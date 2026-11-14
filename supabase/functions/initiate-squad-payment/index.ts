import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const makeRef = () =>
  `CBNEST${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("SQUAD_SECRET_KEY");
  const mode = Deno.env.get("SQUAD_ENVIRONMENT") ?? "sandbox";
  if (!url || !anon || !service || !secret) return reply(503, { error: "squad_payment_not_configured" });
  if (!["sandbox", "live"].includes(mode)) return reply(503, { error: "invalid_squad_environment" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "authentication_required" });
  const user = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error: authErr } = await user.auth.getUser(token);
  if (authErr || !auth.user) return reply(401, { error: "invalid_session" });

  const { data: legal, error: legalErr } = await user.rpc("get_legal_consent_status");
  if (legalErr) return reply(503, { error: "legal_consent_check_unavailable" });
  if (legal?.requiresAcceptance) return reply(403, { error: "legal_consent_required" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const type = body.paymentType;
  const chargeId = typeof body.chargeId === "string" ? body.chargeId : "";
  const goalId = typeof body.goalId === "string" ? body.goalId : "";
  const requested = Number(body.amountKobo);
  if (!["service_charge", "rent_savings"].includes(String(type))) return reply(400, { error: "invalid_payment_type" });
  if (type === "service_charge" && (!chargeId || goalId)) return reply(400, { error: "invalid_service_charge" });
  if (type === "rent_savings" && (!goalId || chargeId || !Number.isSafeInteger(requested) || requested < 10000 || requested > 100000000000)) {
    return reply(400, { error: "invalid_savings_contribution" });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: profile, error: pe }, { data: members, error: me }] = await Promise.all([
    admin.from("users").select("full_name").eq("id", auth.user.id).maybeSingle(),
    admin.from("estate_memberships").select("estate_id").eq("user_id", auth.user.id)
      .eq("membership_role", "resident").eq("status", "active"),
  ]);
  if (pe || me) return reply(503, { error: "resident_context_unavailable" });
  if (!profile?.full_name || !auth.user.email || !members?.length) return reply(403, { error: "active_resident_profile_required" });

  let estateId = "";
  let amountKobo = 0;
  let ledgerId = "";
  let table = "";
  let ref = makeRef();

  if (type === "service_charge") {
    const { data: charge, error } = await admin.from("estate_service_charges")
      .select("id,estate_id,amount_kobo,is_active").eq("id", chargeId).maybeSingle();
    if (error) return reply(503, { error: "charge_lookup_failed" });
    if (!charge || !charge.is_active || !members.some((m) => m.estate_id === charge.estate_id)) {
      return reply(404, { error: "active_estate_charge_not_found" });
    }
    const { data: paid, error: paidError } = await admin.from("service_charge_payments")
      .select("id").eq("charge_id", charge.id).eq("resident_user_id", auth.user.id)
      .eq("status", "successful").maybeSingle();
    if (paidError) return reply(503, { error: "payment_status_lookup_failed" });
    if (paid) return reply(409, { error: "service_charge_already_paid" });

    const { data: pending, error: pendingError } = await admin.from("service_charge_payments")
      .select("id,provider_reference,amount_kobo").eq("charge_id", charge.id)
      .eq("resident_user_id", auth.user.id).eq("status", "pending").maybeSingle();
    if (pendingError) return reply(503, { error: "pending_payment_lookup_failed" });
    if (pending?.provider_reference) {
      return reply(202, {
        status: "pending",
        transactionReference: pending.provider_reference,
        amountKobo: Number(pending.amount_kobo),
        currency: "NGN",
        confirmationPending: true,
      });
    }

    estateId = charge.estate_id;
    amountKobo = Number(charge.amount_kobo);
    table = "service_charge_payments";
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) return reply(409, { error: "invalid_service_charge_amount" });
    const { data: row, error: insertError } = await admin.from(table).insert({
      charge_id: charge.id, estate_id: estateId, resident_user_id: auth.user.id,
      amount_kobo: amountKobo, currency: "NGN", status: "pending",
      provider: "squad", provider_reference: ref,
    }).select("id").single();
    if (insertError || !row) {
      const { data: raced } = await admin.from(table).select("provider_reference,amount_kobo")
        .eq("charge_id", charge.id).eq("resident_user_id", auth.user.id).eq("status", "pending").maybeSingle();
      if (raced?.provider_reference) {
        return reply(202, { status: "pending", transactionReference: raced.provider_reference,
          amountKobo: Number(raced.amount_kobo), currency: "NGN", confirmationPending: true });
      }
      return reply(409, { error: "payment_record_create_failed" });
    }
    ledgerId = row.id;
  } else {
    const { data: goal, error } = await admin.from("rent_savings_goals")
      .select("id,estate_id,status,target_date").eq("id", goalId)
      .eq("resident_user_id", auth.user.id).maybeSingle();
    if (error) return reply(503, { error: "savings_goal_lookup_failed" });
    if (!goal || goal.status !== "active" || !goal.estate_id || !members.some((m) => m.estate_id === goal.estate_id)) {
      return reply(404, { error: "active_savings_goal_not_found" });
    }
    if (goal.target_date && new Date(`${goal.target_date}T00:00:00Z`).getTime() <= Date.now()) {
      return reply(409, { error: "savings_goal_term_ended" });
    }

    const { data: pending, error: pendingError } = await admin.from("rent_savings_contributions")
      .select("id,provider_reference,amount_kobo").eq("goal_id", goal.id)
      .eq("resident_user_id", auth.user.id).eq("amount_kobo", requested)
      .eq("status", "pending").maybeSingle();
    if (pendingError) return reply(503, { error: "pending_contribution_lookup_failed" });
    if (pending?.provider_reference) {
      return reply(202, { status: "pending", transactionReference: pending.provider_reference,
        amountKobo: Number(pending.amount_kobo), currency: "NGN", confirmationPending: true });
    }

    estateId = goal.estate_id;
    amountKobo = requested;
    table = "rent_savings_contributions";
    const { data: row, error: insertError } = await admin.from(table).insert({
      goal_id: goal.id, resident_user_id: auth.user.id, estate_id: estateId,
      amount_kobo: amountKobo, currency: "NGN", status: "pending",
      provider: "squad", provider_reference: ref,
    }).select("id").single();
    if (insertError || !row) {
      const { data: raced } = await admin.from(table).select("provider_reference,amount_kobo")
        .eq("goal_id", goal.id).eq("resident_user_id", auth.user.id)
        .eq("amount_kobo", amountKobo).eq("status", "pending").maybeSingle();
      if (raced?.provider_reference) {
        return reply(202, { status: "pending", transactionReference: raced.provider_reference,
          amountKobo: Number(raced.amount_kobo), currency: "NGN", confirmationPending: true });
      }
      return reply(409, { error: "contribution_record_create_failed" });
    }
    ledgerId = row.id;
  }

  const base = mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com";
  try {
    const response = await fetch(`${base}/transaction/initiate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        email: auth.user.email, amount: amountKobo, currency: "NGN",
        customer_name: profile.full_name, initiate_type: "inline",
        transaction_ref: ref, callback_url: "citiesbuildernest://payment-return",
        payment_channels: ["card", "bank", "ussd", "transfer"], pass_charge: false,
        metadata: { app: "cities-builder-nest", payment_type: type, ledger_id: ledgerId,
          resident_user_id: auth.user.id, estate_id: estateId },
      }),
    });

    const raw = await response.text();
    let result: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed;
    } catch {
      // A non-JSON response is ambiguous; keep the same reference pending.
    }
    const resultData = result.data && typeof result.data === "object"
      ? result.data as Record<string, unknown> : result;
    const checkout = resultData.checkout_url;
    if (response.ok && result.success === true && typeof checkout === "string" && checkout.startsWith("https://")) {
      return reply(200, { checkoutUrl: checkout, transactionReference: ref, amountKobo,
        currency: "NGN", environment: mode, status: "pending" });
    }

    if (response.status >= 500 || response.status === 408 || !raw || !Object.keys(result).length || response.ok) {
      return reply(202, { status: "pending", transactionReference: ref, amountKobo,
        currency: "NGN", confirmationPending: true });
    }

    const { error: updateError } = await admin.from(table)
      .update({ status: "failed" }).eq("id", ledgerId).eq("status", "pending");
    if (updateError) return reply(500, { error: "payment_ledger_update_failed" });
    return reply(502, { error: "squad_checkout_initialization_failed", status: "failed" });
  } catch {
    // A timeout or dropped connection does not prove that Squad rejected the charge.
    // Keep the ledger pending; webhook and scheduled verification will reconcile it.
    return reply(202, { status: "pending", transactionReference: ref, amountKobo,
      currency: "NGN", confirmationPending: true });
  }
});
