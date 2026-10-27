import "dotenv/config";
import express from "express";
import cors from "cors";
import { requireAuth, authConfigurationReady, type AuthenticatedRequest } from "./auth.js";
import { checkDatabase } from "./storage.js";

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
    const [estateResult, announcementsResult, maintenanceResult, unitsResult] = await Promise.all([
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
        .from("maintenance_requests")
        .select("id, title, status, priority, created_at")
        .eq("estate_id", estateId)
        .not("status", "in", "(resolved,closed)")
        .order("created_at", { ascending: false })
        .limit(5),
      authenticated.userSupabase
        .from("units")
        .select("id, status")
        .eq("estate_id", estateId),
    ]);

    if (estateResult.error || !estateResult.data) {
      res.status(403).json({ error: "estate_access_denied" });
      return;
    }
    if (announcementsResult.error || maintenanceResult.error || unitsResult.error) {
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
        openMaintenanceRequests: requests.length,
        publishedAnnouncements: (announcementsResult.data ?? []).length,
      },
      announcements: announcementsResult.data ?? [],
      maintenanceRequests: requests,
    });
  } catch {
    res.status(500).json({ error: "estate_dashboard_load_failed" });
  }
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
