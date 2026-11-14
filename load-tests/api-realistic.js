import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const base = (__ENV.LOAD_TEST_BASE_URL || "").replace(/\/$/, "");
const allowed = (__ENV.LOAD_TEST_ALLOWED_HOST || "").trim();
const environment = (__ENV.LOAD_TEST_ENVIRONMENT || "").trim();
const profile = (__ENV.LOAD_TEST_PROFILE || "full").trim();

if (environment !== "github-actions-ephemeral" || __ENV.LOAD_TEST_CONFIRM !== "YES") {
  throw new Error("Explicit GitHub Actions ephemeral confirmation required.");
}
if (!base || !allowed || base !== "http://" + allowed || allowed !== "127.0.0.1:4000" ||
    __ENV.LOAD_TEST_ALLOW_LOCAL_HTTP !== "true" || __ENV.LOAD_TEST_MODE !== "realistic") {
  throw new Error("Realistic endpoint load is restricted to the local ephemeral API.");
}

const estate = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workloads = [
  { weight: 7, role: "facility-manager", path: `/v1/estates/${estate}/dashboard`, token: "load-manager-token", valid: body => Boolean(body.estate && body.summary) },
  { weight: 5, role: "resident", path: `/v1/estates/${estate}/visitor-passes?page=1&pageSize=20`, token: "load-resident-token", valid: body => Array.isArray(body.visitorPasses) },
];
const expanded = workloads.flatMap(item => Array(item.weight).fill(item));
const stages = {
  "250": [{target:250,duration:"1m"},{target:250,duration:"2m"},{target:0,duration:"1m"}],
  "500": [{target:500,duration:"1m"},{target:500,duration:"2m"},{target:0,duration:"1m"}],
  "1000": [{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
  full: [{target:250,duration:"1m"},{target:250,duration:"2m"},{target:500,duration:"1m"},{target:500,duration:"2m"},{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
};
if (!stages[profile]) throw new Error("Profile must be 250, 500, 1000, or full.");
export const options = {
  scenarios: { cb_nest_read_only_roles: {
    executor: "ramping-vus", startVUs: 0, stages: stages[profile], gracefulRampDown: "30s",
  } },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};
const latency = new Trend("api_latency_ms", true);

export default function () {
  const workload = expanded[(__VU + __ITER) % expanded.length];
  const simulatedClientIp = `10.20.${Math.floor(__VU / 250)}.${(__VU % 250) + 1}`;
  const headers = { Accept: "application/json", Authorization: `Bearer ${workload.token}`, "X-Forwarded-For": simulatedClientIp };
  const response = http.get(base + workload.path, { headers, timeout: "20s", tags: { endpoint: workload.path, role: workload.role } });
  latency.add(response.timings.duration, { endpoint: workload.path, role: workload.role });
  let parsed = null;
  try { parsed = response.json(); } catch (_) {}
  check(response, {
    "HTTP 200": r => r.status === 200,
    "expected endpoint payload": () => parsed !== null && workload.valid(parsed),
  });
  sleep(1);
}
