"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type AuditRow = {
  id: string; actor_user_id: string | null; actor_role: string | null; estate_id: string | null;
  action: string; resource_type: string; resource_id: string | null; module: string | null;
  page_path: string | null; platform: string | null; outcome: string; severity: string;
  changes: Record<string, { before: unknown; after: unknown }>; ip_address: string | null;
  user_agent: string | null; request_id: string | null; created_at: string;
  actor: { full_name: string } | null; estate: { name: string } | null;
};
const displayDate = (value: string) => new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });

export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("audit_logs")
      .select("id,actor_user_id,actor_role,estate_id,action,resource_type,resource_id,module,page_path,platform,outcome,severity,changes,ip_address,user_agent,request_id,created_at,actor:users!audit_logs_actor_user_id_fkey(full_name),estate:estates!audit_logs_estate_id_fkey(name)")
      .order("created_at", { ascending: false }).limit(300);
    if (queryError) { setError("Audit records could not be loaded. Check the account permissions and database connection."); setRows([]); }
    else setRows((data || []) as unknown as AuditRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-audit-logs-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => { void load(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  const modules = useMemo(() => Array.from(new Set(rows.map((row) => row.module || "Platform"))).sort(), [rows]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const searchable = [row.actor?.full_name, row.actor_user_id, row.actor_role, row.estate?.name, row.module, row.page_path, row.action, row.resource_type, row.resource_id, row.ip_address, row.request_id].join(" ").toLowerCase();
      return (!needle || searchable.includes(needle)) && (severity === "all" || row.severity === severity)
        && (module === "all" || (row.module || "Platform") === module) && (action === "all" || row.action === action);
    });
  }, [rows, search, severity, module, action]);
  return <PortalFrame title="Audit Logs" description="A traceable record of administrative and operational changes across the estates you are authorised to oversee.">
    <section className="panel module-panel audit-panel">
      <div className="module-toolbar"><div><h3>Activity history</h3><p>Latest 300 records. Access is restricted by your platform role and estate membership.</p></div>
        <button className="secondary-action" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh records"}</button></div>
      {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
      <div className="audit-filters">
        <input aria-label="Search audit logs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search person, estate, action, record or IP…" />
        <select aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severity</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
        <select aria-label="Filter by module" value={module} onChange={(event) => setModule(event.target.value)}><option value="all">All modules</option>{modules.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Filter by action" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option><option value="insert">Created</option><option value="update">Updated</option><option value="delete">Deleted</option></select>
      </div>
      <div className="audit-result-count">{filtered.length} matching record{filtered.length === 1 ? "" : "s"}</div>
      <div className="table-wrap"><table className="data-table user-data-table audit-table">
        <thead><tr><th>Who</th><th>What was done</th><th>Where</th><th>Source</th><th>When</th><th>Severity</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="empty-cell">Loading audit history…</td></tr> : filtered.length ? filtered.map((row) => <tr key={row.id}>
          <td><strong>{row.actor?.full_name || (row.actor_user_id ? row.actor_user_id.slice(0, 8) : "System")}</strong><small className="audit-subline">{row.actor_role || "System"}{row.actor_user_id ? " · " + row.actor_user_id.slice(0, 8) : ""}</small></td>
          <td><strong className="audit-action">{row.action.toUpperCase()} · {row.resource_type.replaceAll("_", " ")}</strong><small className="audit-subline">{row.module || "Platform"}{row.resource_id ? " · " + row.resource_id.slice(0, 8) : ""}</small><details className="audit-details"><summary>View change details</summary><pre>{JSON.stringify(row.changes || {}, null, 2)}</pre></details></td>
          <td>{row.estate?.name || (row.estate_id ? row.estate_id.slice(0, 8) : "Platform-wide")}<small className="audit-subline">{row.page_path || "Page not supplied"}</small></td>
          <td>{row.platform || "Unknown"}<small className="audit-subline">{row.ip_address || "IP unavailable"}</small></td>
          <td>{displayDate(row.created_at)}<small className="audit-subline">{row.request_id ? "Request " + row.request_id.slice(0, 16) : "Server timestamp"}</small></td>
          <td><span className={"status-pill audit-severity audit-severity-" + row.severity}>{row.severity}</span></td>
        </tr>) : <tr><td colSpan={6} className="empty-cell"><strong>No audit records found</strong><small>Matching activity will appear here after recorded changes occur.</small></td></tr>}</tbody>
      </table></div>
      <p className="notice-line">Audit records are append-only. Passwords, tokens, access codes and personal contact details are redacted from change details. These entries represent committed database changes; rejected requests that never reach the database are not represented.</p>
    </section>
  </PortalFrame>;
}
