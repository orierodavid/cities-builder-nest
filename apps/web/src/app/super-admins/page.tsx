"use client";

import { FormEvent, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

export default function SuperAdminsPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function createSuperAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("create-platform-admin", {
        body: { fullName, email, password },
      });
      if (invokeError || data?.error) {
        setError(data?.message || data?.error || invokeError?.message || "The Super Admin account could not be created.");
        return;
      }
      setSuccess(fullName.trim() + " has been added as a Super Admin. An email notification is queued for existing Super Admins and will be delivered when Resend is configured.");
      setFullName("");
      setEmail("");
      setPassword("");
    } catch {
      setError("The Super Admin account could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalFrame title="Super Admins" description="Create and manage platform-wide administrator access.">
      <section className="panel module-panel">
        <div className="module-toolbar">
          <div>
            <h3>Create a Super Admin</h3>
            <p>Only an existing Super Admin can create another Super Admin. The new account receives the same platform-wide privileges.</p>
          </div>
        </div>
        {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
        {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
        <form className="user-form" onSubmit={createSuperAdmin}>
          <div className="user-form-heading">
            <strong>New administrator details</strong>
            <span>Use a unique email address and a strong password of at least 12 characters. Share the password securely.</span>
          </div>
          <div className="user-form-grid">
            <label>Full name
              <input required minLength={2} maxLength={120} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Full name" />
            </label>
            <label>Email address
              <input required type="email" maxLength={320} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@example.com" />
            </label>
            <label>Initial password
              <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" />
            </label>
          </div>
          <div className="user-form-actions">
            <button type="submit" className="primary-action" disabled={busy}>
              {busy ? "Creating Super Admin…" : "Create Super Admin"}
            </button>
          </div>
        </form>
        <p className="notice-line">For security, the account is created on the server, platform access is assigned from the protected role table, and the action is recorded in the audit log.</p>
      </section>
    </PortalFrame>
  );
}
