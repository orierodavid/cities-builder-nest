import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";

const residentId = "resident-1";
const securityId = "security-1";
const estateA = "estate-a";
const estateB = "estate-b";

const memberships = [
  { estate_id: estateA, user_id: residentId, membership_role: "resident", status: "active" },
  { estate_id: estateA, user_id: "inactive-resident", membership_role: "resident", status: "inactive" },
  { estate_id: estateA, user_id: securityId, membership_role: "security", status: "active" },
  { estate_id: "disabled-estate", user_id: residentId, membership_role: "resident", status: "active" },
  { estate_id: estateB, user_id: "security-b", membership_role: "security", status: "active" },
  { estate_id: "disabled-estate", user_id: securityId, membership_role: "security", status: "active" },
];
const estates = [
  { id: estateA, is_enabled: true },
  { id: estateB, is_enabled: true },
  { id: "disabled-estate", is_enabled: false },
];
const gateCodeHash = createHash("sha256").update("123456").digest("hex");
const passes: Record<string, unknown>[] = [
  {
    id: "other-host-pass", estate_id: estateA, host_user_id: "someone-else",
    visitor_name: "Gate Test Visitor", visitor_phone: null, access_code_hash: gateCodeHash,
    valid_from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: "active", created_at: new Date().toISOString(),
  },
];
const visits: Record<string, any>[] = [];

function sendJson(res: ServerResponse, status: number, body: unknown, objectResponse = false) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(objectResponse && Array.isArray(body) ? body[0] ?? null : body));
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

const mockSupabase = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/auth/v1/user") {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const ids: Record<string, string> = {
      "resident-token": residentId,
      "security-token": securityId,
      "inactive-token": "inactive-resident",
      "other-token": "someone-else",
      "security-b-token": "security-b",
    };
    const id = token ? ids[token] : undefined;
    if (!id) return sendJson(res, 401, { message: "Invalid token" });
    return sendJson(res, 200, { id, aud: "authenticated", role: "authenticated", email: id + "@example.test" });
  }

  if (!url.pathname.startsWith("/rest/v1/")) return sendJson(res, 404, { message: "Not found" });
  const table = url.pathname.slice("/rest/v1/".length);
  const filters = [...url.searchParams.entries()].filter(([key]) => key !== "select" && key !== "order" && key !== "limit");
  const matches = (row: Record<string, any>) => filters.every(([key, value]) => {
    const [operator, ...rest] = value.split(".");
    const expected = rest.join(".");
    if (operator === "is") return expected === "null" ? row[key] === null || row[key] === undefined : String(row[key]) === expected;
    if (operator !== "eq") return true;
    return String(row[key]) === expected;
  });
  const objectResponse = (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");

  if (req.method === "GET" && table === "estate_memberships") {
    return sendJson(res, 200, memberships.filter(matches), objectResponse);
  }
  if (req.method === "GET" && table === "estates") {
    return sendJson(res, 200, estates.filter(matches), objectResponse);
  }
  if (table === "visitor_passes" && req.method === "POST") {
    const body = await readBody(req);
    const row = {
      id: "pass-" + (passes.length + 1),
      created_at: new Date().toISOString(),
      ...body,
    };
    passes.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if (table === "visitor_passes" && req.method === "GET") {
    const rows = passes.filter(matches).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    ).slice(0, Number(url.searchParams.get("limit") ?? 100));
    return sendJson(res, 200, rows, objectResponse);
  }
  if (table === "visitor_visits" && req.method === "POST") {
    const body = await readBody(req);
    const row = {
      id: "visit-" + (visits.length + 1),
      checked_in_at: new Date().toISOString(),
      checked_out_by: null,
      checked_out_at: null,
      ...body,
    };
    visits.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if (table === "visitor_visits" && req.method === "GET") {
    const rows = visits.filter(matches).sort((a, b) =>
      String(b.checked_in_at).localeCompare(String(a.checked_in_at)),
    ).map((visit) => {
      const pass = passes.find((item) => item.id === visit.visitor_pass_id);
      return { ...visit, visitor_passes: pass ? { visitor_name: pass.visitor_name, visitor_phone: pass.visitor_phone } : null };
    });
    return sendJson(res, 200, rows, objectResponse);
  }
  if (table === "visitor_visits" && req.method === "PATCH") {
    const body = await readBody(req);
    const updated = visits.filter(matches);
    for (const row of updated) Object.assign(row, body);
    return sendJson(res, 200, updated, objectResponse);
  }
  return sendJson(res, 404, { message: "Mock route not implemented", table, method: req.method });
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not read test server port"));
      resolve(address.port);
    });
  });
}

