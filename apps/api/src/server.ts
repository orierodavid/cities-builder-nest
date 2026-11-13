import "express-async-errors";
import "dotenv/config";
import express from "express";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { decryptVisitorAccessCode, encryptVisitorAccessCode } from "./visitor-pass-code.js";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import { requireAuth, authConfigurationReady, type AuthenticatedRequest } from "./auth.js";
import { checkDatabase, pool } from "./storage.js";
import { getBackgroundJobQueueMetrics } from "./background-job-monitor.js";
import { withAuthenticatedTransaction } from "./database.js";
import { getMeData } from "./me.repository.js";
import { getEstatesForUser } from "./estates.repository.js";
import { getEstateDashboard } from "./dashboard.repository.js";
import { getBuildingsForEstate, getUnitsForEstate } from "./property-directory.repository.js";
import { getResidentsForEstate } from "./resident-directory.repository.js";
import { getSecurityShiftHandovers } from "./security-shift-handovers.repository.js";
import { getSecurityEmergencyAlerts } from "./security-emergency-alerts.repository.js";
import { publishSecurityEmergencyAlert, resolveSecurityEmergencyAlert } from "./security-emergency-alert-mutations.repository.js";
import { getSecurityIncidents } from "./security-incidents.repository.js";
import { acknowledgeSecurityShiftHandover, createSecurityIncident, createSecurityShiftHandover } from "./security-workflows.repository.js";
import { getVisitorPassesForHost } from "./visitor-passes.repository.js";
import { createVisitorPass, updateVisitorPassStatus } from "./visitor-pass-mutations.repository.js";
import { checkoutGateVisitorVisit, createGateVisitorVisit, denyVisitorPass, getGateVisitorPass } from "./visitor-gate.repository.js";
import { addExistingResidentMembership, assignExistingStaffMembership, assignResidentToEstateUnit, createEstate, createEstateBuilding, createEstateUnit, updateEstateSubscription } from "./estate-management-mutations.repository.js";
import { createEstateAccountMembership, validateAccountUnit } from "./account-setup.repository.js";
import { getActiveGateVisitsForEstate } from "./gate-visits.repository.js";
import { getEstateEventsForCreator } from "./estate-events.repository.js";
import { getEstateEventGuests } from "./estate-event-guests.repository.js";
import { getEstateEventInvitations } from "./estate-event-invitations.repository.js";
import { getEstateEventCheckIns } from "./estate-event-checkins.repository.js";
import { verifyEstateEventInvitation } from "./estate-event-security.repository.js";
import { getEstateEventAttendanceReport } from "./estate-event-attendance.repository.js";
import { getEstateEventAttendanceSummaries } from "./estate-event-attendance.repository.js";
import { createEstateEvent, createEstateEventCheckIn, createEstateEventGuest, deleteEstateEventGuest, issueEstateEventInvitation, revokeEstateEventInvitation, updateEstateEvent } from "./estate-event-mutations.repository.js";
import { getEstateEnabledStatus, getEstateMembershipAccess, getEventCreator, hasEstateManagerRole, hasPlatformAdminRole } from "./authorization.repository.js";
import { startApiServer } from "./lifecycle.js";
import { sharedRateLimit } from "./rate-limit.js";
import { getPageWindow, pageResult } from "./pagination.js";
import { submitMaintenanceRequest } from "./maintenance-service.js";
import { createMaintenanceRequest } from "./maintenance-mutations.repository.js";
import { canCreateVisitorPass } from "./visitor-pass-policy.js";
import { parseVisitorPassInput } from "./visitor-pass-input-policy.js";
import { canUseGateWorkflow } from "./gate-workflow-policy.js";
import { isValidVisitorAccessCode, visitorCheckInFailure, visitorPassAvailabilityError } from "./visitor-pass-lifecycle-policy.js";
import { isAllowedCorsOrigin } from "./cors-policy.js";
import { trustedProxyHops } from "./proxy-config.js";
import { apiSecurityHeaders } from "./security-headers.js";
import type { ErrorRequestHandler } from "express";

export const app = express();
// The production API runs behind one trusted platform ingress proxy. Keep this
// configurable so direct/local deployments do not trust arbitrary forwarded IPs.
app.set("trust proxy", trustedProxyHops(process.env.TRUST_PROXY_HOPS, process.env.NODE_ENV));
const port = Number(process.env.PORT ?? 4000);

app.use(apiSecurityHeaders);

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
// This database-backed read-only route is registered only in the isolated CI
// load-test process. It is absent from normal development and production.
if (process.env.CI === "true" && process.env.NODE_ENV === "test" && process.env.LOAD_TEST_MODE === "true") {
  app.get("/__loadtest/database-read", async (_req, res) => {
    if (!pool) {
      res.status(503).json({ error: "load_test_database_unavailable" });
      return;
    }
    try {
      const result = await pool.query("SELECT 1 AS ok");
      res.status(200).json({ database: result.rows[0]?.ok === 1 ? "ok" : "unexpected_result" });
    } catch {
      res.status(503).json({ error: "load_test_database_unavailable" });
    }
  });
}

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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    return withAuthenticatedTransaction(userId, (client) => hasPlatformAdminRole(client, userId));
  }
  const { data, error } = await userSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "platform_admin")
    .maybeSingle();
  return !error && Boolean(data);
}

app.get("/v1/admin/background-jobs", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  if (!(await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id))) {
    res.status(403).json({ error: "platform_admin_required" });
    return;
  }
  if (!pool) {
    res.status(503).json({ error: "background_job_monitor_unavailable" });
    return;
  }
  try {
    const queue = await getBackgroundJobQueueMetrics(pool);
    res.status(200).json({ generatedAt: new Date().toISOString(), queue });
  } catch {
    res.status(503).json({ error: "background_job_monitor_unavailable" });
  }
});

async function hasEstateManager(userSupabase: AuthenticatedRequest["userSupabase"], userId: string, estateId: string): Promise<boolean> {
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    return withAuthenticatedTransaction(userId, (client) => hasEstateManagerRole(client, userId, estateId));
  }
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

