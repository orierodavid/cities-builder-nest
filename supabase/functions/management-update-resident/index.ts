import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(503, { error: "service_not_configured" });

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(401, { error: "authentication_required" });

  const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: "invalid_session" });

  const { data: legal, error: legalError } = await caller.rpc("get_legal_consent_status");
  if (legalError) return json(503, { error: "legal_consent_check_unavailable" });
  if (legal?.requiresAcceptance === true) return json(403, { error: "legal_consent_required" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const estateId = typeof body.estateId === "string" ? body.estateId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const action = body.action === "load" ? "load" : body.action === "update" ? "update" : "";
  if (!estateId || !userId || !action) return json(400, { error: "invalid_input" });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-cb-actor-id": auth.user.id } },
  });

  const [{ data: platform, error: platformError }, { data: manager, error: managerError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "platform_admin").maybeSingle(),
    admin.from("estate_memberships").select("id").eq("estate_id", estateId).eq("user_id", auth.user.id)
      .eq("status", "active").in("membership_role", ["facility_manager", "estate_manager", "estate_admin"]).maybeSingle(),
  ]);
  if (platformError || managerError) return json(500, { error: "authorization_check_failed" });
  if (!platform && !manager) return json(403, { error: "estate_admin_access_required" });

  const { data: targetMembership, error: targetError } = await admin.from("estate_memberships")
    .select("id").eq("estate_id", estateId).eq("user_id", userId)
    .eq("membership_role", "resident").in("status", ["active", "invited"]).maybeSingle();
  if (targetError) return json(500, { error: "resident_membership_check_failed" });
  if (!targetMembership) return json(404, { error: "resident_not_found_in_estate" });

  const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(userId);
  if (targetAuthError || !targetAuth.user) return json(404, { error: "resident_auth_account_not_found" });

  if (action === "load") {
    return json(200, { email: targetAuth.user.email ?? "" });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const homeNumber = typeof body.homeNumber === "string" ? body.homeNumber.trim() : "";
  const streetName = typeof body.streetName === "string" ? body.streetName.trim() : "";
  const buildingName = typeof body.buildingName === "string" ? body.buildingName.trim() : "";
  const unitNumber = typeof body.unitNumber === "string" ? body.unitNumber.trim() : "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  if (firstName.length < 1 || firstName.length > 80 || lastName.length > 80 ||
      fullName.length < 2 || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      (phone && (phone.length < 7 || phone.length > 20)) ||
      homeNumber.length > 80 || streetName.length > 160 ||
      buildingName.length > 120 || unitNumber.length > 80) {
    return json(400, { error: "invalid_resident_details", message: "Check the name, email, phone number and address fields." });
  }

  const oldEmail = targetAuth.user.email ?? "";
  if (email !== oldEmail.toLowerCase()) {
    const { error: emailError } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (emailError) {
      const duplicate = /already|registered|exists/i.test(emailError.message);
      return json(duplicate ? 409 : 400, {
        error: duplicate ? "email_already_in_use" : "email_update_failed",
        message: duplicate ? "That email address is already used by another account." : emailError.message,
      });
    }
  }

  const { error: profileError } = await admin.from("users").update({
    full_name: fullName,
    first_name: firstName,
    last_name: lastName || null,
    phone_e164: phone || null,
    home_number: homeNumber || null,
    street_name: streetName || null,
    building_name: buildingName || null,
    unit_number: unitNumber || null,
    updated_at: new Date().toISOString(),
  }).eq("id", userId);

  if (profileError) {
    if (email !== oldEmail.toLowerCase() && oldEmail) {
      await admin.auth.admin.updateUserById(userId, { email: oldEmail, email_confirm: true });
    }
    return json(500, { error: "resident_profile_update_failed", message: "The resident profile could not be saved. No changes were confirmed." });
  }

  return json(200, { success: true, emailUpdated: email !== oldEmail.toLowerCase() });
});
