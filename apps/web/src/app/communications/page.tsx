"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type Estate = { id: string; name: string };
type SenderRole = "platform_admin" | "facility_manager";

export default function CommunicationsPage() {
  const [role, setRole] = useState<SenderRole | null>(null);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [allEstates, setAllEstates] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">("normal");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (active) window.location.replace("/");
        return;
      }
      const user = sessionData.session.user;
      const [globalResult, membershipResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("estate_memberships").select("estate_id,membership_role,status,estates(id,name)").eq("user_id", user.id).eq("status", "active")
      ]);
      if (!active) return;
      if (globalResult.error || membershipResult.error) {
        setError("Your access could not be verified. Please refresh and try again.");
        setLoading(false);
        return;
      }
      const isAdmin = (globalResult.data || []).some((item) => item.role === "platform_admin");
      const managerMemberships = (membershipResult.data || []).filter((item) =>
        ["facility_manager", "estate_manager", "estate_admin"].includes(item.membership_role)
      );
      if (!isAdmin && managerMemberships.length === 0) {
        await supabase.auth.signOut();
        window.location.replace("/");
        return;
      }
      const estateRows = isAdmin
        ? await supabase.from("estates").select("id,name").order("name")
        : {
            data: managerMemberships.map((item) => ({
              id: item.estate_id,
              name: (item.estates as unknown as { name?: string } | null)?.name || "Assigned estate"
            })),
            error: null
          };
      if (!active) return;
      if (estateRows.error) {
        setError("Estate recipients could not be loaded. Please refresh and try again.");
        setLoading(false);
        return;
      }
      const uniqueEstates = Array.from(new Map((estateRows.data || []).map((item) =>
        [item.id, { id: item.id, name: item.name || "Estate" }]
      )).values());
      setRole(isAdmin ? "platform_admin" : "facility_manager");
      setEstates(uniqueEstates);
      setSelected(uniqueEstates.map((item) => item.id));
      setAllEstates(true);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const selectedCount = useMemo(
    () => allEstates && role === "platform_admin" ? estates.length : selected.length,
    [allEstates, role, estates.length, selected.length]
  );

  function toggleEstate(id: string) {
    setAllEstates(false);
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const targets = role === "platform_admin" && allEstates ? estates.map((item) => item.id) : selected;
    if (targets.length === 0) {
      setError("Select at least one estate before sending.");
      return;
    }
    setSending(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("send_resident_notification", {
        p_title: title.trim(),
        p_body: body.trim(),
        p_estate_ids: targets,
        p_priority: priority
      });
      if (rpcError) throw rpcError;
      const count = Number(data?.recipientCount ?? 0);
      setSuccess(`Notification sent successfully to ${count.toLocaleString("en-NG")} resident account${count === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
      setPriority("normal");
    } catch {
      setError("Your notification could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="portal-loading">Loading communications…</main>;

  return (
    <PortalFrame title="Communications" description="Send important updates to residents in your authorised estates.">
      {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
      {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
      {!role ? <section className="panel"><p>Your access could not be verified. Please refresh and try again.</p></section> : (
        <section className="panel module-panel">
          <div className="module-toolbar">
            <div><h3>New resident notification</h3><p>Residents will receive this message in their notification centre.</p></div>
            <span className="role-chip">{selectedCount.toLocaleString("en-NG")} ESTATE{selectedCount === 1 ? "" : "S"} SELECTED</span>
          </div>
          <form className="user-form" onSubmit={send}>
            <div className="user-form-heading"><strong>Message details</strong><span>Use clear, actionable information residents can understand.</span></div>
            <div className="user-form-grid">
              <label>Notification title<input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Scheduled water maintenance" /></label>
              <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "important" | "urgent")}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
            </div>
            <label style={{ display: "grid", gap: 6, fontSize: 10, color: "#555", marginTop: 12 }}>Message<textarea required minLength={1} maxLength={10000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the information residents need to know…" style={{ width: "100%", border: "1px solid #ddd", borderRadius: 5, padding: 10, font: "11px Inter,Arial,sans-serif", resize: "vertical" }} /></label>
            <div className="user-form-heading" style={{ marginTop: 18 }}><strong>Resident audience</strong><span>{role === "platform_admin" ? "Send across every estate or choose specific estates." : "You can only send to residents in estates assigned to your account."}</span></div>
            {role === "platform_admin" && <label className="legal-check" style={{ marginBottom: 12 }}><input type="checkbox" checked={allEstates} onChange={(event) => { setAllEstates(event.target.checked); if (event.target.checked) setSelected(estates.map((item) => item.id)); }} /> Send to all estates</label>}
            <div className="estate-target-list">{estates.map((estate) => <label key={estate.id}><input type="checkbox" checked={selected.includes(estate.id)} disabled={role === "platform_admin" && allEstates} onChange={() => toggleEstate(estate.id)} /><span>{estate.name}</span></label>)}</div>
            <div className="user-form-actions"><button type="submit" className="primary-action" disabled={sending || estates.length === 0}>{sending ? "Sending…" : "Send notification →"}</button></div>
          </form>
        </section>
      )}
    </PortalFrame>
  );
}
