"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import PlatformGrowthCharts, { type PlatformGrowthData } from "@/components/PlatformGrowthCharts";

type EstateOption = { id: string; name: string };
type Access = { role: "platform_admin" | "facility_manager"; name: string; email: string; estates: EstateOption[] };
type ManagerMetric = { value: string; detail: string };
type MaintenancePreview = { id:string; title:string; status:string; priority:string; created_at:string };
const emptyManagerMetrics: Record<string,ManagerMetric> = Object.fromEntries(["properties","residents","visitors","events","charges","payments","outstanding","maintenance"].map(key=>[key,{value:"—",detail:"Loading live data…"}]));
const managerNav = [["⌂","Dashboard"],["▣","Properties"],["♙","Residents"],["♟","Users"],["⌕","Visitor Management"],["▦","Events"],["▤","Service Charges"],["▣","Payments"],["⚒","Maintenance"],["⌂","Facility Management"],["▤","Communications"],["▥","Reports"],["⚙","Settings"],["◉","My Profile"]];
const adminNav = [["⌂","Dashboard"],["▦","Estates"],["♙","Users"],["⌂","Properties"],["▤","Subscriptions"],["▣","Payments"],["▥","Analytics"],["?","Support"],["☷","System Logs"],["▤","Legal Documents"],["⚙","Settings"]];
const metrics = [
 ["⌂","TOTAL PROPERTIES","properties"],["♙","REGISTERED RESIDENTS","residents"],["♟","TODAY'S VISITORS","visitors"],["▦","TODAY'S EVENTS","events"],
 ["▤","TOTAL SERVICE CHARGES","charges"],["▣","SUCCESSFUL PAYMENTS","payments"],["⚠","OUTSTANDING BALANCE","outstanding"],["⚒","MAINTENANCE REQUESTS","maintenance"]
];
const adminMetrics = [
 ["▦","TOTAL ESTATES","estates"],["♙","TOTAL USERS","users"],["⌂","TOTAL PROPERTIES","properties"],["♙","ACTIVE RESIDENTS","residents"],
 ["▤","TOTAL SERVICE CHARGES","charges"],["▣","SUCCESSFUL PAYMENTS","payments"],["⚠","OUTSTANDING BALANCE","outstanding"],["⚒","MAINTENANCE REQUESTS","maintenance"]
];
type MetricValue = { value: string; detail: string; error?: boolean };
const initialMetricValues: Record<string,MetricValue> = Object.fromEntries(adminMetrics.map(([, ,key])=>[key,{value:"—",detail:"Loading live data…"}]));

