"use client";
import { FormEvent, useEffect, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import styles from "./SettingsProfile.module.css";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
 const [userId,setUserId]=useState(""); const [email,setEmail]=useState("");
 const [name,setName]=useState(""); const [phone,setPhone]=useState("");
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 const [error,setError]=useState(""); const [success,setSuccess]=useState("");
 const [deletePassword,setDeletePassword]=useState(""); const [deleting,setDeleting]=useState(false); const [deleteError,setDeleteError]=useState("");
 useEffect(()=>{let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user){if(alive){setError("Your session has expired. Please sign in again.");setLoading(false);}return;}const {data,error}=await supabase.from("users").select("full_name,phone_e164").eq("id",user.id).maybeSingle();if(!alive)return;setUserId(user.id);setEmail(user.email||"");setName(data?.full_name||"");setPhone(data?.phone_e164||"");if(error)setError("We could not load your profile details.");setLoading(false);})();return()=>{alive=false;};},[]);
 async function save(e:FormEvent){e.preventDefault();setSaving(true);setError("");setSuccess("");const {error}=await supabase.from("users").update({full_name:name.trim(),phone_e164:phone.trim()||null,updated_at:new Date().toISOString()}).eq("id",userId);if(error)setError("Your profile could not be saved. Please try again.");else setSuccess("Your profile has been updated.");setSaving(false);}
 async function deleteAccount(){
  if(!deletePassword){setDeleteError("Enter your current password to confirm account deletion.");return;}
  if(!window.confirm("Permanently delete your CB Nest account? You will immediately lose access. Your profile details will be anonymised, while legally required financial and audit records will be retained."))return;
  setDeleting(true);setDeleteError("");
  const {data,error}=await supabase.functions.invoke("account-access",{body:{action:"delete_self",password:deletePassword}});
  if(error||data?.error){setDeleteError(data?.message||"Your account could not be deleted. Please try again.");setDeleting(false);return;}
  await supabase.auth.signOut({scope:"local"});
  window.location.assign("/login");
 }
 return <PortalFrame title="My Profile" description="View and update your personal account information.">
  <div className={styles.profileLayout}>
   <section className={styles.card}>
    <div className={styles.profileHero}><div className={styles.avatar}>{(name||email||"U").slice(0,1).toUpperCase()}</div><div><h2>{name||"Your profile"}</h2><p>{email}</p></div></div>
    {loading?<p className={styles.muted}>Loading your profile…</p>:<form onSubmit={save} className={styles.form}>
     <div className={styles.sectionTitle}>Personal information</div>
     <label>Full name<input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name"/></label>
     <label>Email address<input value={email} readOnly disabled/><small>Email is managed by your sign-in account and cannot be changed here.</small></label>
     <label>Phone number<input type="tel" maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+234…"/></label>
     {error&&<div className={styles.error}>{error}</div>}{success&&<div className={styles.success}>{success}</div>}
     <div className={styles.actions}><button disabled={saving||loading}>{saving?"Saving…":"Save changes"}</button></div>
    </form>}
   </section>
   <aside className={styles.sideCard}><span className={styles.eyebrow}>ACCOUNT</span><h3>Profile details</h3><p>Keep your contact information up to date so your estate team can reach you when needed.</p><a href="/settings">Manage account security →</a><a href="/settings#legal-documents">View terms and privacy documents →</a></aside>
  </div>
  <section className={styles.card} style={{marginTop:18,borderColor:"#e7caca"}}>
   <span className={styles.eyebrow} style={{color:"#a62c2c"}}>DANGER ZONE</span>
   <h3 className={styles.heading}>Delete my account</h3>
   <p className={styles.muted} style={{marginBottom:14}}>This immediately revokes your access and anonymises your personal profile. Financial transaction history and audit records required for legal or operational purposes are retained.</p>
   <div className={styles.form}>
    <label>Current password<input type="password" autoComplete="current-password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} placeholder="Confirm your password"/></label>
    {deleteError&&<div className={styles.error} role="alert">{deleteError}</div>}
    <div className={styles.actions}><button type="button" disabled={deleting||!deletePassword} onClick={()=>void deleteAccount()} style={{background:"#8e1b14",color:"#fff"}}>{deleting?"Deleting account…":"Delete my account"}</button></div>
   </div>
  </section>
 </PortalFrame>;
}
