"use client";
import PortalFrame from "@/components/PortalFrame";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import SettingsPage from "./SettingsPage";
import ProfilePage from "./ProfilePage";
import ServiceChargesPage from "./ServiceChargesPage";
import LegalDocumentsPage from "./LegalDocumentsPage";
import AuditLogsPage from "../AuditLogsPage";
import AdminAlertsPage from "../AdminAlertsPage";
import VenueCapacityPage from "./VenueCapacityPage";

type Estate = { id: string; name: string };
type Membership = {
  id: string; estate_id: string; user_id: string; membership_role: string;
  status: string; created_at: string;
  users: { full_name: string; phone_e164: string | null; home_number?: string | null; street_name?: string | null } | null;
};
type PendingResident = { membershipId: string; userId: string; name: string; email: string; phone: string; homeNumber?: string; streetName?: string; submittedAt: string };
type Role = "facility_manager" | "resident" | "security";
const roleLabels: Record<string,string> = {
  facility_manager:"Facility Manager", resident:"Resident", security:"Security Personnel",
  event_organiser:"Legacy event access", estate_admin:"Estate Administrator", estate_manager:"Estate Manager",
  finance_admin:"Finance Admin"
};
const config:Record<string,{title:string;description:string;columns:string[];intro:string}> = {
 estates:{title:"Estates",description:"Create and manage estates across the CB Nest platform.",columns:["Estate name","Location","Properties","Manager","Status"],intro:"No estate records are available yet."},
 users:{title:"User Management",description:"Create accounts, review resident registrations and manage estate access.",columns:["Name","Role","Estate","Phone","Status","Date added"],intro:"Create and manage accounts for the estates you administer."},
 properties:{title:"Properties",description:"View and manage properties and units.",columns:["Property","Estate","Type","Units","Status"],intro:"Property records will appear here."},
 subscriptions:{title:"Subscriptions",description:"Monitor estate plans and subscription status.",columns:["Estate","Plan","Billing cycle","Renewal date","Status"],intro:"Subscription records will appear here."},
 payments:{title:"Payments",description:"Review payments and transaction activity.",columns:["Reference","Payer","Estate","Amount","Date","Status"],intro:"Verified payment transactions will appear here."},
 analytics:{title:"Analytics",description:"Platform performance and estate growth insights.",columns:["Metric","Current period","Previous period","Change"],intro:"Analytics will appear here when reporting periods are available."},
 support:{title:"Support",description:"Review and manage support requests.",columns:["Ticket","Submitted by","Category","Date","Status"],intro:"Support requests will appear here."},
 "system-logs":{title:"Audit Logs",description:"Review who changed what, where and when across your authorised estates.",columns:["Who","What","Where","When","Severity"],intro:"Review recorded activity across your authorised estates."},
 alerts:{title:"Alerts & Notifications",description:"Review important administrative events.",columns:["Alert","Estate","Severity","Created","Status"],intro:"Review and acknowledge important admin alerts."},
 settings:{title:"Settings",description:"Manage platform preferences and configuration.",columns:["Setting","Current value","Last updated"],intro:"Platform settings will be made available here."},
 residents:{title:"Residents",description:"View resident accounts and estate membership.",columns:["Resident","Property","Email","Phone","Status"],intro:"Resident records will appear here."},
 "visitor-management":{title:"Visitor Management",description:"Review visitor passes and estate entry activity.",columns:["Visitor","Resident","Pass code","Visit date","Status"],intro:"Visitor records will appear here."},
 events:{title:"Events",description:"Manage estate events and guest attendance.",columns:["Event","Estate","Date","Guests","Status"],intro:"Event records will appear here."},
 "service-charges":{title:"Service Charges",description:"Manage service-charge billing and balances.",columns:["Invoice","Resident","Property","Amount","Due date","Status"],intro:"Service-charge records will appear here."},
 maintenance:{title:"Maintenance",description:"Track maintenance requests and work orders.",columns:["Request","Property","Category","Submitted","Priority","Status"],intro:"Maintenance requests will appear here."},
 "facility-management":{title:"Facility Management",description:"Oversee estate facilities and operational services.",columns:["Facility","Estate","Condition","Last inspection","Status"],intro:"Facility records will appear here."},
 communications:{title:"Communications",description:"Manage notices and resident communications.",columns:["Subject","Audience","Created","Channel","Status"],intro:"Communication records will appear here."},
 reports:{title:"Reports",description:"Review estate operations and performance reports.",columns:["Report","Period","Generated","Owner","Status"],intro:"Reports will appear here when reporting periods are available."}
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
  if(queryError)setError("Estates could not be loaded. Please refresh and try again.");
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
  if(insertError){setError(insertError.message.includes("duplicate")?"An estate with these details may already exist. Please check the estate list.":"The estate could not be created. Please check the details and try again.");setSaving(false);return;}
  setRows(current=>[insertedEstate(data),...current]);
  setSuccess("Estate created successfully. You can now open User Management and assign its Facility Manager.");
  setName("");setAddress("");setCity("");setState("");setCountry("NG");setShowForm(false);setSaving(false);
 }
 return <PortalFrame title="Estates" description="Create and manage estates across the CB Nest platform.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Estate directory</h3><p>Create an estate first, then assign its Facility Manager from User Management.</p></div><button className="primary-action" onClick={()=>{setShowForm(v=>!v);setError("");setSuccess("");}}>{showForm?"Close":"＋ Create estate"}</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   {success&&<div className="user-alert user-alert-success" role="status">{success}<div style={{marginTop:8}}><a href="/users" style={{color:"inherit",fontWeight:700,textDecoration:"underline"}}>Continue to User Management →</a></div></div>}
   {showForm&&<form className="user-form" onSubmit={createEstate}>
    <div className="user-form-heading"><strong>New estate details</strong><span>Enter the estate's official name and location. It will be enabled immediately.</span></div>
    <div className="user-form-grid">
     <label>Estate name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Cities Builders Estate"/></label>
     <label>Street address<input required minLength={3} maxLength={240} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Estate street address"/></label>
     <label>LGA<input required maxLength={120} value={city} onChange={e=>setCity(e.target.value)} placeholder="e.g. Ikeja"/></label>
     <label>State<input required maxLength={120} value={state} onChange={e=>setState(e.target.value)} placeholder="State"/></label>
     <label>Country code<input required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={country} onChange={e=>setCountry(e.target.value.toUpperCase())} placeholder="NG"/></label>
    </div>
    <div className="user-form-actions"><button type="button" className="secondary-action" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving?"Creating estate…":"Create estate"}</button></div>
   </form>}
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Estate</th><th>Address</th><th>LGA</th><th>State</th><th>Status</th><th>Created</th></tr></thead><tbody>
    {loading?<tr><td colSpan={7} className="empty-cell">Loading estates…</td></tr>:rows.length?rows.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.address}</td><td>{x.city}</td><td>{x.state}</td><td><span className={"status-pill "+(x.is_enabled?"status-active":"status-suspended")}>{x.is_enabled?"Enabled":"Disabled"}</span></td><td>{new Date(x.created_at).toLocaleDateString()}</td></tr>):<tr><td colSpan={6} className="empty-cell"><span className="empty-mark">▦</span><strong>No estates created yet</strong><small>Create your first estate, then add its Facility Manager under User Management.</small></td></tr>}
   </tbody></table></div>
  </section>
 </PortalFrame>;
}

