import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import {
  supabaseAuthProvider,
  type AuthIdentity,
  type AuthProvider,
} from "./auth-provider.js";

const REQUEST_TIMEOUT_MS = 10_000;

const timeoutFetch: typeof fetch = (input, init) => {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
};

export interface AuthenticatedRequest extends Request {
  authUser: AuthIdentity;
  userSupabase: SupabaseClient;
}

export interface AuthMiddlewareDependencies {
  authProvider?: AuthProvider;
  createUserClient?: (accessToken: string) => SupabaseClient;
  createAccountStatusClient?: (accessToken: string) => SupabaseClient;
}

function createSupabaseUserClient(accessToken: string): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: timeoutFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates authentication middleware around a replaceable credential verifier.
 * Supabase remains the configured provider today; other providers can be
 * introduced without changing route handlers or trusting unverified JWT data.
 */
export function createRequireAuth(dependencies: AuthMiddlewareDependencies = {}) {
  const authProvider = dependencies.authProvider ?? supabaseAuthProvider;
  const createUserClient = dependencies.createUserClient ?? createSupabaseUserClient;
  const createAccountStatusClient = dependencies.createAccountStatusClient ?? ((accessToken: string) => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      return createClient(process.env.SUPABASE_URL!, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: timeoutFetch },
      });
    }
    return createUserClient(accessToken);
  });

  return async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!authProvider.isConfigured()) {
      res.status(503).json({ error: "authentication_not_configured" });
      return;
    }

    const authorization = req.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1].trim();
    if (!token) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }

    try {
      const verification = await authProvider.verifyAccessToken(token);
      if (verification.errorStatus !== undefined) {
        const status = verification.errorStatus;
        if (status >= 500 || status === 429 || status === 408) {
          res.setHeader("Retry-After", "5");
          res.status(503).json({ error: "authentication_service_unavailable" });
          return;
        }
        res.status(401).json({ error: "invalid_or_expired_token" });
        return;
      }
      if (!verification.user?.id) {
        res.status(401).json({ error: "invalid_or_expired_token" });
        return;
      }

      // The verified access token is forwarded to Supabase PostgREST so RLS
      // continues to execute as the authenticated user, never service_role.
      const userSupabase = createUserClient(token);
      // If RLS hides a disabled account's profile, a missing row is denied below.
      // A service-role reader is used only when the API environment explicitly has one.
      const accountStatusClient = createAccountStatusClient(token);
      // These independent security checks previously ran sequentially. Running
      // them together reduces authenticated-request latency while preserving
      // both account-status and legal-consent enforcement.
      const [accountProfileResult, legalConsentResult] = await Promise.all([
        accountStatusClient
          .from("users")
          .select("is_active,is_disabled,deleted_at")
          .eq("id", verification.user.id)
          .maybeSingle(),
        userSupabase.rpc("get_legal_consent_status"),
      ]);
      const { data: accountProfile, error: accountProfileError } = accountProfileResult;
      if (accountProfileError) {
        res.status(503).json({ error: "account_status_check_unavailable" });
        return;
      }
      if (!accountProfile) {
        res.status(403).json({ error: "account_profile_not_found" });
        return;
      }
      if (accountProfile.is_disabled === true || accountProfile.deleted_at) {
        res.status(403).json({
          error: accountProfile.deleted_at ? "account_deleted" : "account_disabled",
          message: "This CB Nest account is disabled. Contact support if you believe this is an error.",
        });
        return;
      }
      if (accountProfile && accountProfile.is_active !== true) {
        res.status(403).json({
          error: "account_pending_approval",
          message: "Your account is awaiting administrator approval. We will email you when it becomes active.",
        });
        return;
      }

      const { data: legalStatus, error: legalError } = legalConsentResult;
      if (legalError) {
        res.status(503).json({ error: "legal_consent_check_unavailable" });
        return;
      }
      if (legalStatus?.requiresAcceptance === true) {
        res.status(403).json({ error: "legal_consent_required", legalStatus });
        return;
      }

      (req as AuthenticatedRequest).authUser = verification.user;
      (req as AuthenticatedRequest).userSupabase = userSupabase;
      next();
    } catch {
      res.status(503).json({ error: "authentication_service_unavailable" });
    }
  };
}

export const requireAuth = createRequireAuth();

export function authConfigurationReady(): boolean {
  return supabaseAuthProvider.isConfigured();
}
