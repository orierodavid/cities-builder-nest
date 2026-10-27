import "dotenv/config";
import express from "express";
import cors from "cors";
import { requireAuth, authConfigurationReady, type AuthenticatedRequest } from "./auth.js";
import { checkDatabase } from "./storage.js";
import { submitMaintenanceRequest } from "./maintenance-service.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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

  const { data: resident, error: residentError } = await authenticated.userSupabase
    .from("users")
    .select("id, full_name, phone_e164, is_active")
    .eq("id", residentUserId)
    .maybeSingle();

  if (residentError || !resident || !resident.is_active) {
    res.status(404).json({ error: "active_registered_user_not_found", message: "The resident must already have a registered, active account." });
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

app.post("/v1/estates/:estateId/staff", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  if (!(await hasPlatformAdmin(authenticated.userSupabase, authenticated.authUser.id))) {
    res.status(403).json({ error: "platform_admin_required" });
    return;
  }

  const estateId = Array.isArray(req.params.estateId) ? req.params.estateId[0] : req.params.estateId;
  const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  const role = req.body?.role;
  if (!userId || !["facility_manager", "security"].includes(role)) {
    res.status(400).json({ error: "invalid_staff_assignment", message: "Provide an existing user ID and role facility_manager or security." });
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


app.post("/v1/estates/:estateId/units/:unitId/assignments", requireAuth, async (req, res) => {
  const authenticated = req as AuthenticatedRequest;
  const estateParam = req.params.estateId;
  const unitParam = req.params.unitId;
  const estateId = Array.isArray(estateParam) ? (estateParam[0] ?? "") : estateParam;
  const unitId = Array.isArray(unitParam) ? (unitParam[0] ?? "") : unitParam;
  const residentUserId = typeof req.body?.residentUserId === "string" ? req.body.residentUserId.trim() : "";
  const startDate = typeof req.body?.startDate === "string" ? req.body.startDate : undefined;

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
    .select("id, name, address, city, state, timezone")
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

  // Verify the caller has an active membership before returning estate-scoped data.
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
  if (!membership) {
    res.status(403).json({ error: "active_estate_membership_required" });
    return;
  }

  try {
    const [estateResult, announcementsResult, announcementsCountResult, maintenanceResult, maintenanceCountResult, unitsResult] = await Promise.all([
      authenticated.userSupabase
        .from("estates")
        .select("id, name, address, city, state, timezone")
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
    if (announcementsResult.error || announcementsCountResult.error || maintenanceResult.error || maintenanceCountResult.error || unitsResult.error) {
      res.status(403).json({ error: "estate_dashboard_data_access_denied" });
      return;
    }

    const units = unitsResult.data ?? [];
    const requests = maintenanceResult.data ?? [];
    res.status(200).json({
      estate: { ...estateResult.data, membershipRole: membership.membership_role },
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

    res.status(200).json({
      user: {
        id: authenticated.authUser.id,
        email: authenticated.authUser.email ?? null,
        emailConfirmed: Boolean(authenticated.authUser.email_confirmed_at),
      },
      profile: profile ?? null,
      profilePending: profile === null,
    });
  } catch {
    res.status(500).json({ error: "profile_lookup_failed" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Cities Builder Nest API listening on port ${port}`);
});
