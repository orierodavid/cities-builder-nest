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
  const bearer = req.headers.get("Authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return json(401, { error: "authentication_required" });
  const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: "invalid_session" });
  const { data: legal, error: legalError } = await caller.rpc("get_legal_consent_status");
  if (legalError) return json(503, { error: "legal_consent_check_unavailable" });
  if (legal?.requiresAcceptance === true) return json(403, { error: "legal_consent_required" });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const estateId = typeof body.estateId === "string" ? body.estateId.trim() : "";
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!estateId || !targetUserId || password.length < 8 || password.length > 128) {
    return json(400, { error: "invalid_input", message: "Provide a target user, estate and password of 8–128 characters." });
  }
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-cb-actor-id": auth.user.id } },
  });
  const [{ data: platform }, { data: manager }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "platform_admin").maybeSingle(),
    admin.from("estate_memberships").select("id").eq("estate_id", estateId).eq("user_id", auth.user.id)
      .eq("status", "active").in("membership_role", ["facility_manager", "estate_manager", "estate_admin"]).maybeSingle(),
  ]);
  if (!platform && !manager) return json(403, { error: "estate_admin_access_required" });
  const { data: targetMembership, error: targetError } = await admin.from("estate_memberships")
    .select("id").eq("estate_id", estateId).eq("user_id", targetUserId).eq("status", "active").maybeSingle();
  if (targetError) return json(500, { error: "target_membership_check_failed" });
  if (!targetMembership) return json(404, { error: "user_not_in_authorized_estate" });
  const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password });
  if (updateError) return json(400, { error: "password_update_failed", message: updateError.message });
  return json(200, { success: true, userId: targetUserId, passwordUpdated: true });
});