async function isEstateEnabled(userSupabase: AuthenticatedRequest["userSupabase"], estateId: string, userId?: string): Promise<boolean | null> {
  if (process.env.NATIVE_POSTGRES_READS === "true" && userId) {
    return withAuthenticatedTransaction(userId, (client) => getEstateEnabledStatus(client, estateId));
  }
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

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        updateEstateSubscription(client, { estateId, enabled, reason, updatedAt: new Date().toISOString() }),
      );
      if (!data) { res.status(400).json({ error: "estate_subscription_update_failed", message: "Confirm migration 009 is applied and the estate exists." }); return; }
      res.status(200).json({ estate: data });
    } catch { res.status(503).json({ error: "estate_subscription_update_failed" }); }
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

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createEstate(client, { name, address, city, state, countryCode, timezone }),
      );
      if (!data) { res.status(400).json({ error: "estate_create_failed" }); return; }
      res.status(201).json({ estate: data });
    } catch { res.status(503).json({ error: "estate_create_failed" }); }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        addExistingResidentMembership(client, { estateId, residentUserId }),
      );
      if (!result) { res.status(404).json({ error: "active_registered_user_not_found", message: "The resident must already have a registered, active account and be eligible for this estate." }); return; }
      res.status(201).json({ resident: { id: result.resident.id, fullName: result.resident.full_name, phone: result.resident.phone_e164 }, membership: result.membership });
    } catch { res.status(503).json({ error: "resident_membership_create_failed" }); }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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
    if (process.env.NATIVE_POSTGRES_READS === "true") {
      try {
        const validation = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
          validateAccountUnit(client, estateId, unitId),
        );
        if (validation === "not_found") {
          res.status(400).json({ error: "unit_not_in_selected_estate", message: "Select an apartment or unit belonging to this estate." });
          return;
        }
        if (validation === "already_assigned") {
          res.status(409).json({ error: "unit_already_assigned", message: "This unit already has an active resident assignment." });
          return;
        }
      } catch {
        res.status(503).json({ error: "resident_unit_validation_failed" });
        return;
      }
    } else {
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createEstateAccountMembership(client, {
          estateId, userId, fullName, role,
          unitId: role === "resident" ? unitId : null,
        }),
      );
      if (!membership) throw new Error("Account membership was not created.");
      res.status(201).json({
        account: { id: userId, fullName, email, role, estateId, unitId: role === "resident" ? unitId : null, invitationSent: true },
        membership,
      });
    } catch {
      // Auth identity creation and PostgreSQL membership setup are separate
      // systems. Compensate the identity if the database transaction fails.
      await adminSupabase.auth.admin.deleteUser(userId).catch(() => undefined);
      res.status(500).json({ error: "account_database_setup_failed", message: "The invitation could not be fully provisioned. The incomplete account was rolled back; check the estate configuration before retrying." });
    }
    return;
  }

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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  const role = req.body?.role;
  if (!userId || !["estate_admin", "estate_manager", "facility_manager", "security"].includes(role)) {
    res.status(400).json({ error: "invalid_staff_assignment", message: "Provide an existing user ID and role estate_admin, estate_manager, facility_manager, or security." });
    return;
  }

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        assignExistingStaffMembership(client, { estateId, userId, role }),
      );
      if (!data) { res.status(404).json({ error: "active_staff_account_not_found" }); return; }
      res.status(201).json({ staff: { id: data.staff.id, fullName: data.staff.full_name }, membership: data.membership });
    } catch { res.status(503).json({ error: "staff_assignment_failed" }); }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getBuildingsForEstate(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        buildings: result.items,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch (error) {
      console.error("native_postgres_building_list_failed", error);
      res.status(503).json({ error: "building_list_unavailable" });
    }
    return;
  }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getUnitsForEstate(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        units: result.items,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch (error) {
      console.error("native_postgres_unit_list_failed", error);
      res.status(503).json({ error: "unit_list_unavailable" });
    }
    return;
  }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!platformAdmin && !(await hasEstateManager(authenticated.userSupabase, authenticated.authUser.id, estateId))) {
    res.status(403).json({ error: "estate_manager_access_required" });
    return;
  }
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getResidentsForEstate(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        residents: result.residents,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch (error) {
      console.error("native_postgres_resident_list_failed", error);
      res.status(503).json({ error: "resident_list_unavailable" });
    }
    return;
  }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => createEstateBuilding(client, estateId, name));
      if (!data) { res.status(400).json({ error: "building_create_failed" }); return; }
      res.status(201).json({ building: data });
    } catch (error) {
      const conflict = (error as { code?: string })?.code === "23505";
      res.status(conflict ? 409 : 503).json({ error: conflict ? "building_name_exists" : "building_create_failed" });
    }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createEstateUnit(client, { estateId, buildingId, unitCode, unitType }),
      );
      if (!data) { res.status(404).json({ error: "building_not_found_in_estate" }); return; }
      res.status(201).json({ unit: data });
    } catch (error) {
      const conflict = (error as { code?: string })?.code === "23505";
      res.status(conflict ? 409 : 503).json({ error: conflict ? "unit_code_exists" : "unit_create_failed" });
    }
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        assignResidentToEstateUnit(client, { estateId, unitId, residentUserId, ...(startDate ? { startDate } : {}) }),
      );
      if (result.kind === "unit_not_found") { res.status(404).json({ error: "unit_not_found_in_estate" }); return; }
      if (result.kind === "unit_not_available") { res.status(409).json({ error: "unit_not_available", message: "Only available units can be assigned." }); return; }
      if (result.kind === "resident_not_found") { res.status(404).json({ error: "active_resident_membership_required" }); return; }
      res.status(201).json({ assignment: result.assignment });
    } catch (error) {
      const conflict = (error as { code?: string })?.code === "23505";
      res.status(conflict ? 409 : 503).json({
        error: conflict ? "unit_or_resident_already_assigned" : "unit_assignment_failed",
        message: conflict
          ? "The unit is already occupied or this resident already has an active unit assignment."
          : "Confirm the resident, unit, estate, and that migration 007 has been applied.",
      });
    }
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

  // Native PostgreSQL read canary. RLS grants platform administrators access
  // to all estates and other users access only to their active memberships.
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstatesForUser(client, authenticated.authUser.id),
      );
      res.status(200).json(result);
    } catch {
      res.status(503).json({ error: "estate_lookup_failed" });
    }
    return;
  }

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
  const { data: memberships, error } = await authenticated.userSupabase
    .from("estate_memberships")
    .select("estate_id, membership_role, estates!inner(id, name, address, city, state, timezone, is_enabled, disabled_at, disabled_reason)")
    .eq("user_id", authenticated.authUser.id)
    .eq("status", "active");

  if (error) {
    res.status(403).json({ error: "estate_memberships_access_denied" });
    return;
  }

  const estates = (memberships ?? [])
    .map((membership) => {
      const estate = Array.isArray(membership.estates) ? membership.estates[0] : membership.estates;
      return estate ? { ...estate, membershipRole: membership.membership_role } : null;
    })
    .filter((estate): estate is NonNullable<typeof estate> => estate !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  res.status(200).json({ estates });
});


