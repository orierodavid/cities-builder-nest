import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";

export interface AuthenticatedRequest extends Request {
  authUser: User;
  userSupabase: SupabaseClient;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export function authConfigurationReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
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
    const userSupabase = createClient(supabaseUrl!, supabaseAnonKey!, {
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

    (req as AuthenticatedRequest).authUser = data.user;
    (req as AuthenticatedRequest).userSupabase = userSupabase;
    next();
  } catch {
    res.status(503).json({ error: "authentication_service_unavailable" });
  }
}
