import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(503, { error: "account_access_service_unavailable" });

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return reply(401, { error: "authentication_required" });

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: callerResult, error: callerError } = await caller.auth.getUser(token);
  const actor = callerResult.user;
  if (callerError || !actor) return reply(401, { error: "invalid_or_expired_token" });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply(400, { error: "invalid_request" });
    body = parsed as Record<string, unknown>;
  } catch {
    return reply(400, { error: "invalid_request" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "x-cb-actor-id": actor.id } },
  });
  const { data: actorStatus, error: actorStatusError } = await admin.from("users")
    .select("is_active,is_disabled,deleted_at").eq("id", actor.id).maybeSingle();
  if (actorStatusError) return reply(503, { error: "account_status_check_unavailable" });
  if (!actorStatus || actorStatus.is_disabled === true || actorStatus.deleted_at) {
    return reply(403, { error: "account_disabled", message: "This CB Nest account is disabled." });
  }
  if (body.action !== "delete_self" && actorStatus.is_active !== true) {
    return reply(403, { error: "account_pending_approval" });
  }

  if (body.action === "disable" || body.action === "reactivate") {
    const targetUserId = body.userId;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!isUuid(targetUserId) || reason.length > 500) return reply(400, { error: "invalid_account_action" });
    if (targetUserId === actor.id) return reply(400, { error: "cannot_change_own_access" });

    const { data: actorRole, error: actorRoleError } = await admin
      .from("user_roles").select("role").eq("user_id", actor.id).eq("role", "platform_admin").maybeSingle();
    if (actorRoleError) return reply(503, { error: "permission_check_unavailable" });
    if (!actorRole) return reply(403, { error: "platform_admin_required" });

    const { data: target, error: targetError } = await admin
      .from("users").select("id,is_active,is_disabled,deleted_at").eq("id", targetUserId).maybeSingle();
    if (targetError) return reply(503, { error: "target_account_lookup_failed" });
    if (!target) return reply(404, { error: "account_not_found" });
    if (target.deleted_at) return reply(409, { error: "account_already_deleted" });

    if (body.action === "disable") {
      const { error: updateError } = await admin.from("users").update({
        is_disabled: true,
        disabled_at: new Date().toISOString(),
        disabled_by: actor.id,
        disabled_reason: reason || "Disabled by Super Admin",
        updated_at: new Date().toISOString(),
      }).eq("id", targetUserId);
      if (updateError) return reply(503, { error: "account_disable_failed" });

      const { error: banError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
      if (banError) return reply(503, { error: "account_disabled_auth_ban_incomplete", message: "The account is blocked by CB Nest access controls, but Auth could not complete the session ban. Retry the action." });
      return reply(200, { success: true, status: "disabled" });
    }

    const { error: unbanError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
    if (unbanError) return reply(503, { error: "account_reactivation_failed" });
    const { error: updateError } = await admin.from("users").update({
      is_disabled: false,
      disabled_at: null,
      disabled_by: null,
      disabled_reason: null,
      updated_at: new Date().toISOString(),
    }).eq("id", targetUserId);
    if (updateError) {
      await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
      return reply(503, { error: "account_reactivation_failed" });
    }
    return reply(200, { success: true, status: target.is_active ? "active" : "pending_approval" });
  }

  if (body.action === "delete_self") {
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 128 || !actor.email) {
      return reply(400, { error: "password_confirmation_required" });
    }

    const verifier = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
      email: actor.email,
      password,
    });
    if (verifyError || verified.user?.id !== actor.id) {
      return reply(401, { error: "password_confirmation_failed", message: "Your password could not be verified." });
    }

    const { data: platformRole, error: roleError } = await admin
      .from("user_roles").select("role").eq("user_id", actor.id).eq("role", "platform_admin").maybeSingle();
    if (roleError) return reply(503, { error: "account_deletion_check_failed" });
    if (platformRole) {
      return reply(409, { error: "platform_admin_transfer_required", message: "Transfer Super Admin access before deleting this account." });
    }

    const { error: deletionError } = await admin.rpc("complete_self_account_deletion", { p_user_id: actor.id });
    if (deletionError) return reply(503, { error: "account_deletion_failed" });

    const syntheticEmail = `deleted+${actor.id}@deleted.cbnest.invalid`;
    const replacementPassword = `${crypto.randomUUID()}-${crypto.randomUUID()}!`;
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(actor.id, {
      email: syntheticEmail,
      email_confirm: true,
      password: replacementPassword,
      ban_duration: "876000h",
      user_metadata: {
        account_deleted: true,
        email: null,
        full_name: null,
        name: null,
        first_name: null,
        last_name: null,
        phone: null,
        avatar_url: null,
      },
    });
    if (authUpdateError) {
      return reply(503, { error: "account_deleted_auth_cleanup_incomplete", message: "Your CB Nest profile is anonymised and access is blocked. Auth cleanup needs to be retried by support." });
    }

    await verifier.auth.signOut({ scope: "global" }).catch(() => undefined);
    return reply(200, {
      success: true,
      deleted: true,
      message: "Your account has been deactivated and personal profile details anonymised. Financial and audit records are retained where required.",
    });
  }

  return reply(400, { error: "unsupported_account_action" });
});
