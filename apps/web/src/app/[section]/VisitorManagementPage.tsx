"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type VisitorPass = {
  id: string; estate_id: string; host_user_id: string; visitor_name: string;
  visitor_phone: string | null; visitor_count: number; visit_frequency: string;
  schedule_start_date: string; schedule_end_date: string; valid_from: string;
  valid_until: string; status: string; created_at: string;
};
type Estate = { id: string; name: string };
type User = { id: string; full_name: string | null };

export default function VisitorManagementPage() {
  const [passes, setPasses] = useState<VisitorPass[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [hosts, setHosts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Your session has expired. Sign in again."); setLoading(false); return; }
    const [{ data: roles, error: roleError }, { data: memberships, error: membershipError }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("estate_memberships").select("estate_id,membership_role,status").eq("user_id", user.id).eq("status", "active"),
    ]);
    if (roleError || membershipError) { setError("Your estate access could not be verified."); setLoading(false); return; }
    const admin = (roles || []).some((row: { role: string }) => row.role === "platform_admin");
    const allowed = (memberships || []).filter((row: { membership_role: string }) => ["facility_manager","estate_manager","estate_admin"].includes(row.membership_role)).map((row: { estate_id: string }) => row.estate_id);
    if (!admin && !allowed.length) { setError("Visitor records are available to authorised estate management accounts."); setLoading(false); return; }
    let estateQuery = supabase.from("estates").select("id,name").order("name");
    if (!admin) estateQuery = estateQuery.in("id", allowed);
    const [{ data: estateRows, error: estateError }, passResult] = await Promise.all([
      estateQuery,
      supabase.from("manager_visitor_passes").select("id,estate_id,host_user_id,visitor_name,visitor_phone,visitor_count,visit_frequency,schedule_start_date,schedule_end_date,valid_from,valid_until,status,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (estateError || passResult.error) { setError("Visitor passes could not be loaded. Check the visitor-pass migration and estate permissions."); setLoading(false); return; }
    const estateList = (estateRows || []) as Estate[];
    const estateIds = new Set(estateList.map((item) => item.id));
    const rows = ((passResult.data || []) as VisitorPass[]).filter((item) => estateIds.has(item.estate_id));
    setEstates(estateList); setPasses(rows);
    const hostIds = [...new Set(rows.map((item) => item.host_user_id))];
    if (hostIds.length) {
      const { data: profiles } = await supabase.from("users").select("id,full_name").in("id", hostIds);
      const map: Record<string, string> = {};
      ((profiles || []) as User[]).forEach((item) => { map[item.id] = item.full_name || "Resident"; });
      setHosts(map);
    } else setHosts({});
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => passes.filter((pass) =>
    (!filter || pass.estate_id === filter) &&
    (!search || [pass.visitor_name, pass.visitor_phone || "", hosts[pass.host_user_id] || ""].join(" ").toLowerCase().includes(search.toLowerCase()))
  ), [passes, filter, search, hosts]);
  const estateName = (id: string) => estates.find((item) => item.id === id)?.name || "Estate";
  const date = (value: string) => new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-NG");

  return <PortalFrame title="Visitor Management" description="Review visitor passes, visit schedules and group sizes across your authorised estates.">
    <section className="panel module-panel">
      <div className="module-toolbar"><div><h3>Visitor passes</h3><p>Access codes and encrypted code material are not exposed in this management view.</p></div><button className="secondary-action" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
      {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
      <div className="user-list-toolbar">
        <select aria-label="Filter visitors by estate" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All authorised estates</option>{estates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input aria-label="Search visitor or resident" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visitor, phone or resident…"/>
      </div>
      <div className="table-wrap"><table className="data-table user-data-table">
        <thead><tr><th>Visitor</th><th>Phone</th><th>Resident</th><th>Estate</th><th>Visitors</th><th>Frequency</th><th>Visit dates</th><th>Status</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="empty-cell">Loading visitor passes…</td></tr> :
            visible.length ? visible.map((pass) => <tr key={pass.id}>
              <td><strong>{pass.visitor_name}</strong></td><td>{pass.visitor_phone || "Not provided"}</td>
              <td>{hosts[pass.host_user_id] || "Resident"}</td><td>{estateName(pass.estate_id)}</td>
              <td>{pass.visitor_count}</td><td>{pass.visit_frequency}</td>
              <td>{date(pass.schedule_start_date)}{pass.schedule_end_date !== pass.schedule_start_date ? " – " + date(pass.schedule_end_date) : ""}</td>
              <td><span className={"status-pill " + (pass.status === "active" ? "status-active" : "status-suspended")}>{pass.status}</span></td>
            </tr>) :
            <tr><td colSpan={8} className="empty-cell"><strong>No visitor passes found</strong><small>Resident-created visitor passes will appear here.</small></td></tr>}
        </tbody>
      </table></div>
    </section>
  </PortalFrame>;
}
