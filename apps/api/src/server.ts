import "express-async-errors";
import "dotenv/config";
import express from "express";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { decryptVisitorAccessCode, encryptVisitorAccessCode } from "./visitor-pass-code.js";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import { requireAuth, authConfigurationReady, type AuthenticatedRequest } from "./auth.js";
import { checkDatabase } from "./storage.js";
import { startApiServer } from "./lifecycle.js";
import { sharedRateLimit } from "./rate-limit.js";
import { getPageWindow, pageResult } from "./pagination.js";
import { submitMaintenanceRequest } from "./maintenance-service.js";
import { canCreateVisitorPass } from "./visitor-pass-policy.js";
import { parseVisitorPassInput } from "./visitor-pass-input-policy.js";
import { canUseGateWorkflow } from "./gate-workflow-policy.js";
import { isValidVisitorAccessCode, visitorCheckInFailure, visitorPassAvailabilityError } from "./visitor-pass-lifecycle-policy.js";
import { isAllowedCorsOrigin } from "./cors-policy.js";
import { trustedProxyHops } from "./proxy-config.js";
import type { ErrorRequestHandler } from "express";

export const app = express();
// The production API runs behind one trusted platform ingress proxy. Keep this
// configurable so direct/local deployments do not trust arbitrary forwarded IPs.
app.set("trust proxy", trustedProxyHops(process.env.TRUST_PROXY_HOPS, process.env.NODE_ENV));
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

// Requests without an Origin header (for example, server-to-server health checks)
// remain supported. Browser origins must be explicitly configured via CORS_ORIGINS.
app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    const authenticated = req as AuthenticatedRequest;
    const estateId = req.params?.estateId;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const logEntry = {
      requestId,
      method: req.method,
      route: req.route?.path ?? req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      actorUserId: authenticated.authUser?.id ?? null,
      estateId: typeof estateId === "string" ? estateId : null,
      occurredAt: new Date().toISOString(),
    };
    if (res.statusCode >= 500 || durationMs >= 2_000) {
      console.error(JSON.stringify({
        event: "api_request_alert",
        severity: res.statusCode >= 500 ? "error" : "warning",
        ...logEntry,
      }));
    }
    console.info(JSON.stringify({ event: "api_request", ...logEntry }));
  });
  next();
});
app.use("/v1", sharedRateLimit);

app.get("/health", async (_req, res) => {
  let database = "not-configured";
  try {
    if (process.env.DATABASE_URL) {
      await checkDatabase();
      database = "ok";
    }
    res.status(200).json({
      status: "ok",
      service: "cities-builder-nest-api",
      database,
      authentication: authConfigurationReady() ? "configured" : "not-configured",
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      service: "cities-builder-nest-api",
      database: "error",
      authentication: authConfigurationReady() ? "configured" : "not-configured",
    });
  }
});

app.get("/", (_req, res) => {
  res.json({
    name: "Cities Builder Nest API",
    status: "starter",
    authentication: authConfigurationReady() ? "supabase-configured" : "not-configured",
    message: "Authenticated profile endpoint is available at GET /v1/me.",
  });
});

async function hasPlatformAdmin(userSupabase: AuthenticatedRequest["userSupabase"], userId: string): Promise<boolean> {
  const { data, error } = await userSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "platform_admin")
    .maybeSingle();
  return !error && Boolean(data);
}

async function hasEstateManager(userSupabase: AuthenticatedRequest["userSupabase"], userId: string, estateId: string): Promise<boolean> {
  const { data, error } = await userSupabase
    .from("estate_memberships")
    .select("membership_role")
    .eq("estate_id", estateId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("membership_role", ["facility_manager", "estate_manager", "estate_admin"])
    .maybeSingle();
  return !error && Boolean(data);
}

async function isEstateEnabled(userSupabase: AuthenticatedRequest["userSupabase"], estateId: string): Promise<boolean | null> {
  const { data, error } = await userSupabase
    .from("estates")
    .select("is_enabled")
    .eq("id", estateId)
    .maybeSingle();
  if (error || !data) return null;
  return data.is_enabled === true;
}

function rejectInactiveEstate(res: import("express").Response): void {
  res.status(423).json({
    error: "estate_subscription_inactive",
    message: "This estate is temporarily unavailable because its subscription is inactive.",
  });
}

app.patch("/v1/estates/:estateId/subscription", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  if (!(await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id))) {
    res.status(403).json({ error: "platform_admin_required" });
    return;
  }

  const param = req.params.estateId;
  const estateId = Array.isArray(param) ? (param[0] ?? "") : param;
  const enabled = req.body?.enabled;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
  if (typeof enabled !== "boolean" || (reason !== null && reason.length > 500)) {
    res.status(400).json({ error: "invalid_subscription_status", message: "Provide enabled as a boolean and an optional reason up to 500 characters." });
    return;
  }

  const { data, error } = await authenticated.userSupabase
    .from("estates")
    .update({
      is_enabled: enabled,
      disabled_at: enabled ? null : new Date().toISOString(),
      disabled_reason: enabled ? null : (reason || "Subscription inactive"),
    })
    .eq("id", estateId)
    .select("id, name, is_enabled, disabled_at, disabled_reason")
    .maybeSingle();

  if (error || !data) {
    res.status(400).json({ error: "estate_subscription_update_failed", message: "Confirm migration 009 is applied and the estate exists." });
    return;
  }
  res.status(200).json({ estate: data });
});

app.post("/v1/estates", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  if (!(await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id))) {
    res.status(403).json({ error: "platform_admin_required" });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const city = typeof req.body?.city === "string" ? req.body.city.trim() : "";
  const state = typeof req.body?.state === "string" ? req.body.state.trim() : "";
  const countryCode = typeof req.body?.countryCode === "string" ? req.body.countryCode.trim().toUpperCase() : "NG";
  const timezone = typeof req.body?.timezone === "string" ? req.body.timezone.trim() : "Africa/Lagos";

  if (name.length < 2 || name.length > 120 || address.length < 4 || city.length < 2 || state.length < 2 || !/^[A-Z]{2}$/.test(countryCode) || timezone.length < 3 || timezone.length > 80) {
    res.status(400).json({ error: "invalid_estate_details", message: "Provide an estate name, address, city, state, two-letter country code, and timezone." });
    return;
  }

  const { data, error } = await authenticated.userSupabase
    .from("estates")
    .insert({ name, address, city, state, country_code: countryCode, timezone })
    .select("id, name, address, city, state, country_code, timezone, created_at")
    .single();

  if (error || !data) {
    res.status(400).json({ error: "estate_create_failed" });
    return;
  }
  res.status(201).json({ estate: data });
});

app.post("/v1/estates/:estateId/residents", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const residentUserId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";

  if (!residentUserId || residentUserId.length > 100) {
    res.status(400).json({ error: "resident_user_id_required", message: "Provide the ID of an existing registered user." });
    return;
  }

  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  const manager = platformAdmin || await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId);
  if (!manager) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }

  const { data: residentCandidates, error: residentError } = await authenticated.userSupabase
    .rpc("get_active_resident_candidate", {
      target_estate_id: estateId,
      target_user_id: residentUserId,
    });
  const resident = Array.isArray(residentCandidates) ? residentCandidates[0] : null;

  if (residentError || !resident || !resident.is_active) {
    res.status(404).json({ error: "active_registered_user_not_found", message: "The resident must already have a registered, active account and be eligible for this estate." });
    return;
  }

  const { data, error } = await authenticated.userSupabase
    .from("estate_memberships")
    .insert({
      estate_id: estateId,
      user_id: residentUserId,
      membership_role: "resident",
      status: "active",
    })
    .select("id, estate_id, user_id, membership_role, status, created_at")
    .single();

  if (error || !data) {
    res.status(400).json({ error: "resident_membership_create_failed", message: "Confirm the estate, resident account, and that the resident is not already a member." });
    return;
  }
  res.status(201).json({ resident: { id: resident.id, fullName: resident.full_name, phone: resident.phone_e164 }, membership: data });
});