app.get("/v1/estates/:estateId/dashboard", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateIdParam = req.params.estateId;
  const estateId = Array.isArray(estateIdParam) ? (estateIdParam[0] ?? "") : estateIdParam;

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const dashboard = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstateDashboard(client, authenticated.authUser.id, estateId),
      );
      if (!dashboard.estate) {
        res.status(403).json({ error: "active_estate_membership_required" });
        return;
      }
      if (!dashboard.estate.is_enabled) {
        res.status(423).json({ error: "estate_subscription_inactive", message: "This estate is temporarily unavailable because its subscription is inactive." });
        return;
      }
      const { membershipFound: _membershipFound, ...response } = dashboard;
      res.status(200).json(response);
      return;
    } catch {
      res.status(503).json({ error: "estate_dashboard_data_access_denied" });
      return;
    }
  }

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
    const [estateResult, announcementsResult, announcementsCountResult, maintenanceResult, maintenanceCountResult, unitsResult, occupiedUnitsCountResult] = await Promise.all([
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
        .select("id", { count: "exact", head: true })
        .eq("estate_id", estateId),
      authenticated.userSupabase
        .from("units")
        .select("id", { count: "exact", head: true })
        .eq("estate_id", estateId)
        .eq("status", "occupied"),
    ]);

    if (estateResult.error || !estateResult.data) {
      res.status(403).json({ error: "estate_access_denied" });
      return;
    }
    if (!estateResult.data.is_enabled) {
      res.status(423).json({ error: "estate_subscription_inactive", message: "This estate is temporarily unavailable because its subscription is inactive." });
      return;
    }
    if (announcementsResult.error || announcementsCountResult.error || maintenanceResult.error || maintenanceCountResult.error || unitsResult.error || occupiedUnitsCountResult.error) {
      res.status(403).json({ error: "estate_dashboard_data_access_denied" });
      return;
    }

    const requests = maintenanceResult.data ?? [];
    res.status(200).json({
      estate: { ...estateResult.data, membershipRole: membership?.membership_role ?? (platformAdmin ? "platform_admin" : null) },
      summary: {
        units: unitsResult.count ?? 0,
        occupiedUnits: occupiedUnitsCountResult.count ?? 0,
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
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) {
    res.status(404).json({ error: "estate_not_found_or_unavailable" });
    return;
  }
  if (!estateEnabled) {
    rejectInactiveEstate(res);
    return;
  }

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const outcome = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        submitMaintenanceRequest(estateId, authenticated.authUser.id, req.body, {
          async hasActiveMembership(targetEstateId, userId) {
            const membership = await getEstateMembershipAccess(client, userId, targetEstateId);
            return { active: Boolean(membership) };
          },
          async insertRequest(targetEstateId, userId, input) {
            try {
              const data = await createMaintenanceRequest(client, targetEstateId, userId, input);
              return { data, error: !data };
            } catch {
              return { data: null, error: true };
            }
          },
        }),
      );
      res.status(outcome.status).json(outcome.body);
    } catch {
      res.status(503).json({ error: "maintenance_request_create_unavailable" });
    }
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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
      getEstateMembershipAccess(client, authenticated.authUser.id, estateId),
    );
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
      .maybeSingle();
    if (result.error) { res.status(403).json({ error: "estate_membership_required" }); return; }
    membership = result.data;
  }
  if (!canCreateVisitorPass(membership, estateId)) {
    res.status(403).json({ error: "estate_membership_required" });
    return;
  }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createVisitorPass(client, {
          estateId, hostUserId: authenticated.authUser.id, visitorName, visitorPhone,
          accessCodeHash, accessCodeCiphertext, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString(),
        }),
      );
      if (!data) { res.status(400).json({ error: "visitor_pass_create_failed" }); return; }
      res.status(201).json({ visitorPass: data, accessCode });
    } catch {
      res.status(503).json({ error: "visitor_pass_create_failed" });
    }
    return;
  }
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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getEstateMembershipAccess(client, authenticated.authUser.id, estateId),
      );
    } catch {
      res.status(503).json({ error: "visitor_pass_membership_check_failed" });
      return;
    }
  } else {
    const result = await authenticated.userSupabase
      .from("estate_memberships")
      .select("estate_id, membership_role, status")
      .eq("estate_id", estateId)
      .eq("user_id", authenticated.authUser.id)
      .maybeSingle();
    if (result.error) {
      res.status(403).json({ error: "estate_membership_required" });
      return;
    }
    membership = result.data;
  }

  if (!canCreateVisitorPass(membership, estateId)) {
    res.status(403).json({ error: "estate_membership_required" });
    return;
  }

  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }

  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getVisitorPassesForHost(client, estateId, authenticated.authUser.id, page.pageSize, page.from),
      );
      const encryptionSecret = process.env.VISITOR_PASS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const visitorPasses = result.visitorPasses.map((pass) => {
        const { access_code_ciphertext: ciphertext, ...safePass } = pass;
        return {
          ...safePass,
          accessCode: decryptVisitorAccessCode(typeof ciphertext === "string" ? ciphertext : null, encryptionSecret),
        };
      });
      res.status(200).json({
        visitorPasses,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "visitor_pass_list_failed" });
    }
    return;
  }

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

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const outcome = await withAuthenticatedTransaction(authenticated.authUser.id, async (client) => {
        const membership = await getEstateMembershipAccess(client, authenticated.authUser.id, estateId);
        if (!canCreateVisitorPass(membership, estateId)) return { kind: "forbidden" as const };
        const enabled = await getEstateEnabledStatus(client, estateId);
        if (enabled === null) return { kind: "not_found" as const };
        if (!enabled) return { kind: "disabled" as const };
        return updateVisitorPassStatus(client, {
          estateId, passId, hostUserId: authenticated.authUser.id, targetStatus,
        });
      });
      if (outcome.kind === "forbidden") { res.status(403).json({ error: "estate_membership_required" }); return; }
      if (outcome.kind === "not_found") { res.status(404).json({ error: "visitor_pass_not_found" }); return; }
      if (outcome.kind === "disabled") { rejectInactiveEstate(res); return; }
      if (outcome.kind === "not_reactivatable") { res.status(409).json({ error: "visitor_pass_not_reactivatable" }); return; }
      if (outcome.kind === "expired") { res.status(409).json({ error: "visitor_pass_expired" }); return; }
      if (outcome.kind === "unchanged") { res.status(200).json({ pass: outcome.pass }); return; }
      if (outcome.kind === "updated") { res.status(200).json({ pass: outcome.pass }); return; }
      res.status(409).json({ error: "visitor_pass_status_update_failed" });
    } catch { res.status(503).json({ error: "visitor_pass_status_update_failed" }); }
    return;
  }

  const { data: membership, error: membershipError } = await authenticated.userSupabase.from("estate_memberships")
    .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
  if (membershipError || !canCreateVisitorPass(membership, estateId)) {
    res.status(403).json({ error: "estate_membership_required" }); return;
  }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getEstateMembershipAccess(client, authenticated.authUser.id, estateId));
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
    membership = result.data;
  }
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const accessCode = typeof req.body?.accessCode === "string" ? req.body.accessCode.trim() : "";
  if (!isValidVisitorAccessCode(accessCode)) { res.status(400).json({ error: "invalid_access_code" }); return; }
  const hash = createHash("sha256").update(accessCode).digest("hex");
  let pass: { id: string; host_user_id: string; visitor_name: string; visitor_phone: string | null; valid_from: string; valid_until: string; status: string; host_full_name?: string | null } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try { pass = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getGateVisitorPass(client, estateId, hash)); }
    catch { res.status(503).json({ error: "visitor_pass_lookup_failed" }); return; }
  } else {
    const result = await authenticated.userSupabase.from("visitor_passes")
      .select("id, host_user_id, visitor_name, visitor_phone, valid_from, valid_until, status")
      .eq("estate_id", estateId).eq("access_code_hash", hash).maybeSingle();
    pass = result.error ? null : result.data;
  }
  if (!pass) { res.status(404).json({ error: "visitor_pass_not_found_or_invalid" }); return; }
  let hostName: string | null = pass.host_full_name ?? null;
  if (process.env.NATIVE_POSTGRES_READS !== "true") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && process.env.SUPABASE_URL) {
      const admin = createClient(process.env.SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: host } = await admin.from("users").select("full_name").eq("id", pass.host_user_id).maybeSingle();
      hostName = host?.full_name ?? null;
    }
  }
  res.status(200).json({ visitor: { name: pass.visitor_name, phone: pass.visitor_phone }, host: { name: hostName }, pass: { id: pass.id, validFrom: pass.valid_from, validUntil: pass.valid_until, status: pass.status }, availabilityError: visitorPassAvailabilityError(pass) });
});

