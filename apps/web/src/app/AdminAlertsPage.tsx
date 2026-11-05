"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type AlertRow = {
  id: string; estate_id: string | null; actor_user_id: string | null; alert_type: string;
  severity: "warning" | "critical"; title: string; message: string;
  status: "new" | "acknowledged"; created_at: string; acknowledged_at: string | null;
  actor: { full_name: string } | null; estate: { name: string } | null;
  audit: { actor_role: string | null; module: string | null; page_path: string | null; platform: string | null; action: string; resource_type: string } | null;
};
const displayDate = (value: string) => new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });

export default function AdminAlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("admin_alerts")
      .select("id,estate_id,actor_user_id,alert_type,severity,title,message,status,created_at,acknowledged_at,actor:users!admin_alerts_actor_user_id_fkey(full_name),estate:estates!admin_alerts_estate_id_fkey(name),audit:audit_logs!admin_alerts_audit_log_id_fkey(actor_role,module,page_path,platform,action,resource_type)")
      .order("created_at", { ascending: false }).limit(100);
    if (queryError) { setError("Admin alerts could not be loaded. Check the account permissions and database connection."); setRows([]); }
    else setRows((data || []) as unknown as AlertRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-alerts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_alerts" }, () => { void load(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  const counts = useMemo(() => ({
    total: rows.length, new: rows.filter((row) => row.status === "new").length,
    critical: rows.filter((row) => row.severity === "critical" && row.status === "new").length,
  }), [rows]);
  const visible = useMemo(() => rows.filter((row) =>
    filter === "all" || (filter === "new" ? row.status === "new" : filter === "critical" ? row.severity === "critical" : row.status === "acknowledged")
  ), [rows, filter]);
  const acknowledge = async (id: string) => {
    setAcknowledging(id); setError("");
    const { error: updateError } = await supabase.rpc("acknowledge_admin_alert", { p_alert_id: id });
    if (updateError) setError("This alert could not be acknowledged. Refresh the list and verify your estate permissions.");
    else await load();
    setAcknowledging(null);
  };
  return <PortalFrame title="Alerts & Notifications" description="Important administrative events requiring review. Alerts are limited to your platform role and estate access.">
    <section className="audit-summary-grid">
      <article className="panel"><small>Recent alerts</small><strong>{counts.total}</strong><span>Latest 100 visible alerts</span></article>
      <article className="panel"><small>Awaiting review</small><strong>{counts.new}</strong><span>New and unacknowledged</span></article>
      <article className="panel"><small>Critical and new</small><strong>{counts.critical}</strong><span>Requires priority attention</span></article>
    </section>
    <section className="panel module-panel audit-panel">
      <div className="module-toolbar"><div><h3>Alert centre</h3><p>New alerts are delivered live while this page is open. Acknowledging an alert records who reviewed it and when.</p></div>
        <button className="secondary-action" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh alerts"}</button></div>
      {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
      <div className="audit-alert-filters">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button type="button" className={filter === "new" ? "active" : ""} onClick={() => setFilter("new")}>New</button>
        <button type="button" className={filter === "critical" ? "active" : ""} onClick={() => setFilter("critical")}>Critical</button>
        <button type="button" className={filter === "acknowledged" ? "active" : ""} onClick={() => setFilter("acknowledged")}>Acknowledged</button>
      </div>
      <div className="audit-alert-list">
        {loading ? <p className="empty-cell">Loading alerts…</p> : visible.length ? visible.map((row) => <article className={"audit-alert-card audit-alert-" + row.severity} key={row.id}>
          <div className="audit-alert-top"><span className={"status-pill audit-severity audit-severity-" + row.severity}>{row.severity}</span><span className={"status-pill " + (row.status === "new" ? "status-invited" : "status-active")}>{row.status}</span></div>
          <h4>{row.title}</h4><p>{row.message}</p>
          <div className="audit-alert-meta">
            <span><strong>Who:</strong> {row.actor?.full_name || (row.actor_user_id ? row.actor_user_id.slice(0, 8) : "System")} · {row.audit?.actor_role || "system"}</span>
            <span><strong>Where:</strong> {row.estate?.name || (row.estate_id ? row.estate_id.slice(0, 8) : "Platform-wide")} · {row.audit?.module || row.alert_type}</span>
            <span><strong>When:</strong> {displayDate(row.created_at)}</span>
            <span><strong>Source:</strong> {row.audit?.page_path || "Page not supplied"} · {row.audit?.platform || "Unknown"}</span>
          </div>
          {row.status === "new" ? <button className="primary-action" type="button" disabled={acknowledging === row.id} onClick={() => void acknowledge(row.id)}>{acknowledging === row.id ? "Acknowledging…" : "Acknowledge alert"}</button>
            : <small className="audit-acknowledged">Acknowledged {row.acknowledged_at ? displayDate(row.acknowledged_at) : ""}</small>}
        </article>) : <p className="empty-cell">No alerts match this filter.</p>}
      </div>
      <p className="notice-line">Alerts are generated from important committed database changes. This first release delivers in-app admin alerts; email and mobile push delivery can be added separately.</p>
    </section>
  </PortalFrame>;
}