app.post("/v1/estates/:estateId/accounts", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const isPlatformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!isPlatformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_admin_access_required", message: "Only a platform administrator or manager of this estate can create accounts." });
    return;
  }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const role = req.body?.role;
  const unitId = typeof req.body?.unitId === "string" ? req.body.unitId.trim() : "";
  const supportedRoles = ["estate_admin", "resident", "facility_manager", "security"];
  // Estate administrators are privileged: only a platform administrator may invite one.
  if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !supportedRoles.includes(role) ||
      (role === "resident" && !unitId) || (role !== "resident" && unitId)) {
    res.status(400).json({ error: "invalid_account_input", message: "Provide a full name, valid email, supported role (estate_admin, resident, facility_manager, or security), and a unit for residents only." });
    return;
  }
  if (role === "estate_admin" && !isPlatformAdmin) {
    res.status(403).json({ error: "platform_admin_required", message: "Only a platform administrator can invite an estate administrator." });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !serviceKey) {
    res.status(503).json({ error: "invitation_service_not_configured", message: "Configure SUPABASE_SERVICE_ROLE_KEY on the API server before creating invited accounts." });
    return;
  }

  const adminSupabase = createClient(process.env.SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    // Trusted by audit triggers only when the request JWT role is service_role.
    global: { headers: { "x-cb-actor-id": authenticated.authUser.id } },
  });

  if (role === "resident") {
    const { data: unit, error: unitError } = await adminSupabase
      .from("units")
      .select("id, building_id, buildings!inner(estate_id)")
      .eq("id", unitId)
      .maybeSingle();
    const building = unit?.buildings as unknown as { estate_id?: string } | null;
    if (unitError || !unit || building?.estate_id !== estateId) {
      res.status(400).json({ error: "unit_not_in_selected_estate", message: "Select an apartment or unit belonging to this estate." });
      return;
    }
    const { data: activeAssignment } = await adminSupabase
      .from("resident_units")
      .select("id")
      .eq("unit_id", unitId)
      .is("end_date", null)
      .maybeSingle();
    if (activeAssignment) {
      res.status(409).json({ error: "unit_already_assigned", message: "This unit already has an active resident assignment." });
      return;
    }
  }

  const redirectTo = process.env.AUTH_INVITE_REDIRECT_URL;
  const { data: invited, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (inviteError || !invited.user) {
    const duplicate = /already|registered|exists/i.test(inviteError?.message ?? "");
    res.status(duplicate ? 409 : 400).json({
      error: duplicate ? "email_already_registered" : "invitation_failed",
      message: duplicate ? "An account already exists for this email address." : (inviteError?.message ?? "Could not send the invitation email."),
    });
    return;
  }

  const userId = invited.user.id;
  const { error: profileError } = await adminSupabase.from("users")
    .upsert({ id: userId, full_name: fullName, phone_e164: null, is_active: true }, { onConflict: "id" });
  if (profileError) {
    res.status(500).json({ error: "account_profile_setup_failed", message: "The invitation was created, but the profile could not be saved. Check API logs before retrying this email." });
    return;
  }

  const { data: membership, error: membershipError } = await adminSupabase.from("estate_memberships")
    .insert({ estate_id: estateId, user_id: userId, membership_role: role, status: "active" })
    .select("id, estate_id, user_id, membership_role, status, created_at")
    .single();
  if (membershipError || !membership) {
    res.status(500).json({ error: "account_membership_setup_failed", message: "The invitation was sent, but estate access could not be assigned. An administrator must resolve this account before inviting again." });
    return;
  }

  if (role === "resident") {
    const { error: assignmentError } = await adminSupabase.from("resident_units")
      .insert({ unit_id: unitId, resident_user_id: userId });
    if (assignmentError) {
      res.status(500).json({ error: "resident_unit_assignment_failed", message: "The account and estate membership were created, but the unit assignment failed. Please review the resident assignment." });
      return;
    }
    await adminSupabase.from("units").update({ status: "occupied" }).eq("id", unitId);
  }

  res.status(201).json({
    account: { id: userId, fullName, email, role, estateId, unitId: role === "resident" ? unitId : null, invitationSent: true },
    membership,
  });
});

app.post("/v1/estates/:estateId/staff", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  if (!(await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id))) {
    res.status(403).json({ error: "platform_admin_required" });
    return;
  }

  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  const role = req.body?.role;
  if (!userId || !["estate_admin", "estate_manager", "facility_manager", "security"].includes(role)) {
    res.status(400).json({ error: "invalid_staff_assignment", message: "Provide an existing user ID and role estate_admin, estate_manager, facility_manager, or security." });
    return;
  }

  const { data: staff, error: staffError } = await authenticated.userSupabase
    .from("users")
    .select("id, full_name, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (staffError || !staff || !staff.is_active) {
    res.status(404).json({ error: "active_staff_account_not_found" });
    return;
  }

  const { data, error } = await authenticated.userSupabase
    .from("estate_memberships")
    .insert({ estate_id: estateId, user_id: userId, membership_role: role, status: "active" })
    .select("id, estate_id, user_id, membership_role, status, created_at")
    .single();
  if (error || !data) {
    res.status(400).json({ error: "staff_assignment_failed", message: "Confirm the estate and account, and check for an existing estate membership." });
    return;
  }
  res.status(201).json({ staff: { id: staff.id, fullName: staff.full_name }, membership: data });
});



app.get("/v1/estates/:estateId/buildings", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("buildings")
    .select("id, estate_id, name, created_at").eq("estate_id", estateId).order("name")
    .range(page.from, page.to);
  if (error) { res.status(403).json({ error: "building_list_access_denied" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ buildings: result.items, pagination: result.pagination });
});

app.get("/v1/estates/:estateId/units", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("units")
    .select("id, estate_id, building_id, unit_code, unit_type, status").eq("estate_id", estateId).order("unit_code")
    .range(page.from, page.to);
  if (error) { res.status(403).json({ error: "unit_list_access_denied" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ units: result.items, pagination: result.pagination });
});

app.get("/v1/estates/:estateId/residents", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const page = getPageWindow(req);
  const { data: memberships, error } = await authenticated.userSupabase.from("estate_memberships")
    .select("user_id").eq("estate_id", estateId).eq("membership_role", "resident").eq("status", "active")
    .order("created_at", { ascending: true }).range(page.from, page.to);
  if (error) { res.status(403).json({ error: "resident_list_access_denied" }); return; }
  const membershipPage = pageResult(memberships, page);
  const ids = [...new Set(membershipPage.items.map((item) => item.user_id))];
  if (!ids.length) { res.status(200).json({ residents: [], pagination: membershipPage.pagination }); return; }
  const { data: residents, error: residentError } = await authenticated.userSupabase.from("users")
    .select("id, full_name, phone_e164").in("id", ids).order("full_name");
  if (residentError) { res.status(403).json({ error: "resident_directory_access_denied" }); return; }
  res.status(200).json({ residents: residents ?? [], pagination: membershipPage.pagination });
});

app.post("/v1/estates/:estateId/buildings", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const param = req.params.estateId;
  const estateId = Array.isArray(param) ? (param[0] ?? "") : param;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (name.length < 2 || name.length > 120) {
    res.status(400).json({ error: "invalid_building_name" });
    return;
  }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const { data, error } = await authenticated.userSupabase
    .from("buildings")
    .insert({ estate_id: estateId, name })
    .select("id, estate_id, name, created_at")
    .single();
  if (error || !data) {
    res.status(error?.code === "23505" ? 409 : 400).json({ error: error?.code === "23505" ? "building_name_exists" : "building_create_failed" });
    return;
  }
  res.status(201).json({ building: data });
});