app.post("/v1/estates/:estateId/gate/visitor-passes/:passId/deny", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const passId = Array.isArray(req.params.passId) ? req.params.passId[0] : req.params.passId;
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getEstateMembershipAccess(client, authenticated.authUser.id, estateId));
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
    membership = result.data;
  }
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length > 500) { res.status(400).json({ error: "invalid_denial_reason" }); return; }
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const outcome = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        denyVisitorPass(client, { estateId, passId, reason: reason || null }),
      );
      if (!outcome || outcome.result === "forbidden") { res.status(403).json({ error: "security_membership_required" }); return; }
      if (outcome.result === "not_active") { res.status(409).json({ error: "visitor_pass_not_active" }); return; }
      res.status(200).json({ pass: { id: outcome.pass_id, status: outcome.pass_status } });
    } catch { res.status(503).json({ error: "visitor_decision_failed" }); }
    return;
  }

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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getEstateMembershipAccess(client, authenticated.authUser.id, estateId));
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
    membership = result.data;
  }
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const accessCode = typeof req.body?.accessCode === "string" ? req.body.accessCode.trim() : "";
  if (!isValidVisitorAccessCode(accessCode)) { res.status(400).json({ error: "invalid_access_code" }); return; }
  const hash = createHash("sha256").update(accessCode).digest("hex");
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, async (client) => {
        const pass = await getGateVisitorPass(client, estateId, hash);
        if (!pass) return { kind: "not_found" as const };
        const availabilityError = visitorPassAvailabilityError(pass);
        if (availabilityError) return { kind: "unavailable" as const, error: availabilityError };
        const visit = await createGateVisitorVisit(client, { estateId, visitorPassId: pass.id, checkedInBy: authenticated.authUser.id });
        return visit ? { kind: "created" as const, pass, visit } : { kind: "failed" as const };
      });
      if (result.kind === "not_found") { res.status(404).json({ error: "visitor_pass_not_found_or_invalid" }); return; }
      if (result.kind === "unavailable") { res.status(409).json({ error: result.error }); return; }
      if (result.kind === "failed") { res.status(400).json({ error: "visitor_check_in_failed" }); return; }
      res.status(201).json({ visit: result.visit, visitor: { name: result.pass.visitor_name, phone: result.pass.visitor_phone } });
    } catch (error) {
      const failure = visitorCheckInFailure((error as { code?: string })?.code);
      res.status(failure.status).json({ error: failure.error });
    }
    return;
  }
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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getEstateMembershipAccess(client, authenticated.authUser.id, estateId));
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
    membership = result.data;
  }
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getActiveGateVisitsForEstate(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        visits: result.visits,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "active_visits_load_failed" });
    }
    return;
  }

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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getEstateMembershipAccess(client, authenticated.authUser.id, estateId));
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, membership_role, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id).maybeSingle();
    membership = result.data;
  }
  if (!canUseGateWorkflow(membership, estateId)) { res.status(403).json({ error: "security_membership_required" }); return; }
  const estateEnabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (estateEnabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!estateEnabled) { rejectInactiveEstate(res); return; }
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        checkoutGateVisitorVisit(client, { estateId, visitId, checkedOutBy: authenticated.authUser.id, checkedOutAt: new Date().toISOString() }),
      );
      if (!data) { res.status(409).json({ error: "open_visit_not_found_or_checkout_failed" }); return; }
      res.status(200).json({ visit: data });
    } catch { res.status(503).json({ error: "visitor_visit_checkout_failed" }); }
    return;
  }
  const { data, error } = await authenticated.userSupabase.from("visitor_visits")
    .update({ checked_out_by: authenticated.authUser.id, checked_out_at: new Date().toISOString() })
    .eq("id", visitId).eq("estate_id", estateId).is("checked_out_at", null)
    .select("id, checked_in_at, checked_out_at").maybeSingle();
  if (error || !data) { res.status(409).json({ error: "open_visit_not_found_or_checkout_failed" }); return; }
  res.status(200).json({ visit: data });
});

