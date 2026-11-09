import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c] ?? c));

async function sendActivationEmail(admin: any, userId: string, estateId: string, email: string, name: string, estateName: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("WELCOME_EMAIL_FROM");
  const { data: log } = await admin.from("resident_email_notifications").insert({
    user_id: userId, estate_id: estateId, event_type: "account_activated",
    recipient_email: email, delivery_status: "pending",
  }).select("id").single();
  if (!apiKey || !from) {
    if (log?.id) await admin.from("resident_email_notifications").update({
      delivery_status: "failed", last_error: "RESEND_API_KEY or WELCOME_EMAIL_FROM is not configured",
    }).eq("id", log.id);
    return false;
  }
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#202020;max-width:620px;margin:0 auto;padding:28px">
    <h2 style="color:#9b762c">CB Nest</h2>
    <p>Hello ${escapeHtml(name)},</p>
    <p>Your account for <strong>${escapeHtml(estateName)}</strong> has been approved and is now active.</p>
    <p>You can now sign in to the CB Nest mobile app using your registered email address and password.</p>
    <p>Welcome to your community,<br/>CB Nest Team</p>
  </div>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [email], subject: "Your CB Nest account is now active",
        html, text: `Hello ${name},\n\nYour account for ${estateName} has been approved and is now active. You can now sign in to the CB Nest mobile app.\n\nCB Nest Team`,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      if (log?.id) await admin.from("resident_email_notifications").update({
        delivery_status: "failed", last_error: `Resend HTTP ${response.status}: ${detail}`,
      }).eq("id", log.id);
      return false;
    }
    const result = await response.json() as { id?: string };
    if (log?.id) await admin.from("resident_email_notifications").update({
      delivery_status: "sent", provider_message_id: result.id ?? null,
      sent_at: new Date().toISOString(), last_error: null,
    }).eq("id", log.id);
    return true;
  } catch {
    if (log?.id) await admin.from("resident_email_notifications").update({
      delivery_status: "failed", last_error: "Email provider request failed",
    }).eq("id", log.id);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(503, { error: "approval_service_not_configured" });

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return reply(401, { error: "authentication_required" });
  const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { error: "invalid_session" });

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const action = input.action;
  const estateId = typeof input.estateId === "string" ? input.estateId.trim() : "";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!estateId || !["list", "approve"].includes(String(action))) return reply(400, { error: "invalid_request" });

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: platform, error: platformError }, { data: manager, error: managerError }, { data: estate, error: estateError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "platform_admin").maybeSingle(),
    admin.from("estate_memberships").select("id").eq("estate_id", estateId).eq("user_id", auth.user.id)
      .eq("membership_role", "facility_manager").eq("status", "active").maybeSingle(),
    admin.from("estates").select("id,name").eq("id", estateId).maybeSingle(),
  ]);
  if (platformError || managerError || estateError) return reply(503, { error: "authorization_check_unavailable" });
  if (!estate) return reply(404, { error: "estate_not_found" });
  if (!platform && !manager) return reply(403, { error: "estate_manager_access_required" });

  if (action === "list") {
    const { data, error } = await admin.from("estate_memberships")
      .select("id,user_id,created_at,users(full_name,first_name,last_name,phone_e164,home_number,street_name)")
      .eq("estate_id", estateId).eq("membership_role", "resident").eq("status", "invited")
      .order("created_at", { ascending: true });
    if (error) return reply(503, { error: "pending_residents_unavailable" });
    const pending = await Promise.all((data ?? []).map(async (row: any) => {
      const { data: authUser } = await admin.auth.admin.getUserById(row.user_id);
      return {
        membershipId: row.id, userId: row.user_id,
        name: row.users?.full_name || [row.users?.first_name, row.users?.last_name].filter(Boolean).join(" ") || "Resident",
        email: authUser.user?.email ?? "",
        phone: row.users?.phone_e164 ?? "",
        homeNumber: row.users?.home_number ?? "",
        streetName: row.users?.street_name ?? "",
        submittedAt: row.created_at,
      };
    }));
    return reply(200, { pending });
  }

  if (!userId) return reply(400, { error: "resident_user_id_required" });
  const { data: approved, error: approvalError } = await admin.rpc("approve_resident_account", {
    p_estate_id: estateId, p_user_id: userId, p_approver_id: auth.user.id,
  });
  if (approvalError) {
    const denied = /not_authorized/i.test(approvalError.message || "");
    return reply(denied ? 403 : 503, { error: denied ? "resident_approval_not_authorized" : "resident_approval_failed" });
  }
  if (approved !== true) return reply(409, { error: "resident_already_approved" });

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user?.email) {
    return reply(200, { success: true, approved: true, emailSent: false, emailError: "recipient_email_unavailable" });
  }
  const sent = await sendActivationEmail(admin, userId, estateId, target.user.email, String(target.user.user_metadata?.full_name || "Resident"), estate.name);
  return reply(200, { success: true, approved: true, emailSent: sent });
});
