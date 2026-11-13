import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "server.ts");
const singleUseMigrationPath = resolve(here, "../../../supabase/migrations/20261028095151_visitor_pass_single_use.sql");
const lifecycleMigrationPath = resolve(here, "../../../supabase/migrations/20261028095159_visitor_pass_lifecycle_guards.sql");

test("visitor pass creation and gate endpoints keep role checks and estate scoping", async () => {
  const server = await readFile(serverPath, "utf8");
  assert.match(server, /canCreateVisitorPass\(membership, estateId\)/);
  assert.match(server, /canUseGateWorkflow\(membership, estateId\)/);
  assert.match(server, /\.eq\("estate_id", estateId\)\.eq\("access_code_hash", hash\)/);
  assert.match(server, /\.eq\("id", visitId\)\.eq\("estate_id", estateId\)\.is\("checked_out_at", null\)/);
  assert.match(server, /if \(!isValidVisitorAccessCode\(accessCode\)\)/);
});

test("database migrations enforce single use and pass validity at the database boundary", async () => {
  const singleUse = await readFile(singleUseMigrationPath, "utf8");
  const lifecycle = await readFile(lifecycleMigrationPath, "utf8");
  assert.match(singleUse, /CREATE UNIQUE INDEX IF NOT EXISTS visitor_visits_one_entry_per_pass/i);
  assert.match(singleUse, /ON public\.visitor_visits \(visitor_pass_id\)/i);
  assert.match(lifecycle, /p\.estate_id = NEW\.estate_id/);
  assert.match(lifecycle, /p\.status = 'active'/);
  assert.match(lifecycle, /p\.valid_from <= now\(\)/);
  assert.match(lifecycle, /p\.valid_until > now\(\)/);
  assert.match(lifecycle, /e\.id = NEW\.estate_id AND e\.is_enabled = true/);
  assert.match(lifecycle, /visitor_pass_consume_on_check_in/);
});

test("checkout stays estate-scoped and can only close an open visit once", async () => {
  const server = await readFile(serverPath, "utf8");
  const start = server.indexOf('app.post("/v1/estates/:estateId/gate/visits/:visitId/check-out"');
  assert.notEqual(start, -1);
  const end = server.indexOf('\napp.get("/v1/me"', start);
  assert.notEqual(end, -1);
  const checkoutRoute = server.slice(start, end);
  assert.match(checkoutRoute, /canUseGateWorkflow\(membership, estateId\)/);
  assert.match(checkoutRoute, /\.eq\("id", visitId\)\.eq\("estate_id", estateId\)\.is\("checked_out_at", null\)/);
  assert.match(checkoutRoute, /res\.status\(409\)\.json\(\{ error: "open_visit_not_found_or_checkout_failed" \}\)/);
});