async function requireSecurityEventAccess(req: import("express").Request, res: import("express").Response, estateId: string): Promise<AuthenticatedRequest | null> {
  const authenticated = req as AuthenticatedRequest;
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
      getEstateMembershipAccess(client, authenticated.authUser.id, estateId),
    );
  } else {
    const result = await authenticated.userSupabase
      .from("estate_memberships")
      .select("estate_id, membership_role, status")
      .eq("estate_id", estateId)
      .eq("user_id", authenticated.authUser.id)
      .eq("status", "active")
      .maybeSingle();
    if (result.error) { res.status(403).json({ error: "security_membership_check_failed" }); return null; }
    membership = result.data;
  }
  if (!canUseGateWorkflow(membership, estateId)) {
    res.status(403).json({ error: "security_membership_required" }); return null;
  }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return null; }
  if (!enabled) { rejectInactiveEstate(res); return null; }
  return authenticated;
}

app.get("/v1/estates/:estateId/security/shift-handovers", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireSecurityEventAccess(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getSecurityShiftHandovers(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        handovers: result.handovers,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "security_shift_handovers_load_failed" });
    }
    return;
  }
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createSecurityShiftHandover(client, {
          estateId, userId: authenticated.authUser.id, shiftLabel,
          shiftStartedAt: startedAt.toISOString(), shiftEndedAt: endedAt.toISOString(),
          handoverNotes: notes, pendingActions: pendingActions || null,
        }),
      );
      if (!data) { res.status(400).json({ error: "security_shift_handover_create_failed" }); return; }
      res.status(201).json({ handover: data });
    } catch {
      res.status(503).json({ error: "security_shift_handover_create_failed" });
    }
    return;
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        acknowledgeSecurityShiftHandover(client, { estateId, handoverId, userId: authenticated.authUser.id, acknowledgedAt: new Date().toISOString() }),
      );
      if (!data) { res.status(409).json({ error: "pending_shift_handover_not_found_or_self_acknowledgement" }); return; }
      res.status(200).json({ handover: data });
    } catch {
      res.status(503).json({ error: "shift_handover_acknowledgement_failed" });
    }
    return;
  }
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
  let membership: { estate_id: string; membership_role: string; status: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => getEstateMembershipAccess(client, authenticated.authUser.id, estateId));
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("estate_id, status").eq("estate_id", estateId).eq("user_id", authenticated.authUser.id)
      .eq("status", "active").maybeSingle();
    membership = result.data ? { ...result.data, membership_role: "" } : null;
  }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!membership && !platformAdmin) { res.status(403).json({ error: "active_estate_membership_required" }); return; }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!enabled) { rejectInactiveEstate(res); return; }
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getSecurityEmergencyAlerts(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        alerts: result.alerts,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "emergency_alerts_load_failed" });
    }
    return;
  }
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        publishSecurityEmergencyAlert(client, { estateId, alertType, severity, title, message, location: location || null }),
      );
      if (!data || !data.alert) { res.status(400).json({ error: "emergency_alert_create_failed" }); return; }
      res.status(201).json(data);
    } catch (error) {
      const message = (error as { message?: string })?.message ?? "";
      res.status(message.includes("security_membership_required") ? 403 : message.includes("estate_subscription_inactive") ? 423 : 400)
        .json({ error: message.includes("security_membership_required") ? "security_membership_required" : message.includes("estate_subscription_inactive") ? "estate_subscription_inactive" : "emergency_alert_create_failed" });
    }
    return;
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        resolveSecurityEmergencyAlert(client, { estateId, alertId, userId: authenticated.authUser.id, resolvedAt: new Date().toISOString() }),
      );
      if (!data) { res.status(404).json({ error: "active_emergency_alert_not_found_or_resolve_failed" }); return; }
      res.status(200).json({ alert: data });
    } catch { res.status(503).json({ error: "emergency_alert_resolve_failed" }); }
    return;
  }
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getSecurityIncidents(client, estateId, page.pageSize, page.from),
      );
      res.status(200).json({
        incidents: result.incidents,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "security_incidents_load_failed" });
    }
    return;
  }
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createSecurityIncident(client, {
          estateId, userId: authenticated.authUser.id, title, category, severity,
          description, location: location || null, occurredAt: occurredDate.toISOString(),
        }),
      );
      if (!data) { res.status(400).json({ error: "security_incident_create_failed" }); return; }
      res.status(201).json({ incident: data });
    } catch {
      res.status(503).json({ error: "security_incident_create_failed" });
    }
    return;
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

async function requireResidentEventAccess(req: import("express").Request, res: import("express").Response, estateId: string): Promise<AuthenticatedRequest | null> {
  const authenticated = req as AuthenticatedRequest;
  let membership: { membership_role: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
      getEstateMembershipAccess(client, authenticated.authUser.id, estateId),
    );
  } else {
    const result = await authenticated.userSupabase
      .from("estate_memberships")
      .select("membership_role")
      .eq("estate_id", estateId)
      .eq("user_id", authenticated.authUser.id)
      .eq("status", "active")
      .maybeSingle();
    if (result.error) { res.status(403).json({ error: "resident_event_access_check_failed" }); return null; }
    membership = result.data;
  }
  if (membership?.membership_role !== "resident") {
    res.status(403).json({ error: "resident_membership_required_for_events" }); return null;
  }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return null; }
  if (!enabled) { rejectInactiveEstate(res); return null; }
  return authenticated;
}