app.post("/v1/estates/:estateId/buildings/:buildingId/units", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateParam = req.params.estateId;
  const buildingParam = req.params.buildingId;
  const estateId = Array.isArray(estateParam) ? (estateParam[0] ?? "") : estateParam;
  const buildingId = Array.isArray(buildingParam) ? (buildingParam[0] ?? "") : buildingParam;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const unitCode = typeof req.body?.unitCode === "string" ? req.body.unitCode.trim() : "";
  const unitType = typeof req.body?.unitType === "string" ? req.body.unitType.trim() : null;
  if (unitCode.length < 1 || unitCode.length > 60 || (unitType !== null && unitType.length > 80)) {
    res.status(400).json({ error: "invalid_unit_details" });
    return;
  }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const { data: building, error: buildingError } = await authenticated.userSupabase
    .from("buildings")
    .select("id, estate_id")
    .eq("id", buildingId)
    .eq("estate_id", estateId)
    .maybeSingle();
  if (buildingError || !building) {
    res.status(404).json({ error: "building_not_found_in_estate" });
    return;
  }
  const { data, error } = await authenticated.userSupabase
    .from("units")
    .insert({ building_id: buildingId, estate_id: estateId, unit_code: unitCode, unit_type: unitType, status: "available" })
    .select("id, estate_id, building_id, unit_code, unit_type, status")
    .single();
  if (error || !data) {
    res.status(error?.code === "23505" ? 409 : 400).json({ error: error?.code === "23505" ? "unit_code_exists" : "unit_create_failed" });
    return;
  }
  res.status(201).json({ unit: data });
});

app.post("/v1/estates/:estateId/units/:unitId/assignments", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateParam = req.params.estateId;
  const unitParam = req.params.unitId;
  const estateId = Array.isArray(estateParam) ? (estateParam[0] ?? "") : estateParam;
  const unitId = Array.isArray(unitParam) ? (unitParam[0] ?? "") : unitParam;
  const residentUserId = typeof req.body?.residentUserId === "string" ? req.body.residentUserId.trim() : "";
  const startDate = typeof req.body?.startDate === "string" ? req.body.startDate : undefined;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  if (!residentUserId || residentUserId.length > 100 || (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate))) {
    res.status(400).json({ error: "invalid_unit_assignment", message: "Provide residentUserId and an optional startDate in YYYY-MM-DD format." });
    return;
  }

  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  const manager = platformAdmin || await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId);
  if (!manager) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }

  const { data: unit, error: unitError } = await authenticated.userSupabase
    .from("units")
    .select("id, estate_id, building_id, unit_code, status")
    .eq("id", unitId)
    .eq("estate_id", estateId)
    .maybeSingle();
  if (unitError || !unit) {
    res.status(404).json({ error: "unit_not_found_in_estate" });
    return;
  }
  if (unit.status !== "available") {
    res.status(409).json({ error: "unit_not_available", message: "Only available units can be assigned." });
    return;
  }

  const { data: resident, error: residentError } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("user_id, membership_role, status")
    .eq("estate_id", estateId)
    .eq("user_id", residentUserId)
    .eq("membership_role", "resident")
    .eq("status", "active")
    .maybeSingle();
  if (residentError || !resident) {
    res.status(404).json({ error: "active_resident_membership_required" });
    return;
  }

  const { data: assignment, error: assignmentError } = await authenticated.userSupabase
    .from("resident_units")
    .insert({
      estate_id: estateId,
      unit_id: unitId,
      resident_user_id: residentUserId,
      ...(startDate ? { start_date: startDate } : {}),
    })
    .select("id, estate_id, unit_id, resident_user_id, start_date, end_date, created_at")
    .single();

  if (assignmentError || !assignment) {
    const conflict = assignmentError?.code === "23505";
    res.status(conflict ? 409 : 400).json({
      error: conflict ? "unit_or_resident_already_assigned" : "unit_assignment_failed",
      message: conflict
        ? "The unit is already occupied or this resident already has an active unit assignment."
        : "Confirm the resident, unit, estate, and that migration 007 has been applied.",
    });
    return;
  }

  res.status(201).json({ assignment });
});

app.get("/v1/estates", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (platformAdmin) {
    const { data: allEstates, error: estatesError } = await authenticated.userSupabase
      .from("estates")
      .select("id, name, address, city, state, timezone, is_enabled, disabled_at, disabled_reason")
      .order("name", { ascending: true });
    if (estatesError) {
      res.status(403).json({ error: "estate_access_denied" });
      return;
    }
    res.status(200).json({ estates: (allEstates ?? []).map((estate) => ({ ...estate, membershipRole: "platform_admin" })) });
    return;
  }
  const { data, error } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("estate_id, membership_role, status, created_at")
    .eq("user_id", authenticated.authUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    res.status(403).json({ error: "estate_memberships_access_denied" });
    return;
  }

  const memberships = data ?? [];
  if (memberships.length === 0) {
    res.status(200).json({ estates: [] });
    return;
  }

  const ids = [...new Set(memberships.map((item) => item.estate_id))];
  const result = await authenticated.userSupabase
    .from("estates")
    .select("id, name, address, city, state, timezone, is_enabled, disabled_at, disabled_reason")
    .in("id", ids)
    .order("name", { ascending: true });

  if (result.error) {
    res.status(403).json({ error: "estate_access_denied" });
    return;
  }

  const roleByEstate = new Map(memberships.map((item) => [item.estate_id, item.membership_role]));
  res.status(200).json({ estates: (result.data ?? []).map((estate) => ({
    ...estate,
    membershipRole: roleByEstate.get(estate.id) ?? null,
  })) });
});


app.get("/v1/estates/:estateId/dashboard", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = req.params.estateId;

  // Platform admins can inspect estate dashboards without being estate members.
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  const { data: membership, error: membershipError } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("estate_id, membership_role")
    .eq("estate_id", estateId)
    .eq("user_id", authenticated.authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    res.status(403).json({ error: "estate_membership_check_failed" });
    return;
  }
  if (!membership && !platformAdmin) {
    res.status(403).json({ error: "active_estate_membership_required" });
    return;
  }

  try {
    const [estateResult, announcementsResult, announcementsCountResult, maintenanceResult, maintenanceCountResult, unitsResult] = await Promise.all([
      authenticated.userSupabase
        .from("estates")
        .select("id, name, address, city, state, timezone, is_enabled, disabled_at, disabled_reason")
        .eq("id", estateId)
        .maybeSingle(),
      authenticated.userSupabase
        .from("announcements")
        .select("id, title, body, published_at, created_at")
        .eq("estate_id", estateId)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(3),
      authenticated.userSupabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("estate_id", estateId)
        .not("published_at", "is", null),
      authenticated.userSupabase
        .from("maintenance_requests")
        .select("id, title, status, priority, created_at")
        .eq("estate_id", estateId)
        .not("status", "in", "(resolved,closed)")
        .order("created_at", { ascending: false })
        .limit(5),
      authenticated.userSupabase
        .from("maintenance_requests")
        .select("id", { count: "exact", head: true })
        .eq("estate_id", estateId)
        .not("status", "in", "(resolved,closed)"),
      authenticated.userSupabase
        .from("units")
        .select("id, status")
        .eq("estate_id", estateId),
    ]);

    if (estateResult.error || !estateResult.data) {
      res.status(403).json({ error: "estate_access_denied" });
      return;
    }
    if (!estateResult.data.is_enabled) {
      res.status(423).json({ error: "estate_subscription_inactive", message: "This estate is temporarily unavailable because its subscription is inactive." });
      return;
    }
    if (announcementsResult.error || announcementsCountResult.error || maintenanceResult.error || maintenanceCountResult.error || unitsResult.error) {
      res.status(403).json({ error: "estate_dashboard_data_access_denied" });
      return;
    }

    const units = unitsResult.data ?? [];
    const requests = maintenanceResult.data ?? [];
    res.status(200).json({
      estate: { ...estateResult.data, membershipRole: membership?.membership_role ?? (platformAdmin ? "platform_admin" : null) },
      summary: {
        units: units.length,
        occupiedUnits: units.filter((unit) => unit.status === "occupied").length,
        openMaintenanceRequests: maintenanceCountResult.count ?? 0,
        publishedAnnouncements: announcementsCountResult.count ?? 0,
      },
      announcements: announcementsResult.data ?? [],
      maintenanceRequests: requests,
    });
  } catch {
    res.status(500).json({ error: "estate_dashboard_load_failed" });
  }
});