test("mobile visitor workflows expose permission-denied and lifecycle-safe messages", async () => {
  const mobilePath = resolve(here, "../../mobile/app/(resident)/visitors.tsx");
  const visitorApiPath = resolve(here, "../../mobile/src/features/security/visitor-api.ts");
  const gateHookPath = resolve(here, "../../mobile/src/features/security/useGate.ts");
  const [mobile, visitorApi, gateHook] = await Promise.all([
    readFile(mobilePath, "utf8"), readFile(visitorApiPath, "utf8"), readFile(gateHookPath, "utf8"),
  ]);

  for (const code of [
    "security_membership_required", "estate_membership_required", "estate_subscription_inactive",
    "invalid_access_code", "visitor_pass_expired_or_inactive", "visitor_pass_already_used",
    "open_visit_not_found_or_checkout_failed",
  ]) {
    assert.ok(visitorApi.includes('case "' + code + '"'), "missing mobile message mapping for " + code);
  }

  assert.match(mobile, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(mobile, /setMessage\(/);
  assert.match(mobile, /Visitor pass history/);
  assert.match(mobile, /No visitor passes yet/);
  assert.match(gateHook, /gateVisitsLoading/);
  assert.match(gateHook, /gateVisitsError/);
  assert.match(gateHook, /setGateVisitsError\(["']["']\)/);
  assert.match(mobile, /catch \(error\)/);
});

test("mobile visitor screens provide loading, empty, and error states", async () => {
  const mobilePath = resolve(here, "../../mobile/app/(resident)/visitors.tsx");
  const gateHookPath = resolve(here, "../../mobile/src/features/security/useGate.ts");
  const recordsPath = resolve(here, "../../mobile/app/(security)/records.tsx");
  const [mobile, gateHook, records] = await Promise.all([
    readFile(mobilePath, "utf8"), readFile(gateHookPath, "utf8"), readFile(recordsPath, "utf8"),
  ]);

  assert.match(mobile, /loading \? <ActivityIndicator/);
  assert.match(mobile, /passes\.length/);
  assert.match(mobile, /No visitor passes yet/);
  assert.match(mobile, /setMessage\(/);
  assert.match(gateHook, /gateVisitsLoading/);
  assert.match(records, /gate\.gateVisitsError/);
  assert.match(records, /gate\.gateVisits\.length/);
  assert.match(records, /No active visitors/);
});


test("resident pass creation and listing require active membership and return only the host's passes", async () => {
  const server = await readFile(serverPath, "utf8");
  const createStart = server.indexOf('app.post("/v1/estates/:estateId/visitor-passes"');
  const listStart = server.indexOf('app.get("/v1/estates/:estateId/visitor-passes"');
  const gateStart = server.indexOf('app.post("/v1/estates/:estateId/gate/check-in"');
  assert.ok(createStart >= 0 && listStart > createStart && gateStart > listStart);

  const createRoute = server.slice(createStart, listStart);
  const listRoute = server.slice(listStart, gateStart);
  assert.match(createRoute, /\.eq\("user_id", authenticated\.authUser\.id\)/);
  assert.match(createRoute, /canCreateVisitorPass\(membership, estateId\)/);
  assert.match(createRoute, /isEstateEnabled\(authenticated\.userSupabase, estateId, authenticated\.authUser\.id\)/);
  assert.match(createRoute, /host_user_id: authenticated\.authUser\.id/);

  assert.match(listRoute, /\.eq\("user_id", authenticated\.authUser\.id\)/);
  assert.match(listRoute, /canCreateVisitorPass\(membership, estateId\)/);
  assert.match(listRoute, /\.eq\("host_user_id", authenticated\.authUser\.id\)/);
  assert.match(listRoute, /\.eq\("estate_id", estateId\)/);
  assert.match(listRoute, /isEstateEnabled\(authenticated\.userSupabase, estateId, authenticated\.authUser\.id\)/);
});

test("all gate routes fail closed for non-security memberships and disabled estates", async () => {
  const server = await readFile(serverPath, "utf8");
  const routes = [
    'app.post("/v1/estates/:estateId/gate/check-in"',
    'app.get("/v1/estates/:estateId/gate/visits"',
    'app.post("/v1/estates/:estateId/gate/visits/:visitId/check-out"',
  ];

  for (const routeSignature of routes) {
    const start = server.indexOf(routeSignature);
    assert.notEqual(start, -1, "missing route " + routeSignature);
    const nextRoute = server.indexOf('\napp.', start + 5);
    const route = server.slice(start, nextRoute === -1 ? undefined : nextRoute);
    assert.match(route, /canUseGateWorkflow\(membership, estateId\)/);
    assert.match(route, /isEstateEnabled\(authenticated\.userSupabase, estateId, authenticated\.authUser\.id\)/);
    assert.match(route, /rejectInactiveEstate\(res\)/);
  }
});

test("native PostgreSQL visitor-pass listing checks membership through the authenticated transaction", async () => {
  const server = await readFile(serverPath, "utf8");
  const start = server.indexOf('app.get("/v1/estates/:estateId/visitor-passes"');
  const end = server.indexOf('app.patch("/v1/estates/:estateId/visitor-passes/:passId/status"', start);
  assert.ok(start >= 0 && end > start);
  const route = server.slice(start, end);
  assert.match(route, /if \(process\.env\.NATIVE_POSTGRES_READS === "true"\)/);
  assert.match(route, /getEstateMembershipAccess\(client, authenticated\.authUser\.id, estateId\)/);
  assert.match(route, /withAuthenticatedTransaction\(authenticated\.authUser\.id/);
  assert.match(route, /getVisitorPassesForHost\(client, estateId, authenticated\.authUser\.id/);
  assert.match(route, /canCreateVisitorPass\(membership, estateId\)/);
});