async function requireEventOwner(
  req: import("express").Request,
  res: import("express").Response,
  estateId: string,
  eventId: string,
): Promise<AuthenticatedRequest | null> {
  const authenticated = await requireResidentEventAccess(req, res, estateId);
  if (!authenticated) return null;

  let membership: { membership_role: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
      getEstateMembershipAccess(client, authenticated.authUser.id, estateId),
    );
  } else {
    const result = await authenticated.userSupabase
      .from("estate_memberships")
      .select("membership_role")
      .eq("estate_id", estateId)
      .eq("user_id", authenticated.authUser.id)
      .eq("status", "active")
      .maybeSingle();
    membership = result.error ? null : result.data;
  }
  if (!membership) {
    res.status(403).json({ error: "resident_membership_required_for_events" });
    return null;
  }

  let eventCreator: string | null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    eventCreator = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
      getEventCreator(client, estateId, eventId),
    );
  } else {
    const result = await authenticated.userSupabase
      .from("estate_events")
      .select("id, created_by")
      .eq("estate_id", estateId)
      .eq("id", eventId)
      .maybeSingle();
    eventCreator = result.error ? null : result.data?.created_by ?? null;
  }
  if (eventCreator !== authenticated.authUser.id) {
    res.status(403).json({ error: "event_owner_required" });
    return null;
  }
  return authenticated;
}

app.get("/v1/estates/:estateId/events", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  let membership: { membership_role: string } | null = null;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      membership = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getEstateMembershipAccess(client, authenticated.authUser.id, estateId),
      );
    } catch {
      res.status(503).json({ error: "estate_membership_lookup_failed" });
      return;
    }
  } else {
    const result = await authenticated.userSupabase.from("estate_memberships")
      .select("membership_role").eq("estate_id", estateId)
      .eq("user_id", authenticated.authUser.id).eq("status", "active").maybeSingle();
    if (result.error) { res.status(503).json({ error: "estate_membership_lookup_failed" }); return; }
    membership = result.data;
  }
  const platformAdmin = await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id);
  if (!membership && !platformAdmin) { res.status(403).json({ error: "active_estate_membership_required" }); return; }
  const enabled = await isEstateEnabled(authenticated.userSupabase, estateId, authenticated.authUser.id);
  if (enabled === null) { res.status(404).json({ error: "estate_not_found_or_unavailable" }); return; }
  if (!enabled) { rejectInactiveEstate(res); return; }
  const page = getPageWindow(req);

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstateEventsForCreator(
          client,
          estateId,
          authenticated.authUser.id,
          page.pageSize,
          page.from,
        ),
      );
      res.status(200).json({
        events: result.events,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "estate_events_load_failed" });
    }
    return;
  }

  const { data, error } = await authenticated.userSupabase.from("estate_events")
    .select("id, estate_id, title, description, venue, venue_id, venue_approval_status, starts_at, ends_at, status, created_by, created_at, updated_at")
    .eq("estate_id", estateId)
    .eq("created_by", authenticated.authUser.id)
    .order("starts_at", { ascending: true }).order("id", { ascending: true }).range(page.from, page.to);
  if (error) { res.status(403).json({ error: "estate_events_load_failed" }); return; }
  const result = pageResult(data, page);
  res.status(200).json({ events: result.items, pagination: result.pagination });
});

app.get("/v1/estates/:estateId/events/attendance-summaries", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireResidentEventAccess(req, res, estateId);
  if (!authenticated) return;
  const page = getPageWindow(req);
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const summaries = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        getEstateEventAttendanceSummaries(client, estateId, authenticated.authUser.id, page.pageSize, page.from),
      );
      res.status(200).json({ summaries });
    } catch {
      res.status(503).json({ error: "event_summaries_load_failed" });
    }
    return;
  }
  const { data: events, error: eventsError } = await authenticated.userSupabase
    .from("estate_events").select("id").eq("estate_id", estateId)
    .eq("created_by", authenticated.authUser.id).order("starts_at", { ascending: true }).order("id", { ascending: true }).range(page.from, page.to);
  if (eventsError) { res.status(503).json({ error: "event_summaries_load_failed" }); return; }
  const eventIds = (events ?? []).map((event) => event.id);
  if (!eventIds.length) { res.status(200).json({ summaries: [] }); return; }
  const { data: summaries, error: summariesError } = await authenticated.userSupabase.rpc(
    "get_event_attendance_summaries",
    { p_estate_id: estateId, p_event_ids: eventIds },
  );
  if (summariesError || !summaries) {
    res.status(503).json({ error: "event_summaries_load_failed" }); return;
  }
  res.status(200).json({
    summaries: summaries.map((summary: { event_id: string; total_guests: number; checked_in: number; active_invitations: number }) => {
      const totalGuests = Number(summary.total_guests);
      const checkedIn = Number(summary.checked_in);
      return {
        eventId: summary.event_id,
        totalGuests,
        checkedIn,
        activeInvitations: Number(summary.active_invitations),
        outstanding: Math.max(0, totalGuests - checkedIn),
        attendancePercentage: totalGuests ? Math.round(checkedIn / totalGuests * 100) : 0,
      };
    }),
  });
});

