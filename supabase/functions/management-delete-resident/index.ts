import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? service;
    if (!url || !service || !anon) return json(503, { error: "service_not_configured" });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\\s+/i, "").trim();
    if (!token) return json(401, { error: "authentication_required" });

    const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: authError } = await caller.auth.getUser(token);
    if (authError || !auth.user) return json(401, { error: "invalid_session" });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
    const estateId = typeof body.estateId === "string" ? body.estateId.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!estateId || !userId || userId === auth.user.id) {
      return json(400, { error: "invalid_input", message: "Select a resident account to delete." });
    }

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "x-cb-actor-id": auth.user.id } },
    });

    const [{ data: actorRole, error: actorRoleError }, { data: actor, error: actorError }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "platform_admin").maybeSingle(),
      admin.from("users").select("is_active,is_disabled,deleted_at").eq("id", auth.user.id).maybeSingle(),
    ]);
    if (actorRoleError || actorError) return json(500, { error: "authorization_check_failed" });
    if (!actorRole || !actor || actor.is_active !== true || actor.is_disabled === true || actor.deleted_at) {
      return json(403, { error: "platform_admin_only", message: "Only an active Super Admin can permanently remove an account." });
    }

    const { data: target, error: targetError } = await admin.from("users")
      .select("id,full_name,first_name,last_name,phone_e164,home_number,street_name,building_name,unit_number,deleted_at")
      .eq("id", userId).maybeSingle();
    if (targetError) return json(500, { error: "target_lookup_failed" });
    if (!target || target.deleted_at) return json(404, { error: "resident_not_found" });

    const [{ data: membership, error: membershipError }, { data: protectedRole, error: protectedRoleError }] = await Promise.all([
      admin.from("estate_memberships").select("id,membership_role")
        .eq("estate_id", estateId).eq("user_id", userId).eq("membership_role", "resident")
        .in("status", ["active", "invited"]).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "platform_admin").maybeSingle(),
    ]);
    if (membershipError || protectedRoleError) return json(500, { error: "target_access_check_failed" });
    if (!membership) return json(404, { error: "resident_not_found_in_estate" });
    if (protectedRole) return json(409, { error: "protected_platform_admin", message: "A platform administrator cannot be deleted from the resident directory." });

    const { data: estate } = await admin.from("estates").select("name").eq("id", estateId).maybeSingle();
    const actorRoleLabel = "platform_admin";
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_user_id: auth.user.id,
      actor_role: actorRoleLabel,
      estate_id: estateId,
      action: "resident_account_deleted",
      resource_type: "user",
      resource_id: userId,
      module: "user_management",
      page_path: "/residents",
      platform: "web",
      outcome: "success",
      severity: "warning",
      changes: {
        action: "account_deleted_and_personal_data_anonymized",
        estate_name: estate?.name || null,
        historical_records_retained_anonymously: true,
      },
      metadata: { target_user_id: userId, estate_id: estateId },
    });
    if (auditError) return json(500, { error: "audit_log_write_failed", message: "The deletion was stopped because the audit record could not be written." });

    // Keep the referenced user row as a non-identifying tombstone so immutable
    // financial, security and operational records retain referential integrity.
    const replacementEmail = `deleted+${userId}@deleted.invalid`;
    const randomPassword = crypto.randomUUID() + crypto.randomUUID() + "Aa1!";
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
      email: replacementEmail,
      email_confirm: true,
      password: randomPassword,
      ban_duration: "876000h",
      user_metadata: {},
    });
    if (authUpdateError) {
      await admin.from("audit_logs").update({ outcome: "failed", changes: { action: "account_deletion_failed", reason: "auth_account_revoke_failed" } })
        .eq("resource_type", "user").eq("resource_id", userId).eq("action", "resident_account_deleted");
      return json(500, { error: "auth_account_revoke_failed", message: "The account could not be securely revoked. No profile data was removed." });
    }

    const { error: profileError } = await admin.from("users").update({
      full_name: "Deleted user",
      first_name: null,
      last_name: null,
      phone_e164: null,
      home_number: null,
      street_name: null,
      building_name: null,
      unit_number: null,
      is_active: false,
      is_disabled: true,
      disabled_at: new Date().toISOString(),
      disabled_by: auth.user.id,
      disabled_reason: "Account deleted by Super Admin",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    if (profileError) return json(500, { error: "profile_anonymization_failed", message: "Login was revoked, but profile anonymization needs administrator follow-up." });

    const replacementEmail = `deleted+${userId}@deleted.invalid`;
    const { error: notificationScrubError } = await admin.from("resident_email_notifications")
      .update({ recipient_email: replacementEmail, last_error: null }).eq("user_id", userId);
    if (notificationScrubError) return json(500, { error: "resident_notification_anonymization_failed" });

    // Close active property assignments and release units only when no other
    // resident assignment remains active for the same unit.
    const { data: activeAssignments, error: assignmentLookupError } = await admin.from("resident_units")
      .select("id,unit_id").eq("resident_user_id", userId).eq("estate_id", estateId).is("end_date", null);
    if (assignmentLookupError) return json(500, { error: "resident_assignment_lookup_failed" });
    if (activeAssignments?.length) {
      const closedAt = new Date().toISOString();
      const { error: closeAssignmentsError } = await admin.from("resident_units")
        .update({ end_date: closedAt }).eq("resident_user_id", userId).eq("estate_id", estateId).is("end_date", null);
      if (closeAssignmentsError) return json(500, { error: "resident_assignment_close_failed" });
      for (const assignment of activeAssignments) {
        const { data: remaining, error: remainingError } = await admin.from("resident_units")
          .select("id").eq("unit_id", assignment.unit_id).eq("estate_id", estateId).is("end_date", null).limit(1);
        if (remainingError) return json(500, { error: "unit_availability_check_failed" });
        if (!remaining?.length) {
          const { error: unitUpdateError } = await admin.from("units").update({ status: "available" })
            .eq("id", assignment.unit_id).eq("estate_id", estateId);
          if (unitUpdateError) return json(500, { error: "unit_release_failed" });
        }
      }
    }

    // Remove access and role grants; retain audit logs and historical transaction
    // records in anonymized form for accounting, security and legal traceability.
    const { error: grantError } = await admin.from("user_roles").update({ assigned_by: null }).eq("assigned_by", userId);
    if (grantError) return json(500, { error: "role_grant_cleanup_failed" });
    const { error: membershipDeleteError } = await admin.from("estate_memberships").delete().eq("user_id", userId);
    if (membershipDeleteError) return json(500, { error: "membership_cleanup_failed" });
    const { error: roleDeleteError } = await admin.from("user_roles").delete().eq("user_id", userId);
    if (roleDeleteError) return json(500, { error: "role_cleanup_failed" });

    return json(200, {
      success: true,
      message: "The account has been deleted, personal details anonymized, and estate access revoked. Audit and historical transaction records were retained.",
    });
  } catch (error) {
    console.error("management-delete-resident failed", error);
    return json(500, { error: "resident_deletion_failed", message: "The account could not be deleted. Contact support with the time of this attempt." });
  }
});
