"use client";

import { useCallback, useEffect, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type Estate = { id: string; name: string };
type VenueRequest = {
 id: string; title: string; venue: string; starts_at: string; created_at: string;
 venue_approval_publish_requested: boolean; venue_approval_requested_at: string | null;
};

export default function VenueRequestsPage() {
 const [estates,setEstates]=useState<Estate[]>([]);
 const [estateId,setEstateId]=useState("");
 const [requests,setRequests]=useState<VenueRequest[]>([]);
 const [loading,setLoading]=useState(true);
 const [savingId,setSavingId]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setLoading(false);return;}
  const [{data:roles,error:roleError},{data:members,error:memberError}]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",user.id),
   supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
  ]);
  if(roleError||memberError){setError("Your estate permissions could not be verified.");setLoading(false);return;}
  const admin=(roles||[]).some(x=>x.role==="platform_admin");
  const allowed=[...new Set((members||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id))];
  if(!admin&&!allowed.length){setError("You do not have permission to review venue requests.");setLoading(false);return;}
  let estateQuery=supabase.from("estates").select("id,name").eq("is_enabled",true).order("name");
  if(!admin)estateQuery=estateQuery.in("id",allowed);
  const {data:estateRows,error:estateError}=await estateQuery;
  if(estateError){setError("Estate list could not be loaded.");setLoading(false);return;}
  const list=(estateRows||[]) as Estate[];
  setEstates(list);
  const activeEstate=list.some(x=>x.id===estateId)?estateId:(list[0]?.id||"");
  if(activeEstate!==estateId)setEstateId(activeEstate);
  if(!activeEstate){setRequests([]);setLoading(false);return;}
  const {data,error:requestError}=await supabase.from("estate_events")
   .select("id,title,venue,starts_at,created_at,venue_approval_publish_requested,venue_approval_requested_at")
   .eq("estate_id",activeEstate).eq("venue_approval_status","pending")
   .order("venue_approval_requested_at",{ascending:true}).limit(200);
  if(requestError){setRequests([]);setError("Venue requests could not be loaded. Please refresh.");}
  else setRequests((data||[]) as VenueRequest[]);
  setLoading(false);
 },[estateId]);

 useEffect(()=>{void load();},[load]);

 async function review(request:VenueRequest,decision:"approved"|"rejected"){
  let note:string|null=null;
  if(decision==="rejected"){
   const entered=window.prompt("Reason for rejecting this venue request (required, up to 500 characters).");
   if(entered===null)return;
   note=entered.trim();
   if(!note){setError("Enter a reason before rejecting this request.");return;}
   if(note.length>500){setError("The rejection reason must be 500 characters or fewer.");return;}
  }else if(!window.confirm("Approve the venue request for "+request.title+"?"))return;
  setSavingId(request.id);setError("");setSuccess("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setSavingId(null);return;}
  const {data,error:updateError}=await supabase.from("estate_events").update({
   venue_approval_status:decision,venue_approved_by:user.id,venue_approved_at:new Date().toISOString(),
   venue_approval_note:note,
   status:decision==="approved"&&request.venue_approval_publish_requested?"published":"draft",
   updated_at:new Date().toISOString()
  }).eq("id",request.id).eq("estate_id",estateId).eq("venue_approval_status","pending").select("id").maybeSingle();
  if(updateError||!data){setError("The request could not be updated. It may already have been reviewed; refresh and try again.");setSavingId(null);return;}
  setSuccess(decision==="approved"?"Venue request approved.": "Venue request rejected and the reason recorded.");
  await load();setSavingId(null);
 }

 return <PortalFrame title="Venue Requests" description="Review and decide on resident requests to use estate venues.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Pending venue requests</h3><p>Check the requested venue and event date before approving. Rejections require a reason.</p></div><span className="status-pill status-invited">{requests.length} pending</span></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   {success&&<div className="user-alert user-alert-success" role="status">{success}</div>}
   <div className="user-list-toolbar">
    <label style={{display:"grid",gap:5}}>Estate<select aria-label="Select estate" value={estateId} onChange={e=>setEstateId(e.target.value)}>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <button type="button" className="secondary-action" disabled={loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh requests"}</button>
   </div>
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Event</th><th>Requested venue</th><th>Event date</th><th>Request date</th><th>Requested action</th><th>Decision</th></tr></thead><tbody>
    {loading?<tr><td colSpan={6} className="empty-cell">Loading venue requests…</td></tr>:requests.length?requests.map(request=><tr key={request.id}>
     <td><strong>{request.title||"Untitled event"}</strong></td>
     <td>{request.venue||"Venue not specified"}</td>
     <td>{request.starts_at?new Date(request.starts_at).toLocaleString("en-NG"):"—"}</td>
     <td>{new Date(request.venue_approval_requested_at||request.created_at).toLocaleString("en-NG")}</td>
     <td>{request.venue_approval_publish_requested?"Approve venue and publish":"Venue approval only"}</td>
     <td><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" className="primary-action" disabled={savingId===request.id} onClick={()=>void review(request,"approved")}>{savingId===request.id?"Saving…":"Approve"}</button><button type="button" className="secondary-action" disabled={savingId===request.id} onClick={()=>void review(request,"rejected")}>Reject</button></div></td>
    </tr>):<tr><td colSpan={6} className="empty-cell"><strong>No pending venue requests</strong><small>New resident requests for estate venues will appear here.</small></td></tr>}
   </tbody></table></div>
   <p className="notice-line">Super Admins can review requests across enabled estates. Facility Managers can review requests only for estates assigned to them. Each request can be decided once.</p>
  </section>
 </PortalFrame>;
}
