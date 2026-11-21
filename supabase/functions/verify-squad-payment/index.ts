import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("SQUAD_SECRET_KEY");
  const mode = Deno.env.get("SQUAD_ENVIRONMENT") ?? "";
  if (!url || !anon || !service || !secret || mode !== "live") {
    return reply(503, { error: "payment_verification_not_configured" });
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "authentication_required" });
  const user = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error: authError } = await user.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { error: "invalid_session" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const ref = typeof body.transactionReference === "string" ? body.transactionReference.trim() : "";
  if (!ref || ref.length > 120 || !/^[A-Za-z0-9_-]+$/.test(ref)) {
    return reply(400, { error: "invalid_transaction_reference" });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: accountStatus, error: accountStatusError } = await admin.from("users")
    .select("is_active,is_disabled,deleted_at").eq("id", auth.user.id).maybeSingle();
  if (accountStatusError) return reply(503, { error: "account_status_check_unavailable" });
  if (!accountStatus || accountStatus.is_disabled === true || accountStatus.deleted_at) return reply(403, { error: "account_disabled", message: "This CB Nest account is disabled." });
  if (accountStatus.is_active !== true) return reply(403, { error: "account_pending_approval" });
  const { data: walletIntent, error: walletIntentError } = await admin.from("squad_wallet_funding_intents")
    .select("id,resident_user_id,amount_kobo,currency,status,verified_at,created_at")
    .eq("reference", ref).eq("resident_user_id", auth.user.id).maybeSingle();
  if (walletIntentError) return reply(503, { error: "wallet_funding_lookup_failed" });
  if (walletIntent) {
    if (walletIntent.status === "successful" && walletIntent.verified_at) return reply(200, { status: "successful", verified: true });
    const base = mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com";
    let response: Response;
    try { response = await fetch(`${base}/transaction/verify/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10000) }); }
    catch { return reply(202, { status: "pending", verified: false, retry: true }); }
    if (!response.ok) return reply(202, { status: "pending", verified: false, retry: true });
    let payload: Record<string, unknown>;
    try { payload = await response.json(); } catch { return reply(202, { status: "pending", verified: false, retry: true }); }
    const data = payload.data as Record<string, unknown> | undefined;
    if (!payload.success || !data) return reply(202, { status: "pending", verified: false, retry: true });
    const status = String(data.transaction_status ?? "").toLowerCase();
    const amount = Number(data.transaction_amount ?? data.amount);
    const currency = String(data.transaction_currency_id ?? data.currency ?? "").toUpperCase();
    if (!Number.isSafeInteger(amount) || amount !== Number(walletIntent.amount_kobo) ||
        currency !== "NGN" || walletIntent.currency !== "NGN" || String(data.transaction_ref ?? "") !== ref ||
        String(data.email ?? "").toLowerCase() !== auth.user.email?.toLowerCase()) return reply(409, { error: "verified_wallet_payment_mismatch" });
    if (status === "success") {
      const { error: creditError } = await admin.rpc("post_verified_wallet_credit", {
        p_resident_user_id: auth.user.id, p_amount_kobo: amount, p_source: "squad_checkout",
        p_external_reference: `squad:wallet:${ref}`, p_provider_reference: ref,
        p_description: "Wallet funding via Squad",
        p_metadata: { provider: "squad", reference: ref, currency: "NGN", purpose: "wallet_funding" },
      });
      if (creditError) return reply(500, { error: "wallet_credit_post_failed" });
      const { error } = await admin.from("squad_wallet_funding_intents")
        .update({ status: "successful", verified_at: new Date().toISOString() })
        .eq("id", walletIntent.id).in("status", ["pending", "failed"]).is("verified_at", null);
      if (error) return reply(500, { error: "wallet_funding_update_failed" });
      return reply(200, { status: "successful", verified: true });
    }
    if (status === "failed" || status === "abandoned") {
      const { error } = await admin.from("squad_wallet_funding_intents")
        .update({ status: "failed", verified_at: new Date().toISOString() })
        .eq("id", walletIntent.id).eq("status", "pending").is("verified_at", null);
      if (error) return reply(500, { error: "wallet_funding_update_failed" });
      return reply(200, { status: "failed", verified: true });
    }
    if (status !== "pending") return reply(409, { error: "verified_transaction_status_invalid" });
    return reply(202, { status: "pending", verified: true, retry: true });
  }

  const [{ data: serviceRow, error: serviceError }, { data: rentRow, error: rentError }] = await Promise.all([
    admin.from("service_charge_payments")
      .select("id,amount_kobo,fee_kobo,total_amount_kobo,currency,status,resident_user_id,verified_at,created_at")
      .eq("provider_reference", ref).eq("resident_user_id", auth.user.id).maybeSingle(),
    admin.from("rent_savings_contributions")
      .select("id,amount_kobo,fee_kobo,total_amount_kobo,currency,status,resident_user_id,verified_at,created_at")
      .eq("provider_reference", ref).eq("resident_user_id", auth.user.id).maybeSingle(),
  ]);
  if (serviceError || rentError) return reply(503, { error: "payment_ledger_lookup_failed" });
  if (serviceRow && rentRow) return reply(409, { error: "ambiguous_payment_reference" });
  const row = serviceRow ?? rentRow;
  const table = serviceRow ? "service_charge_payments" : "rent_savings_contributions";
  if (!row) return reply(404, { error: "payment_not_found" });
  if (row.status === "successful" && row.verified_at) {
    return reply(200, { status: "successful", verified: true });
  }
  if (row.status === "reversed") return reply(200, { status: "reversed", verified: true });

  const base = mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com";
  let response: Response;
  try {
    response = await fetch(`${base}/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return reply(202, { status: "pending", verified: false, retry: true });
  }
  if (response.status === 400) {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 15 * 60_000) {
      const { error } = await admin.from(table).update({
        status: "failed", verified_at: new Date().toISOString(),
      }).eq("id", row.id).in("status", ["pending", "failed"]).is("verified_at", null);
      if (error) return reply(500, { error: "payment_ledger_update_failed" });
      return reply(200, { status: "failed", verified: true });
    }
    return reply(202, { status: "pending", verified: false, retry: true });
  }
  if (!response.ok) {
    return reply(202, { status: "pending", verified: false, retry: true });
  }
  let verified: Record<string, unknown>;
  try { verified = await response.json(); } catch {
    return reply(202, { status: "pending", verified: false, retry: true });
  }
  const data = verified.data as Record<string, unknown> | undefined;
  if (!verified.success || !data) return reply(202, { status: "pending", verified: false, retry: true });

  const status = String(data.transaction_status ?? "").toLowerCase();
  const amount = Number(data.transaction_amount ?? data.amount);
  const currency = String(data.transaction_currency_id ?? data.currency ?? "").toUpperCase();
  const verifiedRef = String(data.transaction_ref ?? "");
  if (!Number.isSafeInteger(amount) || amount <= 0 ||
      !Number.isSafeInteger(Number(row.amount_kobo)) || Number(row.amount_kobo) <= 0 ||
      !Number.isSafeInteger(Number(row.total_amount_kobo ?? row.amount_kobo)) ||
      verifiedRef !== ref || amount !== Number(row.total_amount_kobo ?? row.amount_kobo) || currency !== "NGN") {
    return reply(409, { error: "verified_transaction_mismatch" });
  }
  if (!["success", "failed", "abandoned", "pending"].includes(status)) {
    return reply(409, { error: "verified_transaction_status_invalid" });
  }
  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(auth.user.id);
  if (userError || !authUser.user?.email ||
      String(data.email ?? "").toLowerCase() !== authUser.user.email.toLowerCase()) {
    return reply(409, { error: "verified_customer_mismatch" });
  }

  if (status === "success") {
    // Verified provider success can repair an older failed row, but never overwrites success/reversal.
    const { data: updated, error } = await admin.from(table)
      .update({ status: "successful", provider: "squad", verified_at: new Date().toISOString() })
      .eq("id", row.id).in("status", ["pending", "failed"]).is("verified_at", null)
      .select("id").maybeSingle();
    if (error) return reply(500, { error: "payment_ledger_update_failed" });
    if (updated) return reply(200, { status: "successful", verified: true });
    const { data: current, error: currentError } = await admin.from(table)
      .select("status,verified_at").eq("id", row.id).maybeSingle();
    if (currentError || !current) return reply(503, { error: "payment_ledger_lookup_failed" });
    return reply(200, { status: current.status, verified: current.status === "successful" && !!current.verified_at });
  }

  if (status === "failed" || status === "abandoned") {
    const { error } = await admin.from(table).update({
      status: "failed", verified_at: new Date().toISOString(),
    }).eq("id", row.id).in("status", ["pending", "failed"]).is("verified_at", null);
    if (error) return reply(500, { error: "payment_ledger_update_failed" });
    const { data: current, error: currentError } = await admin.from(table)
      .select("status,verified_at").eq("id", row.id).maybeSingle();
    if (currentError || !current) return reply(503, { error: "payment_ledger_lookup_failed" });
    return reply(200, {
      status: current.status,
      verified: (current.status === "successful" || current.status === "failed") && !!current.verified_at,
    });
  }
  return reply(202, { status: "pending", verified: true });
});
