import { createClient } from "npm:@supabase/supabase-js@2";
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function hmac(secret: string, raw: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!url || !service || !secret) return reply(503, { error: "paystack_webhook_not_configured" });
  const raw = await req.text();
  const sent = req.headers.get("x-paystack-signature") ?? "";
  if (!sent || !safeEqual(sent.toLowerCase(), await hmac(secret, raw))) return reply(401, { error: "invalid_paystack_signature" });
  let event: Record<string, unknown>;
  try { event = JSON.parse(raw); } catch { return reply(400, { error: "invalid_json" }); }
  if (event.event !== "charge.success") return reply(200, { received: true, ignored: true });
  const eventData = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
  const reference = typeof eventData.reference === "string" ? eventData.reference : "";
  if (!reference || reference.length > 120) return reply(400, { error: "transaction_reference_missing" });
  let verifiedResponse: Response;
  try {
    verifiedResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12000),
    });
  } catch { return reply(502, { error: "paystack_verification_unavailable" }); }
  if (!verifiedResponse.ok) return reply(502, { error: "paystack_verification_unavailable" });
  let verification: Record<string, unknown>;
  try { verification = await verifiedResponse.json(); } catch { return reply(502, { error: "paystack_invalid_verification" }); }
  const data = verification.data && typeof verification.data === "object" ? verification.data as Record<string, unknown> : {};
  const amount = Number(data.amount), currency = String(data.currency ?? "").toUpperCase();
  if (verification.status !== true || data.status !== "success" || data.reference !== reference ||
      !Number.isSafeInteger(amount) || amount <= 0 || currency !== "NGN") {
    return reply(409, { error: "verified_transaction_invalid" });
  }
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: intent, error: intentError } = await admin.from("paystack_wallet_funding_intents")
    .select("id,resident_user_id,amount_kobo,status").eq("reference", reference).maybeSingle();
  if (intentError) return reply(503, { error: "wallet_funding_lookup_failed" });
  let residentId: string, source: string, external: string, description: string;
  if (intent) {
    if (Number(intent.amount_kobo) !== amount) return reply(409, { error: "wallet_funding_amount_mismatch" });
    residentId = intent.resident_user_id; source = "paystack_checkout";
    external = `paystack:checkout:${reference}`; description = "Wallet funding via Paystack";
  } else {
    const customer = data.customer && typeof data.customer === "object" ? data.customer as Record<string, unknown> : {};
    const customerCode = typeof customer.customer_code === "string" ? customer.customer_code : "";
    const authorization = data.authorization && typeof data.authorization === "object" ? data.authorization as Record<string, unknown> : {};
    const receiverNumber = typeof authorization.receiver_bank_account_number === "string" ? authorization.receiver_bank_account_number : "";
    let query = admin.from("resident_virtual_accounts").select("resident_user_id,id")
      .eq("provider", "paystack").eq("status", "active");
    if (receiverNumber) query = query.eq("account_number", receiverNumber);
    else if (customerCode) query = query.eq("provider_customer_reference", customerCode);
    else return reply(200, { received: true, ignored: true, reason: "no_virtual_account_reference" });
    const { data: accounts, error: accountError } = await query.limit(2);
    if (accountError) return reply(503, { error: "virtual_account_lookup_failed" });
    if (!accounts?.length) return reply(200, { received: true, ignored: true });
    if (accounts.length !== 1) return reply(409, { error: "ambiguous_virtual_account_customer" });
    residentId = accounts[0].resident_user_id; source = "paystack_virtual_account";
    external = `paystack:virtual-account:${reference}`; description = "Bank transfer to Paystack virtual account";
  }
  const { data: wallet, error: walletError } = await admin.from("resident_wallets").select("id,status")
    .eq("resident_user_id", residentId).maybeSingle();
  if (walletError) return reply(503, { error: "wallet_lookup_failed" });
  if (!wallet || wallet.status !== "active") return reply(409, { error: "active_wallet_not_found" });
  const { data: transactionId, error: creditError } = await admin.rpc("post_verified_wallet_credit", {
    p_resident_user_id: residentId, p_amount_kobo: amount, p_source: source,
    p_external_reference: external, p_provider_reference: reference,
    p_description: description, p_metadata: { provider: "paystack", reference, currency: "NGN" },
  });
  if (creditError || !transactionId) return reply(500, { error: "wallet_credit_post_failed" });
  if (intent) {
    const { error: updateError } = await admin.from("paystack_wallet_funding_intents")
      .update({ status: "successful", verified_at: new Date().toISOString() }).eq("id", intent.id);
    if (updateError) return reply(500, { error: "wallet_funding_status_update_failed" });
  }
  return reply(200, { received: true, credited: true, duplicateSafe: true });
});
