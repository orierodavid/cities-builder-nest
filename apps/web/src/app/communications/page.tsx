"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Estate = { id: string; name: string };
type SenderRole = "platform_admin" | "facility_manager";

const adminNav = [["⌂", "Dashboard", "/"], ["▦", "Estates", "/estates"], ["♙", "Users", "/users"], ["⌂", "Properties", "/properties"], ["▤", "Subscriptions", "/subscriptions"], ["▣", "Payments", "/payments"], ["▥", "Analytics", "/analytics"], ["▤", "Communications", "/communications"], ["▤", "Legal Documents", "/legal-documents"], ["⚙", "Settings", "/settings"]];
const managerNav = [["⌂", "Dashboard", "/"], ["▣", "Properties", "/properties"], ["♙", "Residents", "/residents"], ["♟", "Users", "/users"], ["⌕", "Visitor Management", "/visitor-management"], ["▦", "Events", "/events"], ["▤", "Service Charges", "/service-charges"], ["▣", "Payments", "/payments"], ["⚒", "Maintenance", "/maintenance"], ["⌂", "Facility Management", "/facility-management"], ["▤", "Communications", "/communications"], ["▥", "Reports", "/reports"], ["⚙", "Settings", "/settings"], ["◉", "My Profile", "/profile"]];

export default function CommunicationsPage() {
  const [role, setRole] = useState<SenderRole | null>(null);
  const [name, setName] = useState("Management user");
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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        if (active) window.location.replace("/");
        return;
      }
      const user = sessionData.session.user;
      const [globalResult, membershipResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("estate_memberships").select("estate_id,membership_role,status,estates(id,name)").eq("user_id", user.id).eq("status", "active"),
        supabase.from("users").select("full_name").eq("id", user.id).maybeSingle()
      ]);
      if (!active) return;
      if (globalResult.error || membershipResult.error) {
        setError("Unable to verify your management permissions.");
        setLoading(false);
        return;
      }
      const isAdmin = (globalResult.data || []).some((item) => item.role === "platform_admin");
      const managerMemberships = (membershipResult.data || []).filter((item) => ["facility_manager", "estate_manager", "estate_admin"].includes(item.membership_role));
      if (!isAdmin && managerMemberships.length === 0) {
        await supabase.auth.signOut();
        window.location.replace("/");
        return;
      }
      const estateRows = isAdmin
        ? await supabase.from("estates").select("id,name").order("name")
        : { data: managerMemberships.map((item) => ({ id: item.estate_id, name: (item.estates as unknown as { name?: string } | null)?.name || "Assigned estate" })), error: null };
      if (!active) return;
      if (estateRows.error) {
        setError("Unable to load estate recipients. Please refresh and try again.");
        setLoading(false);
        return;
      }
      const uniqueEstates = Array.from(new Map((estateRows.data || []).map((item) => [item.id, { id: item.id, name: item.name || "Estate" }])).values());
      setRole(isAdmin ? "platform_admin" : "facility_manager");
      setName(profileResult.data?.full_name || "Management user");
      setEstates(uniqueEstates);
      setSelected(isAdmin ? uniqueEstates.map((item) => item.id) : uniqueEstates.map((item) => item.id));
      setAllEstates(true);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const nav = role === "platform_admin" ? adminNav : managerNav;
  const selectedCount = useMemo(() => allEstates && role === "platform_admin" ? estates.length : selected.length, [allEstates, role, estates.length, selected.length]);

  function toggleEstate(id: string) {
    setAllEstates(false);
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to send notification.";
      setError(message.includes("send_resident_notification") || message.includes("function") ? "The notification service is not available yet. Confirm the resident-notifications database migration has been applied, then try again." : message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="portal-loading">Loading secure communications…</main>;
  if (!role) return <main className="portal-loading">{error || "Access could not be verified."}</main>;

  return (
    <main className="portal">
      <aside className="sidebar">
        <a className="brand brand-link" href="/"><b>⌂</b><span>CB NEST<small>MANAGEMENT PORTAL</small></span></a>
        <p className="nav-label">MAIN MENU</p>
        <nav className="nav-list">{nav.map(([icon, label, href]) => <a key={label} href={href} className={"nav" + (href === "/communications" ? " active" : "")}><span className="nav-icon">{icon}</span>{label}</a>)}</nav>
        <button className="logout" onClick={async () => { await supabase.auth.signOut(); window.location.replace("/"); }}>↪　Sign out</button>
      </aside>
      <section className="main">
        <header className="topbar">
          <div className="top-left"><span className="role-chip">{role === "platform_admin" ? "SUPER ADMINISTRATOR" : "FACILITY MANAGER"}</span></div>
          <div className="top-right"><a href="/profile" className="profile-shortcut"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}</strong><small>{role === "platform_admin" ? "Super Administrator" : "Facility Manager"}</small></span></a></div>
        </header>
        <div className="content">
          <div className="page-heading"><div><h1>Communications</h1><p>Send an in-app notification to residents in your authorized estates.</p></div></div>
          {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
          {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
          <section className="panel module-panel">
            <div className="module-toolbar"><div><h3>New resident notification</h3><p>Recipients receive this message in their CB Nest notification centre.</p></div><span className="role-chip">{selectedCount.toLocaleString("en-NG")} ESTATE{selectedCount === 1 ? "" : "S"} SELECTED</span></div>
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
            <div className="notice-line">Normal notifications remain in-app. Important and urgent are marked clearly in the resident inbox. Device push delivery is not enabled in this step.</div>
          </section>
        </div>
      </section>
    </main>
  );
}