function insertedEstate(value:EstateRecord):EstateRecord{return value;}

function UsersPage() {
 const [estates,setEstates]=useState<Estate[]>([]);
 const [memberships,setMemberships]=useState<Membership[]>([]);
 const [pendingResidents,setPendingResidents]=useState<PendingResident[]>([]);
 const [pendingVenueEvents,setPendingVenueEvents]=useState<Array<{id:string;title:string;venue:string;starts_at:string;created_at:string;venue_approval_publish_requested:boolean}>>([]);
 const [approvingUserId,setApprovingUserId]=useState<string|null>(null);
 const [selectedEstate,setSelectedEstate]=useState("");
 const [isAdmin,setIsAdmin]=useState(false);
 const [loading,setLoading]=useState(true);
 const [showForm,setShowForm]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [inviteCredentials,setInviteCredentials]=useState<{email:string;password:string}|null>(null);
 const [sendingPasswordUserId,setSendingPasswordUserId]=useState<string|null>(null);
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
   const {data:pendingData,error:pendingError}=await supabase.functions.invoke("resident-approval",{body:{action:"list",estateId}});
   if(pendingError||pendingData?.error){setPendingResidents([]);setError("Pending resident approvals could not be loaded. Please refresh.");}
   else setPendingResidents((pendingData?.pending||[]) as PendingResident[]);
   const {data:venueApprovalData,error:venueApprovalError}=await supabase.from("estate_events")
    .select("id,title,venue,starts_at,created_at,venue_approval_publish_requested")
    .eq("estate_id",estateId).eq("venue_approval_status","pending").order("venue_approval_requested_at",{ascending:true});
   if(venueApprovalError){setPendingVenueEvents([]);setError("Pending venue approvals could not be loaded. Please refresh.");}
   else setPendingVenueEvents((venueApprovalData||[]) as typeof pendingVenueEvents);
   const {data:memberData,error:memberError}=await supabase.from("estate_memberships")
    .select("id,estate_id,user_id,membership_role,status,created_at,users(full_name,phone_e164,home_number,street_name)")
    .in("estate_id",admin?list.map(x=>x.id):list.map(x=>x.id)).order("created_at",{ascending:false});
   if(memberError)setError("Estate access was verified, but user records could not be loaded.");
   else setMemberships((memberData||[]) as unknown as Membership[]);
  } else { setMemberships([]); setPendingResidents([]); setPendingVenueEvents([]); }
  setLoading(false);
 },[selectedEstate]);

 useEffect(()=>{void load();},[load]);
 const visible=useMemo(()=>memberships.filter(m=>{
  const estate=estates.find(e=>e.id===m.estate_id)?.name||"";
  const q=search.toLowerCase();
  return (!selectedEstate||m.estate_id===selectedEstate) && (!q||[m.users?.full_name||"",roleLabels[m.membership_role]||m.membership_role,estate,m.users?.phone_e164||""].join(" ").toLowerCase().includes(q));
 }),[memberships,estates,selectedEstate,search]);
 const allowedRoles:Role[]=isAdmin?["facility_manager","resident","security"]:["resident","security"];
 async function approveResident(userId:string){
  setApprovingUserId(userId);setError("");setSuccess("");
  const {data,error:invokeError}=await supabase.functions.invoke("resident-approval",{body:{action:"approve",estateId:selectedEstate,userId}});
  if(invokeError||data?.error){
   setError(data?.error==="resident_already_approved"?"This resident has already been approved. Refresh the list.":"The resident account could not be approved. Please try again.");
   setApprovingUserId(null);return;
  }
  setSuccess(data?.emailSent===true?"Resident account approved. The activation email has been sent.":"Resident account approved and activated, but the activation email could not be sent. Check email delivery configuration.");
  await load();setApprovingUserId(null);
 }
 async function reviewVenueRequest(event:{id:string;venue_approval_publish_requested:boolean},decision:"approved"|"rejected"){
  setError("");setSuccess("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");return;}
  const {data,error}=await supabase.from("estate_events").update({
   venue_approval_status:decision,venue_approved_by:user.id,venue_approved_at:new Date().toISOString(),
   venue_approval_note:decision==="rejected"?"Rejected by estate management":null,
   status:decision==="approved"&&event.venue_approval_publish_requested?"published":"draft",updated_at:new Date().toISOString()
  }).eq("id",event.id).eq("estate_id",selectedEstate).eq("venue_approval_status","pending").select("id").maybeSingle();
  if(error||!data){setError("The venue request could not be updated. Refresh and try again.");return;}
  setSuccess(decision==="approved"?"Venue approved. The event can now be published or used for invitations.":"Venue request rejected. The event remains a draft.");
  await load();
 }
 async function editResidentAddress(membership:Membership){
  if(membership.membership_role!=="resident"){setError("Only resident home details can be edited here.");return;}
  const homeNumber=window.prompt("Home number / apartment",membership.users?.home_number||"");
  if(homeNumber===null)return;
  const streetName=window.prompt("Street name",membership.users?.street_name||"");
  if(streetName===null)return;
  if(homeNumber.trim().length<1||homeNumber.trim().length>80||streetName.trim().length<2||streetName.trim().length>160){setError("Enter a valid home number and street name.");return;}
  setError("");setSuccess("");
  const {data,error}=await supabase.from("users").update({home_number:homeNumber.trim(),street_name:streetName.trim()}).eq("id",membership.user_id).select("id").maybeSingle();
  if(error||!data){setError("Resident home details could not be updated. Confirm your management access and try again.");return;}
  setSuccess("Resident home number and street name updated.");
  await load();
 }
 async function updateUserPassword(membership:Membership){
  const nextPassword=window.prompt("Enter the new password for this user (8–128 characters).");
  if(nextPassword===null)return;
  if(nextPassword.length<8||nextPassword.length>128){setError("Password must be between 8 and 128 characters.");return;}
  setError("");setSuccess("");setSendingPasswordUserId(membership.user_id);
  const {data,error:invokeError}=await supabase.functions.invoke("update-estate-user-password",{
   body:{estateId:membership.estate_id,userId:membership.user_id,password:nextPassword}
  });
  if(invokeError||data?.error){
   let message="Password could not be updated. Please try again.";
   
   setError(message);setSendingPasswordUserId(null);return;
  }
  try{
   await navigator.clipboard.writeText(nextPassword);
   setSuccess("Password updated successfully. The new password has been copied to your clipboard. Share it securely with the user.");
  }catch{
   setSuccess("Password updated successfully. Copy the new password from the value you entered and share it securely with the user.");
  }
  setSendingPasswordUserId(null);
 }
 async function createUser(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");setSuccess("");
  const payload:Record<string,string>={estateId:selectedEstate,fullName:fullName.trim(),email:email.trim().toLowerCase(),password,role};
  if(role==="resident"){payload.buildingName=buildingName.trim();payload.unitCode=unitCode.trim();if(unitType.trim())payload.unitType=unitType.trim();}
  const {data,error:invokeError}=await supabase.functions.invoke("onboard-account",{body:payload});
  if(invokeError){
   let message="The account could not be created. Please check the details and try again.";
   
   setError(message);setSaving(false);return;
  }
  if(data?.error){setError("The account could not be created. Please check the details and try again.");setSaving(false);return;}
  setInviteCredentials({email:email.trim().toLowerCase(),password});
  setSuccess("Account created successfully. No email was sent. Copy the initial password below and share it securely with the user.");
  setFullName("");setEmail("");setPassword("");setBuildingName("");setUnitCode("");setUnitType("");setShowForm(false);
  await load();setSaving(false);
 }
 return <PortalFrame title="User Management" description="Create accounts, assign roles and manage access within your estate.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Estate users</h3><p>{isAdmin?"Manage users across all estates. Facility Managers can manage users only in their assigned estate.":"Manage residents and security personnel in your assigned estate."}</p></div><button className="primary-action" onClick={()=>{setShowForm(v=>!v);setError("");setSuccess("");setInviteCredentials(null);}}>{showForm?"Close":"＋ Add user"}</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   {success&&<div className="user-alert user-alert-success" role="status">
    <strong>Account created successfully</strong><p>{success}</p>
    {inviteCredentials&&<div style={{display:"grid",gap:10,marginTop:12}}>
     <div><span className="optional-label">USER EMAIL</span><div style={{fontWeight:800,overflowWrap:"anywhere"}}>{inviteCredentials.email}</div><button type="button" className="secondary-action" style={{marginTop:6}} onClick={()=>void navigator.clipboard.writeText(inviteCredentials.email)}>Copy email</button></div>
     <div><span className="optional-label">INITIAL PASSWORD</span><div style={{fontWeight:800,overflowWrap:"anywhere",fontFamily:"monospace"}}>{inviteCredentials.password}</div><button type="button" className="secondary-action" style={{marginTop:6}} onClick={()=>void navigator.clipboard.writeText(inviteCredentials.password)}>Copy password</button></div>
     <small>No email was sent. Keep this password private and share it with the user through a secure channel.</small>
     <button type="button" className="secondary-action" onClick={()=>{setInviteCredentials(null);setSuccess("");}}>Hide credentials</button>
    </div>}
   </div>}
   <section style={{marginTop:18}}>
    <div className="module-toolbar"><div><h3>Pending venue approvals</h3><p>Estate facilities selected by residents remain pending until management approves them. Home events are auto-approved.</p></div><span className="status-pill status-invited">{pendingVenueEvents.length} awaiting approval</span></div>
    <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Event</th><th>Venue</th><th>Event date</th><th>Requested</th><th>Action</th></tr></thead><tbody>
     {loading?<tr><td colSpan={5} className="empty-cell">Loading venue requests…</td></tr>:pendingVenueEvents.length?pendingVenueEvents.map(event=><tr key={event.id}><td><strong>{event.title}</strong><small>{event.venue_approval_publish_requested?"Requested to publish":"Draft event"}</small></td><td>{event.venue}</td><td>{new Date(event.starts_at).toLocaleString("en-NG")}</td><td>{new Date(event.created_at).toLocaleDateString("en-NG")}</td><td style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" className="primary-action" onClick={()=>void reviewVenueRequest(event,"approved")}>Approve</button><button type="button" className="secondary-action" onClick={()=>void reviewVenueRequest(event,"rejected")}>Reject</button></td></tr>):<tr><td colSpan={5} className="empty-cell"><strong>No pending venue approvals</strong><small>Resident requests for estate facilities will appear here.</small></td></tr>}
    </tbody></table></div>
   </section>
   <section style={{marginTop:18}}>
    <div className="module-toolbar"><div><h3>Pending resident approvals</h3><p>Review new resident registrations and activate accounts with one click.</p></div><span className="status-pill status-invited">{pendingResidents.length} awaiting approval</span></div>
    <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Resident</th><th>Email</th><th>Phone</th><th>Home / Apartment</th><th>Street</th><th>Submitted</th><th>Action</th></tr></thead><tbody>
     {loading?<tr><td colSpan={7} className="empty-cell">Loading pending registrations…</td></tr>:pendingResidents.length?pendingResidents.map(person=><tr key={person.membershipId}><td><strong>{person.name}</strong></td><td>{person.email||"—"}</td><td>{person.phone||"—"}</td><td>{person.homeNumber||"—"}</td><td>{person.streetName||"—"}</td><td>{new Date(person.submittedAt).toLocaleDateString("en-NG")}</td><td><button type="button" className="primary-action" disabled={approvingUserId===person.userId} onClick={()=>void approveResident(person.userId)}>{approvingUserId===person.userId?"Approving…":"Approve account"}</button></td></tr>):<tr><td colSpan={7} className="empty-cell"><strong>No pending resident registrations</strong><small>New self-registered residents will appear here.</small></td></tr>}
    </tbody></table></div>
   </section>
   {showForm&&<form className="user-form" onSubmit={createUser}>
    <div className="user-form-heading"><strong>Create a new user</strong><span>Create the account and set its initial password. No email will be sent automatically.</span></div>
    <div className="user-form-grid">
     <label>Full name<input required minLength={2} maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Enter full name"/></label>
     <label>Email address<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
     <label>Initial password<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a password (8+ characters)"/><span className="optional-label">Copy the password after account creation and share it securely.</span></label>
     <label>Estate<select required value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)}>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <label>Role<select value={role} onChange={e=>setRole(e.target.value as Role)}>{allowedRoles.map(x=><option key={x} value={x}>{roleLabels[x]}</option>)}</select></label>
     {role==="resident"&&<><label>Building name<input required value={buildingName} onChange={e=>setBuildingName(e.target.value)} placeholder="e.g. Block A"/></label><label>Apartment / unit number<input required value={unitCode} onChange={e=>setUnitCode(e.target.value)} placeholder="e.g. A-04"/></label><label>Apartment type <span className="optional-label">Optional</span><input value={unitType} onChange={e=>setUnitType(e.target.value)} placeholder="e.g. 3-bedroom"/></label></>}
    </div>
    <div className="user-form-actions"><button type="button" className="secondary-action" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="primary-action" disabled={saving||!selectedEstate}>{saving?"Creating account…":"Create account"}</button></div>
   </form>}
   <div className="user-list-toolbar"><select aria-label="Filter by estate" value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)}><option value="">All estates</option>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, role or phone…" aria-label="Search users"/></div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Name</th><th>Role</th><th>Estate</th><th>Unit details</th><th>Phone</th><th>Status</th><th>Date added</th><th>Actions</th></tr></thead><tbody>
    {loading?<tr><td colSpan={8} className="empty-cell">Loading estate users…</td></tr>:visible.length?visible.map(m=><tr key={m.id}><td><strong>{m.users?.full_name||"Unnamed user"}</strong></td><td>{roleLabels[m.membership_role]||m.membership_role}</td><td>{estates.find(x=>x.id===m.estate_id)?.name||"—"}</td><td>{[m.users?.home_number,m.users?.street_name].filter(Boolean).join(" · ")||"—"}</td><td>{m.users?.phone_e164||"—"}</td><td><span className={"status-pill status-"+m.status}>{m.status}</span></td><td>{new Date(m.created_at).toLocaleDateString()}</td><td style={{display:"flex",gap:8,flexWrap:"wrap"}}>{m.membership_role==="resident"&&<button type="button" className="secondary-action" onClick={()=>void editResidentAddress(m)}>Edit unit details</button>}<button type="button" className="secondary-action" disabled={sendingPasswordUserId===m.user_id} onClick={()=>void updateUserPassword(m)}>{sendingPasswordUserId===m.user_id?"Updating…":"Update password"}</button><a className="secondary-action" href={`/welcome-email?userId=${encodeURIComponent(m.user_id)}&estateId=${encodeURIComponent(m.estate_id)}`}>Send welcome email</a></td></tr>):<tr><td colSpan={8} className="empty-cell"><span className="empty-mark">♙</span><strong>No estate users found</strong><small>Users will appear here once their accounts are created.</small></td></tr>}
   </tbody></table></div>
  </section>
 </PortalFrame>;
}


