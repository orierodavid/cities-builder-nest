import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const makeRef = () => `CBNESTPS${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!url || !anon || !service || !secret) return reply(503, { error: "paystack_not_configured" });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\\s+/i, "");
  if (!token) return reply(401, { error: "authentication_required" });
  const user = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await user.auth.getUser(token);
  if (authError || !auth.user?.email) return reply(401, { error: "invalid_session" });
  const { data: legal, error: legalError } = await user.rpc("get_legal_consent_status");
  if (legalError) return reply(503, { error: "legal_consent_check_unavailable" });
  if (legal?.requiresAcceptance) return reply(403, { error: "legal_consent_required" });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const amount = Number(body.amountKobo);
  if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 100000000000) return reply(400, { error: "invalid_wallet_funding_amount" });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: account, error: accountError } = await admin.from("users").select("is_active,is_disabled,deleted_at,full_name").eq("id", auth.user.id).maybeSingle();
  if (accountError) return reply(503, { error: "account_status_check_unavailable" });
  if (!account || account.is_active !== true || account.is_disabled || account.deleted_at) return reply(403, { error: "active_account_required" });
  const { data: wallet, error: walletError } = await admin.from("resident_wallets").select("id,status").eq("resident_user_id", auth.user.id).maybeSingle();
  if (walletError) return reply(503, { error: "wallet_lookup_failed" });
  if (!wallet || wallet.status !== "active") return reply(403, { error: "active_wallet_required" });
  const reference = makeRef();
  const { error: insertError } = await admin.from("paystack_wallet_funding_intents").insert({
    resident_user_id: auth.user.id, reference, amount_kobo: amount, status: "pending",
  });
  if (insertError) return reply(503, { error: "wallet_funding_intent_create_failed" });
  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: auth.user.email, amount, currency: "NGN", reference,
        callback_url: "citiesbuildernest://payment-return",
        metadata: { app: "cb-nest", purpose: "wallet_funding", resident_user_id: auth.user.id },
      }),
      signal: AbortSignal.timeout(15000),
    });
    let payload: Record<string, unknown>;
    try { payload = await response.json(); } catch { throw new Error("paystack_invalid_response"); }
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    const checkoutUrl = typeof data.authorization_url === "string" ? data.authorization_url : "";
    if (!response.ok || payload.status !== true || !checkoutUrl.startsWith("https://")) throw new Error("paystack_checkout_initialization_failed");
    await admin.from("paystack_wallet_funding_intents").update({ checkout_url: checkoutUrl }).eq("reference", reference);
    return reply(200, { checkoutUrl, reference, amountKobo: amount, currency: "NGN", status: "pending" });
  } catch {
    // The request may have reached Paystack despite a timeout; keep the intent pending for reconciliation.
    return reply(202, { status: "pending", reference, amountKobo: amount, currency: "NGN", confirmationPending: true });
  }
});