app.post("/v1/estates/:estateId/events", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const authenticated = await requireResidentEventAccess(req, res, estateId);
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
      !venueId || (venueId !== "home" && venue.length < 2) || venue.length > 240 ||
      !startsAt || !endsAt || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) ||
      endDate.getTime() <= startDate.getTime()) {
    res.status(400).json({ error: "invalid_event_details", message: "Enter an event title, select an available venue, provide valid start and end date/time, and ensure the end is after the start." }); return;
  }
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => createEstateEvent(client, {
        estateId, creatorUserId: authenticated.authUser.id, title, description, venueId,
        venueLabel: venueId === "home" ? "Home" : venue, startsAt: startDate.toISOString(), endsAt: endDate.toISOString(),
        status, requestedAt: new Date().toISOString(),
      }));
      if (result.kind === "venue_unavailable") { res.status(400).json({ error: "event_venue_unavailable", message: "That venue is no longer available. Refresh the venue list and choose another." }); return; }
      res.status(201).json({ event: result.event });
    } catch { res.status(503).json({ error: "estate_event_create_failed" }); }
    return;
  }
  let selectedVenue: { id: string; name: string; location: string | null; status: string } | null = null;
  if (venueId !== "home") {
    const { data, error: venueError } = await authenticated.userSupabase
      .from("estate_venues").select("id,name,location,status").eq("id", venueId).eq("estate_id", estateId).maybeSingle();
    if (venueError || !data || data.status !== "available") {
      res.status(400).json({ error: "event_venue_unavailable", message: "That venue is no longer available. Refresh the venue list and choose another." }); return;
    }
    selectedVenue = data;
  }
  const venueLabel = selectedVenue
    ? (selectedVenue.location ? selectedVenue.name + " · " + selectedVenue.location : selectedVenue.name)
    : "Home";
  const requiresVenueApproval = venueId !== "home";
  const { data, error } = await authenticated.userSupabase.from("estate_events")
    .insert({
      estate_id: estateId, title, description, venue: venueLabel,
      venue_id: selectedVenue?.id ?? null,
      venue_approval_status: requiresVenueApproval ? "pending" : "approved",
      venue_approval_requested_at: requiresVenueApproval ? new Date().toISOString() : null,
      venue_approval_publish_requested: requiresVenueApproval && status === "published",
      starts_at: startDate.toISOString(), ends_at: endDate.toISOString(),
      status: requiresVenueApproval ? "draft" : status,
      created_by: authenticated.authUser.id,
    })
    .select("id, estate_id, title, description, venue, venue_id, venue_approval_status, starts_at, ends_at, status, created_by, created_at, updated_at").single();
  if (error || !data) { res.status(400).json({ error: "estate_event_create_failed" }); return; }
  res.status(201).json({ event: data });
});

app.patch("/v1/estates/:estateId/events/:eventId", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) => updateEstateEvent(client, {
        estateId, eventId, title, description, venue, startsAt: startDate.toISOString(), endsAt: endDate.toISOString(),
        status, updatedAt: new Date().toISOString(),
      }));
      if (result.kind === "not_found") { res.status(404).json({ error: "estate_event_not_found_or_update_failed" }); return; }
      if (result.kind === "venue_pending") { res.status(409).json({ error: "event_venue_approval_pending", message: "This event cannot be published until its selected estate facility is approved." }); return; }
      res.status(200).json({ event: result.event });
    } catch { res.status(503).json({ error: "estate_event_update_failed" }); }
    return;
  }
  const { data: currentEvent, error: currentEventError } = await authenticated.userSupabase
    .from("estate_events").select("venue_approval_status").eq("estate_id", estateId).eq("id", eventId).maybeSingle();
  if (currentEventError || !currentEvent) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  if (status === "published" && currentEvent.venue_approval_status && currentEvent.venue_approval_status !== "approved") {
    res.status(409).json({ error: "event_venue_approval_pending", message: "This event cannot be published until its selected estate facility is approved." }); return;
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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  const page = getPageWindow(req);

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstateEventGuests(client, estateId, eventId, page.pageSize, page.from),
      );
      res.status(200).json({
        guests: result.guests,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "event_guest_list_load_failed" });
    }
    return;
  }

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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
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
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createEstateEventGuest(client, { estateId, eventId, guestName, email: email || null, phone: phone || null, notes, userId: authenticated.authUser.id }),
      );
      if (!data) { res.status(400).json({ error: "event_guest_add_failed" }); return; }
      res.status(201).json({ guest: data });
    } catch {
      res.status(503).json({ error: "event_guest_add_failed" });
    }
    return;
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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const removedId = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        deleteEstateEventGuest(client, estateId, eventId, guestId),
      );
      if (!removedId) { res.status(404).json({ error: "event_guest_not_found_or_remove_failed" }); return; }
      res.status(200).json({ removed: true, guestId: removedId });
    } catch {
      res.status(503).json({ error: "event_guest_not_found_or_remove_failed" });
    }
    return;
  }
  const { data, error } = await authenticated.userSupabase.from("estate_event_guests")
    .delete().eq("estate_id", estateId).eq("event_id", eventId).eq("id", guestId)
    .select("id").maybeSingle();
  if (error || !data) { res.status(404).json({ error: "event_guest_not_found_or_remove_failed" }); return; }
  res.status(200).json({ removed: true, guestId: data.id });
});