app.post("/v1/estates/:estateId/maintenance", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateParam = req.params.estateId;
  const estateId = Array.isArray(estateParam) ? (estateParam[0] ?? "") : estateParam;
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) {
    res.status(404).json({ error: "estate_not_found_or_unavailable" });
    return;
  }
  if (!estateEnabled) {
    rejectInactiveEstate(res);
    return;
  }

  const outcome = await submitMaintenanceRequest(
    estateId,
    authenticated.authUser.id,
    req.body,
    {
      async hasActiveMembership(targetEstateId, userId) {
        const { data, error } = await authenticated.userSupabase
          .from("estate_memberships")
          .select("estate_id")
          .eq("estate_id", targetEstateId)
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();
        return { active: Boolean(data), error: Boolean(error) };
      },
      async insertRequest(targetEstateId, userId, input) {
        const { data, error } = await authenticated.userSupabase
          .from("maintenance_requests")
          .insert({
            estate_id: targetEstateId,
            created_by: userId,
            title: input.title,
            description: input.description,
            priority: input.priority,
            ...(input.unitId ? { unit_id: input.unitId } : {}),
          })
          .select("id, title, description, status, priority, created_at")
          .single();
        return { data, error: Boolean(error) };
      },
    },
  );
  res.status(outcome.status).json(outcome.body);
});

app.post("/v1/estates/:estateId/visitor-passes", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const { data: membership, error: membershipError } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
    .maybeSingle();
  if (membershipError || !canCreateVisitorPass(membership, estateId)) {
    res.status(403).json({ error: "estate_membership_required" });
    return;
  }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const visitorInput = parseVisitorPassInput(req.body ?? {});
  if (!visitorInput) {
    res.status(400).json({ error: "invalid_visitor_pass", message: "Provide a visitor name and a valid time window of up to 7 days." }); return;
  }
  const { visitorName, visitorPhone, validFrom, validUntil } = visitorInput;
  const encryptionSecret = process.env.VISITOR_PASS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!encryptionSecret) { res.status(503).json({ error: "visitor_code_storage_not_configured" }); return; }
  const accessCode = String(randomInt(100000, 1000000));
  const accessCodeHash = createHash("sha256").update(accessCode).digest("hex");
  const accessCodeCiphertext = encryptVisitorAccessCode(accessCode, encryptionSecret);
  const { data, error } = await authenticated.userSupabase.from("visitor_passes").insert({
    estate_id: estateId, host_user_id: authenticated.authUser.id, visitor_name: visitorName,
    visitor_phone: visitorPhone, access_code_hash: accessCodeHash, access_code_ciphertext: accessCodeCiphertext,
    valid_from: validFrom.toISOString(), valid_until: validUntil.toISOString(), status: "active",
  }).select("id, estate_id, visitor_name, valid_from, valid_until, status, created_at").single();
  if (error || !data) { res.status(400).json({ error: "visitor_pass_create_failed" }); return; }
  const { access_code_ciphertext: _ciphertext, ...safeVisitorPass } = data as typeof data & { access_code_ciphertext?: string };
  res.status(201).json({ visitorPass: safeVisitorPass, accessCode });
});

app.get("/v1/estates/:estateId/visitor-passes", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const { data: membership, error: membershipError } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("estate_id, membership_role, status")
    .eq("estate_id", estateId)
    .eq("user_id", authenticated.authUser.id)
    .maybeSingle();

  if (membershipError || !canCreateVisitorPass(membership, estateId)) {
    res.status(403).json({ error: "estate_membership_required" });
    return;
  }

  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase
    .from("visitor_passes")
    .select("id, estate_id, visitor_name, visitor_phone, valid_from, valid_until, status, created_at, access_code_ciphertext")
    .eq("estate_id", estateId)
    .eq("host_user_id", authenticated.authUser.id)
    .order("created_at", { ascending: false })
    .range(page.from, page.to);

  if (error) {
    res.status(400).json({ error: "visitor_pass_list_failed" });
    return;
  }
  const result = pageResult(data, page);
  const encryptionSecret = process.env.VISITOR_PASS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const visitorPasses = result.items.map((pass: Record<string, unknown>) => {
    const { access_code_ciphertext: ciphertext, ...safePass } = pass;
    return {
      ...safePass,
      accessCode: decryptVisitorAccessCode(typeof ciphertext === "string" ? ciphertext : null, encryptionSecret),
    };
  });
  res.status(200).json({ visitorPasses, pagination: result.pagination });
});

app.patch("/v1/estates/:estateId/visitor-passes/:passId/status", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const passId = Array.isArray(req.params.passId) ? req.params.passId[0] : req.params.passId;
  const targetStatus = req.body?.status;
  if (targetStatus !== "active" && targetStatus !== "revoked") {
    res.status(400).json({ error: "invalid_visitor_pass_status" }); return;
  }
  const { data: membership, error: membershipError } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
  if (membershipError || !canCreateVisitorPass(membership, estateId)) {
    res.status(403).json({ error: "estate_membership_required" }); return;
  }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !process.env.SUPABASE_URL) {
    res.status(503).json({ error: "visitor_pass_update_not_configured" }); return;
  }
  const admin = createClient(process.env.SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: existing, error: lookupError } = await admin.from("visitor_passes")
    .select("id, status, valid_until").eq("id", passId).eq("estate_id", estateId)
    .eq("host_user_id", authenticated.authUser.id).maybeSingle();
  if (lookupError || !existing) { res.status(404).json({ error: "visitor_pass_not_found" }); return; }
  if (existing.status !== "active" && existing.status !== "revoked") {
    res.status(409).json({ error: "visitor_pass_not_reactivatable" }); return;
  }
  if (new Date(existing.valid_until).getTime() <= Date.now()) {
    res.status(409).json({ error: "visitor_pass_expired" }); return;
  }
  if (existing.status === targetStatus) { res.status(200).json({ pass: existing }); return; }
  const { data: updated, error: updateError } = await admin.from("visitor_passes").update({ status: targetStatus })
    .eq("id", passId).eq("estate_id", estateId).eq("host_user_id", authenticated.authUser.id)
    .eq("status", existing.status).gt("valid_until", new Date().toISOString())
    .select("id, status, valid_until").maybeSingle();
  if (updateError || !updated) { res.status(409).json({ error: "visitor_pass_status_update_failed" }); return; }
  res.status(200).json({ pass: updated });
});

app.post("/v1/estates/:estateId/gate/visitor-lookup", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const { data: membership } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const accessCode = typeof req.body?.accessCode === "string" ? req.body.accessCode.trim() : "";
  if (!isValidVisitorAccessCode(accessCode)) { res.status(400).json({ error: "invalid_access_code" }); return; }
  const hash = createHash("sha256").update(accessCode).digest("hex");
  const { data: pass, error } = await authenticated.userSupabase.from("visitor_passes")
    .select("id, host_user_id, visitor_name, visitor_phone, valid_from, valid_until, status")
    .eq("estate_id", estateId).eq("access_code_hash", hash).maybeSingle();
  if (error || !pass) { res.status(404).json({ error: "visitor_pass_not_found_or_invalid" }); return; }
  let hostName: string | null = null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey && process.env.SUPABASE_URL) {
    const admin = createClient(process.env.SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: host } = await admin.from("users").select("full_name").eq("id", pass.host_user_id).maybeSingle();
    hostName = host?.full_name ?? null;
  }
  res.status(200).json({ visitor: { name: pass.visitor_name, phone: pass.visitor_phone }, host: { name: hostName }, pass: { id: pass.id, validFrom: pass.valid_from, validUntil: pass.valid_until, status: pass.status }, availabilityError: visitorPassAvailabilityError(pass) });
});

