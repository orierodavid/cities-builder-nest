import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const base = (__ENV.LOAD_TEST_BASE_URL || "").replace(/\/$/, "");
const allowed = (__ENV.LOAD_TEST_ALLOWED_HOST || "").trim();
const environment = (__ENV.LOAD_TEST_ENVIRONMENT || "").trim();
const profile = (__ENV.LOAD_TEST_PROFILE || "250").trim();

if (environment !== "github-actions-ephemeral" || __ENV.LOAD_TEST_CONFIRM !== "YES") throw new Error("Explicit GitHub Actions ephemeral confirmation required.");
if (!base || !allowed || base !== "http://" + allowed || allowed !== "127.0.0.1:4000" || __ENV.LOAD_TEST_ALLOW_LOCAL_HTTP !== "true" || __ENV.LOAD_TEST_MODE !== "realistic") throw new Error("Realistic endpoint load is restricted to the local ephemeral API.");

const estate = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const roles = [
  { role: "resident", token: "load-resident-token", screens: [
    ["home-profile", "/v1/me", b => Boolean(b.profile && b.profile.id)],
    ["estate-property-context", "/v1/estates", b => Array.isArray(b.estates) && b.estates.some(x => x.id === estate && x.membershipRole === "resident")],
    ["visitor-management-history", `/v1/estates/${estate}/visitor-passes?page=1&pageSize=20`, b => Array.isArray(b.visitorPasses)],
  ]},
  { role: "security", token: "load-security-token", screens: [
    ["security-home-estate-context", "/v1/estates", b => Array.isArray(b.estates) && b.estates.some(x => x.id === estate && x.membershipRole === "security")],
    ["visitor-entry-records", `/v1/estates/${estate}/gate/visits?page=1&pageSize=20`, b => Array.isArray(b.visits)],
    ["shift-handover", `/v1/estates/${estate}/security/shift-handovers?page=1&pageSize=20`, b => Array.isArray(b.handovers)],
    ["emergency-alerts", `/v1/estates/${estate}/emergency-alerts?page=1&pageSize=20`, b => Array.isArray(b.alerts)],
    ["incident-history", `/v1/estates/${estate}/security/incidents?page=1&pageSize=20`, b => Array.isArray(b.incidents)],
  ]},
  { role: "facility-manager", token: "load-manager-token", screens: [
    ["management-profile", "/v1/me", b => Boolean(b.profile && b.profile.id)],
    ["estate-dashboard", `/v1/estates/${estate}/dashboard`, b => Boolean(b.estate && b.summary)],
    ["estate-directory", "/v1/estates", b => Array.isArray(b.estates)],
    ["building-directory", `/v1/estates/${estate}/buildings?page=1&pageSize=20`, b => Array.isArray(b.buildings)],
    ["property-units", `/v1/estates/${estate}/units?page=1&pageSize=20`, b => Array.isArray(b.units)],
    ["resident-directory", `/v1/estates/${estate}/residents?page=1&pageSize=20`, b => Array.isArray(b.residents)],
  ]},
  { role: "super-admin", token: "load-admin-token", screens: [
    ["admin-profile", "/v1/me", b => Array.isArray(b.globalRoles) && b.globalRoles.includes("platform_admin")],
    ["platform-estates", "/v1/estates", b => Array.isArray(b.estates) && b.estates.some(x => x.id === estate && x.membershipRole === "platform_admin")],
    ["estate-overview", `/v1/estates/${estate}/dashboard`, b => Boolean(b.estate && b.summary)],
    ["building-directory", `/v1/estates/${estate}/buildings?page=1&pageSize=20`, b => Array.isArray(b.buildings)],
    ["property-units", `/v1/estates/${estate}/units?page=1&pageSize=20`, b => Array.isArray(b.units)],
    ["resident-directory", `/v1/estates/${estate}/residents?page=1&pageSize=20`, b => Array.isArray(b.residents)],
  ]},
];

const stages = {
  "250": [{target:250,duration:"1m"},{target:250,duration:"2m"},{target:0,duration:"1m"}],
  "500": [{target:500,duration:"1m"},{target:500,duration:"2m"},{target:0,duration:"1m"}],
  "1000": [{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
  full: [{target:250,duration:"1m"},{target:250,duration:"2m"},{target:500,duration:"1m"},{target:500,duration:"2m"},{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
};
if (!stages[profile]) throw new Error("Profile must be 250, 500, 1000, or full.");
export const options = {
  scenarios: { cb_nest_app_role_navigation: { executor:"ramping-vus", startVUs:0, stages:stages[profile], gracefulRampDown:"30s" } },
  thresholds: { http_req_failed:["rate<0.01"], checks:["rate>0.99"] },
};
const screenLatency = new Trend("app_screen_api_load_ms", true);
const transportErrors = new Counter("app_transport_errors");
const timeoutErrors = new Counter("app_timeout_errors");

function openScreen(role, token, screen) {
  const [name, path, valid] = screen;
  group(`${role}/${name}`, () => {
    const response = http.get(base + path, {
      headers: {
        Accept:"application/json",
        Authorization:`Bearer ${token}`,
        "X-Forwarded-For":`10.20.${Math.floor(__VU / 250)}.${(__VU % 250) + 1}`,
      },
      timeout:"20s",
      tags:{role, screen:name},
    });
    screenLatency.add(response.timings.duration, {role, screen:name});
    if (response.error_code) {
      transportErrors.add(1, {role, screen:name});
      if (response.error_code === 1050) timeoutErrors.add(1, {role, screen:name});
    }
    let payload = null;
    try { payload = response.json(); } catch (_) {}
    check(response, {
      "screen API returned HTTP 200": r => r.status === 200,
      "screen returned expected data": () => payload !== null && valid(payload),
    });
  });
}

export default function () {
  const role = roles[(__VU - 1) % roles.length];
  for (const screen of role.screens) {
    openScreen(role.role, role.token, screen);
    sleep(1);
  }
}
