import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const statusOf = (value: unknown) => str(value).toLowerCase();
const validPhone = (value: string) => /^\+?[0-9]{8,15}$/.test(value);
const validEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
  const environment = Deno.env.get("SQUAD_ENVIRONMENT") ?? "sandbox";
  if (!supabaseUrl || !anonKey || !serviceKey || !squadKey) {
    return reply(503, { error: "squad_electricity_not_configured" });
  }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply(401, { error: "authentication_required" });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !auth.user) return reply(401, { error: "invalid_session" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: memberships, error: membershipError } = await admin
    .from("estate_memberships").select("estate_id")
    .eq("user_id", auth.user.id).eq("membership_role", "resident").eq("status", "active");
  if (membershipError) return reply(503, { error: "membership_lookup_failed" });
  const estateIds = (memberships ?? []).map((row) => row.estate_id as string);
  if (!estateIds.length) return reply(403, { error: "active_resident_membership_required" });

  let input: Record<string, unknown>;
  try { input = asObject(await req.json()); } catch { return reply(400, { error: "invalid_json" }); }
  const action = str(input.action);
  const base = environment === "live"
    ? "https://api-d.squadco.com"
    : "https://sandbox-api-d.squadco.com";

  const squad = async (path: string, method = "GET", body?: Record<string, unknown>) => {
    try {
      const response = await fetch(new URL(path, base), {
        method,
        headers: { Authorization: `Bearer ${squadKey}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const rawBody = await response.text();
      let data: Record<string, unknown> = {};
      try { data = asObject(rawBody ? JSON.parse(rawBody) : {}); } catch {
        data = { message: "Squad returned an unreadable response." };
      }
      return { response, data, rawBody };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network request failed";
      return { response: new Response(null, { status: 502 }), data: { message }, rawBody: message };
    }
  };
  const detailsOf = (data: Record<string, unknown>) => asObject(data.data);
  const upstreamError = (data: Record<string, unknown>, fallback: string) =>
    str(data.message) || fallback;

  if (action === "providers") {
    const { response, data } = await squad("/vending/utilities/electricity/service-providers");
    if (!response.ok || data.success !== true || !Array.isArray(data.data)) {
      return reply(502, { error: "provider_list_unavailable", message: upstreamError(data, "Electricity providers are temporarily unavailable.") });
    }
    const providers = data.data.map((item) => {
      const row = asObject(item);
      return { code: str(row.code), name: str(row.name), logoUrl: str(row.logo_url) || null };
    }).filter((item) => item.code && item.name);
    return reply(200, { providers });
  }

  if (action === "lookup") {
    const provider = str(input.discoCode).toUpperCase();
    const meterNumber = str(input.meterNumber);
    const meterType = str(input.meterType).toLowerCase();
    const estateId = str(input.estateId);
    if (!/^[A-Z0-9]{2,20}$/.test(provider) || !/^\d{6,20}$/.test(meterNumber) ||
        !["prepaid", "postpaid"].includes(meterType) || !estateIds.includes(estateId)) {
      return reply(400, { error: "invalid_meter_details" });
    }
    const { response, data } = await squad("/vending/utilities/electricity/lookup", "POST", {
      meter_type: meterType, meter_no: meterNumber, provider,
    });
    const details = detailsOf(data);
    const providerReference = str(details.reference);
    if (!response.ok || data.success !== true || !providerReference) {
      return reply(422, { error: "meter_validation_failed", message: upstreamError(data, "The meter could not be verified. Check the provider and meter number.") });
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: saved, error } = await admin.from("utility_validations").insert({
      resident_user_id: auth.user.id, estate_id: estateId, service: "electricity",
      provider, customer_identifier: meterNumber, meter_type: meterType,
      validation_token: providerReference, customer_name: str(details.customer_name) || null,
      minimum_vend: details.minimum_vend == null ? null : Number(details.minimum_vend),
      expires_at: expiresAt, status: "validated",
    }).select("id").single();
    if (error || !saved) return reply(503, { error: "meter_validation_save_failed" });
    return reply(200, {
      validationId: saved.id, customerName: str(details.customer_name) || null,
      address: str(details.address) || null, meterNumber, meterType, provider,
      minimumVend: details.minimum_vend == null ? null : Number(details.minimum_vend),
      outstandingDebt: details.outstanding_debt == null ? null : Number(details.outstanding_debt),
      accountType: str(details.account_type) || null, expiresAt,
    });
  }

  if (action === "vend") {
    const validationId = str(input.validationId);
    const phone = str(input.phone);
    const email = str(input.email);
    const amount = Number(input.amount);
    if (!validationId || !validPhone(phone) || !validEmail(email) ||
        !Number.isFinite(amount) || amount < 100 || Math.round(amount * 100) !== amount * 100) {
      return reply(400, { error: "invalid_purchase_details", message: "Enter a valid amount, phone number and email address." });
    }
    const { data: validation, error: validationError } = await admin.from("utility_validations")
      .select("*").eq("id", validationId).eq("resident_user_id", auth.user.id)
      .eq("service", "electricity").eq("status", "validated")
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (validationError || !validation || !estateIds.includes(validation.estate_id)) {
      return reply(409, { error: "lookup_expired_or_already_used", message: "Please verify the meter again before purchasing." });
    }
    if (validation.minimum_vend != null && amount < Number(validation.minimum_vend)) {
      return reply(400, { error: "below_minimum_vend", message: `The minimum purchase for this meter is ₦${Number(validation.minimum_vend).toLocaleString("en-NG")}.` });
    }

    // Consume the validation atomically before contacting Squad to prevent duplicate vends.
    const { data: claimed, error: claimError } = await admin.from("utility_validations")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", validation.id).eq("resident_user_id", auth.user.id)
      .eq("status", "validated").select("id").maybeSingle();
    if (claimError || !claimed) return reply(409, { error: "lookup_already_consumed", message: "This meter verification has already been used. Verify it again to make another purchase." });

    const reference = `CBN-EL-${crypto.randomUUID()}`;
    const amountKobo = Math.round(amount * 100);
    const { data: transaction, error: transactionError } = await admin.from("utility_transactions").insert({
      resident_user_id: auth.user.id, estate_id: validation.estate_id,
      validation_id: validation.id, service: "electricity", provider: validation.provider,
      customer_identifier: validation.customer_identifier, merchant_reference: reference,
      amount_kobo: amountKobo, currency: "NGN", status: "pending", provider_status: "SUBMITTING",
    }).select("id").single();
    if (transactionError || !transaction) {
      return reply(503, { error: "transaction_record_failed", message: "We could not safely record this purchase. Please verify the meter again." });
    }

    const { response, data, rawBody } = await squad("/vending/utilities/electricity", "POST", {
      phone_number: phone, amount, ...(email ? { email } : {}), reference: str(validation.validation_token),
    });
    const result = detailsOf(data);
    const meta = typeof result.meta_json === "object" ? asObject(result.meta_json) :
      (() => { try { return asObject(JSON.parse(str(result.meta))); } catch { return {}; } })();
    const providerStatus = statusOf(result.status ?? data.status);
    const finalStatus = response.ok && data.success === true && providerStatus === "success"
      ? "successful" : response.ok && data.success === true && providerStatus === "pending" ? "pending" : "failed";
    const token = str(meta.token) || str(result.value_reference) || null;
    const receipt = {
      token, units: str(meta.total_units) || null, receiptNumber: str(meta.receipt_number) || null,
      customerName: str(meta.account_name) || str(validation.customer_name) || null,
      meterNumber: str(meta.meter_number) || str(validation.customer_identifier),
      address: str(meta.address) || null, tariffClass: str(meta.tariff_class) || null,
      tariffRate: str(meta.tariff_rate) || null, amountPaid: meta.amount_paid ?? amount,
      providerReference: str(result.reference) || str(validation.validation_token),
    };
    const { error: updateError } = await admin.from("utility_transactions")
      .update({ status: finalStatus, provider_status: providerStatus || String(response.status),
        provider_response: data, receipt: finalStatus === "successful" ? receipt : null,
        updated_at: new Date().toISOString() }).eq("id", transaction.id);
    if (updateError) {
      console.error("[squad-electricity] transaction update failed", updateError.message);
      return reply(202, { transaction: { merchantReference: reference, status: "pending" }, message: "The provider responded, but the final status is being reconciled. Do not submit again." });
    }
    if (!response.ok || data.success !== true || finalStatus === "failed") {
      return reply(422, { error: "electricity_vend_failed", message: upstreamError(data, "The electricity purchase was not successful."), upstreamStatus: response.status, upstreamBody: rawBody, transaction: { merchantReference: reference, status: "failed" } });
    }
    return reply(finalStatus === "pending" ? 202 : 200, {
      transaction: { merchantReference: reference, status: finalStatus, amountKobo, receipt },
    });
  }

  if (action === "status") {
    const reference = str(input.merchantReference);
    if (!reference) return reply(400, { error: "merchant_reference_required" });
    const { data: row, error } = await admin.from("utility_transactions").select("*")
      .eq("resident_user_id", auth.user.id).eq("service", "electricity")
      .eq("merchant_reference", reference).maybeSingle();
    if (error || !row) return reply(404, { error: "transaction_not_found" });
    if (row.status === "pending") {
      const { data: validation } = await admin.from("utility_validations").select("validation_token")
        .eq("id", row.validation_id).eq("resident_user_id", auth.user.id).maybeSingle();
      if (!validation?.validation_token) return reply(503, { error: "provider_reference_unavailable" });
      const { response, data } = await squad(`/vending/transactions?reference=${encodeURIComponent(validation.validation_token)}`);
      if (response.ok && data.success === true) {
        const providerTx = detailsOf(data);
        const providerStatus = statusOf(providerTx.status);
        const nextStatus = providerStatus === "success" ? "successful" :
          ["failed", "failure", "reversed"].includes(providerStatus) ? "failed" : "pending";
        const providerMeta = typeof providerTx.meta_json === "object" ? asObject(providerTx.meta_json) : {};
        const receipt = nextStatus === "successful" ? {
          token: str(providerMeta.token) || str(providerTx.value_reference) || null,
          units: str(providerMeta.total_units) || null,
          receiptNumber: str(providerMeta.receipt_number) || null,
          customerName: str(providerMeta.account_name) || null,
          meterNumber: str(providerMeta.meter_number) || str(row.customer_identifier),
          address: str(providerMeta.address) || null,
          amountPaid: providerMeta.amount_paid ?? Number(row.amount_kobo) / 100,
        } : row.receipt;
        const { data: updated } = await admin.from("utility_transactions")
          .update({ status: nextStatus, provider_status: providerStatus || "PENDING",
            provider_response: data, receipt, updated_at: new Date().toISOString() })
          .eq("id", row.id).eq("status", "pending").select("*").maybeSingle();
        if (updated) return reply(200, { transaction: updated });
      }
    }
    return reply(200, { transaction: row });
  }

  if (action === "history") {
    const { data, error } = await admin.from("utility_transactions")
      .select("id,service,provider,customer_identifier,merchant_reference,amount_kobo,currency,status,provider_status,receipt,created_at")
      .eq("resident_user_id", auth.user.id).eq("service", "electricity")
      .order("created_at", { ascending: false }).limit(50);
    if (error) return reply(503, { error: "history_unavailable" });
    return reply(200, { transactions: data ?? [] });
  }

  return reply(400, { error: "unsupported_action" });
});
