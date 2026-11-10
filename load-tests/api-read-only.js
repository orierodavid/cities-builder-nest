import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const base = (__ENV.LOAD_TEST_BASE_URL || "").replace(/\/$/, "");
const allowed = (__ENV.LOAD_TEST_ALLOWED_HOST || "").trim();
const path = (__ENV.LOAD_TEST_PATH || "/health").trim();
const profile = (__ENV.LOAD_TEST_PROFILE || "250").trim();
const token = (__ENV.LOAD_TEST_BEARER_TOKEN || "").trim();
if (__ENV.LOAD_TEST_ENVIRONMENT !== "isolated-staging" || __ENV.LOAD_TEST_CONFIRM !== "YES") throw new Error("Explicit isolated-staging confirmation required.");
if (!base || !allowed) throw new Error("Set base URL and exact allowed host.");
let target;
try { target = new URL(base); } catch { throw new Error("Invalid absolute base URL."); }
if (target.host !== allowed || target.username || target.password || target.search || target.hash) throw new Error("URL must match exact allowed host and contain no credentials/query/fragment.");
const local = __ENV.LOAD_TEST_ALLOW_LOCAL_HTTP === "true" && ["localhost", "127.0.0.1"].includes(target.hostname);
if (target.protocol !== "https:" && !(local && target.protocol === "http:")) throw new Error("HTTPS required except explicitly allowed localhost.");
if (target.hostname.endsWith(".supabase.co")) throw new Error("Do not target Supabase directly.");
if (!["/health", "/v1/me"].includes(path)) throw new Error("Only read-only /health or /v1/me permitted.");
if (path === "/v1/me" && !token) throw new Error("Dedicated staging bearer token required.");
const stages = {
  "250": [{target:250,duration:"1m"},{target:250,duration:"2m"},{target:0,duration:"1m"}],
  "500": [{target:500,duration:"1m"},{target:500,duration:"2m"},{target:0,duration:"1m"}],
  "1000": [{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
  full: [{target:250,duration:"1m"},{target:250,duration:"2m"},{target:500,duration:"1m"},{target:500,duration:"2m"},{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}]
};
if (!stages[profile]) throw new Error("Profile must be 250, 500, 1000, or full.");
export const options = { scenarios: { read_only_api: { executor:"ramping-vus", startVUs:0, stages:stages[profile], gracefulRampDown:"30s" } } };
const failures = new Rate("api_failed_requests");
const latency = new Trend("api_latency_ms", true);
export default function () {
  const headers = { Accept:"application/json" };
  if (path === "/v1/me") headers.Authorization = `Bearer ${token}`;
  const response = http.get(`${base}${path}`, { headers, timeout:"15s", tags:{endpoint:path} });
  latency.add(response.timings.duration);
  const ok = check(response, { "HTTP 200": r => r.status === 200 });
  failures.add(!ok);
  sleep(1);
}
