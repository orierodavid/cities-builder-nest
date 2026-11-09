import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 10_000;
const timeoutFetch: typeof fetch = (input, init) => {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
};
import type { NextFunction, Request, Response } from "express";

export interface AuthenticatedRequest extends Request {
  authUser: User;
  userSupabase: SupabaseClient;
}

export function authConfigurationReady(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!authConfigurationReady()) {
    res.status(503).json({ error: "authentication_not_configured" });
    return;
  }

  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  const token = match[1].trim();
  if (!token) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  try {
    const userSupabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: timeoutFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // getUser(token) asks Supabase Auth to validate the access token; decoding a JWT
    // locally without signature validation is deliberately not used here.
    const { data, error } = await userSupabase.auth.getUser(token);
    if (error) {
      if (typeof error.status === "number" && (error.status >= 500 || error.status === 429 || error.status === 408)) {
        res.setHeader("Retry-After", "5");
        res.status(503).json({ error: "authentication_service_unavailable" });
        return;
      }
      res.status(401).json({ error: "invalid_or_expired_token" });
      return;
    }
    if (!data.user) {
      res.status(401).json({ error: "invalid_or_expired_token" });
      return;
    }

    const { data: accountProfile, error: accountProfileError } = await userSupabase
      .from("users")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (accountProfileError) {
      res.status(503).json({ error: "account_status_check_unavailable" });
      return;
    }
    if (accountProfile && accountProfile.is_active !== true) {
      res.status(403).json({ error: "account_pending_approval", message: "Your account is awaiting administrator approval. We will email you when it becomes active." });
      return;
    }

    const { data: legalStatus, error: legalError } = await userSupabase.rpc("get_legal_consent_status");
    if (legalError) {
      res.status(503).json({ error: "legal_consent_check_unavailable" });
      return;
    }
    if (legalStatus?.requiresAcceptance === true) {
      res.status(403).json({ error: "legal_consent_required", legalStatus });
      return;
    }

    (req as AuthenticatedRequest).authUser = data.user;
    (req as AuthenticatedRequest).userSupabase = userSupabase;
    next();
  } catch {
    res.status(503).json({ error: "authentication_service_unavailable" });
  }
}
