import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";
import { theme as t } from "../../src/theme/theme";

type Estate = { id: string; name: string; membershipRole?: string | null };
type EventRow = { id: string; title: string; description: string; venue: string; starts_at: string; ends_at: string; status: "draft" | "published" | "cancelled"; venue_approval_status?: "pending" | "approved" | "rejected" };
type Guest = { id: string; guest_name: string; email: string | null; phone: string | null; notes: string | null };
type Invitation = { id: string; guest_id: string; status: string; created_at: string; estate_event_guests?: { guest_name: string; email: string | null; phone: string | null } };
type Report = { summary: { totalGuests: number; checkedIn: number; outstanding: number; activeInvitations: number; attendancePercentage: number }; guests: Array<Guest & { invitationStatus: string; checkedInAt: string | null; attendanceStatus: string }> };

export default function EventManagementScreen() {
  const { eventId: rawId } = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const base = getApiBaseUrl();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"guests" | "invitations" | "attendance">("guests");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [issuedMessage, setIssuedMessage] = useState("");

  const headers = useCallback(async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    if (!eventId || !base) { setError("Event details are unavailable."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const authHeaders = await headers();
      const estateResponse = await fetch(base + "/v1/estates", { headers: authHeaders });
      const estatePayload = await estateResponse.json() as { estates?: Estate[]; error?: string };
      if (!estateResponse.ok) throw new Error(estatePayload.error || "Estate access could not be loaded.");
      const assigned = (estatePayload.estates || []).find(item => (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "resident");
      if (!assigned) throw new Error("No active resident membership was found.");
      setEstate(assigned);
      const root = base + "/v1/estates/" + encodeURIComponent(assigned.id) + "/events/" + encodeURIComponent(eventId);
      const [eventsResponse, guestsResponse, invitesResponse, reportResponse] = await Promise.all([
        fetch(base + "/v1/estates/" + encodeURIComponent(assigned.id) + "/events", { headers: authHeaders }),
        fetch(root + "/guests", { headers: authHeaders }),
        fetch(root + "/invitations", { headers: authHeaders }),
        fetch(root + "/attendance-report", { headers: authHeaders }),
      ]);
      const [eventsPayload, guestsPayload, invitesPayload, reportPayload] = await Promise.all([
        eventsResponse.json(), guestsResponse.json(), invitesResponse.json(), reportResponse.json(),
      ]) as [
        { events?: EventRow[]; error?: string },
        { guests?: Guest[]; error?: string },
        { invitations?: Invitation[]; error?: string },
        Report & { error?: string }
      ];
      if (!eventsResponse.ok) throw new Error(eventsPayload.error || "Events could not be loaded.");
      if (!guestsResponse.ok) throw new Error(guestsPayload.error || "Guest list could not be loaded.");
      if (!invitesResponse.ok) throw new Error(invitesPayload.error || "Invitations could not be loaded.");
      if (!reportResponse.ok) throw new Error(reportPayload.error || "Attendance report could not be loaded.");
      const selected = (eventsPayload.events || []).find(item => item.id === eventId);
      if (!selected) throw new Error("This event could not be found in your estate.");
      setEvent(selected); setGuests(guestsPayload.guests || []); setInvitations(invitesPayload.invitations || []); setReport(reportPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Event information could not be loaded.");
    } finally { setLoading(false); }
  }, [base, eventId, headers]);

  useEffect(() => { void load(); }, [load]);

  const addGuest = async () => {
    if (name.trim().length < 2) { setError("Enter the guest's name."); return; }
    if (!estate || !eventId) return;
    setBusy(true); setError(""); setIssuedCode("");
    try {
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events/" + encodeURIComponent(eventId) + "/guests", {
        method: "POST", headers: await headers(), body: JSON.stringify({ guestName: name.trim(), email: email.trim(), phone: phone.trim(), notes: notes.trim() }),
      });
      const payload = await response.json() as { guest?: Guest; error?: string; message?: string };
      if (!response.ok || !payload.guest) throw new Error(payload.message || payload.error || "Guest could not be added.");
      setName(""); setEmail(""); setPhone(""); setNotes("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Guest could not be added."); }
    finally { setBusy(false); }
  };

  const issueInvitation = async (guest: Guest) => {
    if (!estate || !eventId) return;
    setBusy(true); setError(""); setIssuedCode("");
    try {
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events/" + encodeURIComponent(eventId) + "/guests/" + encodeURIComponent(guest.id) + "/invitations", {
        method: "POST", headers: await headers(), body: JSON.stringify({}),
      });
      const payload = await response.json() as { code?: string; error?: string };
      if (!response.ok || !payload.code) throw new Error(payload.error || "Invitation could not be generated.");
      const invitationMessage = [
        "You're invited to " + (event?.title || "an estate event") + "!",
        event?.venue ? "Venue: " + event.venue : "",
        event?.starts_at ? "Date: " + new Date(event.starts_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "",
        "Guest: " + guest.guest_name,
        "Your event access code: " + payload.code,
        "Please present this code to Security at the estate gate.",
      ].filter(Boolean).join("\n");
      setIssuedCode(payload.code);
      setIssuedMessage(invitationMessage);
      setTab("invitations");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation could not be generated."); }
    finally { setBusy(false); }
  };

  const revokeInvitation = async (invitation: Invitation) => {
    if (!estate || !eventId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events/" + encodeURIComponent(eventId) + "/invitations/" + encodeURIComponent(invitation.id) + "/revoke", {
        method: "POST", headers: await headers(), body: JSON.stringify({}),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Invitation could not be revoked.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation could not be revoked."); }
    finally { setBusy(false); }
  };

  const removeGuest = (guest: Guest) => {
    Alert.alert("Remove guest?", "Remove " + guest.guest_name + " from this event?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { void (async () => {
        if (!estate || !eventId) return;
        setBusy(true); setError("");
        try {
          const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events/" + encodeURIComponent(eventId) + "/guests/" + encodeURIComponent(guest.id), { method: "DELETE", headers: await headers() });
          const payload = await response.json() as { error?: string };
          if (!response.ok) throw new Error(payload.error || "Guest could not be removed.");
          await load();
        } catch (e) { setError(e instanceof Error ? e.message : "Guest could not be removed."); }
        finally { setBusy(false); }
      })(); } },
    ]);
  };

  const changeStatus = async (status: EventRow["status"]) => {
    if (!estate || !event) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events/" + encodeURIComponent(event.id), {
        method: "PATCH", headers: await headers(),
        body: JSON.stringify({ title: event.title, description: event.description || "", venue: event.venue, startsAt: event.starts_at, endsAt: event.ends_at, status }),
      });
      const payload = await response.json() as { event?: EventRow; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error || "Event status could not be updated.");
      setEvent(payload.event);
    } catch (e) { setError(e instanceof Error ? e.message : "Event status could not be updated."); }
    finally { setBusy(false); }
  };

  if (loading) return <SafeAreaView style={s.safe} edges={["top"]}><View style={s.center}><ActivityIndicator color={t.gold} size="large" /><Text style={s.muted}>Loading event…</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={s.header}><TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Back</Text></TouchableOpacity><Text style={s.headerTitle}>Event management</Text><TouchableOpacity onPress={() => void load()}><Text style={s.refresh}>REFRESH</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {event ? <>
          <Text style={s.eyebrow}>{estate?.name || "ESTATE EVENT"}</Text>
          <Text style={s.title}>{event.title}</Text>
          <Text style={s.muted}>{event.venue} · {new Date(event.starts_at).toLocaleString()}</Text>
          <View style={s.statusRow}>
            <Text style={s.status}>{event.venue_approval_status === "pending" ? "VENUE APPROVAL · PENDING" : "STATUS · " + event.status.toUpperCase()}</Text>
            {event.status !== "cancelled" && event.venue_approval_status !== "pending" ? <TouchableOpacity disabled={busy} onPress={() => void changeStatus(event.status === "published" ? "draft" : "published")}><Text style={s.statusAction}>{event.status === "published" ? "UNPUBLISH" : "PUBLISH"}</Text></TouchableOpacity> : null}
            {event.status !== "cancelled" ? <TouchableOpacity disabled={busy} onPress={() => void changeStatus("cancelled")}><Text style={s.cancelAction}>CANCEL EVENT</Text></TouchableOpacity> : null}
          </View>
          {report ? <View style={s.metrics}>
            <Metric value={String(report.summary.totalGuests)} label="Guests" />
            <Metric value={String(report.summary.activeInvitations)} label="Invited" />
            <Metric value={String(report.summary.checkedIn)} label="Checked in" />
            <Metric value={report.summary.attendancePercentage + "%"} label="Attendance" />
          </View> : null}
          <View style={s.tabs}>
            {(["guests", "invitations", "attendance"] as const).map(item => <TouchableOpacity key={item} onPress={() => setTab(item)} style={[s.tab, tab === item && s.tabActive]}><Text style={[s.tabText, tab === item && s.tabTextActive]}>{item.toUpperCase()}</Text></TouchableOpacity>)}
          </View>
          {tab === "guests" ? <>
            <Text style={s.section}>Add a guest</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Guest full name *" placeholderTextColor="#777" style={s.input} />
            <TextInput value={email} onChangeText={setEmail} placeholder="Email address (optional)" placeholderTextColor="#777" autoCapitalize="none" keyboardType="email-address" style={s.input} />
            <TextInput value={phone} onChangeText={setPhone} placeholder="Phone number (optional)" placeholderTextColor="#777" keyboardType="phone-pad" style={s.input} />
            <TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor="#777" style={s.input} />
            <TouchableOpacity disabled={busy} onPress={() => void addGuest()} style={s.primary}>{busy ? <ActivityIndicator color="#17130B" /> : <Text style={s.primaryText}>ADD GUEST</Text>}</TouchableOpacity>
            <Text style={s.section}>Guest list · {guests.length}</Text>
            {guests.map(guest => <View key={guest.id} style={s.item}>
              <View style={{ flex: 1, gap: 4 }}><Text style={s.itemTitle}>{guest.guest_name}</Text><Text style={s.itemMeta}>{guest.email || guest.phone || "No contact details"}</Text></View>
              <TouchableOpacity disabled={busy || event.status !== "published"} onPress={() => void issueInvitation(guest)} style={s.smallAction}><Text style={s.smallActionText}>INVITE</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy} onPress={() => removeGuest(guest)}><Text style={s.remove}>REMOVE</Text></TouchableOpacity>
            </View>)}
            {!guests.length ? <Text style={s.empty}>No guests added yet.</Text> : null}
          </> : null}
          {tab === "invitations" ? <>
            <Text style={s.section}>Invitation register · {invitations.length}</Text>
            {issuedCode ? <View style={s.codeCard}><Text style={s.codeLabel}>NEW INVITATION CODE</Text><Text selectable style={s.code}>{issuedCode}</Text><TouchableOpacity onPress={() => void Clipboard.setStringAsync(issuedCode)}><Text style={s.copy}>COPY CODE</Text></TouchableOpacity><Text style={s.codeHint}>The previous active code for this guest was revoked. Share the invitation by WhatsApp, SMS or another messaging app.</Text><TouchableOpacity onPress={() => void Clipboard.setStringAsync(issuedMessage || issuedCode)}><Text style={s.copy}>COPY INVITATION</Text></TouchableOpacity><TouchableOpacity onPress={() => void Share.share({ message: issuedMessage || issuedCode, title: "Event invitation" })} style={s.smallAction}><Text style={s.smallActionText}>SHARE VIA WHATSAPP / SMS</Text></TouchableOpacity></View> : null}
            {invitations.map(invitation => <View key={invitation.id} style={s.item}>
              <View style={{ flex: 1, gap: 4 }}><Text style={s.itemTitle}>{invitation.estate_event_guests?.guest_name || "Guest"}</Text><Text style={s.itemMeta}>{invitation.estate_event_guests?.email || invitation.estate_event_guests?.phone || "No contact details"} · {new Date(invitation.created_at).toLocaleDateString()}</Text></View>
              <Text style={[s.inviteStatus, invitation.status === "active" ? s.active : s.revoked]}>{invitation.status.toUpperCase()}</Text>
              {invitation.status === "active" ? <TouchableOpacity disabled={busy} onPress={() => void revokeInvitation(invitation)}><Text style={s.remove}>REVOKE</Text></TouchableOpacity> : null}
            </View>)}
            {!invitations.length ? <Text style={s.empty}>No invitations have been issued.</Text> : null}
          </> : null}
          {tab === "attendance" ? <>
            <Text style={s.section}>Attendance report</Text>
            {report ? <>
              <View style={s.metrics}><Metric value={String(report.summary.outstanding)} label="Outstanding" /><Metric value={String(report.summary.totalGuests)} label="Guest list" /></View>
              {report.guests.map(guest => <View key={guest.id} style={s.item}><View style={{ flex: 1, gap: 4 }}><Text style={s.itemTitle}>{guest.guest_name}</Text><Text style={s.itemMeta}>{guest.checkedInAt ? "Checked in " + new Date(guest.checkedInAt).toLocaleString() : "Not checked in"}</Text></View><Text style={[s.inviteStatus, guest.attendanceStatus === "checked_in" ? s.active : s.revoked]}>{guest.attendanceStatus === "checked_in" ? "PRESENT" : "PENDING"}</Text></View>)}
            </> : <Text style={s.empty}>Attendance report is unavailable.</Text>}
          </> : null}
        </> : <Text style={s.error}>{error || "Event not found."}</Text>}
        {error ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  header: { minHeight: 52, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { color: t.goldSoft, fontWeight: "800", width: 42 },
  headerTitle: { color: t.text, fontSize: 15, fontWeight: "800" },
  refresh: { color: t.goldSoft, fontSize: 10, fontWeight: "900" },
  content: { padding: 17, paddingBottom: 40, gap: 10 },
  eyebrow: { color: t.goldSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 10 },
  title: { color: t.text, fontSize: 24, fontWeight: "900" },
  muted: { color: t.muted, fontSize: 11 },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, backgroundColor: t.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: t.border, marginTop: 8 },
  status: { color: t.muted, fontSize: 10, fontWeight: "800", flex: 1 },
  statusAction: { color: t.goldSoft, fontSize: 10, fontWeight: "900" },
  cancelAction: { color: "#F2A5A5", fontSize: 10, fontWeight: "900" },
  metrics: { flexDirection: "row", justifyContent: "space-between", gap: 7, marginVertical: 8 },
  metric: { flex: 1, backgroundColor: t.card, borderRadius: 10, padding: 11, borderWidth: 1, borderColor: t.border },
  metricValue: { color: t.text, fontSize: 19, fontWeight: "900" },
  metricLabel: { color: t.muted, fontSize: 9, marginTop: 3 },
  tabs: { flexDirection: "row", backgroundColor: t.card, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: t.border, marginTop: 8 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  tabActive: { backgroundColor: "#342A17" },
  tabText: { color: t.muted, fontSize: 9, fontWeight: "900" },
  tabTextActive: { color: t.goldSoft },
  section: { color: t.text, fontSize: 15, fontWeight: "900", marginTop: 13, marginBottom: 3 },
  input: { backgroundColor: "#101010", borderWidth: 1, borderColor: t.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 12, color: t.text, fontSize: 13 },
  primary: { backgroundColor: t.gold, borderRadius: 9, minHeight: 45, alignItems: "center", justifyContent: "center", marginTop: 3 },
  primaryText: { color: "#17130B", fontSize: 10, fontWeight: "900" },
  item: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, marginTop: 8 },
  itemTitle: { color: t.text, fontSize: 12, fontWeight: "800" },
  itemMeta: { color: t.muted, fontSize: 10 },
  smallAction: { backgroundColor: "#342A17", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7 },
  smallActionText: { color: t.goldSoft, fontSize: 9, fontWeight: "900" },
  remove: { color: "#F0A3A3", fontSize: 9, fontWeight: "900" },
  empty: { color: t.muted, fontSize: 12, paddingVertical: 15 },
  codeCard: { backgroundColor: "#211B10", borderColor: t.gold, borderWidth: 1, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 10, gap: 8 },
  codeLabel: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  code: { color: t.text, fontSize: 34, fontWeight: "900", letterSpacing: 6 },
  copy: { color: t.goldSoft, fontSize: 10, fontWeight: "900" },
  codeHint: { color: t.muted, fontSize: 10, textAlign: "center", lineHeight: 15 },
  inviteStatus: { fontSize: 9, fontWeight: "900" },
  active: { color: "#80D9A5" },
  revoked: { color: "#F0A3A3" },
  error: { color: "#F2A5A5", fontSize: 12, lineHeight: 18, marginTop: 8 },
});