app.get("/v1/estates/:estateId/events/:eventId/invitations", requireAuth, async (req, res) => {
  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const eventId = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  const page = getPageWindow(req);

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstateEventInvitations(client, estateId, eventId, page.pageSize, page.from),
      );
      res.status(200).json({
        invitations: result.invitations,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "event_invitations_load_failed" });
    }
    return;
  }

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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  const code = String(randomInt(100000, 1000000));
  const codeHash = createHash("sha256").update(code).digest("hex");
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        issueEstateEventInvitation(client, { estateId, eventId, guestId, codeHash, userId: authenticated.authUser.id, revokedAt: new Date().toISOString() }),
      );
      if (!result) { res.status(404).json({ error: "event_guest_not_found" }); return; }
      if (result.kind === "venue_pending") {
        res.status(409).json({ error: "event_venue_approval_pending", message: "Invitations can be sent after the estate venue has been approved." });
        return;
      }
      if (result.kind !== "created") return;
      const { guest, event } = result.context;
      res.status(201).json({ invitation: result.invitation, code, guest, event });
    } catch {
      res.status(503).json({ error: "event_invitation_create_failed" });
    }
    return;
  }
  const { data: guest, error: guestError } = await authenticated.userSupabase.from("estate_event_guests")
    .select("id, guest_name, email, phone").eq("id", guestId).eq("estate_id", estateId).eq("event_id", eventId).maybeSingle();
  if (guestError || !guest) { res.status(404).json({ error: "event_guest_not_found" }); return; }
  const { data: event, error: eventError } = await authenticated.userSupabase.from("estate_events")
    .select("id, title, venue, starts_at, ends_at, venue_approval_status").eq("id", eventId).eq("estate_id", estateId).maybeSingle();
  if (eventError || !event) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  if (event.venue_approval_status && event.venue_approval_status !== "approved") {
    res.status(409).json({ error: "event_venue_approval_pending", message: "Invitations can be sent after the estate venue has been approved." }); return;
  }
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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        revokeEstateEventInvitation(client, { estateId, eventId, invitationId, revokedAt: new Date().toISOString() }),
      );
      if (!data) { res.status(404).json({ error: "active_event_invitation_not_found" }); return; }
      res.status(200).json({ invitation: data });
    } catch {
      res.status(503).json({ error: "active_event_invitation_revoke_failed" });
    }
    return;
  }
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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  const page = getPageWindow(req);

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const report = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstateEventAttendanceReport(client, estateId, eventId, page.pageSize, page.from),
      );
      if (!report) { res.status(404).json({ error: "estate_event_not_found" }); return; }
      res.status(200).json({
        event: report.event,
        summary: report.summary,
        guests: report.guests,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: report.hasMore,
          nextPage: report.hasMore ? page.page + 1 : null,
        },
      });
    } catch (error) {
      console.error("native_postgres_event_attendance_report_failed", error);
      res.status(503).json({ error: "event_attendance_report_load_failed" });
    }
    return;
  }

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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  const page = getPageWindow(req);

  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getEstateEventCheckIns(client, estateId, eventId, page.pageSize, page.from),
      );
      res.status(200).json({
        checkIns: result.checkIns,
        total: result.checkIns.length,
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          hasMore: result.hasMore,
          nextPage: result.hasMore ? page.page + 1 : null,
        },
      });
    } catch {
      res.status(503).json({ error: "event_checkins_load_failed" });
    }
    return;
  }

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
  const authenticated = await requireEventOwner(req, res, estateId, eventId);
  if (!authenticated) return;
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: "invalid_event_invitation_code" }); return; }
  const codeHash = createHash("sha256").update(code).digest("hex");
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        createEstateEventCheckIn(client, { estateId, eventId, codeHash, userId: authenticated.authUser.id }),
      );
      if (result.kind === "not_found") { res.status(404).json({ error: "event_invitation_not_found_or_inactive" }); return; }
      if (result.kind === "already_checked_in") {
        res.status(409).json({ error: "event_guest_already_checked_in", checkIn: result.checkIn, guest: result.guest }); return;
      }
      res.status(201).json({ checkIn: result.checkIn, guest: result.guest });
    } catch {
      res.status(503).json({ error: "event_guest_checkin_failed" });
    }
    return;
  }
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
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "invalid_event_invitation_code" }); return;
  }

  const codeHash = createHash("sha256").update(code).digest("hex");
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const result = await withAuthenticatedTransaction(authenticated.authUser.id, (client) =>
        verifyEstateEventInvitation(client, estateId, eventId, codeHash),
      );
      if (!result || result.status === "forbidden") { res.status(403).json({ error: "security_membership_required" }); return; }
      if (result.status === "event_not_found") { res.status(404).json({ error: "estate_event_not_found" }); return; }
      if (result.status === "venue_pending") { res.status(409).json({ error: "event_venue_approval_pending", message: "This event venue has not been approved." }); return; }
      if (result.status === "event_not_open") { res.status(409).json({ error: "event_not_open_for_guest_checkin" }); return; }
      if (result.status === "invitation_not_found") { res.status(404).json({ error: "event_invitation_not_found_or_inactive" }); return; }
      if (result.status === "guest_not_found") { res.status(404).json({ error: "event_invitation_guest_not_found" }); return; }
      if (result.status === "already_checked_in") { res.status(409).json({ error: "event_guest_already_checked_in", checkIn: result.checkIn, guest: result.guest }); return; }
      if (result.status !== "verified") { res.status(503).json({ error: "event_invitation_verification_failed" }); return; }
      // Security authorises entry only. Attendance is recorded later by the Event Coordinator.
      res.status(200).json({ verified: true, event: result.event, guest: result.guest, invitation: result.invitation });
    } catch {
      res.status(503).json({ error: "event_invitation_verification_failed" });
    }
    return;
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
    .select("id, estate_id, title, venue, starts_at, ends_at, status, venue_approval_status")
    .eq("id", eventId).eq("estate_id", estateId).maybeSingle();
  if (eventError || !event) { res.status(404).json({ error: "estate_event_not_found" }); return; }
  if (event.venue_approval_status && event.venue_approval_status !== "approved") {
    res.status(409).json({ error: "event_venue_approval_pending", message: "This event venue has not been approved." }); return;
  }
  if (event.status !== "published") { res.status(409).json({ error: "event_not_open_for_guest_checkin" }); return; }

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

  // Enable the native PostgreSQL read path only after DATABASE_URL and the
  // authenticated-role grants have been verified against the target database.
  // Supabase PostgREST remains the default path during the staged migration.
  if (process.env.NATIVE_POSTGRES_READS === "true") {
    try {
      const data = await withAuthenticatedTransaction(
        authenticated.authUser.id,
        (client) => getMeData(client, authenticated.authUser.id),
      );
      res.status(200).json({
        user: {
          id: authenticated.authUser.id,
          email: authenticated.authUser.email ?? null,
          emailConfirmed: Boolean(authenticated.authUser.email_confirmed_at),
        },
        ...data,
        profilePending: data.profile === null,
      });
    } catch {
      res.status(503).json({ error: "profile_lookup_failed" });
    }
    return;
  }

  try {
    const { data: profile, error } = await authenticated.userSupabase
      .from("users")
      .select("id, full_name, phone_e164, home_number, street_name, is_active, created_at, updated_at")
      .eq("id", authenticated.authUser.id)
      .maybeSingle();

    if (error) {
      res.status(403).json({ error: "profile_access_denied" });
      return;
    }

    const [roleResult, membershipResult, residentUnitResult] = await Promise.all([
      authenticated.userSupabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authenticated.authUser.id),
      authenticated.userSupabase
        .from("estate_memberships")
        .select("id, estate_id, membership_role, status, estates(name, address, city, state)")
        .eq("user_id", authenticated.authUser.id)
        .order("created_at", { ascending: true }),
      authenticated.userSupabase
        .from("resident_units")
        .select("unit_id, start_date, end_date, units(unit_code, unit_type, building_id, buildings(name, estate_id, estates(name)))")
        .eq("resident_user_id", authenticated.authUser.id)
        .is("end_date", null),
    ]);
    const roleRows = roleResult.data;
    const memberships = membershipResult.data;
    const residentUnits = residentUnitResult.data;
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
