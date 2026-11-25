import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(503, { error: "service_not_configured" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "authentication_required" });
  const user = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: auth, error: authError } = await user.auth.getUser(token);
  if (authError || !auth.user?.email) return reply(401, { error: "invalid_session" });
  const { data: legal, error: legalError } = await user.rpc("get_legal_consent_status");
  if (legalError) return reply(503, { error: "legal_consent_check_unavailable" });
  if (legal?.requiresAcceptance) return reply(403, { error: "legal_consent_required" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      fullName.length < 2 || fullName.length > 120) {
    return reply(400, { error: "invalid_invitation_details", message: "Enter the second resident's full name and a valid email address." });
  }
  if (email === auth.user.email.toLowerCase()) {
    return reply(400, { error: "cannot_invite_your_own_email" });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("users")
    .select("is_active,is_disabled,deleted_at").eq("id", auth.user.id).maybeSingle();
  if (profileError) return reply(503, { error: "account_status_check_unavailable" });
  if (!profile || profile.is_active !== true || profile.is_disabled === true || profile.deleted_at) {
    return reply(403, { error: "active_resident_account_required" });
  }

  const { data: reservation, error: reservationError } = await user.rpc("create_resident_household_invite", {
    p_email: email,
    p_full_name: fullName,
  });
  if (reservationError) {
    const detail = reservationError.message || "";
    if (detail.includes("primary_resident_only")) return reply(403, { error: "primary_resident_only", message: "Only the primary resident can invite the second household account." });
    if (detail.includes("apartment_resident_limit_reached")) return reply(409, { error: "apartment_resident_limit_reached", message: "This apartment already has two resident accounts or a pending invitation." });
    if (detail.includes("household_invitation_already_pending")) return reply(409, { error: "household_invitation_already_pending" });
    if (detail.includes("active_resident_apartment_required")) return reply(403, { error: "active_resident_apartment_required" });
    return reply(403, { error: "household_invitation_not_allowed", message: "Your account cannot invite another resident for this apartment." });
  }
  const invite = Array.isArray(reservation) ? reservation[0] : reservation;
  if (!invite?.invite_id) return reply(503, { error: "invitation_reservation_failed" });

  const redirectTo = "https://www.cbnestltd.com/invitation/accepted?flow=household";
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, cb_nest_household_invite: invite.invite_id },
    redirectTo,
  });
  if (inviteError || !invited.user) {
    await admin.from("resident_household_invites").update({ status: "cancelled" }).eq("id", invite.invite_id).eq("status", "pending");
    const duplicate = /already|registered|exists/i.test(inviteError?.message ?? "");
    return reply(duplicate ? 409 : 502, {
      error: duplicate ? "email_already_registered" : "invitation_email_failed",
      message: duplicate
        ? "That email already has a CB Nest account. Use a different email address for this invitation."
        : "The invitation email could not be sent. No second resident account has been added.",
    });
  }

  const { error: linkError } = await admin.from("resident_household_invites")
    .update({ invitee_user_id: invited.user.id })
    .eq("id", invite.invite_id).eq("status", "pending");
  if (linkError) {
    await admin.from("resident_household_invites").update({ status: "cancelled" }).eq("id", invite.invite_id);
    return reply(503, { error: "invitation_link_setup_failed", message: "The invitation was created but could not be linked securely. Please contact support before sending another invitation." });
  }

  return reply(201, {
    success: true,
    email,
    expiresAt: invite.expires_at,
    message: "Invitation sent. The second resident will join this apartment after verifying their email and accepting the invitation.",
  });
});
