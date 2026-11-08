"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import PortalFrame from "@/components/PortalFrame";

type Estate = { id: string; name: string };
type Venue = {
 id: string; estate_id: string; name: string; location: string; description: string;
 capacity: number; amenities: string[]; status: "available" | "unavailable" | "maintenance";
};

const emptyForm = { name: "", location: "", description: "", capacity: "50", amenities: "", status: "available" as Venue["status"] };

export default function VenueCapacityPage() {
 const [estates,setEstates]=useState<Estate[]>([]);
 const [estateId,setEstateId]=useState("");
 const [venues,setVenues]=useState<Venue[]>([]);
 const [form,setForm]=useState(emptyForm);
 const [editing,setEditing]=useState<string|null>(null);
 const [showForm,setShowForm]=useState(false);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
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
  const isPlatformAdmin=(roles||[]).some(x=>x.role==="platform_admin");
  const allowed=(members||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id);
  if(!isPlatformAdmin&&!allowed.length){setError("You do not have permission to manage venues.");setLoading(false);return;}
  let estateQuery=supabase.from("estates").select("id,name").eq("is_enabled",true).order("name");
  if(!isPlatformAdmin)estateQuery=estateQuery.in("id",allowed);
  const {data:estateRows,error:estateError}=await estateQuery;
  if(estateError){setError("Estate list could not be loaded.");setLoading(false);return;}
  const list=(estateRows||[]) as Estate[];setEstates(list);
  const activeEstate=list.some(x=>x.id===estateId)?estateId:(list[0]?.id||"");
  setEstateId(activeEstate);
  if(!activeEstate){setVenues([]);setLoading(false);return;}
  const {data,error:venueError}=await supabase.from("estate_venues")
   .select("id,estate_id,name,location,description,capacity,amenities,status")
   .eq("estate_id",activeEstate).order("name");
  if(venueError)setError("Venues could not be loaded. Please refresh.");
  else setVenues((data||[]) as Venue[]);
  setLoading(false);
 },[estateId]);

 useEffect(()=>{void load();},[load]);

 const stats=useMemo(()=>({
  total:venues.length,
  available:venues.filter(v=>v.status==="available").length,
  capacity:venues.reduce((sum,v)=>sum+v.capacity,0)
 }),[venues]);

 function beginCreate(){setEditing(null);setForm(emptyForm);setShowForm(true);setError("");setSuccess("");}
 function beginEdit(v:Venue){setEditing(v.id);setForm({name:v.name,location:v.location,description:v.description,capacity:String(v.capacity),amenities:v.amenities.join(", "),status:v.status});setShowForm(true);setError("");setSuccess("");}

 async function saveVenue(e:FormEvent){
  e.preventDefault();
  if(!estateId){setError("Select an estate first.");return;}
  const capacity=Number(form.capacity);
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>100000){setError("Enter a whole-number capacity between 1 and 100,000.");return;}
  setSaving(true);setError("");setSuccess("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setError("Your session has expired. Sign in again.");setSaving(false);return;}
  const payload={estate_id:estateId,name:form.name.trim(),location:form.location.trim(),description:form.description.trim(),capacity,amenities:form.amenities.split(",").map(x=>x.trim()).filter(Boolean).slice(0,30),status:form.status,updated_at:new Date().toISOString(),...(editing?{}:{created_by:user.id})};
  const result=editing
   ? await supabase.from("estate_venues").update(payload).eq("id",editing).eq("estate_id",estateId)
   : await supabase.from("estate_venues").insert(payload);
  if(result.error){setError(result.error.message.includes("estate_venues_estate_id_name_key")?"A venue with this name already exists in this estate.":"The venue could not be saved. Check the details and your permissions.");setSaving(false);return;}
  setSuccess(editing?"Venue details updated.":"Venue added successfully.");
  setShowForm(false);setEditing(null);setForm(emptyForm);setSaving(false);await load();
 }

 async function deleteVenue(v:Venue){
  if(!window.confirm("Delete "+v.name+"? Venues already linked to events cannot be deleted."))return;
  setError("");setSuccess("");
  const {error:deleteError}=await supabase.from("estate_venues").delete().eq("id",v.id).eq("estate_id",estateId);
  if(deleteError){setError("This venue could not be deleted. It may already be linked to an event; mark it unavailable instead.");return;}
  setSuccess("Venue deleted.");await load();
 }

 return <PortalFrame title="Venues & Capacity" description="Create estate venues, set their capacity and control when they can be booked.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Venue directory</h3><p>Event Organisers can select available venues when planning estate events.</p></div><button type="button" className="primary-action" onClick={beginCreate}>＋ Add venue</button></div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}
   {success&&<div className="user-alert user-alert-success" role="status">{success}</div>}
   <div className="user-list-toolbar"><label style={{display:"grid",gap:5}}>Estate<select aria-label="Select estate" value={estateId} onChange={e=>setEstateId(e.target.value)}>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>
   <div className="user-form-grid" style={{margin:"16px 0"}}>
    <div className="panel" style={{padding:16}}><small>Total venues</small><h2>{stats.total}</h2></div>
    <div className="panel" style={{padding:16}}><small>Available to book</small><h2>{stats.available}</h2></div>
    <div className="panel" style={{padding:16}}><small>Combined capacity</small><h2>{stats.capacity.toLocaleString()}</h2></div>
   </div>
   {showForm&&<form className="user-form" onSubmit={saveVenue}>
    <div className="user-form-heading"><strong>{editing?"Edit venue":"Add a venue"}</strong><span>Set the venue details and maximum safe attendance.</span></div>
    <div className="user-form-grid">
     <label>Venue name<input required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Main Event Hall"/></label>
     <label>Location within estate<input maxLength={240} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="e.g. Beside the clubhouse"/></label>
     <label>Maximum capacity<input required type="number" min="1" max="100000" step="1" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/></label>
     <label>Booking status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Venue["status"]})}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="maintenance">Under maintenance</option></select></label>
     <label style={{gridColumn:"1 / -1"}}>Facilities / amenities<input value={form.amenities} onChange={e=>setForm({...form,amenities:e.target.value})} placeholder="Air conditioning, chairs, projector (separate with commas)"/></label>
     <label style={{gridColumn:"1 / -1"}}>Description<textarea rows={3} maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Additional venue information"/></label>
    </div>
    <div className="user-form-actions"><button type="button" className="secondary-action" onClick={()=>{setShowForm(false);setEditing(null);}}>Cancel</button><button type="submit" className="primary-action" disabled={saving}>{saving?"Saving…":editing?"Save changes":"Add venue"}</button></div>
   </form>}
   <div className="table-wrap"><table className="data-table user-data-table"><thead><tr><th>Venue</th><th>Location</th><th>Capacity</th><th>Facilities</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    {loading?<tr><td colSpan={6} className="empty-cell">Loading venues…</td></tr>:venues.length?venues.map(v=><tr key={v.id}><td><strong>{v.name}</strong>{v.description&&<small style={{display:"block",whiteSpace:"normal",maxWidth:260}}>{v.description}</small>}</td><td>{v.location||"—"}</td><td><strong>{v.capacity.toLocaleString()}</strong> people</td><td>{v.amenities.length?v.amenities.join(", "):"—"}</td><td><span className={"status-pill "+(v.status==="available"?"status-active":"status-suspended")}>{v.status==="available"?"Available":v.status==="maintenance"?"Maintenance":"Unavailable"}</span></td><td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button type="button" className="secondary-action" onClick={()=>beginEdit(v)}>Edit</button><button type="button" className="secondary-action" onClick={()=>void deleteVenue(v)}>Delete</button></div></td></tr>):<tr><td colSpan={6} className="empty-cell"><strong>No venues added yet</strong><small>Add your first venue and define its maximum capacity.</small></td></tr>}
   </tbody></table></div>
   <p className="notice-line">Venues linked to existing events are protected from deletion. Set them to unavailable instead. Event bookings must use an available venue and cannot exceed its capacity.</p>
  </section>
 </PortalFrame>;
}
