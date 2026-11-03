"use client";
import PortalFrame from "@/components/PortalFrame";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import SettingsPage from "./SettingsPage";
import ProfilePage from "./ProfilePage";
import ServiceChargesPage from "./ServiceChargesPage";
import LegalDocumentsPage from "./LegalDocumentsPage";

type Estate = { id: string; name: string };
type Membership = {
  id: string; estate_id: string; user_id: string; membership_role: string;
  status: string; created_at: string;
  users: { full_name: string; phone_e164: string | null } | null;
};
type Role = "facility_manager" | "resident" | "security" | "event_organiser";
const roleLabels: Record<string,string> = {
  facility_manager:"Facility Manager", resident:"Resident", security:"Security Personnel",
  event_organiser:"Event Coordinator", estate_admin:"Estate Administrator", estate_manager:"Estate Manager",
  finance_admin:"Finance Admin"
};
const config:Record<string,{title:string;description:string;columns:string[];intro:string}> = {
 estates:{title:"Estates",description:"Create and manage estates across the CB Nest platform.",columns:["Estate name","Location","Properties","Manager","Status"],intro:"Estate records will appear here when connected."},
 users:{title:"User Management",description:"Invite people, assign roles and manage estate access.",columns:["Name","Role","Estate","Phone","Status","Date added"],intro:"Create and manage accounts for the estates you administer."},
 properties:{title:"Properties",description:"View and manage properties and units.",columns:["Property","Estate","Type","Units","Status"],intro:"Property records will appear here."},
 subscriptions:{title:"Subscriptions",description:"Monitor estate plans and subscription status.",columns:["Estate","Plan","Billing cycle","Renewal date","Status"],intro:"Subscription records will appear here."},
 payments:{title:"Payments",description:"Review payments and transaction activity.",columns:["Reference","Payer","Estate","Amount","Date","Status"],intro:"Verified payment transactions will appear here."},
 analytics:{title:"Analytics",description:"Platform performance and estate growth insights.",columns:["Metric","Current period","Previous period","Change"],intro:"Analytics will appear when reporting data is connected."},
 support:{title:"Support",description:"Review and manage support requests.",columns:["Ticket","Submitted by","Category","Date","Status"],intro:"Support requests will appear here."},
 "system-logs":{title:"System Logs",description:"Review administrative and platform activity.",columns:["Activity","User","Module","Timestamp","Result"],intro:"System activity will appear here when audit logging is connected."},
 settings:{title:"Settings",description:"Manage platform preferences and configuration.",columns:["Setting","Current value","Last updated"],intro:"Platform settings will be made available here."},
 residents:{title:"Residents",description:"View resident accounts and estate membership.",columns:["Resident","Property","Email","Phone","Status"],intro:"Resident records will appear here."},
 "visitor-management":{title:"Visitor Management",description:"Review visitor passes and estate entry activity.",columns:["Visitor","Resident","Pass code","Visit date","Status"],intro:"Visitor records will appear here."},
 events:{title:"Events",description:"Manage estate events and guest attendance.",columns:["Event","Estate","Date","Guests","Status"],intro:"Event records will appear here."},
 "service-charges":{title:"Service Charges",description:"Manage service-charge billing and balances.",columns:["Invoice","Resident","Property","Amount","Due date","Status"],intro:"Service-charge records will appear here."},
 maintenance:{title:"Maintenance",description:"Track maintenance requests and work orders.",columns:["Request","Property","Category","Submitted","Priority","Status"],intro:"Maintenance requests will appear here."},
 "facility-management":{title:"Facility Management",description:"Oversee estate facilities and operational services.",columns:["Facility","Estate","Condition","Last inspection","Status"],intro:"Facility records will appear here."},
 communications:{title:"Communications",description:"Manage notices and resident communications.",columns:["Subject","Audience","Created","Channel","Status"],intro:"Communication records will appear here."},
 reports:{title:"Reports",description:"Review estate operations and performance reports.",columns:["Report","Period","Generated","Owner","Status"],intro:"Reports will appear when verified reporting data is connected."}
};