app.post("/v1/estates/:estateId/gate/visitor-passes/:passId/deny", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const passId = Array.isArray(req.params.passId) ? req.params.passId[0] : req.params.passId;
  const { data: membership } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length > 500) { res.status(400).json({ error: "invalid_denial_reason" }); return; }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !process.env.SUPABASE_URL) { res.status(503).json({ error: "visitor_decision_service_not_configured" }); return; }
  const admin = createClient(process.env.SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();
  const { data: pass, error: passError } = await admin.from("visitor_passes").update({ status: "revoked" })
    .eq("id", passId).eq("estate_id", estateId).eq("status", "active")
    .lte("valid_from", now).gt("valid_until", now)
    .select("id, status").maybeSingle();
  if (passError || !pass) { res.status(409).json({ error: "visitor_pass_not_active" }); return; }
  const { error: auditError } = await admin.from("visitor_pass_denials").insert({
    estate_id: estateId, visitor_pass_id: passId, denied_by: authenticated.authUser.id,
    reason: reason || null,
  });
  if (auditError) {
    // Do not leave a denied pass without its audit record.
    await admin.from("visitor_passes").update({ status: "active" }).eq("id", passId).eq("estate_id", estateId).eq("status", "revoked");
    res.status(500).json({ error: "visitor_denial_audit_failed" }); return;
  }
  res.status(200).json({ pass });
});

app.post("/v1/estates/:estateId/gate/check-in", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const { data: membership } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
    .maybeSingle();
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const accessCode = typeof req.body?.accessCode === "string" ? req.body.accessCode.trim() : "";
  if (!isValidVisitorAccessCode(accessCode)) { res.status(400).json({ error: "invalid_access_code" }); return; }
  const hash = createHash("sha256").update(accessCode).digest("hex");
  const { data: pass, error: passError } = await authenticated.userSupabase.from("visitor_passes")
    .select("id, visitor_name, visitor_phone, valid_from, valid_until, status")
    .eq("estate_id", estateId).eq("access_code_hash", hash).maybeSingle();
  if (passError || !pass) { res.status(404).json({ error: "visitor_pass_not_found_or_invalid" }); return; }
  const passAvailabilityError = visitorPassAvailabilityError(pass);
  if (passAvailabilityError) { res.status(409).json({ error: passAvailabilityError }); return; }
  const { data: visit, error } = await authenticated.userSupabase.from("visitor_visits")
    .insert({ estate_id: estateId, visitor_pass_id: pass.id, checked_in_by: authenticated.authUser.id })
    .select("id, visitor_pass_id, checked_in_at").single();
  if (error || !visit) {
    const failure = visitorCheckInFailure(error?.code);
    res.status(failure.status).json({ error: failure.error });
    return;
  }
  res.status(201).json({ visit, visitor: { name: pass.visitor_name, phone: pass.visitor_phone } });
});