type PropertyUnitRow = { id:string; estate_id:string; building_id:string; unit_code:string; unit_type:string|null; status:string };
function PropertiesPage(){
 const [estates,setEstates]=useState<Estate[]>([]);
 const [selected,setSelected]=useState("");
 const [rows,setRows]=useState<Array<{id:string;estate:string;building:string;unit:string;type:string;resident:string;status:string}>>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [search,setSearch]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();if(authError)throw authError;if(!user)throw new Error("Your session has expired. Sign in again.");
   const [{data:globalRoles,error:roleError},{data:ownMemberships,error:membershipError}]=await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id",user.id),
    supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
   ]);
   if(roleError||membershipError)throw new Error("Your property access could not be verified.");
   const admin=(globalRoles||[]).some(x=>x.role==="platform_admin");
   const allowed=admin?[]:(ownMemberships||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id);
   if(!admin&&!allowed.length)throw new Error("You do not have permission to view property records.");
   let estateQuery=supabase.from("estates").select("id,name").order("name");if(!admin)estateQuery=estateQuery.in("id",allowed);
   const {data:estateData,error:estateError}=await estateQuery;if(estateError)throw new Error("Estate records could not be loaded.");
   const estateList=(estateData||[]) as Estate[];setEstates(estateList);const estateIds=estateList.map(x=>x.id);
   if(!estateIds.length){setRows([]);return;}
   const [{data:buildings,error:buildingError},{data:units,error:unitError}]=await Promise.all([
    supabase.from("buildings").select("id,estate_id,name").in("estate_id",estateIds).order("name"),
    supabase.from("units").select("id,estate_id,building_id,unit_code,unit_type,status").in("estate_id",estateIds).order("unit_code")
   ]);
   if(buildingError||unitError)throw new Error("Property details could not be loaded. Please refresh and try again.");
   const unitRows=(units||[]) as PropertyUnitRow[];const unitIds=unitRows.map(x=>x.id);
   let assignments:Array<{unit_id:string;resident_user_id:string}>=[];
   if(unitIds.length){const {data,error}=await supabase.from("resident_units").select("unit_id,resident_user_id").in("unit_id",unitIds).is("end_date",null);if(error)throw new Error("Resident-to-property assignments could not be loaded.");assignments=data||[];}
   const residentIds=[...new Set(assignments.map(x=>x.resident_user_id))];
   const {data:profiles,error:profileError}=residentIds.length?await supabase.from("users").select("id,full_name").in("id",residentIds):{data:[],error:null};
   if(profileError)throw new Error("Resident names could not be loaded for property assignments.");
   const buildingMap=new Map((buildings||[]).map(x=>[x.id,x.name]));
   const estateMap=new Map(estateList.map(x=>[x.id,x.name]));
   const profileMap=new Map((profiles||[]).map(x=>[x.id,x.full_name]));
   const residentByUnit=new Map(assignments.map(x=>[x.unit_id,profileMap.get(x.resident_user_id)||"Resident name unavailable"]));
   setRows(unitRows.map(unit=>({id:unit.id,estate:estateMap.get(unit.estate_id)||"Estate unavailable",building:buildingMap.get(unit.building_id)||"Building unavailable",unit:unit.unit_code,type:unit.unit_type||"Not specified",resident:residentByUnit.get(unit.id)||"Unassigned",status:unit.status||"Unknown"})));
  }catch(e){setRows([]);setError("Property records could not be loaded. Please refresh and try again.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const visible=rows.filter(x=>(!selected||estates.find(e=>e.id===selected)?.name===x.estate)&&(!search||[x.estate,x.building,x.unit,x.type,x.resident,x.status].join(" ").toLowerCase().includes(search.toLowerCase())));
 return <PortalFrame title="Properties" description="Live buildings, units and resident assignments across your authorized estates.">
  <section className="panel module-panel"><div className="module-toolbar"><div><h3>Property register</h3><p>Live estate buildings, property units and resident assignments.</p></div><button className="secondary-action" onClick={()=>void load()}>Refresh records</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   <div className="user-list-toolbar"><select aria-label="Filter by estate" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All estates</option>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search estate, building, unit or resident…" aria-label="Search properties"/></div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Estate</th><th>Building</th><th>Unit / Property</th><th>Property type</th><th>Assigned resident</th><th>Status</th></tr></thead><tbody>
    {loading?<tr><td colSpan={6} className="empty-cell">Loading live property records…</td></tr>:visible.length?visible.map(x=><tr key={x.id}><td>{x.estate}</td><td><strong>{x.building}</strong></td><td>{x.unit}</td><td>{x.type}</td><td>{x.resident}</td><td><span className={"status-pill status-"+x.status.toLowerCase().replace(/[^a-z0-9]+/g,"-")}>{x.status}</span></td></tr>):<tr><td colSpan={6} className="empty-cell"><strong>No property units found</strong><small>{estates.length?"No building or unit records match this estate and search.":"No estates are assigned to this account."}</small></td></tr>}
   </tbody></table></div><p className="notice-line">Read-only property register. This view does not create, edit or delete buildings, units or resident assignments.</p>
  </section>
 </PortalFrame>;
}

type ManagementPayment = {
 id:string; estateId:string; type:string; resident:string; estate:string; amount:number; currency:string;
 status:string; reference:string|null; createdAt:string; description:string;
};
function ManagementPaymentsPage(){
 const [rows,setRows]=useState<ManagementPayment[]>([]);
 const [estates,setEstates]=useState<Estate[]>([]);
 const [selectedEstate,setSelectedEstate]=useState("");
 const [status,setStatus]=useState("all");
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setRows([]);setError("Your session has expired. Please sign in again.");setLoading(false);return;}
  const [{data:roles,error:roleError},{data:members,error:memberError}]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",user.id),
   supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
  ]);
  if(roleError||memberError){setRows([]);setError("Payment records could not be loaded. Please refresh and try again.");setLoading(false);return;}
  const admin=(roles||[]).some(x=>x.role==="platform_admin");
  const allowed=admin?[]:(members||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id);
  if(!admin&&!allowed.length){setRows([]);setError("You do not have permission to view these payment records.");setLoading(false);return;}
  const estateQuery=supabase.from("estates").select("id,name").order("name");
  const {data:estateRows,error:estateError}=admin?await estateQuery:await estateQuery.in("id",allowed);
  if(estateError){setRows([]);setError("Estate details could not be loaded. Please refresh and try again.");setLoading(false);return;}
  const estateList=(estateRows||[]) as Estate[];
  setEstates(estateList);
  const estateIds=estateList.map(x=>x.id);
  if(!estateIds.length){setRows([]);setLoading(false);return;}
  const [charges,savings,electricity]=await Promise.all([
   supabase.from("service_charge_payments").select("id,estate_id,resident_user_id,charge_id,amount_kobo,currency,status,provider_reference,verified_at,created_at").in("estate_id",estateIds).order("created_at",{ascending:false}).limit(200),
   supabase.from("rent_savings_contributions").select("id,estate_id,resident_user_id,amount_kobo,currency,status,provider_reference,verified_at,created_at").in("estate_id",estateIds).order("created_at",{ascending:false}).limit(200),
   supabase.from("electricity_recharge_orders").select("id,estate_id,resident_user_id,amount_kobo,currency,status,units_purchased,verified_at,created_at").in("estate_id",estateIds).order("created_at",{ascending:false}).limit(200)
  ]);
  if(charges.error||savings.error||electricity.error){setRows([]);setError("Payment records could not be loaded. Please refresh and try again.");setLoading(false);return;}
  const residentIds=[...new Set([...(charges.data||[]).map(x=>x.resident_user_id),...(savings.data||[]).map(x=>x.resident_user_id),...(electricity.data||[]).map(x=>x.resident_user_id)])];
  const chargeIds=[...new Set((charges.data||[]).map(x=>x.charge_id).filter(Boolean))];
  const [{data:profiles},{data:chargeNames}]=await Promise.all([
   residentIds.length?supabase.from("users").select("id,full_name").in("id",residentIds):Promise.resolve({data:[],error:null}),
   chargeIds.length?supabase.from("estate_service_charges").select("id,title").in("id",chargeIds):Promise.resolve({data:[],error:null})
  ]);
  const names=new Map((profiles||[]).map(x=>[x.id,x.full_name||"Resident"]));
  const estateNames=new Map(estateList.map(x=>[x.id,x.name]));
  const titles=new Map((chargeNames||[]).map(x=>[x.id,x.title]));
  const statusName=(value:string,verifiedAt:string|null)=>{
   if(value==="successful"&&verifiedAt)return "Successful";
   if(value==="successful"||value==="pending")return "Pending";
   if(value==="failed")return "Failed";
   if(value==="reversed")return "Reversed";
   return "Processing";
  };
  const chargeRows=(charges.data||[]).map(x=>({id:"charge-"+x.id,estateId:x.estate_id,type:"Service charge",resident:names.get(x.resident_user_id)||"Resident",estate:estateNames.get(x.estate_id)||"Estate",amount:Number(x.amount_kobo),currency:x.currency||"NGN",status:statusName(x.status,x.verified_at),reference:x.provider_reference,createdAt:x.verified_at||x.created_at,description:titles.get(x.charge_id)||"Service charge"}));
  const savingsRows=(savings.data||[]).map(x=>({id:"savings-"+x.id,estateId:x.estate_id,type:"Rent savings",resident:names.get(x.resident_user_id)||"Resident",estate:estateNames.get(x.estate_id)||"Estate",amount:Number(x.amount_kobo),currency:x.currency||"NGN",status:statusName(x.status,x.verified_at),reference:x.provider_reference,createdAt:x.verified_at||x.created_at,description:"Rent savings contribution"}));
  const electricityRows=(electricity.data||[]).map(x=>({id:"electricity-"+x.id,estateId:x.estate_id,type:"Electricity",resident:names.get(x.resident_user_id)||"Resident",estate:estateNames.get(x.estate_id)||"Estate",amount:Number(x.amount_kobo),currency:x.currency||"NGN",status:statusName(x.status,x.verified_at),reference:null,createdAt:x.verified_at||x.created_at,description:"Electricity purchase"+(x.units_purchased?" · "+x.units_purchased+" units":"")}));
  setRows([...chargeRows,...savingsRows,...electricityRows].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()));
  setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const visible=rows.filter(row=>(!selectedEstate||selectedEstate===row.estateId)&&(status==="all"||row.status.toLowerCase()===status)&&(!search||[row.resident,row.estate,row.type,row.description,row.reference].join(" ").toLowerCase().includes(search.toLowerCase())));
 const money=(amount:number,currency:string)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:currency||"NGN",maximumFractionDigits:2}).format(amount/100);
 return <PortalFrame title="Payments" description="Review service charge, rent savings and electricity transactions across your authorised estates.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Payment history</h3><p>Recent transactions and their current payment status.</p></div><button className="secondary-action" onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh records"}</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   <div className="user-list-toolbar">
    <select aria-label="Filter by estate" value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)}><option value="">All estates</option>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <select aria-label="Filter by payment status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="successful">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="reversed">Reversed</option></select>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resident, estate or reference…" aria-label="Search payment records"/>
   </div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Transaction</th><th>Resident</th><th>Estate</th><th>Amount</th><th>Date</th><th>Status</th><th>Reference</th></tr></thead><tbody>
    {loading?<tr><td colSpan={7} className="empty-cell">Loading payment history…</td></tr>:visible.length?visible.map(row=><tr key={row.id}><td><strong>{row.description}</strong><small>{row.type}</small></td><td>{row.resident}</td><td>{row.estate}</td><td>{money(row.amount,row.currency)}</td><td>{new Date(row.createdAt).toLocaleString("en-NG")}</td><td><span className={"status-pill status-"+row.status.toLowerCase()}>{row.status}</span></td><td>{row.reference||"—"}</td></tr>):<tr><td colSpan={7} className="empty-cell"><strong>No payment records found</strong><small>Matching transactions will appear here when available.</small></td></tr>}
   </tbody></table></div>
   <p className="notice-line">A transaction is shown as successful only after it has been confirmed.</p>
  </section>
 </PortalFrame>;
}