export default function HomeClient({ serverAuthorized }: { serverAuthorized: boolean }) {
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [access,setAccess]=useState<Access|null>(null); const [selectedEstate,setSelectedEstate]=useState(""); const [invitationAccepted,setInvitationAccepted]=useState(false); const [metricValues,setMetricValues]=useState<Record<string,MetricValue>>(initialMetricValues); const [managerMetricValues,setManagerMetricValues]=useState<Record<string,ManagerMetric>>(emptyManagerMetrics); const [managerLoading,setManagerLoading]=useState(false); const [managerError,setManagerError]=useState(""); const [managerMaintenanceRows,setManagerMaintenanceRows]=useState<MaintenancePreview[]>([]); const [growthData,setGrowthData]=useState<PlatformGrowthData|null>(null); const [growthLoading,setGrowthLoading]=useState(false); const [growthError,setGrowthError]=useState("");
 async function checkRole(userId:string,userEmail:string) {
  const [globalResult,membershipResult,profileResult]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",userId),
   supabase.from("estate_memberships").select("estate_id,membership_role").eq("user_id",userId).eq("status","active"),
   supabase.from("users").select("full_name").eq("id",userId).maybeSingle()
  ]);
  if(globalResult.error||membershipResult.error){setError("Unable to verify management permissions. Please try again.");await supabase.auth.signOut();return;}
  const globalRoles=(globalResult.data||[]).map(x=>x.role as string);
  const managerMemberships=(membershipResult.data||[]).filter(x=>["estate_manager","estate_admin","facility_manager"].includes(x.membership_role as string));
  const isAdmin=globalRoles.includes("platform_admin");
  if(!isAdmin&&!managerMemberships.length){await supabase.auth.signOut();setError("This account is not authorized for the management web portal.");return;}
  const estateIds=[...new Set(managerMemberships.map(x=>x.estate_id as string))];
  const {data:estateRows,error:estateError}=estateIds.length?await supabase.from("estates").select("id,name").in("id",estateIds):{data:[],error:null};
  if(estateError){setError("Unable to load your assigned estates. Please refresh.");await supabase.auth.signOut();return;}
  const estates=(estateRows||[]) as EstateOption[];
  setAccess({role:isAdmin?"platform_admin":"facility_manager",name:profileResult.data?.full_name||"Management user",email:userEmail,estates});
  if(estates.length)setSelectedEstate(estates[0].id);
 }
 useEffect(()=>{setInvitationAccepted(new URLSearchParams(window.location.search).get("invitation")==="accepted");if(!serverAuthorized)return;let alive=true;supabase.auth.getSession().then(({data})=>{if(alive&&data.session)void checkRole(data.session.user.id,data.session.user.email||"");});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive&&session)void checkRole(session.user.id,session.user.email||"");if(alive&&!session)setAccess(null);});return()=>{alive=false;subscription.unsubscribe();};},[serverAuthorized]);
 useEffect(()=>{ if(access?.role!=="platform_admin") return; let active=true; const load=async()=>{ const {data,error}=await supabase.rpc("get_platform_dashboard_metrics"); if(!active)return; if(error||!data){setMetricValues(Object.fromEntries(adminMetrics.map(([, ,key])=>[key,{value:"—",detail:"This figure is temporarily unavailable",error:true}])));return;} const money=new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}); const mapping:Record<string,string>={estates:"estates",users:"users",properties:"properties",residents:"residents",charges:"charges",payments:"payments",maintenance:"maintenance"}; const next:Record<string,MetricValue>={}; for(const [key,field] of Object.entries(mapping)){ const value=Number(data[field]??0); next[key]={value:value.toLocaleString("en-NG"),detail:"Total records"}; } next.outstanding={value:money.format(Number(data.outstanding_kobo??0)/100),detail:"Unpaid active service charges"}; setMetricValues(next); }; void load(); return()=>{active=false;}; },[access?.role]);
 useEffect(()=>{ if(access?.role!=="platform_admin")return;let active=true;setGrowthLoading(true);setGrowthError("");void (async()=>{try{const {data,error}=await supabase.rpc("get_platform_growth_analytics");if(!active)return;if(error||!data){setGrowthData(null);setGrowthError("Growth analytics are temporarily unavailable.");}else{setGrowthData(data as PlatformGrowthData);}}catch{if(active){setGrowthData(null);setGrowthError("Growth analytics are temporarily unavailable.");}}finally{if(active)setGrowthLoading(false);}})();return()=>{active=false;};},[access?.role]);
 useEffect(()=>{ if(access?.role!=="facility_manager"||!selectedEstate)return; let active=true; const load=async()=>{
  setManagerLoading(true);setManagerError("");
  const startOfDay=new Date();startOfDay.setHours(0,0,0,0);const endOfDay=new Date(startOfDay);endOfDay.setDate(endOfDay.getDate()+1);
  const money=new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2});const fmt=(n:number)=>n.toLocaleString("en-NG");
  try{
   const [properties,residents,visitors,events,charges,payments,maintenance]=await Promise.all([
    supabase.from("units").select("id",{count:"exact",head:true}).eq("estate_id",selectedEstate),
    supabase.from("estate_memberships").select("user_id").eq("estate_id",selectedEstate).eq("membership_role","resident").eq("status","active"),
    supabase.from("visitor_visits").select("id",{count:"exact",head:true}).eq("estate_id",selectedEstate).gte("checked_in_at",startOfDay.toISOString()).lt("checked_in_at",endOfDay.toISOString()),
    supabase.from("estate_events").select("id",{count:"exact",head:true}).eq("estate_id",selectedEstate).gte("starts_at",startOfDay.toISOString()).lt("starts_at",endOfDay.toISOString()),
    supabase.from("estate_service_charges").select("id,amount_kobo,is_active").eq("estate_id",selectedEstate),
    supabase.from("service_charge_payments").select("charge_id,resident_user_id,amount_kobo").eq("estate_id",selectedEstate).eq("status","successful"),
    supabase.from("maintenance_requests").select("id,status,priority,created_at,title",{count:"exact"}).eq("estate_id",selectedEstate).order("created_at",{ascending:false}).limit(5)
   ]);
   const failure=[properties.error,residents.error,visitors.error,events.error,charges.error,payments.error,maintenance.error].find(Boolean);if(failure)throw failure;
   const residentIds=[...new Set((residents.data||[]).map(row=>row.user_id))];const activeCharges=(charges.data||[]).filter(row=>row.is_active);
   const paidByObligation=new Map<string,number>();
   for(const payment of payments.data||[]){const key=payment.charge_id+":"+payment.resident_user_id;paidByObligation.set(key,(paidByObligation.get(key)||0)+Number(payment.amount_kobo||0));}
   let outstandingKobo=0;for(const charge of activeCharges)for(const residentId of residentIds)outstandingKobo+=Math.max(Number(charge.amount_kobo||0)-(paidByObligation.get(charge.id+":"+residentId)||0),0);
   const configuredKobo=activeCharges.reduce((sum,row)=>sum+Number(row.amount_kobo||0),0);const receivedKobo=(payments.data||[]).reduce((sum,row)=>sum+Number(row.amount_kobo||0),0);
   const next:Record<string,ManagerMetric>={
    properties:{value:fmt(properties.count||0),detail:"Total property units in this estate"},
    residents:{value:fmt(residentIds.length),detail:"Distinct active resident accounts"},
    visitors:{value:fmt(visitors.count||0),detail:"Visitor check-ins today"},
    events:{value:fmt(events.count||0),detail:"Events scheduled today"},
    charges:{value:fmt((charges.data||[]).length),detail:activeCharges.length+" active charges · "+money.format(configuredKobo/100)+" configured"},
    payments:{value:fmt((payments.data||[]).length),detail:money.format(receivedKobo/100)+" received from successful payments"},
    outstanding:{value:money.format(outstandingKobo/100),detail:"Unpaid active service charges for active residents"},
    maintenance:{value:fmt(maintenance.count||0),detail:"Total maintenance requests in this estate"}
   };
   if(active){setManagerMetricValues(next);setManagerMaintenanceRows((maintenance.data||[]) as MaintenancePreview[]);}
  }catch(e){if(active){setManagerMaintenanceRows([]);setManagerError("Estate information could not be loaded. Please refresh and try again.");setManagerMetricValues(Object.fromEntries(["properties","residents","visitors","events","charges","payments","outstanding","maintenance"].map(key=>[key,{value:"—",detail:"Live data unavailable"}])));}}
  finally{if(active)setManagerLoading(false);}
 };
 void load();return()=>{active=false;};
 },[access?.role,selectedEstate]);
 async function signIn(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{const {data,error}=await supabase.functions.invoke("account-login",{body:{email:email.trim().toLowerCase(),password}});if(error)throw error;if(data?.error){const retry=Number(data.retry_after_seconds||0);setError(data.error==="account_locked"?(data.message||("Your account is temporarily locked. Try again in "+Math.ceil(retry/60)+" minutes.")):"We could not sign you in. Check your details and try again.");return;}if(!data?.session){setError("We could not sign you in. Please try again.");return;}const {error:sessionError}=await supabase.auth.setSession(data.session);if(sessionError)throw sessionError;window.location.replace("/dashboard");}catch(e){const message=e instanceof Error?e.message:"Unable to sign in.";setError(/email not confirmed/i.test(message)?"Your invitation email has not been verified yet. Open the latest invitation link sent to your email, then sign in again.":"We could not sign you in. Check your details and try again.");}finally{setBusy(false);}}
 async function signOut(){await supabase.auth.signOut();window.location.replace("/");}
 if(access){
  const admin=access.role==="platform_admin"; const nav=admin?adminNav:managerNav; const data=admin?adminMetrics:metrics; const managerData:Record<string,ManagerMetric>={properties:managerMetricValues.properties,residents:managerMetricValues.residents,visitors:managerMetricValues.visitors,events:managerMetricValues.events,charges:managerMetricValues.charges,payments:managerMetricValues.payments,outstanding:managerMetricValues.outstanding,maintenance:managerMetricValues.maintenance};
  return <main className="portal"><aside className="sidebar"><div className="brand"><img src="/IMG_9873.png" alt="CB Nest logo" /><span>CB NEST<small>MANAGEMENT PORTAL</small></span></div><p className="nav-label">MAIN MENU</p><nav className="nav-list">{nav.map(([icon,label],i)=><a key={label} href={label==="My Profile"?"/profile":i===0?"/dashboard":"/"+label.toLowerCase().replaceAll(" ","-")} className={"nav"+(i===0?" active":"")}><span className="nav-icon">{icon}</span>{label}</a>)}</nav><button className="logout" onClick={signOut}>↪　Sign out</button></aside><section className="main"><header className="topbar"><div className="top-left">{!admin&&<select className="estate-select" value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)} aria-label="Select estate">{access.estates.map(estate=><option key={estate.id} value={estate.id}>{estate.name}</option>)}</select>}</div><div className="top-right"><a href="/alerts" className="bell" aria-label="Open alerts">♧</a><a href="/profile" className="profile-shortcut"><span className="avatar">{access.name.slice(0,1).toUpperCase()}</span><span><strong>{access.name}</strong><small>{admin?"Super Administrator":"Facility Manager"}</small></span></a></div></header><div className="content"><div className="page-heading"><div><h1>{admin?"Platform Overview":"Dashboard"}</h1><p>{admin?"Complete overview of CB Nest platform operations":"Overview of your estate operations"}</p></div><span className="date-control">▦　{new Intl.DateTimeFormat("en-NG",{month:"short",year:"numeric"}).format(new Date())}</span></div><div className="metrics">{data.map(([icon,label,key])=><article key={label}><span className="metric-icon">{icon}</span><div><small>{!admin&&key==="charges"?"ACTIVE SERVICE CHARGES":label}</small><strong>{admin?(metricValues[key]?.value??"—"):(managerData[key]?.value??"—")}</strong><p>{admin?(metricValues[key]?.detail??"Loading live data…"):(managerData[key]?.detail??"Loading live data…")}</p></div></article>)}</div>{!admin&&managerError&&<div className="error">{managerError}</div>}{!admin&&managerLoading&&<div className="notice-line">Refreshing live estate data…</div>}<div className="dashboard-grid">{admin?<PlatformGrowthCharts data={growthData} loading={growthLoading} error={growthError}/>:<div className="dashboard-grid"><section className="panel"><h3>Service Charge Collections</h3><p>Verified service-charge payment totals for the selected estate</p><div className="list-placeholder"><div><span>Verified payments</span><strong>{managerData.payments.value}</strong></div><div><span>Active service charges</span><strong>{managerData.charges.value}</strong></div><div><span>Outstanding balance</span><strong>{managerData.outstanding.value}</strong></div></div></section><section className="panel"><h3>Maintenance Requests</h3><p>Latest maintenance requests for the selected estate</p><div className="list-placeholder">{managerMaintenanceRows.length?managerMaintenanceRows.map(row=><div key={row.id}><span>{row.title||"Maintenance request"} · {row.priority||"Normal"}<small style={{display:"block",marginTop:4}}>{new Date(row.created_at).toLocaleDateString("en-NG")}</small></span><strong>{row.status.replaceAll("_"," ")}</strong></div>):<div><span>Maintenance requests</span><strong>No requests recorded</strong></div>}</div></section></div>}</div></div></section></main>;
 }
 return <main className="login"><section className="visual"><div className="brand"><img src="/IMG_9873.png" alt="CB Nest logo" /><span>CB NEST<small>MANAGEMENT PORTAL</small></span></div><div><small>ESTATE & PLATFORM MANAGEMENT</small><h1>One platform.<br/>Every estate.<br/><em>In control.</em></h1><p>A secure workspace for platform administrators and estate facility managers.</p></div><footer>CB NEST · MANAGEMENT PORTAL</footer></section><section className="form-wrap"><div className="form"><small>MANAGEMENT PORTAL</small><h2>Welcome back</h2><p>Sign in with your management account to continue.</p>{!supabaseConfigured&&<div className="notice">Management sign-in is temporarily unavailable. Please try again later.</div>}{invitationAccepted&&<div className="notice">Your invitation has been verified. Sign in with the email address and password provided by your administrator.</div>}{error&&<div className="error">{error}</div>}<form onSubmit={signIn}><label>Email address</label><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button disabled={busy||!supabaseConfigured}>{busy?"Signing in…":"Sign in to portal"} <span>→</span></button></form><div className="foot">Access is restricted to authorized management accounts.</div></div></section></main>;
}