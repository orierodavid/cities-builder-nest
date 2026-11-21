import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const makeRef = () => `CBNESTWALLET${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("SQUAD_SECRET_KEY");
  const mode = Deno.env.get("SQUAD_ENVIRONMENT") ?? "sandbox";
  if (!url || !anon || !service || !secret || !["sandbox", "live"].includes(mode)) return reply(503, { error: "squad_payment_not_configured" });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
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
  const { data: account, error: accountError } = await admin.from("users").select("full_name,is_active,is_disabled,deleted_at").eq("id", auth.user.id).maybeSingle();
  if (accountError) return reply(503, { error: "account_status_check_unavailable" });
  if (!account || account.is_disabled === true || account.deleted_at) return reply(403, { error: "account_disabled" });
  if (account.is_active !== true || !account.full_name) return reply(403, { error: "active_resident_profile_required" });
  const { data: wallet, error: walletError } = await user.rpc("get_my_wallet_balance");
  if (walletError) return reply(503, { error: "wallet_lookup_failed" });
  const walletRow = Array.isArray(wallet) ? wallet[0] : null;
  if (!walletRow || walletRow.status !== "active") return reply(403, { error: "active_wallet_required" });
  const reference = makeRef();
  const { error: insertError } = await admin.from("squad_wallet_funding_intents").insert({
    resident_user_id: auth.user.id, reference, amount_kobo: amount, currency: "NGN", status: "pending",
  });
  if (insertError) return reply(503, { error: "wallet_funding_intent_create_failed" });
  const base = mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com";
  try {
    const response = await fetch(`${base}/transaction/initiate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        email: auth.user.email, amount, currency: "NGN", customer_name: account.full_name,
        initiate_type: "inline", transaction_ref: reference,
        callback_url: "citiesbuildernest://payment-return",
        payment_channels: ["card", "bank", "ussd", "transfer"], pass_charge: false,
        metadata: { app: "cb-nest", payment_type: "wallet_funding", resident_user_id: auth.user.id, wallet_id: walletRow.wallet_id },
      }),
    });
    const raw = await response.text();
    let result: Record<string, unknown> = {};
    try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed; } catch {}
    const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : result;
    const checkoutUrl = data.checkout_url;
    if (response.ok && result.success === true && typeof checkoutUrl === "string" && checkoutUrl.startsWith("https://")) {
      await admin.from("squad_wallet_funding_intents").update({ checkout_url: checkoutUrl }).eq("reference", reference);
      return reply(200, { checkoutUrl, transactionReference: reference, amountKobo: amount, currency: "NGN", status: "pending" });
    }
    if (response.status >= 500 || response.status === 408 || !raw || !Object.keys(result).length || response.ok) {
      return reply(202, { status: "pending", transactionReference: reference, confirmationPending: true });
    }
    await admin.from("squad_wallet_funding_intents").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return reply(502, { error: "squad_checkout_initialization_failed" });
  } catch {
    return reply(202, { status: "pending", transactionReference: reference, confirmationPending: true });
  }
});