type EstateRecord = { id:string; name:string; address:string; city:string; state:string; country_code:string; is_enabled:boolean; created_at:string };

function EstatesPage() {
 const [rows,setRows]=useState<EstateRecord[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [showForm,setShowForm]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [name,setName]=useState("");
 const [address,setAddress]=useState("");
 const [city,setCity]=useState("");
 const [state,setState]=useState("");
 const [country,setCountry]=useState("NG");

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setLoading(false);return;}
  const {data:roles,error:roleError}=await supabase.from("user_roles").select("role").eq("user_id",user.id);
  if(roleError||!(roles||[]).some((r:{role:string})=>r.role==="platform_admin")){
   setError("Only Super Administrators can create and manage estates.");setLoading(false);return;
  }
  const {data,error:queryError}=await supabase.from("estates").select("id,name,address,city,state,country_code,is_enabled,created_at").order("created_at",{ascending:false});
  if(queryError)setError("Unable to load estates. Check your platform permissions.");
  else setRows((data||[]) as EstateRecord[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);

 async function createEstate(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");setSuccess("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setSaving(false);return;}
  const {data:roles,error:roleError}=await supabase.from("user_roles").select("role").eq("user_id",user.id);
  if(roleError||!(roles||[]).some((r:{role:string})=>r.role==="platform_admin")){
   setError("Your account is not authorized to create estates.");setSaving(false);return;
  }
  const {data,error:insertError}=await supabase.from("estates").insert({
   name:name.trim(),address:address.trim(),city:city.trim(),state:state.trim(),country_code:country.trim().toUpperCase(),is_enabled:true
  }).select("id,name,address,city,state,country_code,is_enabled,created_at").single();
  if(insertError){setError(insertError.message.includes("duplicate")?"An estate with these details may already exist. Please check the estate list.":"Estate could not be created. "+insertError.message);setSaving(false);return;}
  setRows(current=>[insertedEstate(data),...current]);
  setSuccess("Estate created successfully. You can now open User Management and assign its Facility Manager.");
  setName("");setAddress("");setCity("");setState("");setCountry("NG");setShowForm(false);setSaving(false);
 }
 return <PortalFrame title="Estates" description="Create and manage estates across the CB Nest platform.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Estate directory</h3><p>Create an estate first, then assign its Facility Manager from User Management.</p></div><button className="primary-action" onClick={()=>{setShowForm(v=>!v);setError("");setSuccess("");setInviteCredentials(null);}}>{showForm?"Close":"＋ Create estate"}</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   {resendMessage&&<div className="user-alert user-alert-success" role="status">{resendMessage}</div>}
   {success&&<div className="user-alert user-alert-success" role="status">{success}<div style={{marginTop:8}}><a href="/users" style={{color:"inherit",fontWeight:700,textDecoration:"underline"}}>Continue to User Management →</a></div></div>}
   {showForm&&<form className="user-form" onSubmit={createEstate}>
    <div className="user-form-heading"><strong>New estate details</strong><span>Enter the estate's official name and location. It will be enabled immediately.</span></div>
    <div className="user-form-grid">
     <label>Estate name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Cities Builders Estate"/></label>
     <label>Street address<input required minLength={3} maxLength={240} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Estate street address"/></label>
     <label>City<input required maxLength={120} value={city} onChange={e=>setCity(e.target.value)} placeholder="City"/></label>
     <label>State<input required maxLength={120} value={state} onChange={e=>setState(e.target.value)} placeholder="State"/></label>
     <label>Country code<input required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={country} onChange={e=>setCountry(e.target.value.toUpperCase())} placeholder="NG"/></label>
    </div>
    <div className="user-form-actions"><button type="button" className="secondary-action" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving?"Creating estate…":"Create estate"}</button></div>
   </form>}
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Estate</th><th>Address</th><th>City</th><th>State</th><th>Status</th><th>Created</th></tr></thead><tbody>
    {loading?<tr><td colSpan={7} className="empty-cell">Loading estates…</td></tr>:rows.length?rows.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.address}</td><td>{x.city}</td><td>{x.state}</td><td><span className={"status-pill "+(x.is_enabled?"status-active":"status-suspended")}>{x.is_enabled?"Enabled":"Disabled"}</span></td><td>{new Date(x.created_at).toLocaleDateString()}</td></tr>):<tr><td colSpan={6} className="empty-cell"><span className="empty-mark">▦</span><strong>No estates created yet</strong><small>Create your first estate, then add its Facility Manager under User Management.</small></td></tr>}
   </tbody></table></div>
  </section>
 </PortalFrame>;
}

