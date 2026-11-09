import { NIGERIA_LGAS } from "./nigeria-locations.ts";
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

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function normalisePhone(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.startsWith("234") && digits.length === 13) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "+234" + digits.slice(1);
  if (digits.length === 10 && /^[789]/.test(digits)) return "+234" + digits;
  return "";
}
async function sendEmail(admin: any, userId: string, estateId: string, email: string, name: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("WELCOME_EMAIL_FROM");
  const eventType = "account_pending_approval";
  const { data: log } = await admin.from("resident_email_notifications").insert({
    user_id: userId, estate_id: estateId, event_type: eventType,
    recipient_email: email, delivery_status: "pending",
  }).select("id").single();
  if (!apiKey || !from) {
    if (log?.id) await admin.from("resident_email_notifications").update({
      delivery_status: "failed", last_error: "RESEND_API_KEY or WELCOME_EMAIL_FROM is not configured",
    }).eq("id", log.id);
    return { sent: false, error: "email_delivery_not_configured" };
  }
  const safeName = escapeHtml(name);
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#202020;max-width:620px;margin:0 auto;padding:28px">
    <h2 style="color:#9b762c">CB Nest</h2>
    <p>Hello ${safeName},</p>
    <p>Your CB Nest account has been created successfully.</p>
    <p><strong>Your account is awaiting approval</strong> from the estate administrator. You will receive another email as soon as your account is approved and activated.</p>
    <p>You will be able to sign in and access your resident dashboard after approval.</p>
    <p>Thank you,<br/>CB Nest Team</p>
  </div>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [email], subject: "Your CB Nest account is awaiting approval",
        html, text: `Hello ${name},\n\nYour CB Nest account has been created and is awaiting approval from the estate administrator. You will receive another email when your account is approved and activated.\n\nCB Nest Team`,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      if (log?.id) await admin.from("resident_email_notifications").update({
        delivery_status: "failed", last_error: `Resend HTTP ${response.status}: ${detail}`,
      }).eq("id", log.id);
      return { sent: false, error: "email_provider_rejected" };
    }
    const result = await response.json() as { id?: string };
    if (log?.id) await admin.from("resident_email_notifications").update({
      delivery_status: "sent", provider_message_id: result.id ?? null,
      sent_at: new Date().toISOString(), last_error: null,
    }).eq("id", log.id);
    return { sent: true, emailId: result.id ?? null };
  } catch {
    if (log?.id) await admin.from("resident_email_notifications").update({
      delivery_status: "failed", last_error: "Email provider request failed",
    }).eq("id", log.id);
    return { sent: false, error: "email_provider_unavailable" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(503, { error: "registration_service_not_configured" });

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  if (input.action === "options") {
    const { data, error } = await admin.from("estates")
      .select("id,name,state,lga,city").eq("is_enabled", true)
      .order("state").order("lga").order("name");
    if (error) return reply(503, { error: "estate_options_unavailable" });
    const estates = (data ?? []).map((estate: any) => ({
      id: estate.id, name: estate.name, state: estate.state,
      lga: estate.lga || estate.city || "",
    })).filter((estate: any) => estate.state && estate.lga);
    const states = Object.keys(NIGERIA_LGAS).sort();
    return reply(200, { states, lgas: NIGERIA_LGAS, estates });
  }

  if (input.action !== "register") return reply(400, { error: "invalid_action" });
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? normalisePhone(input.phone) : "";
  const password = typeof input.password === "string" ? input.password : "";
  const estateId = typeof input.estateId === "string" ? input.estateId.trim() : "";
  const state = typeof input.state === "string" ? input.state.trim() : "";
  const lga = typeof input.lga === "string" ? input.lga.trim() : "";
  if (firstName.length < 2 || firstName.length > 60 || lastName.length < 2 || lastName.length > 60 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone ||
      password.length < 8 || password.length > 128 || !estateId || !state || !lga) {
    return reply(400, { error: "invalid_registration_details", message: "Complete all fields and use a valid Nigerian phone number and a password of at least 8 characters." });
  }

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const bucket = await digest("cbnest:resident-register:" + ip);
  const rate = await admin.rpc("consume_api_rate_limit", {
    p_bucket_key: bucket, p_window_seconds: 3600, p_max_requests: 5,
  });
  if (rate.error) return reply(503, { error: "registration_rate_limit_unavailable" });
  if (rate.data !== true) return reply(429, { error: "registration_rate_limited", message: "Too many registration attempts. Please try again later." });

  const { data: estate, error: estateError } = await admin.from("estates")
    .select("id,name,state,lga,city,is_enabled").eq("id", estateId).maybeSingle();
  if (estateError) return reply(503, { error: "estate_validation_unavailable" });
  if (!estate || estate.is_enabled !== true || estate.state !== state || (estate.lga || estate.city) !== lga) {
    return reply(400, { error: "invalid_estate_selection", message: "Select an active estate matching the selected State and LGA." });
  }

  const fullName = firstName + " " + lastName;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName, phone_e164: phone },
  });
  if (createError || !created.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message ?? "");
    return reply(duplicate ? 409 : 400, {
      error: duplicate ? "email_already_registered" : "registration_failed",
      message: duplicate ? "An account already exists for this email address." : "Your account could not be created. Please check your details and try again.",
    });
  }

  const userId = created.user.id;
  const { error: profileError } = await admin.from("users").upsert({
    id: userId, full_name: fullName, first_name: firstName, last_name: lastName,
    phone_e164: phone, is_active: false,
  }, { onConflict: "id" });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return reply(500, { error: "registration_profile_failed" });
  }
  const { data: membership, error: membershipError } = await admin.from("estate_memberships")
    .insert({ estate_id: estateId, user_id: userId, membership_role: "resident", status: "invited" })
    .select("id").single();
  if (membershipError || !membership) {
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return reply(500, { error: "registration_membership_failed" });
  }

  const delivery = await sendEmail(admin, userId, estateId, email, fullName);
  return reply(201, {
    success: true, status: "pending_approval",
    message: "Your account has been created and is awaiting administrator approval.",
    emailSent: delivery.sent,
    emailError: delivery.sent ? null : delivery.error,
  });
});