app.get("/v1/estates/:estateId/gate/visits", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const { data: membership } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
    .maybeSingle();
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("visitor_visits")
    .select("id, visitor_pass_id, checked_in_at, visitor_passes(visitor_name, visitor_phone)")
    .eq("estate_id", estateId).is("checked_out_at", null).order("checked_in_at", { ascending: false })
    .range(page.from, page.to);
  if (error) { res.status(400).json({ error: "active_visits_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ visits: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/gate/visits/:visitId/check-out", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const visitId = Array.isArray(req.params.visitId) ? req.params.visitId[0] : req.params.visitId;
  const { data: membership } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
    .maybeSingle();
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const { data, error } = await authenticated.userSupabase.from("visitor_visits")
    .update({ checked_out_by: authenticated.authUser.id, checked_out_at: new Date().toISOString() })
    .eq("id", visitId).eq("estate_id", estateId).is("checked_out_at", null)
    .select("id, checked_in_at, checked_out_at").maybeSingle();
  if (error || !data) { res.status(409).json({ error: "open_visit_not_found_or_checkout_failed" }); return; }
  res.status(200).json({ visit: data });
});

async function requireSecurityEventAccess(req: import("express").Request, res: import("express").Response, estateId: string): Promise<AuthenticatedRequest | null> {
  const authenticated = req as AuthenticatedRequest;
  const { data: membership, error } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("estate_id, membership_role, status")
    .eq("estate_id", estateId)
    .eq("user_id", authenticated.authUser.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) { res.status(403).json({ error: "security_membership_check_failed" }); return null; }
  if (!canUseGateWorkflow(membership, estateId)) {
    res.status(403).json({ error: "security_membership_required" }); return null;
  }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return null; }
  if (!enabled) { rejectInactiveEstate(res); return null; }
  return authenticated;
}

app.get("/v1/estates/:estateId/security/shift-handovers", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("security_shift_handovers")
    .select("id, estate_id, outgoing_officer, shift_label, shift_started_at, shift_ended_at, handover_notes, pending_actions, status, acknowledged_by, acknowledged_at, created_at")
    .eq("estate_id", estateId).order("created_at", { ascending: false }).range(page.from, page.to);
  if (error) { res.status(400).json({ error: "security_shift_handovers_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ handovers: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/security/shift-handovers", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const shiftLabel = typeof req.body?.shiftLabel === "string" ? req.body.shiftLabel.trim() : "";
  const startedAt = typeof req.body?.shiftStartedAt === "string" ? new Date(req.body.shiftStartedAt) : new Date(Number.NaN);
  const endedAt = typeof req.body?.shiftEndedAt === "string" ? new Date(req.body.shiftEndedAt) : new Date(Number.NaN);
  const notes = typeof req.body?.handoverNotes === "string" ? req.body.handoverNotes.trim() : "";
  const pendingActions = typeof req.body?.pendingActions === "string" ? req.body.pendingActions.trim() : "";
  if (shiftLabel.length < 2 || shiftLabel.length > 80 || Number.isNaN(startedAt.getTime()) ||
      Number.isNaN(endedAt.getTime()) || endedAt.getTime() < startedAt.getTime() ||
      endedAt.getTime() > Date.now() + 5 * 60 * 1000 || notes.length < 10 || notes.length > 4000 ||
      pendingActions.length > 3000) {
    res.status(400).json({ error: "invalid_security_shift_handover", message: "Provide a shift label, valid start and end times, and handover notes." }); return;
  }
  const { data, error } = await authenticated.userSupabase.from("security_shift_handovers")
    .insert({
      estate_id: estateId, outgoing_officer: authenticated.authUser.id, shift_label: shiftLabel,
      shift_started_at: startedAt.toISOString(), shift_ended_at: endedAt.toISOString(),
      handover_notes: notes, pending_actions: pendingActions || null, status: "pending",
    })
    .select("id, estate_id, outgoing_officer, shift_label, shift_started_at, shift_ended_at, handover_notes, pending_actions, status, created_at")
    .single();
  if (error || !data) { res.status(400).json({ error: "security_shift_handover_create_failed" }); return; }
  res.status(201).json({ handover: data });
});

app.post("/v1/estates/:estateId/security/shift-handovers/:handoverId/acknowledge", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const handoverId = Array.isArray(req.params.handoverId) ? req.params.handoverId[0] : req.params.handoverId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const { data, error } = await authenticated.userSupabase.from("security_shift_handovers")
    .update({ status: "acknowledged", acknowledged_by: authenticated.authUser.id, acknowledged_at: new Date().toISOString() })
    .eq("id", handoverId).eq("estate_id", estateId).eq("status", "pending")
    .neq("outgoing_officer", authenticated.authUser.id)
    .select("id, estate_id, status, acknowledged_by, acknowledged_at").maybeSingle();
  if (error || !data) { res.status(409).json({ error: "pending_shift_handover_not_found_or_self_acknowledgement" }); return; }
  res.status(200).json({ handover: data });
});

app.get("/v1/estates/:estateId/emergency-alerts", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = req as AuthenticatedRequest;
  const { data: membership, error: membershipError } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
    .eq("status", "active").maybeSingle();
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (membershipError || (!membership && !platformAdmin)) { res.status(403).json({ error: "active_estate_membership_required" }); return; }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!enabled) { rejectInactiveEstate(res); return; }
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("security_emergency_alerts")
    .select("id, estate_id, created_by, alert_type, severity, title, message, location, status, resolved_by, resolved_at, created_at, updated_at")
    .eq("estate_id", estateId).order("created_at", { ascending: false }).range(page.from, page.to);
  if (error) { res.status(400).json({ error: "emergency_alerts_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ alerts: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/emergency-alerts", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const alertType = typeof req.body?.alertType === "string" ? req.body.alertType.trim() : "";
  const severity = typeof req.body?.severity === "string" ? req.body.severity.trim() : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : "";
  const alertTypes = ["security_threat", "fire", "medical", "utility", "weather", "other"];
  if (!alertTypes.includes(alertType) || !["high", "critical"].includes(severity) ||
      title.length < 3 || title.length > 160 || message.length < 10 || message.length > 3000 ||
      location.length > 240) {
    res.status(400).json({ error: "invalid_emergency_alert", message: "Provide a valid emergency type, high or critical severity, title and message." }); return;
  }
  const { data, error } = await authenticated.userSupabase.rpc("publish_security_emergency_alert", {
    p_estate_id: estateId,
    p_alert_type: alertType,
    p_severity: severity,
    p_title: title,
    p_message: message,
    p_location: location || null,
  });
  if (error || !data || typeof data !== "object" || !("alert" in data)) {
    res.status(400).json({ error: error?.message?.includes("security_membership_required") ? "security_membership_required" : "emergency_alert_create_failed" }); return;
  }
  res.status(201).json(data);
});

app.post("/v1/estates/:estateId/emergency-alerts/:alertId/resolve", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const alertId = Array.isArray(req.params.alertId) ? req.params.alertId[0] : req.params.alertId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const { data, error } = await authenticated.userSupabase.from("security_emergency_alerts")
    .update({ status: "resolved", resolved_by: authenticated.authUser.id, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", alertId).eq("estate_id", estateId).eq("status", "active")
    .select("id, estate_id, title, status, resolved_by, resolved_at").maybeSingle();
  if (error || !data) { res.status(404).json({ error: "active_emergency_alert_not_found_or_resolve_failed" }); return; }
  res.status(200).json({ alert: data });
});

app.get("/v1/estates/:estateId/security/incidents", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("security_incident_reports")
    .select("id, estate_id, reported_by, title, category, severity, description, location, occurred_at, status, reviewed_by, reviewed_at, resolution_note, created_at, updated_at")
    .eq("estate_id", estateId).order("created_at", { ascending: false }).range(page.from, page.to);
  if (error) { res.status(400).json({ error: "security_incidents_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ incidents: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/security/incidents", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const severity = typeof req.body?.severity === "string" ? req.body.severity.trim() : "medium";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const location = typeof req.body?.location === "string" ? req.body.location.trim() : "";
  const occurredAt = typeof req.body?.occurredAt === "string" ? req.body.occurredAt : "";
  const categories = ["unauthorised_access", "theft", "property_damage", "disturbance", "safety_hazard", "medical", "fire", "other"];
  const severities = ["low", "medium", "high", "critical"];
  const occurredDate = occurredAt ? new Date(occurredAt) : new Date();
  if (title.length < 3 || title.length > 160 || !categories.includes(category) ||
      !severities.includes(severity) || description.length < 10 || description.length > 5000 ||
      location.length > 240 || Number.isNaN(occurredDate.getTime()) || occurredDate.getTime() > Date.now() + 5 * 60 * 1000) {
    res.status(400).json({ error: "invalid_security_incident", message: "Provide a valid title, category, severity, description and occurrence time." }); return;
  }
  const { data, error } = await authenticated.userSupabase.from("security_incident_reports")
    .insert({
      estate_id: estateId,
      reported_by: authenticated.authUser.id,
      title,
      category,
      severity,
      description,
      location: location || null,
      occurred_at: occurredDate.toISOString(),
      status: "open",
    })
    .select("id, estate_id, reported_by, title, category, severity, description, location, occurred_at, status, created_at")
    .single();
  if (error || !data) { res.status(400).json({ error: "security_incident_create_failed" }); return; }
  res.status(201).json({ incident: data });
});

async function requireEventOrganiser(req: import("express").Request, res: import("express").Response, estateId: string): Promise<AuthenticatedRequest | null> {
  const authenticated = req as AuthenticatedRequest;
  const { data: membership, error } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("membership_role")
    .eq("estate_id", estateId)
    .eq("user_id", authenticated.authUser.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) { res.status(403).json({ error: "event_organiser_access_check_failed" }); return null; }
  if (membership?.membership_role !== "event_organiser") {
    res.status(403).json({ error: "event_organiser_membership_required" }); return null;
  }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return null; }
  if (!enabled) { rejectInactiveEstate(res); return null; }
  return authenticated;
}

app.get("/v1/estates/:estateId/events", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const { data: membership, error: membershipError } = await authenticated.userSupabase
    .from("estate_memberships").select("membership_role").eq("estate_id", estateId)
    .eq("user_id", authenticated.authUser.id).eq("status", "active").maybeSingle();
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (membershipError || (!membership && !platformAdmin)) { res.status(403).json({ error: "active_estate_membership_required" }); return; }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!enabled) { rejectInactiveEstate(res); return; }
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("estate_events")
    .select("id, estate_id, title, description, venue, starts_at, ends_at, status, created_by, created_at, updated_at")
    .eq("estate_id", estateId).order("starts_at", { ascending: true }).range(page.from, page.to);
  if (error) { res.status(403).json({ error: "estate_events_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ events: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/events", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const venue = typeof req.body?.venue === "string" ? req.body.venue.trim() : "";
  const venueId = typeof req.body?.venueId === "string" ? req.body.venueId : "";
  const startsAt = typeof req.body?.startsAt === "string" ? req.body.startsAt : "";
  const endsAt = typeof req.body?.endsAt === "string" ? req.body.endsAt : "";
  const startDate = new Date(startsAt), endDate = new Date(endsAt);
  const status = req.body?.status === "published" ? "published" : "draft";
  if (title.length < 3 || title.length > 160 || description.length > 5000 ||
      !venueId || venue.length < 2 || venue.length > 240 ||
      !startsAt || !endsAt || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) ||
      endDate.getTime() <= startDate.getTime()) {
    res.status(400).json({ error: "invalid_event_details", message: "Enter an event title, select an available venue, provide valid start and end date/time, and ensure the end is after the start." }); return;
  }
  const { data: selectedVenue, error: venueError } = await authenticated.userSupabase
    .from("estate_venues").select("id,name,location,status").eq("id", venueId).eq("estate_id", estateId).maybeSingle();
  if (venueError || !selectedVenue || selectedVenue.status !== "available") {
    res.status(400).json({ error: "event_venue_unavailable", message: "That venue is no longer available. Refresh the venue list and choose another." }); return;
  }
  const venueLabel = selectedVenue.location ? selectedVenue.name + " · " + selectedVenue.location : selectedVenue.name;
  const { data, error } = await authenticated.userSupabase.from("estate_events")
    .insert({ estate_id: estateId, title, description, venue: venueLabel, venue_id: selectedVenue.id, starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), status, created_by: authenticated.authUser.id })
    .select("id, estate_id, title, description, venue, starts_at, ends_at, status, created_by, created_at, updated_at").single();
  if (error || !data) { res.status(400).json({ error: "estate_event_create_failed" }); return; }
  res.status(201).json({ event: data });
});

app.patch("/v1/estates/:estateId/events/:eventId", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const venue = typeof req.body?.venue === "string" ? req.body.venue.trim() : "";
  const startsAt = typeof req.body?.startsAt === "string" ? req.body.startsAt : "";
  const endsAt = typeof req.body?.endsAt === "string" ? req.body.endsAt : "";
  const startDate = new Date(startsAt), endDate = new Date(endsAt);
  const status = ["draft", "published", "cancelled"].includes(req.body?.status) ? req.body.status : "draft";
  if (title.length < 3 || title.length > 160 || description.length > 5000 ||
      venue.length < 2 || venue.length > 240 || Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    res.status(400).json({ error: "invalid_event_details" }); return;
  }
  const { data, error } = await authenticated.userSupabase.from("estate_events")
    .update({ title, description, venue, starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), status, updated_at: new Date().toISOString() })
    .eq("estate_id", estateId).eq("id", eventId)
    .select("id, estate_id, title, description, venue, starts_at, ends_at, status, created_by, created_at, updated_at").maybeSingle();
  if (error || !data) { res.status(404).json({ error: "estate_event_not_found_or_update_failed" }); return; }
  res.status(200).json({ event: data });
});

app.get("/v1/estates/:estateId/events/:eventId/guests", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("estate_event_guests")
    .select("id, estate_id, event_id, guest_name, email, phone, notes, created_at, updated_at")
    .eq("estate_id", estateId).eq("event_id", eventId).order("created_at", { ascending: true }).range(page.from, page.to);
  if (error) { res.status(403).json({ error: "event_guest_list_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ guests: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/events/:eventId/guests", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const guestName = typeof req.body?.guestName === "string" ? req.body.guestName.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if (guestName.length < 2 || guestName.length > 160 || email.length > 254 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      phone.length > 32 || notes.length > 1000) {
    res.status(400).json({ error: "invalid_event_guest", message: "Enter a guest name and valid optional contact details." }); return;
  }
  const { data: event, error: eventError } = await authenticated.userSupabase.from("estate_events")
    .select("id").eq("estate_id", estateId).eq("id", eventId).maybeSingle();
  if (eventError || !event) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  const { data, error } = await authenticated.userSupabase.from("estate_event_guests")
    .insert({ estate_id: estateId, event_id: eventId, guest_name: guestName, email: email || null, phone: phone || null, notes, created_by: authenticated.authUser.id })
    .select("id, estate_id, event_id, guest_name, email, phone, notes, created_at, updated_at").single();
  if (error || !data) { res.status(400).json({ error: "event_guest_add_failed" }); return; }
  res.status(201).json({ guest: data });
});

app.delete("/v1/estates/:estateId/events/:eventId/guests/:guestId", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const guestId = Array.isArray(req.params.guestId) ? req.params.guestId[0] : req.params.guestId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const { data, error } = await authenticated.userSupabase.from("estate_event_guests")
    .delete().eq("estate_id", estateId).eq("event_id", eventId).eq("id", guestId)
    .select("id").maybeSingle();
  if (error || !data) { res.status(404).json({ error: "event_guest_not_found_or_remove_failed" }); return; }
  res.status(200).json({ removed: true, guestId: data.id });
});

app.get("/v1/estates/:estateId/events/:eventId/invitations", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("estate_event_invitations")
    .select("id, guest_id, status, created_at, estate_event_guests!inner(guest_name, email, phone)")
    .eq("estate_id", estateId).eq("event_id", eventId).order("created_at", { ascending: false }).range(page.from, page.to);
  if (error) { res.status(403).json({ error: "event_invitations_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ invitations: result.items, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/events/:eventId/guests/:guestId/invitations", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const guestId = Array.isArray(req.params.guestId) ? req.params.guestId[0] : req.params.guestId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const { data: guest, error: guestError } = await authenticated.userSupabase.from("estate_event_guests")
    .select("id, guest_name, email, phone").eq("id", guestId).eq("estate_id", estateId).eq("event_id", eventId).maybeSingle();
  if (guestError || !guest) { res.status(404).json({ error: "event_guest_not_found" }); return; }
  const { data: event, error: eventError } = await authenticated.userSupabase.from("estate_events")
    .select("id, title, venue, starts_at, ends_at").eq("id", eventId).eq("estate_id", estateId).maybeSingle();
  if (eventError || !event) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  const code = String(randomInt(100000, 1000000));
  const codeHash = createHash("sha256").update(code).digest("hex");
  const { error: revokeError } = await authenticated.userSupabase.from("estate_event_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("estate_id", estateId).eq("event_id", eventId).eq("guest_id", guestId).eq("status", "active");
  if (revokeError) { res.status(400).json({ error: "previous_invitation_revoke_failed" }); return; }
  const { data, error } = await authenticated.userSupabase.from("estate_event_invitations")
    .insert({ estate_id: estateId, event_id: eventId, guest_id: guestId, code_hash: codeHash, created_by: authenticated.authUser.id })
    .select("id, guest_id, status, created_at").single();
  if (error || !data) { res.status(400).json({ error: "event_invitation_create_failed" }); return; }
  res.status(201).json({ invitation: data, code, guest, event });
});

app.post("/v1/estates/:estateId/events/:eventId/invitations/:invitationId/revoke", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const invitationId = Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const { data, error } = await authenticated.userSupabase.from("estate_event_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", invitationId).eq("estate_id", estateId).eq("event_id", eventId).eq("status", "active")
    .select("id, status, revoked_at").maybeSingle();
  if (error || !data) { res.status(404).json({ error: "active_event_invitation_not_found" }); return; }
  res.status(200).json({ invitation: data });
});

app.get("/v1/estates/:estateId/events/:eventId/attendance-report", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);

  const [eventResult, guestResult, invitationCountResult, checkInCountResult] = await Promise.all([
    authenticated.userSupabase.from("estate_events")
      .select("id, title, venue, starts_at, ends_at, status")
      .eq("id", eventId).eq("estate_id", estateId).maybeSingle(),
    authenticated.userSupabase.from("estate_event_guests")
      .select("id, guest_name, email, phone", { count: "exact" })
      .eq("estate_id", estateId).eq("event_id", eventId).order("guest_name")
      .range(page.from, page.to),
    authenticated.userSupabase.from("estate_event_invitations")
      .select("id", { count: "exact", head: true })
      .eq("estate_id", estateId).eq("event_id", eventId).eq("status", "active"),
    authenticated.userSupabase.from("estate_event_checkins")
      .select("id", { count: "exact", head: true })
      .eq("estate_id", estateId).eq("event_id", eventId),
  ]);

  if (eventResult.error || !eventResult.data) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  if (guestResult.error || invitationCountResult.error || checkInCountResult.error) {
    res.status(503).json({ error: "event_attendance_report_load_failed" }); return;
  }

  const guestPage = pageResult(guestResult.data, page);
  const guestIds = guestPage.items.map((guest) => guest.id);
  let activeInvitationGuestIds = new Set<string>();
  let checkInByGuest = new Map<string, { checked_in_at: string }>();
  if (guestIds.length > 0) {
    const [invitationRows, checkInRows] = await Promise.all([
      authenticated.userSupabase.from("estate_event_invitations")
        .select("guest_id").eq("estate_id", estateId).eq("event_id", eventId)
        .eq("status", "active").in("guest_id", guestIds),
      authenticated.userSupabase.from("estate_event_checkins")
        .select("guest_id, checked_in_at").eq("estate_id", estateId).eq("event_id", eventId)
        .in("guest_id", guestIds),
    ]);
    if (invitationRows.error || checkInRows.error) {
      res.status(503).json({ error: "event_attendance_report_load_failed" }); return;
    }
    activeInvitationGuestIds = new Set((invitationRows.data ?? []).map((item) => item.guest_id));
    checkInByGuest = new Map((checkInRows.data ?? []).map((item) => [item.guest_id, item]));
  }

  const rows = guestPage.items.map((guest) => {
    const checkIn = checkInByGuest.get(guest.id);
    return {
      ...guest,
      invitationStatus: activeInvitationGuestIds.has(guest.id) ? "active" : "none",
      checkedInAt: checkIn?.checked_in_at ?? null,
      attendanceStatus: checkIn ? "checked_in" : "not_checked_in",
    };
  });
  const totalGuests = guestResult.count ?? 0;
  const checkedIn = checkInCountResult.count ?? 0;
  res.status(200).json({
    event: eventResult.data,
    summary: {
      totalGuests,
      checkedIn,
      outstanding: Math.max(0, totalGuests - checkedIn),
      activeInvitations: invitationCountResult.count ?? 0,
      attendancePercentage: totalGuests ? Math.round((checkedIn / totalGuests) * 100) : 0,
    },
    guests: rows,
    pagination: guestPage.pagination,
  });
});

app.get("/v1/estates/:estateId/events/:eventId/check-ins", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  const { data, error } = await authenticated.userSupabase.from("estate_event_checkins")
    .select("id, guest_id, invitation_id, checked_in_at, estate_event_guests!inner(guest_name, email, phone)")
    .eq("estate_id", estateId).eq("event_id", eventId).order("checked_in_at", { ascending: false }).range(page.from, page.to);
  if (error) { res.status(400).json({ error: "event_checkins_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ checkIns: result.items, total: result.items.length, pagination: result.pagination });
});

app.post("/v1/estates/:estateId/events/:eventId/check-in", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOrganiser(req, res, estateId);
  if (!authenticated) return;
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: "invalid_event_invitation_code" }); return; }
  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: invitation, error: invitationError } = await authenticated.userSupabase.from("estate_event_invitations")
    .select("id, guest_id, status, estate_event_guests!inner(id, guest_name, email, phone)")
    .eq("estate_id", estateId).eq("event_id", eventId).eq("code_hash", codeHash).eq("status", "active").maybeSingle();
  if (invitationError || !invitation) { res.status(404).json({ error: "event_invitation_not_found_or_inactive" }); return; }
  const guest = Array.isArray(invitation.estate_event_guests) ? invitation.estate_event_guests[0] : invitation.estate_event_guests;
  if (!guest) { res.status(404).json({ error: "event_invitation_guest_not_found" }); return; }
  const { data: existing } = await authenticated.userSupabase.from("estate_event_checkins")
    .select("id, checked_in_at").eq("estate_id", estateId).eq("event_id", eventId).eq("guest_id", invitation.guest_id).maybeSingle();
  if (existing) { res.status(409).json({ error: "event_guest_already_checked_in", checkIn: existing, guest }); return; }
  const { data: checkIn, error } = await authenticated.userSupabase.from("estate_event_checkins")
    .insert({ estate_id: estateId, event_id: eventId, guest_id: invitation.guest_id, invitation_id: invitation.id, checked_in_by: authenticated.authUser.id })
    .select("id, guest_id, invitation_id, checked_in_at").single();
  if (error || !checkIn) {
    if (error?.code === "23505") { res.status(409).json({ error: "event_guest_already_checked_in" }); return; }
    res.status(400).json({ error: "event_guest_checkin_failed" }); return;
  }
  res.status(201).json({ checkIn, guest });
});

