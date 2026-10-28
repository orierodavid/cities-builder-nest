import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(503, { error: "invitation_service_not_configured", message: "The onboarding function is missing required Supabase runtime secrets." });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(401, { error: "authentication_required" });

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "invalid_session" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const estateId = typeof input.estateId === "string" ? input.estateId.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role;
  const unitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
  const supportedRoles = ["estate_admin", "resident", "facility_manager", "security"];

  if (!estateId || estateId.length > 100 ||
      fullName.length < 2 || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof role !== "string" || !supportedRoles.includes(role) ||
      (role === "resident" && !unitId) || (role !== "resident" && unitId)) {
    return json(400, { error: "invalid_account_input", message: "Provide an estate, full name, valid email, supported role, and a unit for residents only." });
  }

  const userId = authData.user.id;
  const [{ data: platformAdmin, error: platformRoleError }, { data: estateMembership, error: membershipCheckError }, { data: estate, error: estateError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "platform_admin").maybeSingle(),
    admin.from("estate_memberships").select("membership_role").eq("estate_id", estateId).eq("user_id", userId).eq("status", "active").in("membership_role", ["estate_manager", "estate_admin"]).maybeSingle(),
    admin.from("estates").select("is_enabled").eq("id", estateId).maybeSingle(),
  ]);
  if (platformRoleError || membershipCheckError) return json(500, { error: "authorization_check_failed" });

  const isPlatformAdmin = Boolean(platformAdmin);
  if (!isPlatformAdmin && !estateMembership) {
    return json(403, { error: "estate_admin_access_required", message: "Only a platform administrator or an estate manager/administrator for this estate can create accounts." });
  }
  if (role === "estate_admin" && !isPlatformAdmin) {
    return json(403, { error: "platform_admin_required", message: "Only a platform administrator can invite an estate administrator." });
  }
  if (estateError) return json(500, { error: "estate_lookup_failed" });
  if (!estate) return json(404, { error: "estate_not_found_or_unavailable" });
  if (estate.is_enabled !== true) return json(403, { error: "estate_subscription_inactive" });

  if (role === "resident") {
    const { data: unit, error: unitError } = await admin.from("units")
      .select("id, estate_id, status").eq("id", unitId).maybeSingle();
    if (unitError) return json(500, { error: "unit_validation_failed" });
    if (!unit || unit.estate_id !== estateId) {
      return json(400, { error: "unit_not_in_selected_estate", message: "Select a unit belonging to this estate." });
    }
    if (unit.status !== "available") return json(409, { error: "unit_not_available", message: "The selected unit is not available for a new resident." });

    const { data: assignment, error: assignmentCheckError } = await admin.from("resident_units")
      .select("id").eq("unit_id", unitId).eq("estate_id", estateId).is("end_date", null).maybeSingle();
    if (assignmentCheckError) return json(500, { error: "unit_assignment_check_failed" });
    if (assignment) return json(409, { error: "unit_already_assigned" });
  }

  const redirectTo = Deno.env.get("AUTH_INVITE_REDIRECT_URL");
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (inviteError || !invited.user) {
    const duplicate = /already|registered|exists/i.test(inviteError?.message ?? "");
    return json(duplicate ? 409 : 400, {
      error: duplicate ? "email_already_registered" : "invitation_failed",
      message: duplicate ? "An account already exists for this email address." : (inviteError?.message ?? "Could not send invitation email."),
    });
  }

  const invitedUserId = invited.user.id;
  const { error: profileError } = await admin.from("users")
    .upsert({ id: invitedUserId, full_name: fullName, phone_e164: null, is_active: true }, { onConflict: "id" });
  if (profileError) return json(500, { error: "account_profile_setup_failed", message: "Invitation sent but profile creation failed; review the account before retrying." });

  const { data: membership, error: membershipError } = await admin.from("estate_memberships")
    .insert({ estate_id: estateId, user_id: invitedUserId, membership_role: role, status: "active" })
    .select("id, estate_id, user_id, membership_role, status, created_at").single();
  if (membershipError || !membership) return json(500, { error: "account_membership_setup_failed", message: "Invitation sent but estate access could not be assigned; review this account before retrying." });

  if (role === "resident") {
    const { error: residentUnitError } = await admin.from("resident_units")
      .insert({ unit_id: unitId, estate_id: estateId, resident_user_id: invitedUserId });
    if (residentUnitError) return json(500, { error: "resident_unit_assignment_failed", message: "Account created but unit assignment failed; review the resident assignment." });
    const { error: unitUpdateError } = await admin.from("units").update({ status: "occupied" }).eq("id", unitId).eq("estate_id", estateId);
    if (unitUpdateError) return json(500, { error: "unit_status_update_failed", message: "Account and assignment created but unit status needs review." });
  }

  return json(201, {
    account: { id: invitedUserId, fullName, email, role, estateId, unitId: role === "resident" ? unitId : null, invitationSent: true },
    membership,
  });
});
