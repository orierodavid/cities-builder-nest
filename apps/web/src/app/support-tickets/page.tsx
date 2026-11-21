"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type Ticket = {
  id: string;
  estate_id: string;
  resident_user_id: string;
  subject: string;
  status: "awaiting_management" | "awaiting_resident" | "closed";
  created_at: string;
  updated_at: string;
};
type Message = { id: string; ticket_id: string; sender_user_id: string; body: string; created_at: string };
type Person = { id: string; full_name: string };
type Estate = { id: string; name: string };

const statusText: Record<Ticket["status"], string> = {
  awaiting_management: "Needs your response",
  awaiting_resident: "Awaiting resident",
  closed: "Closed",
};

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [estates, setEstates] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState<"all" | "awaiting_management" | "awaiting_resident" | "closed">("all");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [managerAllowed, setManagerAllowed] = useState(false);

  const loadTickets = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("support_tickets")
      .select("id,estate_id,resident_user_id,subject,status,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (queryError) throw queryError;
    const rows = (data || []) as Ticket[];
    setTickets(rows);
    const userIds = [...new Set(rows.map((row) => row.resident_user_id))];
    const estateIds = [...new Set(rows.map((row) => row.estate_id))];
    const [userResult, estateResult] = await Promise.all([
      userIds.length ? supabase.from("users").select("id,full_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
      estateIds.length ? supabase.from("estates").select("id,name").in("id", estateIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (userResult.error) throw userResult.error;
    if (estateResult.error) throw estateResult.error;
    setPeople(Object.fromEntries(((userResult.data || []) as Person[]).map((person) => [person.id, person.full_name])));
    setEstates(Object.fromEntries(((estateResult.data || []) as Estate[]).map((estate) => [estate.id, estate.name])));
  }, []);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error: queryError } = await supabase
      .from("support_ticket_messages")
      .select("id,ticket_id,sender_user_id,body,created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (queryError) throw queryError;
    setMessages((data || []) as Message[]);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (active) { setError("Please sign in again to view support tickets."); setLoading(false); }
        return;
      }
      const { data: memberships, error: membershipError } = await supabase
        .from("estate_memberships")
        .select("membership_role")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (membershipError) {
        if (active) { setError("Your management access could not be verified."); setLoading(false); }
        return;
      }
      const allowed = (memberships || []).some((item) => item.membership_role === "facility_manager");
      if (!active) return;
      setManagerAllowed(allowed);
      if (!allowed) { setLoading(false); return; }
      try { await loadTickets(); }
      catch { if (active) setError("Support tickets could not be loaded. Please refresh."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [loadTickets]);

  useEffect(() => {
    if (!selected?.id) return;
    let active = true;
    const refresh = async () => {
      try { await Promise.all([loadMessages(selected.id), loadTickets()]); }
      catch { if (active) setError("The conversation could not be refreshed."); }
    };
    void refresh();
    const channel = supabase.channel("manager-support-ticket-" + selected.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_messages", filter: "ticket_id=eq." + selected.id }, () => { void refresh(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: "id=eq." + selected.id }, () => { void refresh(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [selected?.id, loadMessages, loadTickets]);

  const visibleTickets = useMemo(() => filter === "all" ? tickets : tickets.filter((ticket) => ticket.status === filter), [tickets, filter]);
  const counts = useMemo(() => ({
    all: tickets.length,
    awaiting_management: tickets.filter((ticket) => ticket.status === "awaiting_management").length,
    awaiting_resident: tickets.filter((ticket) => ticket.status === "awaiting_resident").length,
    closed: tickets.filter((ticket) => ticket.status === "closed").length,
  }), [tickets]);

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true); setError("");
    try {
      const { error: rpcError } = await supabase.rpc("send_support_ticket_message", {
        p_ticket_id: selected.id,
        p_body: reply.trim(),
      });
      if (rpcError) throw rpcError;
      setReply("");
      await Promise.all([loadMessages(selected.id), loadTickets()]);
      setSelected({ ...selected, status: "awaiting_resident", updated_at: new Date().toISOString() });
    } catch {
      setError("Your reply could not be sent. Please try again.");
    } finally { setSending(false); }
  }

  async function closeTicket() {
    if (!selected) return;
    try {
      const { error: rpcError } = await supabase.rpc("close_support_ticket", { p_ticket_id: selected.id });
      if (rpcError) throw rpcError;
      setSelected({ ...selected, status: "closed" });
      await loadTickets();
    } catch { setError("This ticket could not be closed. Please try again."); }
  }

  return (
    <PortalFrame title="Support Tickets" description="Respond to resident requests in your assigned estate.">
      {loading ? <div className="portal-loading">Loading support tickets…</div> : !managerAllowed ? (
        <section className="panel"><p>Support tickets are available to Facility Managers only.</p></section>
      ) : (
        <>
          {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(270px, 0.85fr) minmax(360px, 1.4fr)", gap: 16, alignItems: "start" }}>
            <section className="panel" style={{ minWidth: 0 }}>
              <div className="module-toolbar"><div><h3>Resident requests</h3><p>Tickets assigned to your Facility Manager account.</p></div></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "14px 0" }}>
                {(["all", "awaiting_management", "awaiting_resident", "closed"] as const).map((key) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} style={{ border: "1px solid " + (filter === key ? "#D9A93F" : "#3A3A3A"), background: filter === key ? "#2A2110" : "transparent", color: filter === key ? "#F0C766" : "#888", borderRadius: 20, padding: "7px 10px", fontSize: 11, cursor: "pointer" }}>
                    {key === "all" ? "All" : key === "awaiting_management" ? "Needs response" : key === "awaiting_resident" ? "Awaiting resident" : "Closed"} · {counts[key]}
                  </button>
                ))}
              </div>
              {!visibleTickets.length ? <p style={{ color: "#888", fontSize: 12, padding: "24px 8px" }}>No tickets in this view.</p> : visibleTickets.map((ticket) => (
                <button key={ticket.id} type="button" onClick={() => { setSelected(ticket); setError(""); }} style={{ width: "100%", textAlign: "left", display: "block", padding: 13, marginBottom: 8, borderRadius: 10, border: "1px solid " + (selected?.id === ticket.id ? "#D9A93F" : "#333"), background: selected?.id === ticket.id ? "#211B0E" : "#101010", color: "#EEE", cursor: "pointer" }}>
                  <strong style={{ display: "block", fontSize: 12 }}>{ticket.subject}</strong>
                  <span style={{ display: "block", color: "#A6A6A6", fontSize: 10, marginTop: 5 }}>{people[ticket.resident_user_id] || "Resident"} · {estates[ticket.estate_id] || "Estate"}</span>
                  <span style={{ display: "block", color: ticket.status === "awaiting_management" ? "#F0C766" : "#999", fontSize: 10, marginTop: 6 }}>{statusText[ticket.status]}</span>
                  <span style={{ display: "block", color: "#777", fontSize: 9, marginTop: 5 }}>{new Date(ticket.updated_at).toLocaleString("en-NG")}</span>
                </button>
              ))}
            </section>
            <section className="panel" style={{ minWidth: 0 }}>
              {!selected ? <div style={{ padding: "44px 12px", textAlign: "center", color: "#888" }}><h3 style={{ color: "#EEE" }}>Select a support ticket</h3><p>Open a resident request to read the conversation and send a response.</p></div> : (
                <>
                  <div className="module-toolbar"><div><h3>{selected.subject}</h3><p>{people[selected.resident_user_id] || "Resident"} · {estates[selected.estate_id] || "Estate"}</p></div><span className="role-chip">{statusText[selected.status].toUpperCase()}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 0", maxHeight: 470, overflowY: "auto" }}>
                    {messages.map((message) => {
                      const mine = message.sender_user_id === selected.resident_user_id;
                      return <div key={message.id} style={{ alignSelf: mine ? "flex-start" : "flex-end", maxWidth: "86%", padding: 12, borderRadius: 12, background: mine ? "#171717" : "#2A2110", border: "1px solid " + (mine ? "#333" : "#6B5420") }}>
                        <small style={{ color: mine ? "#AAA" : "#F0C766", fontWeight: 800 }}>{mine ? "RESIDENT" : "FACILITY MANAGER"}</small>
                        <p style={{ color: "#EEE", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: "6px 0" }}>{message.body}</p>
                        <small style={{ color: "#888" }}>{new Date(message.created_at).toLocaleString("en-NG")}</small>
                      </div>;
                    })}
                  </div>
                  {selected.status !== "closed" ? <div style={{ borderTop: "1px solid #333", paddingTop: 14 }}>
                    <label style={{ display: "block", color: "#AAA", fontSize: 11, marginBottom: 7 }}>Your response</label>
                    <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} maxLength={10000} placeholder="Write a clear response to the resident…" style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "#0B0B0B", color: "#EEE", border: "1px solid #444", borderRadius: 8, padding: 12, font: "12px inherit" }} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 10 }}>
                      <button type="button" onClick={closeTicket} style={{ border: "1px solid #555", background: "transparent", color: "#AAA", borderRadius: 7, padding: "9px 12px", cursor: "pointer" }}>Close ticket</button>
                      <button type="button" disabled={sending || !reply.trim()} onClick={sendReply} className="primary-action">{sending ? "Sending…" : "Send response →"}</button>
                    </div>
                  </div> : <p style={{ color: "#888", fontSize: 12, borderTop: "1px solid #333", paddingTop: 14 }}>This ticket is closed.</p>}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </PortalFrame>
  );
}
