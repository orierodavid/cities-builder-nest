import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

async function sendImmediateAccountAlert(
  recipientEmail: string,
  recipientName: string,
  account: { fullName: string; email: string; role: string; estate?: string },
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("WELCOME_EMAIL_FROM");
  if (!apiKey || !from) return { sent: false, error: "email_delivery_not_configured" };
  const subject = "New CB Nest account created";
  const text = [
    "A new CB Nest account has been created.",
    "",
    `Name: ${account.fullName}`,
    `Email: ${account.email}`,
    `Role: ${account.role}`,
    `Estate: ${account.estate || "Platform-wide"}`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202020;max-width:640px;margin:0 auto;padding:24px"><p>Hello ${escapeEmailHtml(recipientName)},</p><p>A new CB Nest account has been created.</p><p><strong>Name:</strong> ${escapeEmailHtml(account.fullName)}<br/><strong>Email:</strong> ${escapeEmailHtml(account.email)}<br/><strong>Role:</strong> ${escapeEmailHtml(account.role)}<br/><strong>Estate:</strong> ${escapeEmailHtml(account.estate || "Platform-wide")}</p><p>Cities Builder Nest</p></div>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [recipientEmail], subject, html, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { sent: false, error: `resend_http_${response.status}` };
    return { sent: true };
  } catch {
    return { sent: false, error: "resend_request_failed" };
  }
}

async function notifyExistingSuperAdmins(
  admin: any,
  newUserId: string,
  account: { fullName: string; email: string; role: string; estate?: string },
): Promise<{ sent: number; failed: number }> {
  const { data: recipients, error } = await admin.from("user_roles")
    .select("user_id, users!inner(full_name,is_active,is_disabled,deleted_at)")
    .eq("role", "platform_admin")
    .neq("user_id", newUserId);
  if (error) return { sent: 0, failed: 1 };
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients ?? []) {
    const profile = Array.isArray(recipient.users) ? recipient.users[0] : recipient.users;
    if (!profile || profile.is_active === false || profile.is_disabled === true || profile.deleted_at) continue;
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(recipient.user_id);
    if (authError || !authUser.user?.email) { failed++; continue; }
    const result = await sendImmediateAccountAlert(authUser.user.email, profile.full_name || "Super Admin", account);
    if (result.sent) sent++; else failed++;
  }
  return { sent, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return reply(503, { error: "admin_creation_not_configured" });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return reply(401, { error: "authentication_required" });

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return reply(401, { error: "invalid_session" });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "x-cb-actor-id": authData.user.id } },
  });

  // The role is read from the protected database table, never from user metadata
  // or a client-supplied role field.
  const { data: actorRole, error: roleError } = await admin.from("user_roles")
    .select("user_id").eq("user_id", authData.user.id).eq("role", "platform_admin").maybeSingle();
  if (roleError) return reply(503, { error: "authorization_check_unavailable" });
  if (!actorRole) return reply(403, { error: "platform_admin_required" });

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (fullName.length < 2 || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12 || password.length > 128) {
    return reply(400, {
      error: "invalid_admin_details",
      message: "Provide a full name, valid email address, and password between 12 and 128 characters.",
    });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message ?? "");
    return reply(duplicate ? 409 : 400, {
      error: duplicate ? "email_already_registered" : "admin_creation_failed",
      message: duplicate ? "An account already exists for this email address." : "The Super Admin account could not be created.",
    });
  }

  const newUserId = created.user.id;
  const { error: profileError } = await admin.from("users").upsert({
    id: newUserId,
    full_name: fullName,
    phone_e164: null,
    is_active: true,
  }, { onConflict: "id" });

  if (profileError) {
    await admin.from("users").delete().eq("id", newUserId);
    await admin.auth.admin.deleteUser(newUserId);
    return reply(500, { error: "admin_profile_setup_failed", message: "The new account was rolled back because its profile could not be saved." });
  }

  const { error: roleInsertError } = await admin.from("user_roles").insert({
    user_id: newUserId,
    role: "platform_admin",
    assigned_by: authData.user.id,
  });
  if (roleInsertError) {
    await admin.from("users").delete().eq("id", newUserId);
    await admin.auth.admin.deleteUser(newUserId);
    return reply(500, { error: "admin_role_setup_failed", message: "The new account was rolled back because platform access could not be assigned." });
  }

  const notifications = await notifyExistingSuperAdmins(admin, newUserId, {
    fullName, email, role: "Super Admin", estate: "Platform-wide",
  });
  return reply(201, {
    success: true,
    account: { id: newUserId, fullName, email, role: "platform_admin" },
    notifications: { sent: notifications.sent, failed: notifications.failed },
  });
});