app.post("/v1/estates/:estateId/events/:eventId/security-verify", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;

  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!/^\\d{6}$/.test(code)) {
    res.status(400).json({ error: "invalid_event_invitation_code" }); return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !process.env.SUPABASE_URL) {
    res.status(503).json({ error: "event_verification_service_not_configured" }); return;
  }
  const adminSupabase = createClient(process.env.SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "x-cb-actor-id": authenticated.authUser.id } },
  });

  const { data: event, error: eventError } = await adminSupabase.from("estate_events")
    .select("id, estate_id, title, venue, starts_at, ends_at, status")
    .eq("id", eventId).eq("estate_id", estateId).maybeSingle();
  if (eventError || !event) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  if (event.status !== "published") { res.status(409).json({ error: "event_not_open_for_guest_checkin" }); return; }

  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: invitation, error: invitationError } = await adminSupabase.from("estate_event_invitations")
    .select("id, guest_id, status")
    .eq("estate_id", estateId).eq("event_id", eventId).eq("code_hash", codeHash).eq("status", "active")
    .maybeSingle();
  if (invitationError || !invitation) { res.status(404).json({ error: "event_invitation_not_found_or_inactive" }); return; }

  const { data: guest, error: guestError } = await adminSupabase.from("estate_event_guests")
    .select("id, guest_name, email, phone")
    .eq("id", invitation.guest_id).eq("estate_id", estateId).eq("event_id", eventId)
    .maybeSingle();
  if (guestError || !guest) { res.status(404).json({ error: "event_invitation_guest_not_found" }); return; }

  const { data: existing, error: existingError } = await adminSupabase.from("estate_event_checkins")
    .select("id, checked_in_at")
    .eq("estate_id", estateId).eq("event_id", eventId).eq("guest_id", guest.id)
    .maybeSingle();
  if (existingError) { res.status(503).json({ error: "event_guest_checkin_lookup_failed" }); return; }
  if (existing) { res.status(409).json({ error: "event_guest_already_checked_in", checkIn: existing, guest }); return; }

  // Security authorises entry only. Attendance is recorded later by the Event Coordinator.
  res.status(200).json({ verified: true, event, guest, invitation: { id: invitation.id, status: invitation.status } });
});

