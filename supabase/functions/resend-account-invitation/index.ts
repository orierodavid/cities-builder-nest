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

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(503, { error: "service_not_configured" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "authentication_required" });

  const auth = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: actorData, error: actorError } = await auth.auth.getUser(token);
  if (actorError || !actorData.user) return json(401, { error: "invalid_session" });

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  let body: { estateId?: string; userId?: string; delivery?: "invitation" | "password_setup" };
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const estateId = body.estateId?.trim() ?? "";
  const targetUserId = body.userId?.trim() ?? "";
  const delivery = body.delivery ?? "invitation";
  if (!["invitation", "password_setup"].includes(delivery)) return json(400, { error: "invalid_delivery_type" });
  if (!estateId || !targetUserId) return json(400, { error: "estate_and_user_required" });

  const [{ data: platformAdmin, error: roleError }, { data: managerMembership, error: managerError },
    { data: targetMembership, error: targetError }, { data: estate, error: estateError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", actorData.user.id).eq("role", "platform_admin").maybeSingle(),
    admin.from("estate_memberships").select("id").eq("estate_id", estateId).eq("user_id", actorData.user.id)
      .eq("status", "active").in("membership_role", ["facility_manager", "estate_manager", "estate_admin"]).maybeSingle(),
    admin.from("estate_memberships").select("id,membership_role,status").eq("estate_id", estateId)
      .eq("user_id", targetUserId).maybeSingle(),
    admin.from("estates").select("is_enabled").eq("id", estateId).maybeSingle(),
  ]);
  if (roleError || managerError || targetError || estateError) return json(500, { error: "authorization_lookup_failed" });
  if (!platformAdmin && !managerMembership) return json(403, { error: "estate_admin_access_required" });
  if (!targetMembership || targetMembership.status !== "active") return json(404, { error: "active_estate_membership_not_found" });
  if (!estate?.is_enabled) return json(403, { error: "estate_unavailable" });
  if (!platformAdmin && ["estate_admin", "facility_manager", "estate_manager"].includes(targetMembership.membership_role)) {
    return json(403, { error: "insufficient_role_permissions" });
  }

  let origin: string;
  try {
    const parsed = new URL(req.headers.get("origin") ?? "");
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("invalid origin");
    origin = parsed.origin;
  } catch { return json(400, { error: "invalid_portal_origin" }); }
  const redirectTo = new URL("/invitation/accepted", origin).toString();

  const { data: target, error: targetUserError } = await admin.auth.admin.getUserById(targetUserId);
  if (targetUserError || !target.user?.email) return json(404, { error: "account_email_not_found" });
  const email = target.user.email;

  if (delivery === "password_setup") {
    // Send a one-time password setup/reset link. Never email the user's actual password.
    const { error } = await auth.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return json(502, {
      error: "password_setup_email_failed",
      message: "The password setup email could not be sent. Check Supabase Auth email delivery settings and try again.",
    });
    return json(200, { success: true, email, delivery: "password_setup" });
  }

  // Pending invitations get a fresh signup/confirmation email. Already-confirmed
  // accounts get a password-reset email; no duplicate Auth user or membership is created.
  if (!target.user.email_confirmed_at) {
    const { error } = await auth.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return json(502, {
      error: "invitation_resend_failed",
      message: "Supabase could not resend the pending invitation. Check Auth email delivery settings and try again.",
    });
    return json(200, { success: true, email, delivery: "invitation" });
  }

  const { error } = await auth.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return json(502, {
    error: "access_email_failed",
    message: "The account exists, but its password-reset email could not be sent. Check Supabase Auth email delivery settings.",
  });
  return json(200, { success: true, email, delivery: "password_reset" });
});
