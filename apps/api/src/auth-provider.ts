import { createClient, type User } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 10_000;

const timeoutFetch: typeof fetch = (input, init) => {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
};

export interface AuthIdentity {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

export interface AuthProviderResult {
  user: AuthIdentity | null;
  errorStatus?: number;
}

/**
 * Verifies bearer credentials independently of the API's data-access layer.
 * A provider must validate signatures/expiry/revocation; decoding a JWT alone
 * is not sufficient authentication.
 */
export interface AuthProvider {
  isConfigured(): boolean;
  verifyAccessToken(token: string): Promise<AuthProviderResult>;
}

function toIdentity(user: User): AuthIdentity {
  return {
    id: user.id,
    email: user.email ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}

export class SupabaseAuthProvider implements AuthProvider {
  isConfigured(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  }

  async verifyAccessToken(token: string): Promise<AuthProviderResult> {
    if (!this.isConfigured()) throw new Error("Supabase Auth is not configured.");

    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { fetch: timeoutFetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await client.auth.getUser(token);
    if (error) return { user: null, errorStatus: error.status };
    return { user: data.user ? toIdentity(data.user) : null };
  }
}

export const supabaseAuthProvider = new SupabaseAuthProvider();
