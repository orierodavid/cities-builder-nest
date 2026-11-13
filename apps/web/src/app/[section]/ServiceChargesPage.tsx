import { FormEvent, useCallback, useEffect, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type Estate = { id: string; name: string };
type Charge = { id: string; estate_id: string; title: string; description: string | null; amount_kobo: number; due_date: string | null; is_active: boolean; created_at: string };
type Payment = { charge_id: string; status: string; amount_kobo: number };
const money = (kobo:number) => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(kobo/100);

export default function ServiceChargesPage(){
 const [estates,setEstates]=useState<Estate[]>([]); const [estateId,setEstateId]=useState("");
 const [rows,setRows]=useState<Charge[]>([]); const [payments,setPayments]=useState<Payment[]>([]);
 const [isAdmin,setIsAdmin]=useState(false); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 const [title,setTitle]=useState(""); const [description,setDescription]=useState(""); const [amount,setAmount]=useState(""); const [dueDate,setDueDate]=useState("");
 const [error,setError]=useState(""); const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:{user}}=await supabase.auth.getUser(); if(!user){setError("Session expired. Sign in again.");setLoading(false);return;}
  const [{data:roles,error:re},{data:members,error:me}]=await Promise.all([
   supabase.from("user_roles").select("role").eq("user_id",user.id),
   supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id",user.id).eq("status","active")
  ]);
  if(re||me){setError("Unable to verify estate permissions.");setLoading(false);return;}
  const admin=(roles||[]).some(x=>x.role==="platform_admin");setIsAdmin(admin);
  const allowed=(members||[]).filter(x=>["facility_manager","estate_manager","estate_admin"].includes(x.membership_role)).map(x=>x.estate_id);
  let q=supabase.from("estates").select("id,name").eq("is_enabled",true).order("name");
  if(!admin)q=q.in("id",allowed);
  const {data:es,error:ee}=await q;
  if(ee){setError("Unable to load assigned estates.");setLoading(false);return;}
  const list=(es||[]) as Estate[];setEstates(list);
  const chosen=estateId&&list.some(x=>x.id===estateId)?estateId:(list[0]?.id||"");setEstateId(chosen);
  if(chosen){
   const [{data:charges,error:ce},{data:paid,error:pe}]=await Promise.all([
    supabase.from("estate_service_charges").select("id,estate_id,title,description,amount_kobo,due_date,is_active,created_at").eq("estate_id",chosen).order("created_at",{ascending:false}),
    supabase.from("service_charge_payments").select("charge_id,status,amount_kobo").eq("estate_id",chosen)
   ]);
   if(ce||pe)setError("Service charges could not be loaded. Please refresh and try again.");
   else{setRows((charges||[]) as Charge[]);setPayments((paid||[]) as Payment[]);}
  }else{setRows([]);setPayments([]);}
  setLoading(false);
 },[estateId]);
 useEffect(()=>{void load();},[load]);
 async function create(event:FormEvent){
  event.preventDefault();setSaving(true);setError("");setNotice("");
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||!estateId){setError("Choose an estate and sign in again.");setSaving(false);return;}
  const naira=Number(amount);
  if(!Number.isFinite(naira)||naira<=0||naira>100000000){setError("Enter a valid service fee in NGN.");setSaving(false);return;}
  const {error:insertError}=await supabase.from("estate_service_charges").insert({estate_id:estateId,title:title.trim(),description:description.trim()||null,amount_kobo:Math.round(naira*100),due_date:dueDate||null,created_by:user.id});
  if(insertError){setError("This service charge could not be saved. Please try again.");setSaving(false);return;}
  setTitle("");setDescription("");setAmount("");setDueDate("");setNotice("Service charge published. Residents in this estate can now see the amount due.");await load();setSaving(false);
 }
 async function toggle(row:Charge){
  const {error:updateError}=await supabase.from("estate_service_charges").update({is_active:!row.is_active,updated_at:new Date().toISOString()}).eq("id",row.id);
  if(updateError)setError("This charge could not be updated. Please try again.");else await load();
 }
 return <PortalFrame title="Service Charges" description="Set estate service fees and publish the amounts residents need to pay.">
  <section className="panel module-panel">
   <div className="module-toolbar"><div><h3>Estate service fees</h3><p>Create a service charge for the selected estate. Super Administrators can select any estate; Facility Managers are restricted to their assigned estate.</p></div>
    <select aria-label="Select estate" value={estateId} onChange={e=>setEstateId(e.target.value)}>{estates.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
   </div>
   {error&&<div className="user-alert user-alert-error" role="alert">{error}</div>}{notice&&<div className="user-alert user-alert-success" role="status">{notice}</div>}
   <form className="user-form" onSubmit={create}>
    <div className="user-form-heading"><strong>Publish a service charge</strong><span>Set the amount residents in the selected estate will be asked to pay.</span></div>
    <div className="user-form-grid">
     <label>Charge name<input required minLength={2} maxLength={140} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Monthly Estate Service Fee"/></label>
     <label>Amount (NGN)<input required type="number" min="1" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="e.g. 25000"/></label>
     <label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
     <label>Description<input maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What this charge covers"/></label>
    </div>
    <div className="user-form-actions"><button className="primary-action" type="submit" disabled={saving||!estateId}>{saving?"Publishing…":"Publish service charge"}</button></div>
   </form>
   <div className="table-wrap"><table className="data-table"><thead><tr><th>Charge</th><th>Amount</th><th>Due date</th><th>Paid records</th><th>Status</th><th>Action</th></tr></thead><tbody>
    {loading?<tr><td colSpan={6} className="empty-cell">Loading charges…</td></tr>:rows.length?rows.map(x=><tr key={x.id}><td><strong>{x.title}</strong><small>{x.description||"Estate service charge"}</small></td><td>{money(x.amount_kobo)}</td><td>{x.due_date?new Date(x.due_date+"T00:00:00").toLocaleDateString():"Not set"}</td><td>{payments.filter(p=>p.charge_id===x.id&&p.status==="successful").length}</td><td><span className={"status-pill "+(x.is_active?"status-active":"status-suspended")}>{x.is_active?"Published":"Archived"}</span></td><td><button className="secondary-action" onClick={()=>void toggle(x)}>{x.is_active?"Archive":"Republish"}</button></td></tr>):<tr><td colSpan={6} className="empty-cell"><strong>No service charges yet</strong><small>Publish a charge to make the amount visible to residents.</small></td></tr>}
   </tbody></table></div>
   <p className="optional-label">Residents can pay published charges from the Service Charges section of their app. A charge is marked paid only after the payment is confirmed.</p>
  </section>
 </PortalFrame>;
}
