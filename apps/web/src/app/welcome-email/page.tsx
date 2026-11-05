"use client";

import { FormEvent, useEffect, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type Recipient = { email: string; name: string };

export default function WelcomeEmailPage() {
  const [userId, setUserId] = useState("");
  const [estateId, setEstateId] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [subject, setSubject] = useState("Welcome to Cities Builder Nest");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const query = new URLSearchParams(window.location.search);
      const selectedUserId = query.get("userId") || "";
      const selectedEstateId = query.get("estateId") || "";
      setUserId(selectedUserId);
      setEstateId(selectedEstateId);
      if (!selectedUserId || !selectedEstateId) {
        setError("The selected user or estate is missing. Return to User Management and select a user.");
        setLoading(false);
        return;
      }
      const { data, error: invokeError } = await supabase.functions.invoke("send-welcome-email", {
        body: { action: "preview", userId: selectedUserId, estateId: selectedEstateId }
      });
      if (!active) return;
      if (invokeError || data?.error) {
        setError(data?.message || data?.error || invokeError?.message || "Unable to load the selected recipient.");
      } else {
        setRecipient(data.recipient as Recipient);
        setMessage(`Welcome to Cities Builder Nest, {{name}}.\n\nYour account has been created. You can now sign in using the email address provided to you by estate management.\n\nPlease contact your Facility Manager if you need assistance.`);
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSending(true);
    const finalMessage = message.replaceAll("{{name}}", recipient?.name || "there");
    const { data, error: invokeError } = await supabase.functions.invoke("send-welcome-email", {
      body: { action: "send", userId, estateId, subject, message: finalMessage }
    });
    if (invokeError || data?.error) {
      setError(data?.message || data?.error || invokeError?.message || "Welcome email could not be sent.");
    } else if (data?.sent === true) {
      setSuccess(`Welcome email sent successfully to ${recipient?.email}.`);
    } else {
      setError("The email provider did not confirm delivery. No success has been recorded.");
    }
    setSending(false);
  }

  return <PortalFrame title="Send welcome email" description="Compose and send an individual welcome message to the selected estate user.">
    <section className="panel module-panel">
      <div className="module-toolbar">
        <div><h3>Individual welcome message</h3><p>This message is sent only when you select Send welcome email. Creating the account does not send it.</p></div>
        <button type="button" className="secondary-action" onClick={() => { window.location.href = "/users"; }}>← Back to users</button>
      </div>
      {loading && <p className="empty-cell">Loading recipient details…</p>}
      {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
      {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
      {!loading && recipient && <form className="user-form" onSubmit={send}>
        <div className="user-form-heading"><strong>Recipient</strong><span>Only the selected user in the selected estate will receive this message.</span></div>
        <div className="user-form-grid">
          <label>To<input value={recipient.email} readOnly /></label>
          <label>Recipient name<input value={recipient.name} readOnly /></label>
          <label style={{gridColumn:"1 / -1"}}>Subject<input required minLength={1} maxLength={180} value={subject} onChange={event=>setSubject(event.target.value)} /></label>
        </div>
        <label style={{display:"grid",gap:6,marginTop:14}}>Message<textarea required minLength={1} maxLength={10000} rows={12} value={message} onChange={event=>setMessage(event.target.value)} style={{width:"100%",border:"1px solid var(--border,#ddd)",borderRadius:6,padding:12,font:"inherit",resize:"vertical"}} /></label>
        <p className="notice-line">You can use <code>{"{{name}}"}</code> in the message; it will be replaced with the recipient's name. Do not include the user's password in an email.</p>
        <div className="user-form-actions"><button type="button" className="secondary-action" onClick={()=>{ window.location.href = "/users"; }}>Cancel</button><button type="submit" className="primary-action" disabled={sending}>{sending?"Sending…":"Send welcome email →"}</button></div>
      </form>}
    </section>
  </PortalFrame>;
}
