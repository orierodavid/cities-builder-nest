import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import exec from "k6/execution";

const apiBase = (__ENV.LOAD_TEST_BASE_URL || "").replace(/\/$/, "");
const apiAllowed = (__ENV.LOAD_TEST_ALLOWED_HOST || "").trim();
const restBase = (__ENV.LOAD_TEST_SUPABASE_BASE_URL || "").replace(/\/$/, "");
const restAllowed = (__ENV.LOAD_TEST_SUPABASE_ALLOWED_HOST || "").trim();
const environment = (__ENV.LOAD_TEST_ENVIRONMENT || "").trim();
const profile = (__ENV.LOAD_TEST_PROFILE || "full").trim();
const anonKey = (__ENV.LOAD_TEST_SUPABASE_ANON_KEY || "").trim();

if (environment !== "github-actions-ephemeral" || __ENV.LOAD_TEST_CONFIRM !== "YES") throw new Error("Explicit GitHub Actions ephemeral confirmation required.");
if (apiBase !== "http://" + apiAllowed || apiAllowed !== "127.0.0.1:4000" ||
    restBase !== "http://" + restAllowed || restAllowed !== "127.0.0.1:4100" ||
    __ENV.LOAD_TEST_ALLOW_LOCAL_HTTP !== "true" || __ENV.LOAD_TEST_MODE !== "realistic" || !anonKey) {
  throw new Error("App load simulation is restricted to the two local ephemeral services.");
}

