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
 useEffect(()=>{let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user){if(alive){setError("Your session has expired. Please sign in again.");setLoading(false);}return;}const {data,error}=await supabase.from("users").select("full_name,phone_e164").eq("id",user.id).maybeSingle();if(!alive)return;setUserId(user.id);setEmail(user.email||"");setName(data?.full_name||"");setPhone(data?.phone_e164||"");if(error)setError("We could not load your profile details.");setLoading(false);})();return()=>{alive=false;};},[]);
 async function save(e:FormEvent){e.preventDefault();setSaving(true);setError("");setSuccess("");const {error}=await supabase.from("users").update({full_name:name.trim(),phone_e164:phone.trim()||null,updated_at:new Date().toISOString()}).eq("id",userId);if(error)setError("Profile could not be saved: "+error.message);else setSuccess("Your profile has been updated.");setSaving(false);}
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
   <aside className={styles.sideCard}><span className={styles.eyebrow}>ACCOUNT</span><h3>Profile details</h3><p>Your management account is connected to the CB Nest identity system.</p><div className={styles.detail}><small>Account ID</small><strong>{userId||"—"}</strong></div><a href="/settings">Manage account security →</a><a href="/settings#legal-documents">View terms and privacy documents →</a></aside>
  </div>
 </PortalFrame>;
}