type ResidentDirectoryRow = { id:string; user_id:string; estate_id:string; status:string; created_at:string; membership_role:string };
type ResidentActivityRow = { id:string; title:string; status:string; date:string; detail:string };
type ResidentActivity = {
 visitorPasses:ResidentActivityRow[]; visitorVisits:ResidentActivityRow[];
 maintenance:ResidentActivityRow[]; savingsGoals:ResidentActivityRow[];
 savingsContributions:ResidentActivityRow[]; electricityOrders:ResidentActivityRow[];
 electricityMeters:ResidentActivityRow[]; serviceChargePayments:ResidentActivityRow[];
};
function ResidentsPage(){
 const [rows,setRows]=useState<Array<{id:string;userId:string;estateId:string;name:string;email:string;phone:string;estate:string;unit:string;status:string;joined:string}>>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [search,setSearch]=useState("");const [estates,setEstates]=useState<Estate[]>([]);const [selected,setSelected]=useState("");
 const [selectedResident,setSelectedResident]=useState<{userId:string;estateId:string;name:string;estate:string;unit:string}|null>(null);
 const [activity,setActivity]=useState<ResidentActivity|null>(null);const [activityLoading,setActivityLoading]=useState(false);const [activityWarnings,setActivityWarnings]=useState<string[]>([]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();if(!user){setError("Your session has expired. Sign in again.");setLoading(false);return;}
  const [{data:globalRoles,error:roleError},{data:ownMemberships,error:ownError}]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",user.id),
   supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
  ]);
  if(roleError||ownError){setError("Unable to verify access to resident records.");setLoading(false);return;}
  const admin=(globalRoles||[]).some(x=>x.role==="platform_admin");
  const allowed=admin?[]:(ownMemberships||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id);
  if(!admin&&!allowed.length){setError("You do not have permission to view resident records.");setLoading(false);return;}
  let estateQuery=supabase.from("estates").select("id,name").order("name");
  if(!admin)estateQuery=estateQuery.in("id",allowed);
  const {data:estateRows,error:estateError}=await estateQuery;
  if(estateError){setError("Unable to load estate records.");setLoading(false);return;}
  const estateList=(estateRows||[]) as Estate[];setEstates(estateList);
  const estateIds=estateList.map(x=>x.id);
  if(!estateIds.length){setRows([]);setLoading(false);return;}
  const {data:members,error:memberError}=await supabase.from("estate_memberships").select("id,user_id,estate_id,status,created_at,membership_role").in("estate_id",estateIds).eq("membership_role","resident").order("created_at",{ascending:false});
  if(memberError){setError("Resident records could not be loaded. Please refresh and try again.");setLoading(false);return;}
  const ids=[...new Set((members||[]).map(x=>x.user_id))];
  const [{data:profiles,error:profileError},{data:units,error:unitError}]=await Promise.all([
   ids.length?supabase.from("users").select("id,full_name,phone_e164,home_number,street_name").in("id",ids):Promise.resolve({data:[],error:null}),
   supabase.from("units").select("id,estate_id,unit_code,building_id").in("estate_id",estateIds)
  ]);
  if(profileError||unitError){setError("Resident profile or property details could not be loaded.");setLoading(false);return;}
  const profileMap=new Map((profiles||[]).map(x=>[x.id,x]));
  const unitMap=new Map((units||[]).map(x=>[x.id,x]));
  const {data:assignments,error:assignmentError}=ids.length?await supabase.from("resident_units").select("resident_user_id,unit_id").in("resident_user_id",ids).is("end_date",null):{data:[],error:null};
  if(assignmentError){setError("Resident property assignments could not be loaded.");setLoading(false);return;}
  const assignmentMap=new Map((assignments||[]).map(x=>[x.resident_user_id,x.unit_id]));
  const next=(members||[]).map((m:ResidentDirectoryRow)=>{
   const profile=profileMap.get(m.user_id);const unitId=assignmentMap.get(m.user_id);const unit=unitId?unitMap.get(unitId):null;
   return {id:m.id,userId:m.user_id,estateId:m.estate_id,name:profile?.full_name||"Name unavailable",email:"Email is private",phone:profile?.phone_e164||"—",estate:estateList.find(x=>x.id===m.estate_id)?.name||"—",unit:[profile?.home_number,profile?.street_name].filter(Boolean).join(" · ")||unit?.unit_code||"Not assigned",status:m.status,joined:new Date(m.created_at).toLocaleDateString("en-NG")};
  });
  setRows(next);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const visible=rows.filter(x=>{const q=search.toLowerCase();return (!selected||x.estateId===selected)&&(!q||[x.name,x.phone,x.estate,x.unit,x.status].join(" ").toLowerCase().includes(q));});
 const loadActivity=async(resident:{userId:string;estateId:string;name:string;estate:string;unit:string})=>{
  setSelectedResident(resident);setActivity(null);setActivityWarnings([]);setActivityLoading(true);
  const [passes,maintenance,goals,contributions,electricity,meters,charges]=await Promise.all([
   supabase.from("visitor_passes").select("id,visitor_name,status,created_at,valid_from,valid_until").eq("host_user_id",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(50),
   supabase.from("maintenance_requests").select("id,title,status,priority,created_at").eq("created_by",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(50),
   supabase.from("rent_savings_goals").select("id,name,status,target_amount_kobo,target_date,created_at").eq("resident_user_id",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(50),
   supabase.from("rent_savings_contributions").select("id,amount_kobo,status,verified_at,created_at").eq("resident_user_id",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(100),
   supabase.from("electricity_recharge_orders").select("id,amount_kobo,status,units_purchased,verified_at,created_at").eq("resident_user_id",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(100),
   supabase.from("resident_electricity_meters").select("id,meter_number,disco,meter_type,label,created_at").eq("resident_user_id",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(30),
   supabase.from("service_charge_payments").select("id,amount_kobo,status,verified_at,created_at").eq("resident_user_id",resident.userId).eq("estate_id",resident.estateId).order("created_at",{ascending:false}).limit(100)
  ]);
  const warnings:string[]=[];
  const sources=[passes,maintenance,goals,contributions,electricity,meters,charges];
  const labels=["Visitor passes","Maintenance requests","Rent savings goals","Rent savings contributions","Electricity purchases","Electricity meters","Service charge payments"];
  sources.forEach((result,index)=>{if(result.error)warnings.push(labels[index]+" could not be loaded. Refresh to try again.");});
  const passRows=passes.data||[];
  let visitRows:Array<{id:string;visitor_pass_id:string;checked_in_at:string|null;checked_out_at:string|null}>=[];
  if(passRows.length){
   const visits=await supabase.from("visitor_visits").select("id,visitor_pass_id,checked_in_at,checked_out_at").eq("estate_id",resident.estateId).in("visitor_pass_id",passRows.map(x=>x.id)).order("checked_in_at",{ascending:false}).limit(100);
   if(visits.error)warnings.push("Visitor check-in history could not be loaded. Refresh to try again.");
   else visitRows=visits.data||[];
  }
  const date=(value:string|null)=>value?new Date(value).toLocaleString("en-NG"):"—";
  const money=(value:number|null)=>value===null?"Amount unavailable":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(value/100);
  setActivity({
   visitorPasses:passRows.map(x=>({id:x.id,title:x.visitor_name||"Visitor pass",status:x.status||"unknown",date:date(x.created_at),detail:"Valid "+date(x.valid_from)+" – "+date(x.valid_until)})),
   visitorVisits:visitRows.map(x=>({id:x.id,title:"Visitor check-in",status:x.checked_out_at?"Checked out":"Checked in",date:date(x.checked_in_at),detail:x.checked_out_at?"Checked out "+date(x.checked_out_at):"Visitor currently checked in"})),
   maintenance:(maintenance.data||[]).map(x=>({id:x.id,title:x.title||"Maintenance request",status:x.status||"unknown",date:date(x.created_at),detail:"Priority: "+(x.priority||"Not specified")})),
   savingsGoals:(goals.data||[]).map(x=>({id:x.id,title:x.name||"Rent savings goal",status:String(x.status||"unknown"),date:date(x.created_at),detail:money(x.target_amount_kobo)+" target • due "+(x.target_date||"Not set")})),
   savingsContributions:(contributions.data||[]).map(x=>({id:x.id,title:"Rent savings contribution",status:x.status||"unknown",date:date(x.created_at),detail:money(x.amount_kobo)+(x.verified_at?" • confirmed "+date(x.verified_at):"")})),
   electricityOrders:(electricity.data||[]).map(x=>({id:x.id,title:"Electricity purchase",status:x.status||"unknown",date:date(x.created_at),detail:money(x.amount_kobo)+" • "+(x.units_purchased??"Units unavailable")+" units"})),
   electricityMeters:(meters.data||[]).map(x=>({id:x.id,title:x.label||x.meter_number,status:x.meter_type||"Meter",date:date(x.created_at),detail:(x.disco||"Disco unavailable")+" • "+x.meter_number})),
   serviceChargePayments:(charges.data||[]).map(x=>({id:x.id,title:"Service charge payment",status:x.status||"unknown",date:date(x.created_at),detail:money(x.amount_kobo)+(x.verified_at?" • confirmed "+date(x.verified_at):"")}))
  });
  setActivityWarnings(warnings);setActivityLoading(false);
 };
 const activitySections: {key:keyof ResidentActivity;title:string}[]=[
  {key:"visitorPasses",title:"Visitor passes created"},{key:"visitorVisits",title:"Visitor check-in history"},
  {key:"maintenance",title:"Maintenance requests"},{key:"savingsGoals",title:"Rent savings goals"},
  {key:"savingsContributions",title:"Verified / pending savings contributions"},{key:"electricityOrders",title:"Electricity purchase history"},
  {key:"electricityMeters",title:"Registered electricity meters"},{key:"serviceChargePayments",title:"Service charge payments"}
 ];
 return <PortalFrame title="Residents" description="Read-only resident directory across the estates you are authorized to oversee.">
  <section className="panel module-panel"><div className="module-toolbar"><div><h3>Resident directory</h3><p>Live resident memberships and assigned property details. This screen does not permit resident-record edits.</p></div><button className="secondary-action" onClick={()=>void load()}>Refresh records</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   <div className="user-list-toolbar"><select aria-label="Filter by estate" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All estates</option>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resident, phone, unit or estate…" aria-label="Search residents"/></div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Resident</th><th>Estate</th><th>Unit</th><th>Phone</th><th>Membership</th><th>Date added</th><th>Activity</th></tr></thead><tbody>
   {loading?<tr><td colSpan={6} className="empty-cell">Loading live resident records…</td></tr>:visible.length?visible.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.estate}</td><td>{x.unit}</td><td>{x.phone}</td><td><span className={"status-pill status-"+x.status}>{x.status}</span></td><td>{x.joined}</td><td><button type="button" className="secondary-action" onClick={()=>void loadActivity({userId:x.userId,estateId:x.estateId,name:x.name,estate:x.estate,unit:x.unit})}>View activity</button></td></tr>):<tr><td colSpan={7} className="empty-cell"><strong>No resident records found</strong><small>There are no matching resident memberships in the estates available to this account.</small></td></tr>}
   </tbody></table></div>
   {selectedResident&&<section className="panel module-panel" style={{marginTop:20}}>
    <div className="module-toolbar"><div><h3>Resident activity — {selectedResident.name}</h3><p>{selectedResident.estate} • {selectedResident.unit}. Records are limited to this resident and estate.</p></div><button type="button" className="secondary-action" onClick={()=>{setSelectedResident(null);setActivity(null);setActivityWarnings([]);}}>Close activity</button></div>
    {activityLoading?<p className="empty-cell">Loading resident activity from live records…</p>:null}
    {activityWarnings.length>0&&<div className="user-alert user-alert-error" role="status"><strong>Some activity sources could not be read.</strong><ul>{activityWarnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></div>}
    {activity&&<div className="user-form-grid">{activitySections.map(section=><div key={section.key} className="panel" style={{padding:14}}>
     <h4>{section.title}</h4>
     {activity[section.key].length?activity[section.key].map(item=><div key={item.id} style={{padding:"10px 0",borderBottom:"1px solid var(--border,#e5e7eb)"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{item.title}</strong><span className={"status-pill status-"+item.status.toLowerCase().replace(/[^a-z0-9]+/g,"-")}>{item.status}</span></div>
      <small>{item.date}</small><p style={{margin:"4px 0 0"}}>{item.detail}</p>
     </div>):<p className="empty-cell">No records found for this resident.</p>}
    </div>)}</div>}
    <p className="notice-line">This activity view is read-only. It does not allow changing resident records, payments, visitor passes, meter details or maintenance requests.</p>
   </section>}
   <p className="notice-line">Read-only oversight. Resident accounts, financial records and personal details cannot be changed from this directory.</p>
  </section>
 </PortalFrame>;
}


type MaintenanceRecord = {
 id:string; estate_id:string; unit_id:string|null; created_by:string;
 title:string; description:string; status:string; priority:string;
 management_response:string|null; responded_by:string|null; responded_at:string|null; resident_reopen_note:string|null; reopened_at:string|null; reopen_count:number;
 created_at:string; updated_at:string;
};
function MaintenancePage(){
 const [rows,setRows]=useState<Array<MaintenanceRecord & {estate:string;unit:string;resident:string}>>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [success,setSuccess]=useState("");
 const [estates,setEstates]=useState<Estate[]>([]);const [selectedEstate,setSelectedEstate]=useState("");
 const [status,setStatus]=useState("all");const [search,setSearch]=useState("");
 const [active,setActive]=useState<MaintenanceRecord & {estate:string;unit:string;resident:string}|null>(null);
 const [response,setResponse]=useState("");const [markFixed,setMarkFixed]=useState(false);const [saving,setSaving]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setLoading(false);return;}
  const [{data:globalRoles,error:roleError},{data:memberships,error:membershipError}]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",user.id),
   supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
  ]);
  if(roleError||membershipError){setError("Your management access could not be verified.");setLoading(false);return;}
  const admin=(globalRoles||[]).some(x=>x.role==="platform_admin");
  const allowedIds=[...new Set((memberships||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id))];
  if(!admin&&!allowedIds.length){setError("You do not have permission to view maintenance requests.");setLoading(false);return;}
  let estateQuery=supabase.from("estates").select("id,name").order("name");if(!admin)estateQuery=estateQuery.in("id",allowedIds);
  const {data:estateRows,error:estateError}=await estateQuery;
  if(estateError){setError("Estate records could not be loaded.");setLoading(false);return;}
  const estateList=(estateRows||[]) as Estate[];setEstates(estateList);const estateIds=estateList.map(x=>x.id);
  if(!estateIds.length){setRows([]);setLoading(false);return;}
  const {data:requests,error:requestError}=await supabase.from("maintenance_requests")
   .select("id,estate_id,unit_id,created_by,title,description,status,priority,management_response,responded_by,responded_at,resident_reopen_note,reopened_at,reopen_count,created_at,updated_at")
   .in("estate_id",estateIds).order("created_at",{ascending:false}).limit(500);
  if(requestError){setError("Maintenance requests could not be loaded. Check permissions and refresh.");setLoading(false);return;}
  const requestRows=(requests||[]) as MaintenanceRecord[];
  const userIds=[...new Set(requestRows.map(x=>x.created_by))];const unitIds=[...new Set(requestRows.map(x=>x.unit_id).filter((x):x is string=>Boolean(x)))];
  const [{data:profiles,error:profileError},{data:units,error:unitError}]=await Promise.all([
   userIds.length?supabase.from("users").select("id,full_name").in("id",userIds):Promise.resolve({data:[],error:null}),
   unitIds.length?supabase.from("units").select("id,unit_code").in("id",unitIds):Promise.resolve({data:[],error:null})
  ]);
  if(profileError||unitError){setError("Resident or property details could not be loaded.");setLoading(false);return;}
  const estateMap=new Map(estateList.map(x=>[x.id,x.name]));const profileMap=new Map((profiles||[]).map(x=>[x.id,x.full_name]));const unitMap=new Map((units||[]).map(x=>[x.id,x.unit_code]));
  const mapped=requestRows.map(x=>({...x,estate:estateMap.get(x.estate_id)||"Estate",unit:x.unit_id?(unitMap.get(x.unit_id)||"Unit details unavailable"):"Not assigned",resident:profileMap.get(x.created_by)||"Resident"}));
  setRows(mapped);setActive(current=>current?mapped.find(x=>x.id===current.id)||null:null);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 const visible=rows.filter(x=>(!selectedEstate||x.estate_id===selectedEstate)&&(status==="all"||x.status===status)&&(!search||[x.title,x.description,x.resident,x.estate,x.unit,x.priority].join(" ").toLowerCase().includes(search.toLowerCase())));
 const counts=rows.reduce((acc,x)=>{acc[x.status]=(acc[x.status]||0)+1;return acc;},{} as Record<string,number>);
 const date=(value:string)=>new Date(value).toLocaleString("en-NG");
 async function openRequest(item:typeof rows[number]){
  setActive(item);setResponse(item.management_response||"");setMarkFixed(item.status==="resolved"||item.status==="closed");setError("");setSuccess("");
  const {data:{user}}=await supabase.auth.getUser();
  if(user) await supabase.from("maintenance_management_notifications").update({read_at:new Date().toISOString()}).eq("request_id",item.id).eq("recipient_user_id",user.id).is("read_at",null);
 }
 async function sendResponse(){
  if(!active||response.trim().length<2){setError("Enter a response to the resident before saving.");return;}
  setSaving(true);setError("");setSuccess("");
  const {error:rpcError}=await supabase.rpc("respond_to_maintenance_request",{p_request_id:active.id,p_response:response.trim(),p_mark_fixed:markFixed});
  if(rpcError){setError(rpcError.message||"Your response could not be sent. Please try again.");setSaving(false);return;}
  setSuccess(markFixed?"The resident has been notified that the maintenance request is fixed.":"Your update has been sent to the resident.");
  await load();setSaving(false);
 }
 return <PortalFrame title="Maintenance" description="Review resident requests, reply to residents and confirm when work is fixed.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Maintenance requests</h3><p>Open a request to send an update or confirm that the issue has been fixed.</p></div><button type="button" className="secondary-action" onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh requests"}</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}{success&&<div className="user-alert user-alert-success" role="status">{success}</div>}
   <div className="user-list-toolbar">
    <select aria-label="Filter by estate" value={selectedEstate} onChange={e=>setSelectedEstate(e.target.value)}><option value="">All authorised estates</option>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <select aria-label="Filter by maintenance status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses ({rows.length})</option>{["open","assigned","in_progress","resolved","closed"].map(x=><option key={x} value={x}>{x.replace("_"," ")} ({counts[x]||0})</option>)}</select>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search request, resident, property or estate…" aria-label="Search maintenance requests"/>
   </div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Request</th><th>Resident</th><th>Estate</th><th>Property / Unit</th><th>Submitted</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>
    {loading?<tr><td colSpan={8} className="empty-cell">Loading maintenance requests…</td></tr>:visible.length?visible.map(x=><tr key={x.id}><td><strong>{x.title}</strong><small style={{display:"block",maxWidth:340,whiteSpace:"normal"}}>{x.description}</small></td><td>{x.resident}</td><td>{x.estate}</td><td>{x.unit}</td><td>{date(x.created_at)}</td><td><span className={"status-pill status-"+x.priority}>{x.priority}</span></td><td><span className={"status-pill status-"+x.status}>{x.status.replace("_"," ")}</span></td><td><button type="button" className="secondary-action" onClick={()=>void openRequest(x)}>Open / reply</button></td></tr>):<tr><td colSpan={8} className="empty-cell"><strong>No maintenance requests found</strong><small>{rows.length?"No requests match the selected filters.":"Resident-submitted requests will appear here when received."}</small></td></tr>}
   </tbody></table></div>
   {active&&<section className="maintenance-reply" aria-label="Reply to maintenance request">
    <div className="module-toolbar"><div><h3>{active.title}</h3><p>{active.resident} · {active.estate} · {active.unit}</p></div><button type="button" className="secondary-action" onClick={()=>setActive(null)}>Close</button></div>
    <div className="maintenance-request-description"><strong>Resident's message</strong><p>{active.description}</p></div>
    {active.resident_reopen_note&&<div className="maintenance-previous-reply"><strong>Resident reopened this request</strong><p>{active.resident_reopen_note}</p>{active.reopened_at&&<small>{date(active.reopened_at)}</small>}</div>}<p className="maintenance-meta"><strong>Priority:</strong> {active.priority} <span>·</span> <strong>Status:</strong> {active.status.replace("_"," ")}</p>
    {active.management_response&&<div className="maintenance-previous-reply"><strong>Previous response</strong><p>{active.management_response}</p>{active.responded_at&&<small>{date(active.responded_at)}</small>}</div>}
    <label className="maintenance-reply-label">Reply to resident<textarea rows={4} maxLength={4000} value={response} onChange={e=>setResponse(e.target.value)} placeholder="Type your update to the resident here…"/></label>
    <label className="maintenance-fixed-option"><input type="checkbox" checked={markFixed} onChange={e=>setMarkFixed(e.target.checked)}/> Mark this request as fixed and notify the resident</label>
    <button type="button" className="primary-action" disabled={saving||response.trim().length<2} onClick={()=>void sendResponse()} style={{marginTop:14}}>{saving?"Sending…":markFixed?"Send reply & mark fixed":"Send update to resident"}</button>
   </section>}
   <p className="notice-line">Only authorised management accounts can respond. Residents receive replies in their notification inbox and on their maintenance request.</p>
  </section>
 </PortalFrame>;
}

export default function SectionPage(){
 const params=useParams<{section:string}>();const section=Array.isArray(params.section)?params.section[0]:params.section;
 if(section==="users")return <UsersPage/>;
 if(section==="payments")return <ManagementPaymentsPage/>;
 if(section==="maintenance")return <MaintenancePage/>;
 if(section==="venues")return <VenueCapacityPage/>;
 if(section==="residents")return <ResidentsPage/>;
 if(section==="settings")return <SettingsPage/>;
 if(section==="profile")return <ProfilePage/>;
 if(section==="estates")return <EstatesPage/>;
 if(section==="properties")return <PropertiesPage/>;
  if(section==="service-charges")return <ServiceChargesPage/>;
 if(section==="legal-documents")return <LegalDocumentsPage/>;
 if(section==="system-logs")return <AuditLogsPage/>;
 if(section==="alerts")return <AdminAlertsPage/>;
 const item=config[section]||{title:"Page not found",description:"This section is not available.",columns:[],intro:"The requested section could not be found."};
 return <PortalFrame title={item.title} description={item.description}><section className="panel module-panel"><div className="module-toolbar"><div><h3>{item.title} overview</h3><p>{item.intro}</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr>{item.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody><tr><td colSpan={Math.max(item.columns.length,1)} className="empty-cell"><span className="empty-mark">▤</span><strong>No records to display</strong><small>This section is being prepared. Please check back later.</small></td></tr></tbody></table></div></section></PortalFrame>;
}
