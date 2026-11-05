import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";

const residentId = "resident-1";
const managerId = "manager-1";
const managerBId = "manager-b";
const securityId = "security-1";
const estateA = "estate-a";
const estateB = "estate-b";

const memberships = [
  { estate_id: estateA, user_id: managerId, membership_role: "estate_manager", status: "active" },
  { estate_id: estateB, user_id: managerBId, membership_role: "estate_manager", status: "active" },
  { estate_id: estateA, user_id: residentId, membership_role: "resident", status: "active" },
  { estate_id: estateA, user_id: "inactive-resident", membership_role: "resident", status: "inactive" },
  { estate_id: estateA, user_id: securityId, membership_role: "security", status: "active" },
  { estate_id: estateA, user_id: "security-incoming", membership_role: "security", status: "active" },
  { estate_id: "disabled-estate", user_id: residentId, membership_role: "resident", status: "active" },
  { estate_id: estateB, user_id: "security-b", membership_role: "security", status: "active" },
  { estate_id: "disabled-estate", user_id: securityId, membership_role: "security", status: "active" },
];
const estates = [
  { id: estateA, name: "Estate A", address: "1 Test Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null },
  { id: estateB, name: "Estate B", address: "2 Test Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: true, disabled_at: null, disabled_reason: null },
  { id: "disabled-estate", name: "Disabled Estate", address: "3 Test Road", city: "Lagos", state: "Lagos", timezone: "Africa/Lagos", is_enabled: false, disabled_at: new Date().toISOString(), disabled_reason: "Test disabled estate" },
];
const announcements: Record<string, any>[] = [
  { id: "announcement-a", estate_id: estateA, title: "Estate A notice", body: "Test notice", published_at: new Date().toISOString(), created_at: new Date().toISOString() },
];
const maintenanceRequests: Record<string, any>[] = [];
const units: Record<string, any>[] = [
  { id: "unit-a", estate_id: estateA, status: "available" },
  { id: "unit-b", estate_id: estateB, status: "available" },
];
const assignments: Record<string, any>[] = [];
const gateCodeHash = createHash("sha256").update("123456").digest("hex");
const passes: Record<string, unknown>[] = [
  {
    id: "other-host-pass", estate_id: estateA, host_user_id: "someone-else",
    visitor_name: "Gate Test Visitor", visitor_phone: null, access_code_hash: gateCodeHash,
    valid_from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: "active", created_at: new Date().toISOString(),
  },
  {
    id: "denial-test-pass", estate_id: estateA, host_user_id: residentId,
    visitor_name: "Denial Test Visitor", visitor_phone: null,
    access_code_hash: createHash("sha256").update("654321").digest("hex"),
    valid_from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: "active", created_at: new Date().toISOString(),
  },
];
const visits: Record<string, any>[] = [];
const denials: Record<string, any>[] = [];
const eventRecords: Record<string, any>[] = [
  { id: "event-a", estate_id: estateA, title: "Estate A Gathering", venue: "Clubhouse", status: "published", starts_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), ends_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() },
];
const eventGuestRecords: Record<string, any>[] = [
  { id: "event-guest-a", estate_id: estateA, event_id: "event-a", guest_name: "Event Test Guest", email: "guest@example.test", phone: "08000000000" },
];
const eventInvitationRecords: Record<string, any>[] = [
  { id: "event-invitation-a", estate_id: estateA, event_id: "event-a", guest_id: "event-guest-a", status: "active", code_hash: createHash("sha256").update("987654").digest("hex") },
];
const eventCheckinRecords: Record<string, any>[] = [];
const incidentRecords: Record<string, any>[] = [];
const emergencyAlertRecords: Record<string, any>[] = [];
const shiftHandoverRecords: Record<string, any>[] = [];

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
      "manager-token": managerId,
      "manager-b-token": managerBId,
      "security-token": securityId,
      "security-incoming-token": "security-incoming",
      "inactive-token": "inactive-resident",
      "other-token": "someone-else",
      "security-b-token": "security-b",
    };
    const id = token ? ids[token] : undefined;
    if (!id) return sendJson(res, 401, { message: "Invalid token" });
    return sendJson(res, 200, { id, aud: "authenticated", role: "authenticated", email: id + "@example.test" });
  }

  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/get_legal_consent_status") {
    return sendJson(res, 200, {
      requiresAcceptance: false,
      configurationRequired: false,
      accepted: true,
      documents: [],
      acceptedDocumentIds: [],
      pendingDocumentIds: [],
    });
  }

  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/publish_security_emergency_alert") {
    const body = await readBody(req);
    const alert = {
      id: "emergency-alert-" + (emergencyAlertRecords.length + 1),
      estate_id: body.p_estate_id,
      created_by: req.headers.authorization === "Bearer security-token" ? securityId : "security-incoming",
      alert_type: body.p_alert_type,
      severity: body.p_severity,
      title: body.p_title,
      message: body.p_message,
      location: body.p_location,
      status: "active",
      created_at: new Date().toISOString(),
    };
    emergencyAlertRecords.push(alert);
    const recipientCount = memberships.filter(m => m.estate_id === body.p_estate_id && m.membership_role === "resident" && m.status === "active").length;
    return sendJson(res, 200, { alert, notificationId: recipientCount ? "resident-notification-1" : null, recipientCount });
  }

  if (!url.pathname.startsWith("/rest/v1/")) return sendJson(res, 404, { message: "Not found" });
  const table = url.pathname.slice("/rest/v1/".length);
  const filters = [...url.searchParams.entries()].filter(([key]) => key !== "select" && key !== "order" && key !== "limit");
  const matches = (row: Record<string, any>) => filters.every(([key, value]) => {
    const [operator, ...rest] = value.split(".");
    const expected = rest.join(".");
    if (operator === "is") return expected === "null" ? row[key] === null || row[key] === undefined : String(row[key]) === expected;
    if (operator === "lte") return String(row[key]) <= expected;
    if (operator === "gt") return String(row[key]) > expected;
    if (operator === "neq") return String(row[key]) !== expected;
    if (operator === "in") {
      const allowed = expected.replace(/^\(/, "").replace(/\)$/, "").split(",").map((item) => item.replace(/^"|"$/g, ""));
      return allowed.includes(String(row[key]));
    }
    if (operator !== "eq") return true;
    return String(row[key]) === expected;
  });
  const objectResponse = (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");

  if (req.method === "GET" && table === "users") return sendJson(res, 200, [], objectResponse);
  if (req.method === "GET" && table === "security_shift_handovers") {
    return sendJson(res, 200, shiftHandoverRecords.filter(matches).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Number(url.searchParams.get("limit") ?? 100)), objectResponse);
  }
  if (req.method === "POST" && table === "security_shift_handovers") {
    const body = await readBody(req);
    const row = { id: "shift-handover-" + (shiftHandoverRecords.length + 1), created_at: new Date().toISOString(), status: "pending", ...body };
    shiftHandoverRecords.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if (req.method === "PATCH" && table === "security_shift_handovers") {
    const body = await readBody(req);
    const updated = shiftHandoverRecords.filter(matches);
    for (const row of updated) Object.assign(row, body);
    return sendJson(res, 200, updated, objectResponse);
  }
  if (req.method === "GET" && table === "security_emergency_alerts") {
    return sendJson(res, 200, emergencyAlertRecords.filter(matches).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Number(url.searchParams.get("limit") ?? 100)), objectResponse);
  }
  if (req.method === "POST" && table === "security_emergency_alerts") {
    const body = await readBody(req);
    const row = { id: "emergency-alert-" + (emergencyAlertRecords.length + 1), created_at: new Date().toISOString(), status: "active", ...body };
    emergencyAlertRecords.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if (req.method === "PATCH" && table === "security_emergency_alerts") {
    const body = await readBody(req);
    const updated = emergencyAlertRecords.filter(matches);
    for (const row of updated) Object.assign(row, body);
    return sendJson(res, 200, updated, objectResponse);
  }
  if (req.method === "GET" && table === "security_incident_reports") {
    return sendJson(res, 200, incidentRecords.filter(matches).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Number(url.searchParams.get("limit") ?? 100)), objectResponse);
  }
  if (req.method === "POST" && table === "security_incident_reports") {
    const body = await readBody(req);
    const row = { id: "incident-" + (incidentRecords.length + 1), created_at: new Date().toISOString(), status: "open", ...body };
    incidentRecords.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if (req.method === "GET" && table === "estate_events") return sendJson(res, 200, eventRecords.filter(matches), objectResponse);
  if (req.method === "GET" && table === "estate_event_invitations") return sendJson(res, 200, eventInvitationRecords.filter(matches), objectResponse);
  if (req.method === "GET" && table === "estate_event_guests") return sendJson(res, 200, eventGuestRecords.filter(matches), objectResponse);
  if (req.method === "GET" && table === "estate_event_checkins") return sendJson(res, 200, eventCheckinRecords.filter(matches), objectResponse);
  if (req.method === "POST" && table === "estate_event_checkins") {
    const body = await readBody(req);
    const row = { id: "event-checkin-" + (eventCheckinRecords.length + 1), checked_in_at: new Date().toISOString(), ...body };
    eventCheckinRecords.push(row);
    return sendJson(res, 201, row, objectResponse);
  }

  if (req.method === "GET" && table === "estate_memberships") {
    return sendJson(res, 200, memberships.filter(matches), objectResponse);
  }
  if (req.method === "GET" && table === "estates") {
    return sendJson(res, 200, estates.filter(matches), objectResponse);
  }
  if ((req.method === "GET" || req.method === "HEAD") && table === "announcements") {
    const rows = announcements.filter(matches);
    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("content-range", `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
      return res.end();
    }
    return sendJson(res, 200, rows, objectResponse);
  }
  if ((req.method === "GET" || req.method === "HEAD") && table === "maintenance_requests") {
    const rows = maintenanceRequests.filter(matches).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    ).slice(0, Number(url.searchParams.get("limit") ?? 100));
    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("content-range", `0-${Math.max(0, rows.length - 1)}/${maintenanceRequests.filter(matches).length}`);
      return res.end();
    }
    return sendJson(res, 200, rows, objectResponse);
  }
  if (table === "maintenance_requests" && req.method === "POST") {
    const body = await readBody(req);
    const row = { id: "maintenance-" + (maintenanceRequests.length + 1), created_at: new Date().toISOString(), status: "open", ...body };
    maintenanceRequests.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if ((req.method === "GET" || req.method === "HEAD") && table === "units") {
    return sendJson(res, 200, units.filter(matches), objectResponse);
  }
  if (table === "resident_units" && req.method === "POST") {
    const body = await readBody(req);
    const row = { id: "assignment-" + (assignments.length + 1), created_at: new Date().toISOString(), end_date: null, ...body };
    assignments.push(row);
    return sendJson(res, 201, row, objectResponse);
  }
  if (table === "visitor_passes" && req.method === "PATCH") {
    const body = await readBody(req);
    const updated = passes.filter(matches);
    for (const row of updated) Object.assign(row, body);
    return sendJson(res, 200, updated, objectResponse);
  }
  if (table === "visitor_pass_denials" && req.method === "POST") {
    const body = await readBody(req);
    const row = { id: "denial-" + (denials.length + 1), created_at: new Date().toISOString(), ...body };
    denials.push(row);
    return sendJson(res, 201, row, objectResponse);
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
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test-service-role-key";
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
  assert.equal(listed.body.visitorPasses.length, 2);
  assert.ok(listed.body.visitorPasses.some((pass: Record<string, unknown>) => pass.visitor_name === "Test Visitor"));
  assert.ok(listed.body.visitorPasses.some((pass: Record<string, unknown>) => pass.id === "denial-test-pass"));
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

test("security can look up visitor passes only inside the assigned estate", async () => {
  const lookup = await request(`/v1/estates/${estateA}/gate/visitor-lookup`, "security-token", "POST", {
    accessCode: "123456",
  });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.visitor.name, "Gate Test Visitor");
  assert.equal(lookup.body.pass.status, "active");
  assert.equal(lookup.body.pass.id, "other-host-pass");
  assert.equal(lookup.body.availabilityError, null);

  const invalidCode = await request(`/v1/estates/${estateA}/gate/visitor-lookup`, "security-token", "POST", {
    accessCode: "12345",
  });
  assert.equal(invalidCode.status, 400);
  assert.equal(invalidCode.body.error, "invalid_access_code");

  const unknownCode = await request(`/v1/estates/${estateA}/gate/visitor-lookup`, "security-token", "POST", {
    accessCode: "999999",
  });
  assert.equal(unknownCode.status, 404);
  assert.equal(unknownCode.body.error, "visitor_pass_not_found_or_invalid");

  const crossEstate = await request(`/v1/estates/${estateA}/gate/visitor-lookup`, "security-b-token", "POST", {
    accessCode: "123456",
  });
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "security_membership_required");

  const resident = await request(`/v1/estates/${estateA}/gate/visitor-lookup`, "resident-token", "POST", {
    accessCode: "123456",
  });
  assert.equal(resident.status, 403);
  assert.equal(resident.body.error, "security_membership_required");
});

test("security denial revokes an active pass and records who denied it", async () => {
  const denied = await request(`/v1/estates/${estateA}/gate/visitor-passes/denial-test-pass/deny`, "security-token", "POST", {
    reason: "Visitor identity could not be verified.",
  });
  assert.equal(denied.status, 200);
  assert.equal(denied.body.pass.id, "denial-test-pass");
  assert.equal(denied.body.pass.status, "revoked");

  const storedPass = passes.find((pass) => pass.id === "denial-test-pass");
  assert.equal(storedPass?.status, "revoked");
  assert.equal(denials.length, 1);
  assert.equal(denials[0]?.denied_by, securityId);
  assert.equal(denials[0]?.estate_id, estateA);
  assert.equal(denials[0]?.visitor_pass_id, "denial-test-pass");
  assert.equal(denials[0]?.reason, "Visitor identity could not be verified.");
});

test("only security assigned to the estate can deny visitor entry", async () => {
  const crossEstate = await request(`/v1/estates/${estateA}/gate/visitor-passes/denial-test-pass/deny`, "security-b-token", "POST", {
    reason: "Not assigned to this estate.",
  });
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "security_membership_required");

  const resident = await request(`/v1/estates/${estateA}/gate/visitor-passes/denial-test-pass/deny`, "resident-token", "POST", {
    reason: "Residents cannot deny entry.",
  });
  assert.equal(resident.status, 403);
  assert.equal(resident.body.error, "security_membership_required");
});

test("security officers can create, view and acknowledge shift handovers only within their estate", async () => {
  const started = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const ended = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const created = await request(`/v1/estates/${estateA}/security/shift-handovers`, "security-token", "POST", {
    shiftLabel: "Night shift",
    shiftStartedAt: started,
    shiftEndedAt: ended,
    handoverNotes: "Main gate patrol completed. Perimeter lighting at Block D requires attention.",
    pendingActions: "Follow up with maintenance on the Block D perimeter lights.",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.handover.outgoing_officer, securityId);
  assert.equal(created.body.handover.estate_id, estateA);
  assert.equal(created.body.handover.status, "pending");

  const listed = await request(`/v1/estates/${estateA}/security/shift-handovers`, "security-incoming-token");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.handovers.length, 1);

  const selfAcknowledge = await request(`/v1/estates/${estateA}/security/shift-handovers/${created.body.handover.id}/acknowledge`, "security-token", "POST");
  assert.equal(selfAcknowledge.status, 409);

  const acknowledged = await request(`/v1/estates/${estateA}/security/shift-handovers/${created.body.handover.id}/acknowledge`, "security-incoming-token", "POST");
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.body.handover.status, "acknowledged");
  assert.equal(acknowledged.body.handover.acknowledged_by, "security-incoming");

  const invalid = await request(`/v1/estates/${estateA}/security/shift-handovers`, "security-token", "POST", {
    shiftLabel: "Night", shiftStartedAt: ended, shiftEndedAt: started,
    handoverNotes: "Invalid time order should be rejected.",
  });
  assert.equal(invalid.status, 400);

  const crossEstate = await request(`/v1/estates/${estateA}/security/shift-handovers`, "security-b-token");
  assert.equal(crossEstate.status, 403);
});

test("security can issue and resolve emergency alerts while estate members can read them", async () => {
  const created = await request(`/v1/estates/${estateA}/emergency-alerts`, "security-token", "POST", {
    alertType: "fire", severity: "critical", title: "Fire reported at Block C",
    message: "A fire has been reported near Block C. Avoid the area and follow security instructions.",
    location: "Block C",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.alert.estate_id, estateA);
  assert.equal(created.body.alert.created_by, securityId);
  assert.equal(created.body.alert.status, "active");
  assert.equal(created.body.recipientCount, 1);

  const residentRead = await request(`/v1/estates/${estateA}/emergency-alerts`, "resident-token");
  assert.equal(residentRead.status, 200);
  assert.equal(residentRead.body.alerts.length, 1);
  assert.equal(residentRead.body.alerts[0].title, "Fire reported at Block C");

  const invalid = await request(`/v1/estates/${estateA}/emergency-alerts`, "security-token", "POST", {
    alertType: "fire", severity: "low", title: "Test", message: "Short",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "invalid_emergency_alert");

  const crossEstate = await request(`/v1/estates/${estateA}/emergency-alerts`, "security-b-token", "POST", {
    alertType: "other", severity: "high", title: "Wrong estate alert",
    message: "This must not be broadcast to another estate.",
  });
  assert.equal(crossEstate.status, 403);

  const residentCreate = await request(`/v1/estates/${estateA}/emergency-alerts`, "resident-token", "POST", {
    alertType: "other", severity: "high", title: "Resident alert",
    message: "Residents cannot issue security emergency broadcasts.",
  });
  assert.equal(residentCreate.status, 403);

  const resolved = await request(`/v1/estates/${estateA}/emergency-alerts/${created.body.alert.id}/resolve`, "security-token", "POST");
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.alert.status, "resolved");
  assert.equal(resolved.body.alert.resolved_by, securityId);
});

test("security can create and list incident reports only in the assigned estate", async () => {
  const created = await request(`/v1/estates/${estateA}/security/incidents`, "security-token", "POST", {
    title: "Unauthorised gate access attempt",
    category: "unauthorised_access",
    severity: "high",
    description: "An unknown individual attempted to enter the estate without a valid visitor pass.",
    location: "Main entrance",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.incident.estate_id, estateA);
  assert.equal(created.body.incident.reported_by, securityId);
  assert.equal(created.body.incident.status, "open");
  assert.equal(incidentRecords.length, 1);

  const listed = await request(`/v1/estates/${estateA}/security/incidents`, "security-token");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.incidents.length, 1);
  assert.equal(listed.body.incidents[0].title, "Unauthorised gate access attempt");

  const invalid = await request(`/v1/estates/${estateA}/security/incidents`, "security-token", "POST", {
    title: "x", category: "unknown", severity: "urgent", description: "short",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "invalid_security_incident");

  const crossEstate = await request(`/v1/estates/${estateA}/security/incidents`, "security-b-token", "POST", {
    title: "Cross estate report", category: "other", severity: "medium",
    description: "This report must not be created from another estate.",
  });
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "security_membership_required");

  const resident = await request(`/v1/estates/${estateA}/security/incidents`, "resident-token", "POST", {
    title: "Resident report", category: "other", severity: "medium",
    description: "Residents cannot submit through the Security incident workflow.",
  });
  assert.equal(resident.status, 403);
  assert.equal(resident.body.error, "security_membership_required");
});

test("security can verify and check in event guests only in the assigned estate", async () => {
  const checkedIn = await request(`/v1/estates/${estateA}/events/event-a/security-check-in`, "security-token", "POST", {
    code: "987654",
  });
  assert.equal(checkedIn.status, 201, JSON.stringify(checkedIn.body));
  assert.equal(checkedIn.body.event.id, "event-a");
  assert.equal(checkedIn.body.guest.guest_name, "Event Test Guest");
  assert.equal(checkedIn.body.checkIn.checked_in_by, securityId);
  assert.equal(eventCheckinRecords.length, 1);

  const duplicate = await request(`/v1/estates/${estateA}/events/event-a/security-check-in`, "security-token", "POST", {
    code: "987654",
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, "event_guest_already_checked_in");

  const invalidCode = await request(`/v1/estates/${estateA}/events/event-a/security-check-in`, "security-token", "POST", {
    code: "98765",
  });
  assert.equal(invalidCode.status, 400);
  assert.equal(invalidCode.body.error, "invalid_event_invitation_code");

  const crossEstate = await request(`/v1/estates/${estateA}/events/event-a/security-check-in`, "security-b-token", "POST", {
    code: "987654",
  });
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "security_membership_required");

  const resident = await request(`/v1/estates/${estateA}/events/event-a/security-check-in`, "resident-token", "POST", {
    code: "987654",
  });
  assert.equal(resident.status, 403);
  assert.equal(resident.body.error, "security_membership_required");
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


test("dashboard requires active membership in the requested estate and blocks disabled estates", async () => {
  const allowed = await request(`/v1/estates/${estateA}/dashboard`, "resident-token");
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.estate.membershipRole, "resident");
  assert.equal(allowed.body.summary.units, 1);
  assert.equal(allowed.body.announcements[0].title, "Estate A notice");

  const crossEstate = await request(`/v1/estates/${estateB}/dashboard`, "resident-token");
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "active_estate_membership_required");

  const noMembership = await request(`/v1/estates/${estateA}/dashboard`, "other-token");
  assert.equal(noMembership.status, 403);

  const disabled = await request("/v1/estates/disabled-estate/dashboard", "resident-token");
  assert.equal(disabled.status, 423);
  assert.equal(disabled.body.error, "estate_subscription_inactive");
});

test("maintenance submission requires active membership in the same enabled estate", async () => {
  const created = await request(`/v1/estates/${estateA}/maintenance`, "resident-token", "POST", {
    title: "Leaking kitchen tap",
    description: "Water is leaking under the kitchen sink.",
    priority: "high",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.maintenanceRequest.created_by, residentId);
  assert.equal(created.body.maintenanceRequest.estate_id, estateA);

  const crossEstate = await request(`/v1/estates/${estateB}/maintenance`, "resident-token", "POST", {
    title: "Leaking kitchen tap",
    description: "Water is leaking under the kitchen sink.",
    priority: "high",
  });
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "active_estate_membership_required");

  const noMembership = await request(`/v1/estates/${estateA}/maintenance`, "other-token", "POST", {
    title: "Leaking kitchen tap",
    description: "Water is leaking under the kitchen sink.",
    priority: "high",
  });
  assert.equal(noMembership.status, 403);

  const disabled = await request("/v1/estates/disabled-estate/maintenance", "resident-token", "POST", {
    title: "Leaking kitchen tap",
    description: "Water is leaking under the kitchen sink.",
    priority: "high",
  });
  assert.equal(disabled.status, 423);
});


test("unit assignment endpoint allows only estate managers for active residents in their own estate", async () => {
  const assigned = await request(`/v1/estates/${estateA}/units/unit-a/assignments`, "manager-token", "POST", {
    residentUserId: residentId,
    startDate: "2026-10-28",
  });
  assert.equal(assigned.status, 201);
  assert.equal(assigned.body.assignment.estate_id, estateA);
  assert.equal(assigned.body.assignment.resident_user_id, residentId);

  const crossEstate = await request(`/v1/estates/${estateB}/units/unit-b/assignments`, "manager-token", "POST", {
    residentUserId: "security-b",
  });
  assert.equal(crossEstate.status, 403);
  assert.equal(crossEstate.body.error, "estate_manager_access_required");

  const resident = await request(`/v1/estates/${estateA}/units/unit-a/assignments`, "resident-token", "POST", {
    residentUserId: residentId,
  });
  assert.equal(resident.status, 403);
  assert.equal(resident.body.error, "estate_manager_access_required");

  const disabled = await request("/v1/estates/disabled-estate/units/unit-a/assignments", "manager-token", "POST", {
    residentUserId: residentId,
  });
  assert.equal(disabled.status, 423);
  assert.equal(disabled.body.error, "estate_subscription_inactive");
});
