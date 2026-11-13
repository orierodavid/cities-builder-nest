import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const htmlEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(503, { error: "service_not_configured" });
  const bearer = req.headers.get("Authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return json(401, { error: "authentication_required" });
  const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: "invalid_session" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const estateId = typeof body.estateId === "string" ? body.estateId.trim() : "";
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const action = body.action === "send" ? "send" : "preview";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!estateId || !targetUserId) return json(400, { error: "invalid_recipient" });
  if (action === "send" && (!subject || subject.length > 180 || !message || message.length > 10000)) {
    return json(400, { error: "invalid_message", message: "Enter a subject (up to 180 characters) and a message (up to 10,000 characters)." });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: platform }, { data: manager }, { data: targetMembership, error: targetError }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "platform_admin").maybeSingle(),
    admin.from("estate_memberships").select("id").eq("estate_id", estateId).eq("user_id", auth.user.id)
      .eq("status", "active").in("membership_role", ["facility_manager", "estate_manager", "estate_admin"]).maybeSingle(),
    admin.from("estate_memberships").select("id").eq("estate_id", estateId).eq("user_id", targetUserId)
      .eq("status", "active").maybeSingle(),
  ]);
  if (!platform && !manager) return json(403, { error: "estate_admin_access_required" });
  if (targetError) return json(500, { error: "recipient_membership_check_failed" });
  if (!targetMembership) return json(404, { error: "user_not_in_authorized_estate" });

  const { data: target, error: targetAuthError } = await admin.auth.admin.getUserById(targetUserId);
  if (targetAuthError || !target.user?.email) return json(404, { error: "recipient_email_unavailable" });
  const recipientName = String(target.user.user_metadata?.full_name ?? target.user.user_metadata?.name ?? "there");
  if (action === "preview") return json(200, { success: true, recipient: { email: target.user.email, name: recipientName } });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("WELCOME_EMAIL_FROM");
  if (!apiKey || !from) {
    return json(503, {
      error: "email_delivery_not_configured",
      message: "The welcome email composer is ready, but email delivery is not configured. Configure the email provider and worker before sending. No email has been sent.",
    });
  }

  const requestId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId)
    ? body.requestId
    : crypto.randomUUID();
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202020;max-width:640px;margin:0 auto;padding:24px"><p>Hello ${escapeHtml(recipientName)},</p><div style="white-space:pre-wrap">${escapeHtml(message)}</div><p style="margin-top:32px;color:#777;font-size:12px">Cities Builder Nest</p></div>`;
  let resendResponse: Response;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestId,
      },
      body: JSON.stringify({
        from,
        to: [target.user.email],
        subject,
        html,
        text: `Hello ${recipientName},\\n\\n${message}\\n\\nCities Builder Nest`,
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return json(502, {
      error: "email_provider_unreachable",
      message: "Resend could not be reached. Retry sending; the same request ID is protected against duplicate sends.",
    });
  }

  let providerResult: Record<string, unknown> = {};
  try {
    const parsed = await resendResponse.json();
    if (parsed && typeof parsed === "object") providerResult = parsed as Record<string, unknown>;
  } catch {
    // Keep provider response details out of the client when the response is not valid JSON.
  }
  if (!resendResponse.ok) {
    return json(502, {
      error: "email_provider_rejected",
      providerStatus: resendResponse.status,
      message: "Resend did not accept the welcome email. Check the sender configuration and try again.",
    });
  }

  return json(200, {
    success: true,
    sent: true,
    provider: "resend",
    messageId: typeof providerResult.id === "string" ? providerResult.id : null,
    recipient: target.user.email,
  });
});