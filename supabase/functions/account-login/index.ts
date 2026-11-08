import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function loginRateLimitBucket(ip: string): Promise<string> {\n  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cbnest:login:${ip}`));\n  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");\n}\n\nfunction remainingSeconds(until: string) {
  return Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(503, { error: "authentication_service_unavailable" });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });\n  const clientIp = req.headers.get("cf-connecting-ip")?.trim();\n  if (clientIp) {\n    const bucketKey = await loginRateLimitBucket(clientIp);\n    const limit = await admin.rpc("consume_api_rate_limit", {\n      p_bucket_key: bucketKey,\n      p_window_seconds: 60,\n      p_max_requests: 10,\n    });\n    if (limit.error) return reply(503, { error: "login_rate_limit_unavailable" });\n    if (limit.data !== true) {\n      return new Response(JSON.stringify({ error: "rate_limit_exceeded", message: "Too many sign-in attempts. Please retry shortly." }), {\n        status: 429,\n        headers: { ...headers, "Retry-After": "60" },\n      });\n    }\n  }\n\n  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
    return reply(400, { error: "invalid_credentials", message: "Enter a valid email address and password." });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const lock = await admin.rpc("get_account_login_lockout", { p_email: email });
  if (lock.error) return reply(503, { error: "lockout_check_unavailable" });
  const current = Array.isArray(lock.data) ? lock.data[0] : null;
  if (current?.locked_until && new Date(current.locked_until).getTime() > Date.now()) {
    const seconds = remainingSeconds(current.locked_until);
    return reply(423, {
      error: "account_locked",
      message: "Too many unsuccessful sign-in attempts. Try again in " + Math.ceil(seconds / 60) + " minute(s).",
      retry_after_seconds: seconds,
      locked_until: current.locked_until,
    });
  }

  const publicClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return reply(403, {
        error: "email_not_confirmed",
        message: "Your email is not confirmed yet. Open the latest CB Nest invitation email and follow its confirmation link. If the link has expired, ask your estate administrator to send a fresh invitation.",
      });
    }
    const failed = await admin.rpc("record_account_login_failure", { p_email: email });
    if (failed.error) return reply(503, { error: "login_attempt_recording_unavailable", message: "Sign-in could not be completed. Please try again shortly." });
    const result = Array.isArray(failed.data) ? failed.data[0] : null;
    if (result?.lock_minutes > 0 && result?.locked_until) {
      const ban = await admin.auth.admin.updateUserById(result.user_id, { ban_duration: result.lock_minutes + "m" });
      if (ban.error) return reply(503, { error: "account_lock_enforcement_failed", message: "The account lock could not be applied. Please contact support." });
      return reply(423, {
        error: "account_locked",
        message: "Too many unsuccessful sign-in attempts. This account is locked for " + result.lock_minutes + " minutes.",
        retry_after_seconds: result.lock_minutes * 60,
        locked_until: result.locked_until,
      });
    }
    return reply(401, { error: "invalid_credentials", message: "Email or password is incorrect." });
  }

  const reset = await admin.rpc("reset_account_login_lockout", { p_email: email });
  if (reset.error) {
    await publicClient.auth.signOut({ scope: "local" });
    return reply(503, { error: "login_state_reset_failed", message: "Sign-in could not be completed. Please try again." });
  }

  return reply(200, {
    user: data.user,
    session: data.session,
  });
});
