import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveVirtualAccountProvider } from "./provider.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(503, { error: "virtual_account_service_unavailable" });

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return reply(401, { error: "authentication_required" });

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return reply(401, { error: "invalid_session" });

  const { data: legalStatus, error: legalError } = await userClient.rpc("get_legal_consent_status");
  if (legalError) return reply(503, { error: "legal_consent_check_unavailable" });
  if (legalStatus?.requiresAcceptance === true) {
    return reply(403, { error: "legal_consent_required", legalStatus });
  }

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const estateId = typeof input.estateId === "string" ? input.estateId.trim() : "";
  if (!estateId || estateId.length > 100) return reply(400, { error: "estate_id_required" });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: membership, error: membershipError }, { data: estate, error: estateError }] = await Promise.all([
    admin.from("estate_memberships")
      .select("id")
      .eq("estate_id", estateId)
      .eq("user_id", authData.user.id)
      .eq("membership_role", "resident")
      .eq("status", "active")
      .maybeSingle(),
    admin.from("estates").select("id, is_enabled").eq("id", estateId).maybeSingle(),
  ]);
  if (membershipError || estateError) return reply(503, { error: "resident_membership_check_failed" });
  if (!membership) return reply(403, { error: "active_resident_membership_required" });
  if (!estate || estate.is_enabled !== true) return reply(423, { error: "estate_unavailable" });

  const { data: existing, error: existingError } = await admin.from("resident_virtual_accounts")
    .select("id, provider, provider_account_reference, bank_name, account_number, account_name, currency, status")
    .eq("resident_user_id", authData.user.id)
    .eq("estate_id", estateId)
    .maybeSingle();
  if (existingError) return reply(503, { error: "virtual_account_lookup_failed" });
  if (existing?.status === "active") return reply(200, { virtualAccount: existing, alreadyCreated: true });
  if (existing?.status === "pending") return reply(202, { virtualAccount: existing, pending: true });

  const provider = resolveVirtualAccountProvider();
  if (!provider) {
    return reply(503, {
      error: "virtual_account_provider_not_configured",
      message: "A payment provider has not been selected and configured. No virtual account has been created.",
    });
  }

  const { data: profile, error: profileError } = await admin.from("users")
    .select("full_name, phone_e164").eq("id", authData.user.id).maybeSingle();
  if (profileError || !profile?.full_name || !authData.user.email) {
    return reply(400, { error: "resident_profile_incomplete", message: "Complete the resident name and email before creating a virtual account." });
  }

  const idempotencyKey = `cbnest-va:${authData.user.id}:${estateId}`;
  let accountRowId: string | null = existing?.id ?? null;
  if (!accountRowId) {
    const { data, error } = await admin.from("resident_virtual_accounts").insert({
      resident_user_id: authData.user.id,
      estate_id: estateId,
      provider: provider.name,
      status: "pending",
      idempotency_key: idempotencyKey,
    }).select("id").single();
    if (error || !data) {
      const { data: raced } = await admin.from("resident_virtual_accounts")
        .select("id, provider, provider_account_reference, bank_name, account_number, account_name, currency, status")
        .eq("resident_user_id", authData.user.id).eq("estate_id", estateId).maybeSingle();
      if (raced?.status === "active") return reply(200, { virtualAccount: raced, alreadyCreated: true });
      if (raced?.status === "pending") return reply(202, { virtualAccount: raced, pending: true });
      return reply(409, { error: "virtual_account_request_conflict" });
    }
    accountRowId = data.id;
  }
  if (!accountRowId) return reply(500, { error: "virtual_account_request_id_missing" });

  try {
    const created = await provider.createDedicatedAccount({
      residentId: authData.user.id,
      estateId,
      fullName: profile.full_name,
      email: authData.user.email,
      phone: profile.phone_e164,
      idempotencyKey,
    });
    if (!created.accountReference || !created.bankName || !created.accountNumber || !created.accountName) {
      throw new Error("provider_account_details_incomplete");
    }
    const { data: saved, error: saveError } = await admin.from("resident_virtual_accounts")
      .update({
        provider: created.provider,
        provider_customer_reference: created.customerReference,
        provider_account_reference: created.accountReference,
        bank_name: created.bankName,
        account_number: created.accountNumber,
        account_name: created.accountName,
        currency: "NGN",
        status: "active",
        failure_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountRowId)
      .select("id, provider, provider_account_reference, bank_name, account_number, account_name, currency, status")
      .single();
    if (saveError || !saved) throw new Error("virtual_account_persistence_failed");
    return reply(201, { virtualAccount: saved });
  } catch (error) {
    await admin.from("resident_virtual_accounts")
      .update({ status: "failed", failure_code: "provider_creation_failed", updated_at: new Date().toISOString() })
      .eq("id", accountRowId);
    return reply(502, {
      error: "virtual_account_creation_failed",
      message: error instanceof Error ? error.message : "The provider could not create the account.",
    });
  }
});
