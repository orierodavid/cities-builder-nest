import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const cents = (value: unknown) => Math.round(Number(value) * 100);
const allowedServices = new Set(["electricity", "cable_tv"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const squadKey = Deno.env.get("SQUAD_SECRET_KEY");
  const mode = Deno.env.get("SQUAD_ENVIRONMENT") ?? "sandbox";
  if (!url || !anon || !serviceKey || !squadKey) return reply(503, { error: "utilities_not_configured" });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply(401, { error: "authentication_required" });
  const userClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: auth, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !auth.user) return reply(401, { error: "invalid_session" });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: memberships, error: membershipError } = await admin.from("estate_memberships").select("estate_id").eq("user_id", auth.user.id).eq("membership_role", "resident").eq("status", "active");
  if (membershipError) return reply(503, { error: "membership_lookup_failed" });
  const estateIds = (memberships ?? []).map((item) => item.estate_id);
  if (!estateIds.length) return reply(403, { error: "active_resident_membership_required" });

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const action = text(input.action);
  const service = text(input.service);
  const provider = text(input.provider).toUpperCase();
  const base = mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com";
  const squad = async (path: string, method = "GET", body?: Record<string, unknown>) => {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${squadKey}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { response, data };
  };
  const failure = (data: Record<string, unknown>, fallback: string) => typeof data.message === "string" ? data.message : fallback;

  if (action === "billers") {
    if (!allowedServices.has(service)) return reply(400, { error: "unsupported_utility_service" });
    const { response, data } = await squad(`/v1/service/billers?service=${encodeURIComponent(service)}`);
    if (!response.ok) return reply(502, { error: "billers_unavailable", message: failure(data, "Utility providers could not be loaded.") });
    const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.billers) ? data.billers : [];
    return reply(200, { billers: rows });
  }

  if (action === "products") {
    if (service !== "cable_tv" || !provider) return reply(400, { error: "invalid_product_request" });
    const { response, data } = await squad("/v1/service/products", "POST", { service, provider });
    if (!response.ok) return reply(502, { error: "products_unavailable", message: failure(data, "TV packages could not be loaded.") });
    return reply(200, { products: Array.isArray(data.data) ? data.data : [] });
  }

  if (action === "lookup") {
    if (!allowedServices.has(service) || !provider) return reply(400, { error: "invalid_lookup_request" });
    const estateId = text(input.estateId);
    const customerIdentifier = text(input.customerIdentifier);
    const meterType = text(input.meterType).toLowerCase();
    if (!estateIds.includes(estateId) || !/^[A-Za-z0-9-]{6,30}$/.test(customerIdentifier) || (service === "electricity" && !["prepaid", "postpaid"].includes(meterType))) return reply(400, { error: "invalid_customer_details" });
    const body: Record<string, unknown> = { service, provider, customer_identifier: customerIdentifier };
    if (service === "electricity") body.context = { meter_type: meterType };
    const { response, data } = await squad("/v1/service/lookup", "POST", body);
    const details = (data.data && typeof data.data === "object" ? data.data : data) as Record<string, unknown>;
    const validationToken = text(details.validation_token);
    if (!response.ok || !validationToken) return reply(422, { error: "customer_lookup_failed", message: failure(data, "Could not retrieve the account information. Check the provider and customer number.") });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: saved, error } = await admin.from("utility_validations").insert({
      resident_user_id: auth.user.id, estate_id: estateId, service, provider,
      customer_identifier: customerIdentifier, meter_type: service === "electricity" ? meterType : null,
      validation_token: validationToken, customer_name: text(details.customer_name) || null,
      expires_at: expiresAt, status: "validated"
    }).select("id").single();
    if (error || !saved) return reply(503, { error: "lookup_save_failed" });
    return reply(200, { validationId: saved.id, service, provider, customerIdentifier, customerName: details.customer_name ?? null, minimumVend: details.minimum_vend ?? null, accountDetails: details, expiresAt });
  }

  if (action === "vend") {
    const validationId = text(input.validationId);
    const amount = Number(input.amount);
    const productCode = text(input.productCode);
    const phone = text(input.phone);
    const email = text(input.email);
    if (!validationId || !/^\+?[0-9]{8,15}$/.test(phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return reply(400, { error: "invalid_purchase_details" });
    const { data: validation, error: validationError } = await admin.from("utility_validations").select("*").eq("id", validationId).eq("resident_user_id", auth.user.id).eq("status", "validated").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (validationError || !validation) return reply(409, { error: "lookup_expired_or_already_used" });
    if (validation.service === "electricity" && (!Number.isFinite(amount) || amount < Number(input.minimumVend ?? 0) || amount < 100)) return reply(400, { error: "invalid_electricity_amount" });
    if (validation.service === "cable_tv" && !productCode) return reply(400, { error: "select_tv_package" });

    const merchantReference = `CBN-${crypto.randomUUID()}`;
    const vendBody: Record<string, unknown> = {
      validation_token: validation.validation_token,
      merchant_reference: merchantReference,
      customer: { phone_number: phone, ...(email ? { email } : {}) }
    };
    if (validation.service === "electricity") vendBody.amount = amount;
    else vendBody.products = [{ code: productCode, quantity: 1 }];

    const { response, data } = await squad("/v1/service/vend", "POST", vendBody);
    const payload = (data.data && typeof data.data === "object" ? data.data : data) as Record<string, unknown>;
    const rawStatus = text(payload.status ?? payload.processed_status ?? data.status).toUpperCase();
    const status = response.status === 202 || rawStatus === "PENDING" ? "pending" : response.ok && rawStatus === "SUCCESS" ? "successful" : "failed";
    const actualAmount = validation.service === "electricity" ? amount : Number(payload.amount ?? payload.kobo_amount ?? 0) / (payload.kobo_amount ? 100 : 1);
    const { error: consumeError } = await admin.from("utility_validations").update({ status: "used", used_at: new Date().toISOString() }).eq("id", validation.id).eq("status", "validated");
    if (consumeError) return reply(503, { error: "validation_consume_failed" });
    const { data: transaction, error: transactionError } = await admin.from("utility_transactions").insert({
      resident_user_id: auth.user.id, estate_id: validation.estate_id, validation_id: validation.id,
      service: validation.service, provider: validation.provider, customer_identifier: validation.customer_identifier,
      merchant_reference: merchantReference, amount_kobo: cents(actualAmount), currency: "NGN", status,
      provider_status: rawStatus || (response.status === 202 ? "PENDING" : "UNKNOWN"),
      provider_response: data, receipt: payload.token ?? payload.receipt ?? payload
    }).select("id,merchant_reference,status,amount_kobo,receipt,created_at").single();
    if (transactionError || !transaction) return reply(503, { error: "transaction_record_failed", merchantReference });
    if (!response.ok && response.status !== 202) return reply(422, { error: "vend_failed", message: failure(data, "The utility purchase could not be completed."), transaction });
    return reply(status === "pending" ? 202 : status === "successful" ? 200 : 422, { transaction });
  }

  if (action === "status") {
    const reference = text(input.merchantReference);
    const { data: row, error } = await admin.from("utility_transactions").select("id,merchant_reference,status,provider_status,amount_kobo,receipt,created_at").eq("resident_user_id", auth.user.id).eq("merchant_reference", reference).maybeSingle();
    if (error || !row) return reply(404, { error: "transaction_not_found" });
    if (row.status === "pending") {
      const { response, data } = await squad(`/v1/service/transactions/${encodeURIComponent(reference)}`);
      if (response.ok) {
        const result = (data.data && typeof data.data === "object" ? data.data : data) as Record<string, unknown>;
        const providerStatus = text(result.processed_status ?? result.status).toUpperCase();
        const status = providerStatus === "SUCCESS" ? "successful" : ["FAILED", "FAILURE"].includes(providerStatus) ? "failed" : "pending";
        const { data: updated } = await admin.from("utility_transactions").update({ status, provider_status: providerStatus || "PENDING", provider_response: data, receipt: result.token ?? result.receipt ?? row.receipt, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "pending").select("id,merchant_reference,status,provider_status,amount_kobo,receipt,created_at").maybeSingle();
        if (updated) return reply(200, { transaction: updated });
      }
    }
    return reply(200, { transaction: row });
  }

  if (action === "history") {
    const { data, error } = await admin.from("utility_transactions").select("id,service,provider,customer_identifier,merchant_reference,amount_kobo,currency,status,provider_status,receipt,created_at").eq("resident_user_id", auth.user.id).order("created_at", { ascending: false }).limit(50);
    if (error) return reply(503, { error: "history_unavailable" });
    return reply(200, { transactions: data ?? [] });
  }

  return reply(400, { error: "unsupported_action" });
});
