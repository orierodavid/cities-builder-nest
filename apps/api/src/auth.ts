import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
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
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // getUser(token) asks Supabase Auth to validate the access token; decoding a JWT
    // locally without signature validation is deliberately not used here.
    const { data, error } = await userSupabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "invalid_or_expired_token" });
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
