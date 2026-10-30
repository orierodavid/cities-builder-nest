"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type Access = { role: "platform_admin" | "facility_manager"; name: string; email: string; estates: string[] };
const managerNav = [["⌂","Dashboard"],["▣","Properties"],["♙","Residents"],["♟","Users"],["⌕","Visitor Management"],["▦","Events"],["▤","Service Charges"],["▣","Payments"],["⚒","Maintenance"],["⌂","Facility Management"],["▤","Communications"],["▥","Reports"],["⚙","Settings"]];
const adminNav = [["⌂","Dashboard"],["▦","Estates"],["♙","Users"],["⌂","Properties"],["▤","Subscriptions"],["▣","Payments"],["▥","Analytics"],["?","Support"],["☷","System Logs"],["⚙","Settings"]];
const metrics = [
 ["⌂","TOTAL PROPERTIES"],["♙","REGISTERED RESIDENTS"],["♟","TODAY'S VISITORS"],["▦","EVENTS"],
 ["▤","SERVICE CHARGES BILLED"],["▣","PAYMENTS RECEIVED"],["⚠","OUTSTANDING BALANCE"],["⚒","MAINTENANCE REQUESTS"]
];
const adminMetrics = [
 ["▦","TOTAL ESTATES"],["♙","TOTAL USERS"],["⌂","TOTAL PROPERTIES"],["▤","ACTIVE SUBSCRIPTIONS"],
 ["▤","TOTAL SERVICE CHARGES"],["▣","PAYMENTS RECEIVED"],["⚠","OUTSTANDING BALANCE"],["▥","PLATFORM REVENUE"]
];

export default function Home() {
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [access,setAccess]=useState<Access|null>(null); const [selectedEstate,setSelectedEstate]=useState(""); const [invitationAccepted,setInvitationAccepted]=useState(false);
 async function checkRole(userId:string,userEmail:string) {
  const [globalResult,membershipResult,profileResult]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",userId),
   supabase.from("estate_memberships").select("membership_role, estates(name)").eq("user_id",userId).eq("status","active"),
   supabase.from("users").select("full_name").eq("id",userId).maybeSingle()
  ]);
  if(globalResult.error||membershipResult.error){setError("Unable to verify management permissions. Please try again.");await supabase.auth.signOut();return;}
  const globalRoles=(globalResult.data||[]).map(x=>x.role as string);
  const estateRoles=(membershipResult.data||[]).map(x=>x.membership_role as string);
  const isAdmin=globalRoles.includes("platform_admin");
  const isManager=estateRoles.some(x=>["estate_manager","estate_admin","facility_manager"].includes(x));
  if(!isAdmin&&!isManager){await supabase.auth.signOut();setError("This account is not authorized for the management web portal.");return;}
  const estates=(membershipResult.data||[]).map(x=>(x.estates as unknown as {name?:string}|null)?.name||"Assigned estate");
  setAccess({role:isAdmin?"platform_admin":"facility_manager",name:profileResult.data?.full_name||"Management user",email:userEmail,estates});
  if(estates.length)setSelectedEstate(estates[0]);
 }
 useEffect(()=>{setInvitationAccepted(new URLSearchParams(window.location.search).get("invitation")==="accepted");let alive=true;supabase.auth.getSession().then(({data})=>{if(alive&&data.session)void checkRole(data.session.user.id,data.session.user.email||"");});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive&&session)void checkRole(session.user.id,session.user.email||"");if(alive&&!session)setAccess(null);});return()=>{alive=false;subscription.unsubscribe();};},[]);
 async function signIn(e:FormEvent){e.preventDefault();setBusy(true);setError("");const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error){const message=error.message||"Unable to sign in.";setError(/email not confirmed/i.test(message)?"Your invitation email has not been verified yet. Open the latest invitation link sent to your email, then sign in again.":message);}setBusy(false);}
 async function signOut(){await supabase.auth.signOut();setAccess(null);setPassword("");}
 if(access){
  const admin=access.role==="platform_admin"; const nav=admin?adminNav:managerNav; const data=admin?adminMetrics:metrics;
  return <main className="portal"><aside className="sidebar"><div className="brand"><b>⌂</b><span>CB NEST<small>MANAGEMENT PORTAL</small></span></div><p className="nav-label">MAIN MENU</p><nav className="nav-list">{nav.map(([icon,label],i)=><a key={label} href={i===0?"/":"/"+label.toLowerCase().replaceAll(" ","-")} className={"nav"+(i===0?" active":"")}><span className="nav-icon">{icon}</span>{label}</a>)}</nav><button className="logout" onClick={signOut}>↪　Sign out</button></aside><section className="main"><header className="topbar"><div className="top-left">{!admin&&<select className="estate-select" value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)} aria-label="Select estate">{access.estates.map(name=><option key={name}>{name}</option>)}</select>}<input className="search" placeholder={admin?"⌕  Search estates, users, transactions...":"⌕  Search residents, properties, visitors..."}/></div><div className="top-right"><span className="bell">♧</span><span className="avatar">{access.name.slice(0,1).toUpperCase()}</span><span><strong>{access.name}</strong><small>{admin?"Super Administrator":"Facility Manager"}</small></span></div></header><div className="content"><div className="page-heading"><div><h1>{admin?"Platform Overview":"Dashboard"}</h1><p>{admin?"Complete overview of CB Nest platform operations":"Overview of your estate operations"}</p></div><button className="date-control">▦　Nov 2024　⌄</button></div><div className="metrics">{data.map(([icon,label])=><article key={label}><span className="metric-icon">{icon}</span><div><small>{label}</small><strong>—</strong><p>Live data connection pending</p></div></article>)}</div><div className="dashboard-grid"><section className="panel"><h3>{admin?"Estate Growth":"Payment Collection Trend"}</h3><p>{admin?"Estate and platform growth over time":"Collected service-charge payments over time"}</p><div className="chart-placeholder">Chart will appear when verified reporting data is connected</div></section><section className="panel"><h3>{admin?"Top Performing Estates":"Maintenance Requests"}</h3><p>{admin?"Estate collection and outstanding balances":"Current maintenance request status"}</p><div className="list-placeholder"><div><span>Reporting data</span><strong>Not connected</strong></div><div><span>Estate records</span><strong>Not loaded</strong></div><div><span>Last refresh</span><strong>—</strong></div></div></section></div><div className="notice-line">Signed in as {access.email}. Dashboard figures remain unavailable until the live reporting queries are implemented and verified.</div></div></section></main>;
 }
 return <main className="login"><section className="visual"><div className="brand"><b>⌂</b><span>CB NEST<small>MANAGEMENT PORTAL</small></span></div><div><small>ESTATE & PLATFORM MANAGEMENT</small><h1>One platform.<br/>Every estate.<br/><em>In control.</em></h1><p>A secure workspace for platform administrators and estate facility managers.</p></div><footer>CB NEST · MANAGEMENT PORTAL</footer></section><section className="form-wrap"><div className="form"><small>MANAGEMENT PORTAL</small><h2>Welcome back</h2><p>Sign in with your management account to continue.</p>{!supabaseConfigured&&<div className="notice">Supabase environment variables are not configured.</div>}{invitationAccepted&&<div className="notice">Your invitation has been verified. Sign in with the email address and password provided by your administrator.</div>}{error&&<div className="error">{error}</div>}<form onSubmit={signIn}><label>Email address</label><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button disabled={busy||!supabaseConfigured}>{busy?"Signing in…":"Sign in to portal"} <span>→</span></button></form><div className="foot">Access is restricted to authorized management accounts.</div></div></section></main>;
}