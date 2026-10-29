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

/**
 * Best-effort compensation for failures after an invite has created an auth user.
 * The invite email has already been sent at this point, so deleting the pending
 * user also invalidates that invite rather than leaving a partially provisioned account.
 */
async function rollbackOnboarding(
  admin: any,
  userId: string,
  estateId: string,
  unitId?: string,
  createdUnitId?: string,
  createdBuildingId?: string,
): Promise<boolean> {
  let clean = true;

  if (unitId) {
    const { error } = await admin.from("resident_units").delete()
      .eq("resident_user_id", userId).eq("estate_id", estateId);
    if (error) clean = false;
  }

  const { error: membershipDeleteError } = await admin.from("estate_memberships").delete()
    .eq("user_id", userId).eq("estate_id", estateId);
  if (membershipDeleteError) clean = false;

  const { error: profileDeleteError } = await admin.from("users").delete().eq("id", userId);
  if (profileDeleteError) clean = false;

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) clean = false;

  // A resident assignment may have been removed after the unit status update
  // succeeded but its response failed. Restore availability only if no active
  // resident assignment remains.
  if (unitId) {
    const { data: activeAssignments, error: activeAssignmentError } = await admin.from("resident_units")
      .select("id").eq("unit_id", unitId).eq("estate_id", estateId).is("end_date", null).limit(1);
    if (activeAssignmentError) {
      clean = false;
    } else if (!activeAssignments?.length) {
      // This project currently has no generated Supabase Database type for the
      // units table in this function, so use the generic PostgREST builder here.
      const unitsTable = admin.from("units") as any;
      const { error: restoreError } = await unitsTable.update({ status: "available" })
        .eq("id", unitId).eq("estate_id", estateId).eq("status", "occupied");
      if (restoreError) clean = false;
    }
  }

  if (createdUnitId) {
    const { error: createdUnitDeleteError } = await admin.from("units").delete()
      .eq("id", createdUnitId).eq("estate_id", estateId);
    if (createdUnitDeleteError) clean = false;
  }

  if (createdBuildingId) {
    const { data: remainingUnits, error: remainingUnitsError } = await admin.from("units")
      .select("id").eq("building_id", createdBuildingId).limit(1);
    if (remainingUnitsError) {
      clean = false;
    } else if (!remainingUnits?.length) {
      const { error: buildingDeleteError } = await admin.from("buildings").delete()
        .eq("id", createdBuildingId).eq("estate_id", estateId);
      if (buildingDeleteError) clean = false;
    }
  }

  return clean;
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
  const requestedUnitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
  const buildingId = typeof input.buildingId === "string" ? input.buildingId.trim() : "";
  const buildingName = typeof input.buildingName === "string" ? input.buildingName.trim() : "";
  const unitCode = typeof input.unitCode === "string" ? input.unitCode.trim() : "";
  const unitType = typeof input.unitType === "string" ? input.unitType.trim() : "";
  const supportedRoles = ["estate_admin", "resident", "facility_manager", "security"];
  const residentDetailsProvided = Boolean(requestedUnitId || buildingId || buildingName || unitCode || unitType);
  const residentDetailsValid = requestedUnitId
    ? !buildingId && !buildingName && !unitCode && !unitType
    : Boolean(unitCode && (buildingId || buildingName) && !(buildingId && buildingName));

  if (!estateId || estateId.length > 100 ||
      fullName.length < 2 || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof role !== "string" || !supportedRoles.includes(role) ||
      (role === "resident" && (!residentDetailsProvided || !residentDetailsValid)) ||
      (role !== "resident" && residentDetailsProvided)) {
    return json(400, { error: "invalid_account_input", message: "Provide an estate, full name, valid email and supported role. Residents also need a building and apartment number." });
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

  let residentUnitId = requestedUnitId || "";
  let createdUnitId = "";
  let createdBuildingId = "";

  if (role === "resident" && !requestedUnitId) {
    if (buildingId) {
      const { data: building, error: buildingError } = await admin.from("buildings")
        .select("id").eq("id", buildingId).eq("estate_id", estateId).maybeSingle();
      if (buildingError) return json(500, { error: "building_validation_failed" });
      if (!building) return json(400, { error: "building_not_in_selected_estate", message: "Select a building belonging to this estate." });
      const { data: duplicateUnit, error: duplicateUnitError } = await admin.from("units")
        .select("id").eq("building_id", buildingId).eq("unit_code", unitCode).maybeSingle();
      if (duplicateUnitError) return json(500, { error: "apartment_validation_failed" });
      if (duplicateUnit) return json(409, { error: "apartment_number_already_exists", message: "That apartment number already exists in the selected building." });
    } else if (buildingName.length < 2 || buildingName.length > 120) {
      return json(400, { error: "invalid_building_name", message: "Enter a valid building name." });
    }
    if (unitCode.length < 1 || unitCode.length > 80 || unitType.length > 80) {
      return json(400, { error: "invalid_apartment_details", message: "Enter a valid apartment number and apartment type." });
    }
  } else if (role === "resident" && requestedUnitId) {
    const { data: unit, error: unitError } = await admin.from("units")
      .select("id, estate_id, status").eq("id", requestedUnitId).maybeSingle();
    if (unitError) return json(500, { error: "unit_validation_failed" });
    if (!unit || unit.estate_id !== estateId) return json(400, { error: "unit_not_in_selected_estate", message: "The selected unit does not belong to this estate." });
    if (unit.status !== "available") return json(409, { error: "unit_not_available", message: "The selected unit is not available for a new resident." });
    const { data: assignment, error: assignmentCheckError } = await admin.from("resident_units")
      .select("id").eq("unit_id", requestedUnitId).eq("estate_id", estateId).is("end_date", null).maybeSingle();
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

  if (role === "resident" && !requestedUnitId) {
    let targetBuildingId = buildingId;
    if (!targetBuildingId) {
      const { data: createdBuilding, error: createBuildingError } = await admin.from("buildings")
        .insert({ estate_id: estateId, name: buildingName }).select("id").single();
      if (createBuildingError || !createdBuilding) {
        await rollbackOnboarding(admin, invitedUserId, estateId);
        return json(500, { error: "apartment_building_creation_failed", message: "The invitation could not be completed because the building could not be created." });
      }
      targetBuildingId = createdBuilding.id;
      createdBuildingId = targetBuildingId;
    }

    const { data: createdUnit, error: createUnitError } = await admin.from("units")
      .insert({ estate_id: estateId, building_id: targetBuildingId, unit_code: unitCode, unit_type: unitType || null, status: "available" })
      .select("id").single();
    if (createUnitError || !createdUnit) {
      await rollbackOnboarding(admin, invitedUserId, estateId, undefined, undefined, createdBuildingId || undefined);
      return json(500, { error: "apartment_creation_failed", message: "The invitation could not be completed because the apartment could not be created. Check the apartment number and building." });
    }
    createdUnitId = createdUnit.id;
    residentUnitId = createdUnit.id;
  }

  const { error: profileError } = await admin.from("users")
    .upsert({ id: invitedUserId, full_name: fullName, phone_e164: null, is_active: true }, { onConflict: "id" });
  if (profileError) {
    const rolledBack = await rollbackOnboarding(admin, invitedUserId, estateId, role === "resident" ? residentUnitId : undefined, createdUnitId || undefined, createdBuildingId || undefined);
    return json(500, {
      error: "account_profile_setup_failed",
      message: rolledBack ? "Profile setup failed and the pending account was rolled back. You can retry the invitation." : "Profile setup failed and automatic cleanup was incomplete. Review the pending account before retrying.",
    });
  }

  const { data: membership, error: membershipError } = await admin.from("estate_memberships")
    .insert({ estate_id: estateId, user_id: invitedUserId, membership_role: role, status: "active" })
    .select("id, estate_id, user_id, membership_role, status, created_at").single();
  if (membershipError || !membership) {
    const rolledBack = await rollbackOnboarding(admin, invitedUserId, estateId, role === "resident" ? unitId : undefined);
    return json(500, {
      error: "account_membership_setup_failed",
      message: rolledBack ? "Estate access setup failed and the pending account was rolled back. You can retry the invitation." : "Estate access setup failed and automatic cleanup was incomplete. Review the pending account before retrying.",
    });
  }

  if (role === "resident") {
    const { error: residentUnitError } = await admin.from("resident_units")
      .insert({ unit_id: residentUnitId, estate_id: estateId, resident_user_id: invitedUserId });
    if (residentUnitError) {
      const rolledBack = await rollbackOnboarding(admin, invitedUserId, estateId, unitId);
      return json(500, {
        error: "resident_unit_assignment_failed",
        message: rolledBack ? "Unit assignment failed and the pending account was rolled back. You can retry the invitation." : "Unit assignment failed and automatic cleanup was incomplete. Review the resident account and unit before retrying.",
      });
    }
    // Compare-and-set protects against two concurrent invitations claiming the
    // same unit after both have passed the initial availability check.
    const { data: updatedUnit, error: unitUpdateError } = await admin.from("units")
      .update({ status: "occupied" })
      .eq("id", residentUnitId).eq("estate_id", estateId).eq("status", "available")
      .select("id").maybeSingle();
    if (unitUpdateError || !updatedUnit) {
      const rolledBack = await rollbackOnboarding(admin, invitedUserId, estateId, unitId);
      return json(unitUpdateError ? 500 : 409, {
        error: unitUpdateError ? "unit_status_update_failed" : "unit_no_longer_available",
        message: rolledBack
          ? "The unit became unavailable during onboarding and the pending account was rolled back. Select an available unit and retry."
          : "The unit became unavailable during onboarding and automatic cleanup was incomplete. Review the resident account and unit before retrying.",
      });
    }
  }

  return json(201, {
    account: { id: invitedUserId, fullName, email, role, estateId, unitId: role === "resident" ? residentUnitId : null, invitationSent: true },
    membership,
  });
});
