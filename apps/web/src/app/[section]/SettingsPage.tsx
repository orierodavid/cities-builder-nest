"use client";
import { FormEvent, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import styles from "./SettingsProfile.module.css";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
 const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
 const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
 async function changePassword(e:FormEvent){e.preventDefault();setError("");setSuccess("");if(password.length<8){setError("Use at least 8 characters for your new password.");return;}if(password!==confirm){setError("The passwords do not match.");return;}setSaving(true);const {error}=await supabase.auth.updateUser({password});if(error)setError("Password could not be changed: "+error.message);else{setSuccess("Password updated successfully. Use the new password the next time you sign in.");setPassword("");setConfirm("");}setSaving(false);}
 async function signOut(){await supabase.auth.signOut();window.location.assign("/");}
 return <PortalFrame title="Settings" description="Manage your account security and sign-in preferences.">
  <div className={styles.settingsGrid}>
   <section className={styles.card}>
    <div className={styles.sectionTitle}>Security</div><h2 className={styles.heading}>Change password</h2><p className={styles.muted}>Choose a strong password that you do not use on other websites.</p>
    <form onSubmit={changePassword} className={styles.form}>
     <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
     <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Enter the new password again"/></label>
     {error&&<div className={styles.error}>{error}</div>}{success&&<div className={styles.success}>{success}</div>}
     <div className={styles.actions}><button disabled={saving}>{saving?"Updating…":"Update password"}</button></div>
    </form>
   </section>
   <aside className={styles.sideCard}><span className={styles.eyebrow}>SESSION</span><h3>Sign-in session</h3><p>Your current browser is signed in to the CB Nest management portal.</p><button type="button" className={styles.secondaryButton} onClick={signOut}>Sign out of this account</button><a href="/profile">View my profile →</a></aside>
  </div>
 </PortalFrame>;
}
