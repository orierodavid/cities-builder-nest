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

  return reply(201, {
    success: true,
    account: { id: newUserId, fullName, email, role: "platform_admin" },
    notificationQueued: true,
  });
});