function insertedEstate(value:EstateRecord):EstateRecord{return value;}

function UsersPage() {
 const [estates,setEstates]=useState<Estate[]>([]);
 const [memberships,setMemberships]=useState<Membership[]>([]);
 const [selectedEstate,setSelectedEstate]=useState("");
 const [isAdmin,setIsAdmin]=useState(false);
 const [loading,setLoading]=useState(true);
 const [showForm,setShowForm]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [inviteCredentials,setInviteCredentials]=useState<{email:string;password:string}|null>(null);
 const [resendingUserId,setResendingUserId]=useState<string|null>(null);
 const [resendMessage,setResendMessage]=useState("");
 const [fullName,setFullName]=useState("");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [role,setRole]=useState<Role>("resident");
 const [buildingName,setBuildingName]=useState("");
 const [unitCode,setUnitCode]=useState("");
 const [unitType,setUnitType]=useState("");
 const [search,setSearch]=useState("");

 const load = useCallback(async () => {
  setLoading(true); setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setLoading(false);return;}
  const [{data:globalRoles,error:roleError},{data:ownMemberships,error:ownError}] = await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",user.id),
   supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
  ]);
  if(roleError||ownError){setError("Unable to verify your estate permissions.");setLoading(false);return;}
  const admin=(globalRoles||[]).some((x:{role:string})=>x.role==="platform_admin");
  setIsAdmin(admin);
  let estateQuery=supabase.from("estates").select("id,name").eq("is_enabled",true).order("name");
  if(!admin){
   const allowed=(ownMemberships||[]).filter((x:{membership_role:string})=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map((x:{estate_id:string})=>x.estate_id);
   if(!allowed.length){setError("You do not have permission to manage estate users.");setLoading(false);return;}
   estateQuery=estateQuery.in("id",allowed);
  }
  const {data:estateData,error:estateError}=await estateQuery;
  if(estateError){setError("Unable to load estates available to your account.");setLoading(false);return;}
  const list=(estateData||[]) as Estate[];
  setEstates(list);
  const estateId=selectedEstate&&list.some(x=>x.id===selectedEstate)?selectedEstate:(list[0]?.id||"");
  setSelectedEstate(estateId);
  if(estateId){
   const {data:memberData,error:memberError}=await supabase.from("estate_memberships")
    .select("id,estate_id,user_id,membership_role,status,created_at,users(full_name,phone_e164)")
    .in("estate_id",admin?list.map(x=>x.id):list.map(x=>x.id)).order("created_at",{ascending:false});
   if(memberError)setError("Estate access was verified, but user records could not be loaded.");
   else setMemberships((memberData||[]) as unknown as Membership[]);
  } else setMemberships([]);
  setLoading(false);
 },[selectedEstate]);

 useEffect(()=>{void load();},[load]);
 const visible=useMemo(()=>memberships.filter(m=>{
  const estate=estates.find(e=>e.id===m.estate_id)?.name||"";
  const q=search.toLowerCase();
  return (!selectedEstate||m.estate_id===selectedEstate) && (!q||[m.users?.full_name||"",roleLabels[m.membership_role]||m.membership_role,estate,m.users?.phone_e164||""].join(" ").toLowerCase().includes(q));
 }),[memberships,estates,selectedEstate,search]);
 const allowedRoles:Role[]=isAdmin?["facility_manager","resident","security","event_organiser"]:["resident","security","event_organiser"];
 async function resendInvitation(membership:Membership){
  setResendMessage("");setError("");setResendingUserId(membership.user_id);
  const {data,error:invokeError}=await supabase.functions.invoke("resend-account-invitation",{
   body:{estateId:membership.estate_id,userId:membership.user_id}
  });
  if(invokeError){
   let message=invokeError.message||"The access email could not be sent.";
   const context=(invokeError as typeof invokeError & {context?:Response}).context;
   if(context){try{const detail=await context.clone().json() as {message?:string};message=detail.message||message;}catch{/* keep SDK message */}}
   setError(message);setResendingUserId(null);return;
  }
  if(data?.error){setError(data.message||"The access email could not be sent.");setResendingUserId(null);return;}
  setResendMessage(data.delivery==="password_reset"
   ? `Password-reset email sent to ${data.email}. The existing account and estate role were not changed.`
   : `A fresh invitation email was sent to ${data.email}. The existing account and estate role were not changed.`);
  setResendingUserId(null);
 }
 
 async function createUser(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");setSuccess("");
  const payload:Record<string,string>={estateId:selectedEstate,fullName:fullName.trim(),email:email.trim().toLowerCase(),password,role};
  if(role==="resident"){payload.buildingName=buildingName.trim();payload.unitCode=unitCode.trim();if(unitType.trim())payload.unitType=unitType.trim();}
  const {data,error:invokeError}=await supabase.functions.invoke("onboard-account",{body:payload});
  if(invokeError){
   let message=invokeError.message||"Invitation could not be sent.";
   const context=(invokeError as typeof invokeError & {context?:Response}).context;
   if(context){try{const detail=await context.clone().json() as {message?:string;error?:string};message=detail.message||detail.error||message;}catch{/* retain the SDK error */}}
   setError(message);setSaving(false);return;
  }
  if(data?.error){setError(data.message||data.error||"Invitation could not be completed.");setSaving(false);return;}
  setInviteCredentials({email:email.trim().toLowerCase(),password});
  setSuccess("Invitation email sent successfully. Give the user the initial password below through a separate secure channel.");
  setFullName("");setEmail("");setPassword("");setBuildingName("");setUnitCode("");setUnitType("");setShowForm(false);
  await load();setSaving(false);
 }
 return <PortalFrame title="User Management" description="Invite people, assign roles and manage access within your estate.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Estate users</h3><p>{isAdmin?"Manage users across all estates. Facility Managers can manage users only in their assigned estate.":"Manage residents, security personnel and event coordinators in your assigned estate."}</p></div><button className="primary-action" onClick={()=>{setShowForm(v=>!v);setError("");setSuccess("");setInviteCredentials(null);setResendMessage("");}}>{showForm?"Close":"＋ Add user"}</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   {success&&<div className="user-alert user-alert-success" role="status">
    <strong>Invitation created successfully</strong><p>{success}</p>
    {inviteCredentials&&<div style={{display:"grid",gap:10,marginTop:12}}>
     <div><span className="optional-label">INVITATION EMAIL</span><div style={{fontWeight:800,overflowWrap:"anywhere"}}>{inviteCredentials.email}</div><button type="button" className="secondary-action" style={{marginTop:6}} onClick={()=>void navigator.clipboard.writeText(inviteCredentials.email)}>Copy email</button></div>
     <div><span className="optional-label">INITIAL PASSWORD</span><div style={{fontWeight:800,overflowWrap:"anywhere",fontFamily:"monospace"}}>{inviteCredentials.password}</div><button type="button" className="secondary-action" style={{marginTop:6}} onClick={()=>void navigator.clipboard.writeText(inviteCredentials.password)}>Copy password</button></div>
     <small>Keep this password private. Do not forward it in the invitation email; share it with the user separately and securely.</small>
     <button type="button" className="secondary-action" onClick={()=>{setInviteCredentials(null);setSuccess("");}}>Hide credentials</button>
    </div>}
   </div>}
   {showForm&&<form className="user-form" onSubmit={createUser}>
    <div className="user-form-heading"><strong>Invite a new user</strong><span>Create their login password here. They will receive a separate email link to accept the invitation.</span></div>
    <div className="user-form-grid">
     <label>Full name<input required minLength={2} maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Enter full name"/></label>
     <label>Email address<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
     <label>Initial password<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a password (8+ characters)"/><span className="optional-label">Share this password with the user securely, separately from the invitation email.</span></label>
     <label>Estate<select required value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)}>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <label>Role<select value={role} onChange={e=>setRole(e.target.value as Role)}>{allowedRoles.map(x=><option key={x} value={x}>{roleLabels[x]}</option>)}</select></label>
     {role==="resident"&&<><label>Building name<input required value={buildingName} onChange={e=>setBuildingName(e.target.value)} placeholder="e.g. Block A"/></label><label>Apartment / unit number<input required value={unitCode} onChange={e=>setUnitCode(e.target.value)} placeholder="e.g. A-04"/></label><label>Apartment type <span className="optional-label">Optional</span><input value={unitType} onChange={e=>setUnitType(e.target.value)} placeholder="e.g. 3-bedroom"/></label></>}
    </div>
    <div className="user-form-actions"><button type="button" className="secondary-action" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="primary-action" disabled={saving||!selectedEstate}>{saving?"Sending invitation…":"Send invitation"}</button></div>
   </form>}
   <div className="user-list-toolbar"><select aria-label="Filter by estate" value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)}><option value="">All estates</option>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, role or phone…" aria-label="Search users"/></div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Name</th><th>Role</th><th>Estate</th><th>Phone</th><th>Status</th><th>Date added</th><th>Actions</th></tr></thead><tbody>
    {loading?<tr><td colSpan={7} className="empty-cell">Loading estate users…</td></tr>:visible.length?visible.map(m=><tr key={m.id}><td><strong>{m.users?.full_name||"Unnamed user"}</strong></td><td>{roleLabels[m.membership_role]||m.membership_role}</td><td>{estates.find(x=>x.id===m.estate_id)?.name||"—"}</td><td>{m.users?.phone_e164||"—"}</td><td><span className={"status-pill status-"+m.status}>{m.status}</span></td><td>{new Date(m.created_at).toLocaleDateString()}</td><td><button type="button" className="secondary-action" disabled={resendingUserId===m.user_id} onClick={()=>void resendInvitation(m)}>{resendingUserId===m.user_id?"Sending…":"Resend invitation"}</button></td></tr>):<tr><td colSpan={6} className="empty-cell"><span className="empty-mark">♙</span><strong>No estate users found</strong><small>Invited users will appear here once their accounts are provisioned.</small></td></tr>}
   </tbody></table></div>
  </section>
 </PortalFrame>;
}

export default function SectionPage(){
 const params=useParams<{section:string}>();const section=Array.isArray(params.section)?params.section[0]:params.section;
 if(section==="users")return <UsersPage/>;
 if(section==="settings")return <SettingsPage/>;
 if(section==="profile")return <ProfilePage/>;
 if(section==="estates")return <EstatesPage/>;
  if(section==="service-charges")return <ServiceChargesPage/>;
 if(section==="legal-documents")return <LegalDocumentsPage/>;
 const item=config[section]||{title:"Page not found",description:"This section is not available.",columns:[],intro:"The requested section could not be found."};
 return <PortalFrame title={item.title} description={item.description}><section className="panel module-panel"><div className="module-toolbar"><div><h3>{item.title} overview</h3><p>{item.intro}</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr>{item.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody><tr><td colSpan={Math.max(item.columns.length,1)} className="empty-cell"><span className="empty-mark">▤</span><strong>No records to display</strong><small>Records will appear here after the data connection and module workflow are implemented.</small></td></tr></tbody></table></div></section></PortalFrame>;
}