const mockPort = await listen(mockSupabase);
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = `http://127.0.0.1:${mockPort}`;
process.env.SUPABASE_ANON_KEY = "isolated-test-anon-key";
const { app } = await import("./server.js");
const api = createServer(app);
const apiPort = await listen(api);
const apiBase = `http://127.0.0.1:${apiPort}`;

after(async () => {
  await Promise.all([
    new Promise<void>((resolve, reject) => api.close((error) => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => mockSupabase.close((error) => error ? reject(error) : resolve())),
  ]);
});

async function request(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(apiBase + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

test("authenticated resident can create a pass and list only passes hosted by that resident", async () => {
  const created = await request(`/v1/estates/${estateA}/visitor-passes`, "resident-token", "POST", {
    visitorName: "Test Visitor",
  });
  assert.equal(created.status, 201);
  assert.match(created.body.accessCode, /^\d{6}$/);

  const listed = await request(`/v1/estates/${estateA}/visitor-passes`, "resident-token");
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.body.visitorPasses));
  assert.equal(listed.body.visitorPasses.length, 1);
  assert.equal(listed.body.visitorPasses[0].visitor_name, "Test Visitor");
  assert.ok(!listed.body.visitorPasses.some((pass: Record<string, unknown>) => pass.id === "other-host-pass"));
});

test("authenticated security and inactive resident accounts cannot create resident visitor passes", async () => {
  const security = await request(`/v1/estates/${estateA}/visitor-passes`, "security-token", "POST", {
    visitorName: "Not Allowed",
  });
  assert.equal(security.status, 403);
  assert.equal(security.body.error, "estate_membership_required");

  const inactive = await request(`/v1/estates/${estateA}/visitor-passes`, "inactive-token", "POST", {
    visitorName: "Not Allowed",
  });
  assert.equal(inactive.status, 403);
  assert.equal(inactive.body.error, "estate_membership_required");
});

test("resident membership and estate checks fail closed for another estate and disabled estates", async () => {
  const wrongEstate = await request(`/v1/estates/${estateB}/visitor-passes`, "resident-token", "POST", {
    visitorName: "Wrong Estate",
  });
  assert.equal(wrongEstate.status, 403);
  assert.equal(wrongEstate.body.error, "estate_membership_required");

  const disabledEstate = await request("/v1/estates/disabled-estate/visitor-passes", "resident-token", "POST", {
    visitorName: "Disabled Estate",
  });
  assert.equal(disabledEstate.status, 423);
  assert.equal(disabledEstate.body.error, "estate_subscription_inactive");
});

test("authenticated security can check in, list, and check out only visits in the assigned estate", async () => {
  const checkIn = await request(`/v1/estates/${estateA}/gate/check-in`, "security-token", "POST", {
    accessCode: "123456",
  });
  assert.equal(checkIn.status, 201);
  assert.equal(checkIn.body.visitor.name, "Gate Test Visitor");
  const visitId = checkIn.body.visit.id as string;

  const active = await request(`/v1/estates/${estateA}/gate/visits`, "security-token");
  assert.equal(active.status, 200);
  assert.ok(active.body.visits.some((visit: Record<string, unknown>) => visit.id === visitId));

  const crossEstate = await request(
    `/v1/estates/${estateB}/gate/visits/${visitId}/check-out`,
    "security-b-token",
    "POST",
  );
  assert.equal(crossEstate.status, 409);

  const checkout = await request(
    `/v1/estates/${estateA}/gate/visits/${visitId}/check-out`,
    "security-token",
    "POST",
  );
  assert.equal(checkout.status, 200);

  const repeated = await request(
    `/v1/estates/${estateA}/gate/visits/${visitId}/check-out`,
    "security-token",
    "POST",
  );
  assert.equal(repeated.status, 409);
});

test("resident and security roles cannot use each other's workflows; disabled estate blocks gate operations", async () => {
  const residentCheckIn = await request(`/v1/estates/${estateA}/gate/check-in`, "resident-token", "POST", {
    accessCode: "123456",
  });
  assert.equal(residentCheckIn.status, 403);
  assert.equal(residentCheckIn.body.error, "security_membership_required");

  const disabledCheckIn = await request("/v1/estates/disabled-estate/gate/check-in", "security-token", "POST", {
    accessCode: "123456",
  });
  assert.equal(disabledCheckIn.status, 423);
  assert.equal(disabledCheckIn.body.error, "estate_subscription_inactive");
});