const estate = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ids = {
  resident: "22222222-2222-4222-8222-222222222222",
  security: "33333333-3333-4333-8333-333333333333",
  manager: "11111111-1111-4111-8111-111111111111",
  admin: "55555555-5555-4555-8555-555555555555",
};
const roles = [
  { role:"resident", id:ids.resident, token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.S55g1jSz4SITv8_GahRllxJjEMWh00SIJLigExGhE2c" },
  { role:"security", id:ids.security, token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjMzMzMzMzMzLTMzMzMtNDMzMy04MzMzLTMzMzMzMzMzMzMzMyIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.jHjNNdqC4sNP_Mtaj1AyvGQtpnXXgaATUh4w6q49dnw" },
  { role:"facility-manager", id:ids.manager, token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.x3VAd9zpiEE5xKePK7LO7aETyzK-Q1ZqroyjyUnIfw8" },
  { role:"super-admin", id:ids.admin, token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjU1NTU1NTU1LTU1NTUtNDU1NS04NTU1LTU1NTU1NTU1NTU1NSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.HCVdw1tF-k-BCBRyRfGimnm-V65M5uUNCXUbeo2wonI" },
];

const stages = {
  "250":[{target:250,duration:"1m"},{target:250,duration:"2m"},{target:0,duration:"1m"}],
  "500":[{target:500,duration:"1m"},{target:500,duration:"2m"},{target:0,duration:"1m"}],
  "1000":[{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
  full:[{target:250,duration:"1m"},{target:250,duration:"2m"},{target:500,duration:"1m"},{target:500,duration:"2m"},{target:1000,duration:"1m"},{target:1000,duration:"2m"},{target:0,duration:"1m"}],
};
if (!stages[profile]) throw new Error("Profile must be full, 250, 500, or 1000.");
export const options = {
  scenarios:{ cb_nest_app_role_navigation:{ executor:"ramping-vus", startVUs:0, stages:stages[profile], gracefulRampDown:"30s" } },
  summaryTrendStats:["avg","min","med","max","p(90)","p(95)","p(99)"],
  thresholds:{ http_req_failed:["rate<0.01"], checks:["rate>0.99"] },
};

const screenLatency = new Trend("app_screen_data_load_ms", true);
const transportErrors = new Counter("app_transport_errors");
const timeoutErrors = new Counter("app_timeout_errors");

function loadTag() {
  const active = exec.instance.vusActive;
  return active <= 250 ? "250" : active <= 500 ? "500" : "1000";
}
function validate(response, role, screen, valid, level) {
  screenLatency.add(response.timings.duration,{role,screen,load_level:level});
  if (response.error_code) {
    transportErrors.add(1,{role,screen});
    if (response.error_code === 1050) timeoutErrors.add(1,{role,screen});
  }
  let payload = null;
  try { payload = response.json(); } catch (_) {}
  check(response,{
    "screen data request returned HTTP success": r => r.status === 200 || r.status === 206,
    "screen returned expected data": () => valid ? payload !== null && valid(payload) : response.status === 200,
  });
  return payload;
}
function restRead(user, screen, path, valid = Array.isArray, method = "GET") {
  let payload = null;
  group(`${user.role}/${screen}`,() => {
    const level = loadTag();
    const response = http.request(method,restBase + path,null,{
      headers:{ Authorization:`Bearer ${user.token}`, apikey:anonKey, Accept:"application/json", Prefer:"count=exact" },
      timeout:"20s",
      tags:{ role:user.role, screen, source:"supabase-rest", load_level:level },
    });
    payload = validate(response,user.role,screen,valid,level);
  });
  return payload;
}
function apiRead(user, screen, path, valid) {
  group(`${user.role}/${screen}`,() => {
    const level = loadTag();
    const response = http.get(apiBase + path,{
      headers:{
        Authorization:`Bearer ${user.token}`, Accept:"application/json",
        "X-Forwarded-For":`10.20.${Math.floor(__VU / 250)}.${(__VU % 250) + 1}`,
      },
      timeout:"20s",
      tags:{ role:user.role, screen, source:"api", load_level:level },
    });
    validate(response,user.role,screen,valid,level);
  });
}
function pauseBetweenScreens() { sleep(0.5); }

function residentJourney(user) {
  const uid = user.id;
  restRead(user,"home-profile",`/rest/v1/users?select=full_name,home_number,street_name&id=eq.${uid}`,b=>Array.isArray(b)&&b.length===1);
  pauseBetweenScreens();
  const assignment = restRead(user,"my-property-assignment",`/rest/v1/resident_units?select=unit_id,start_date,estate_id&resident_user_id=eq.${uid}&end_date=is.null&order=start_date.desc&limit=1`);
  pauseBetweenScreens();
  const unitId = assignment && assignment[0] ? assignment[0].unit_id : "";
  if (unitId) {
    const units = restRead(user,"my-property-unit",`/rest/v1/units?select=unit_code,building_id,estate_id&id=eq.${unitId}`);
    pauseBetweenScreens();
    const unit = units && units[0];
    if (unit?.building_id) restRead(user,"my-property-building",`/rest/v1/buildings?select=name&id=eq.${unit.building_id}`);
    pauseBetweenScreens();
    const estateId = assignment[0].estate_id || unit?.estate_id || estate;
    restRead(user,"my-property-estate",`/rest/v1/estates?select=name,address,city,state&id=eq.${estateId}`);
  }
  pauseBetweenScreens();
  restRead(user,"service-charge-membership",`/rest/v1/estate_memberships?select=estate_id&user_id=eq.${uid}&membership_role=eq.resident&status=eq.active`);
  pauseBetweenScreens();
  restRead(user,"service-charge-payment-status",`/rest/v1/service_charge_payments?select=charge_id,status,provider_reference,verified_at,created_at&resident_user_id=eq.${uid}&estate_id=eq.${estate}`);
  pauseBetweenScreens();
  restRead(user,"published-service-charges",`/rest/v1/estate_service_charges?select=id,title,description,amount_kobo,due_date,created_at&estate_id=eq.${estate}&is_active=eq.true&order=due_date.asc.nullsfirst,created_at.desc`);
  pauseBetweenScreens();
  restRead(user,"payment-history-service-charges",`/rest/v1/service_charge_payments?select=id,amount_kobo,currency,status,provider_reference,verified_at,created_at,charge:estate_service_charges(title)&resident_user_id=eq.${uid}&order=created_at.desc`);
  pauseBetweenScreens();
  restRead(user,"payment-history-rent-savings",`/rest/v1/rent_savings_contributions?select=id,amount_kobo,currency,status,provider_reference,verified_at,created_at&resident_user_id=eq.${uid}&order=created_at.desc`);
  pauseBetweenScreens();
  restRead(user,"payment-history-electricity",`/rest/v1/electricity_recharge_orders?select=id,amount_kobo,currency,status,units_purchased,verified_at,created_at&resident_user_id=eq.${uid}&order=created_at.desc`);
  pauseBetweenScreens();
  apiRead(user,"visitor-management-estates","/v1/estates",b=>Array.isArray(b.estates)&&b.estates.some(x=>x.id===estate&&x.membershipRole==="resident"));
  pauseBetweenScreens();
  apiRead(user,"visitor-management-history",`/v1/estates/${estate}/visitor-passes?page=1&pageSize=20`,b=>Array.isArray(b.visitorPasses));
}

function securityJourney(user) {
  const uid=user.id;
  restRead(user,"security-profile",`/rest/v1/users?select=full_name&id=eq.${uid}`,b=>Array.isArray(b)&&b.length===1);
  pauseBetweenScreens();
  restRead(user,"security-estate-membership",`/rest/v1/estate_memberships?select=estate_id,membership_role,status&user_id=eq.${uid}&status=eq.active`);
  pauseBetweenScreens();
  restRead(user,"security-assigned-estate",`/rest/v1/estates?select=id,name,is_enabled&id=eq.${estate}`);
  pauseBetweenScreens();
  apiRead(user,"visitor-entry-records",`/v1/estates/${estate}/gate/visits?page=1&pageSize=20`,b=>Array.isArray(b.visits));
  pauseBetweenScreens();
  apiRead(user,"shift-handover",`/v1/estates/${estate}/security/shift-handovers?page=1&pageSize=20`,b=>Array.isArray(b.handovers));
  pauseBetweenScreens();
  apiRead(user,"emergency-alerts",`/v1/estates/${estate}/emergency-alerts?page=1&pageSize=20`,b=>Array.isArray(b.alerts));
  pauseBetweenScreens();
  apiRead(user,"incident-history",`/v1/estates/${estate}/security/incidents?page=1&pageSize=20`,b=>Array.isArray(b.incidents));
}

function facilityManagerJourney(user) {
  const uid=user.id;
  restRead(user,"management-role-check",`/rest/v1/estate_memberships?select=estate_id,membership_role&user_id=eq.${uid}&status=eq.active`);
  pauseBetweenScreens();
  restRead(user,"management-profile",`/rest/v1/users?select=full_name&id=eq.${uid}`,b=>Array.isArray(b)&&b.length===1);
  pauseBetweenScreens();
  restRead(user,"management-dashboard-property-count","/rest/v1/units?select=id&estate_id=eq."+estate,undefined,"HEAD");
  pauseBetweenScreens();
  restRead(user,"management-dashboard-resident-list",`/rest/v1/estate_memberships?select=user_id&estate_id=eq.${estate}&membership_role=eq.resident&status=eq.active`);
  pauseBetweenScreens();
  restRead(user,"management-dashboard-visitor-count","/rest/v1/visitor_visits?select=id&estate_id=eq."+estate,undefined,"HEAD");
  pauseBetweenScreens();
  restRead(user,"management-dashboard-event-count","/rest/v1/estate_events?select=id&estate_id=eq."+estate,undefined,"HEAD");
  pauseBetweenScreens();
  restRead(user,"management-dashboard-service-charges",`/rest/v1/estate_service_charges?select=id,amount_kobo,is_active&estate_id=eq.${estate}`);
  pauseBetweenScreens();
  restRead(user,"management-dashboard-payments",`/rest/v1/service_charge_payments?select=charge_id,resident_user_id,amount_kobo&estate_id=eq.${estate}&status=eq.successful`);
  pauseBetweenScreens();
  restRead(user,"management-dashboard-maintenance",`/rest/v1/maintenance_requests?select=id,status,priority,created_at,title&estate_id=eq.${estate}&order=created_at.desc&limit=5`);
}

function superAdminJourney(user) {
  const uid=user.id;
  restRead(user,"admin-role-check",`/rest/v1/user_roles?select=role&user_id=eq.${uid}`);
  pauseBetweenScreens();
  restRead(user,"admin-profile",`/rest/v1/users?select=full_name&id=eq.${uid}`,b=>Array.isArray(b)&&b.length===1);
  pauseBetweenScreens();
  restRead(user,"platform-estates-list","/rest/v1/estates?select=id,name,address,city,state,is_enabled&order=name.asc");
  pauseBetweenScreens();
  restRead(user,"platform-user-management","/rest/v1/users?select=id,full_name,phone_e164,is_active&order=created_at.desc&limit=20");
  pauseBetweenScreens();
  restRead(user,"platform-dashboard-metrics","/rest/v1/rpc/get_platform_dashboard_metrics",b=>Boolean(b&&b.estates!==undefined));
  pauseBetweenScreens();
  restRead(user,"platform-growth-analytics","/rest/v1/rpc/get_platform_growth_analytics",b=>Boolean(b&&b.summary&&Array.isArray(b.trend)&&Array.isArray(b.estates)));
}

export default function () {
  const user=roles[(__VU-1)%roles.length];
  if(user.role==="resident") residentJourney(user);
  else if(user.role==="security") securityJourney(user);
  else if(user.role==="facility-manager") facilityManagerJourney(user);
  else superAdminJourney(user);
}