app.get("/v1/me", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  try {
    const { data: profile, error } = await authenticated.userSupabase
      .from("users")
      .select("id, full_name, phone_e164, is_active, created_at, updated_at")
      .eq("id", authenticated.authUser.id)
      .maybeSingle();

    if (error) {
      res.status(403).json({ error: "profile_access_denied" });
      return;
    }

    const { data: roleRows } = await authenticated.userSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authenticated.authUser.id);
    const { data: memberships } = await authenticated.userSupabase
      .from("estate_memberships")
      .select("id, estate_id, membership_role, status, estates(name, address, city, state)")
      .eq("user_id", authenticated.authUser.id)
      .order("created_at", { ascending: true });
    const { data: residentUnits } = await authenticated.userSupabase
      .from("resident_units")
      .select("unit_id, start_date, end_date, units(unit_code, unit_type, building_id, buildings(name, estate_id, estates(name)))")
      .eq("resident_user_id", authenticated.authUser.id)
      .is("end_date", null);
    res.status(200).json({
      user: {
        id: authenticated.authUser.id,
        email: authenticated.authUser.email ?? null,
        emailConfirmed: Boolean(authenticated.authUser.email_confirmed_at),
      },
      profile: profile ?? null,
      globalRoles: (roleRows ?? []).map((item) => item.role),
      estateMemberships: memberships ?? [],
      residentUnits: residentUnits ?? [],
      profilePending: profile === null,
    });
  } catch {
    res.status(500).json({ error: "profile_lookup_failed" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "route_not_found" });
});

const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const candidate = error as { status?: unknown; statusCode?: unknown; name?: unknown; code?: unknown };
  const rawStatus = typeof candidate?.statusCode === "number"
    ? candidate.statusCode
    : typeof candidate?.status === "number" ? candidate.status : 500;
  const statusCode = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  const requestId = res.getHeader("x-request-id")?.toString() ?? null;

  console.error(JSON.stringify({
    event: "api_unhandled_error",
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    errorName: typeof candidate?.name === "string" ? candidate.name : "Error",
    errorCode: typeof candidate?.code === "string" ? candidate.code : null,
    occurredAt: new Date().toISOString(),
  }));

  if (res.headersSent) return next(error);
  res.status(statusCode).json({
    error: statusCode >= 500 ? "internal_server_error" : "request_failed",
    requestId,
  });
};
app.use(apiErrorHandler);

if (process.env.NODE_ENV !== "test") {
  startApiServer(app, port);
}
