import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { getApiBaseUrl } from "../../lib/api-url";
import { theme as t } from "../../theme/theme";

type Estate = {
  id: string;
  name: string;
  membershipRole?: string | null;
  is_enabled?: boolean;
};
type EstateEvent = {
  id: string;
  title: string;
  description: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  status: "draft" | "published" | "cancelled";
  venue_approval_status?: "pending" | "approved" | "rejected";
};
type AttendanceSummary = {
  totalGuests: number;
  checkedIn: number;
  outstanding: number;
  activeInvitations: number;
  attendancePercentage: number;
};
type EventReport = { summary: AttendanceSummary };
type DashboardEvent = EstateEvent & { summary: AttendanceSummary | null };

const CARD = { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 15 } as const;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"] }) {
  return (
    <View style={[CARD, styles.statCard]}>
      <MaterialCommunityIcons name={icon} size={20} color={t.goldSoft} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function EventDashboard() {
  const router = useRouter();
  const base = getApiBaseUrl();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState(false);

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setReportError(false);
    try {
      if (!base) throw new Error("The event service is not configured on this device.");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("Your session has expired. Sign in again.");
      const headers = {
        Authorization: "Bearer " + session.access_token,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const estateResponse = await fetch(base + "/v1/estates", { headers });
      const estatePayload = await estateResponse.json() as { estates?: Estate[]; error?: string };
      if (!estateResponse.ok) throw new Error(estatePayload.error || "Your estate access could not be loaded.");
      const assignedEstate = (estatePayload.estates || []).find((item) =>
        (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "resident" && item.is_enabled !== false,
      );
      if (!assignedEstate) throw new Error("No active resident membership was found for an enabled estate.");
      setEstate(assignedEstate);

      const eventsResponse = await fetch(base + "/v1/estates/" + encodeURIComponent(assignedEstate.id) + "/events", { headers });
      const eventsPayload = await eventsResponse.json() as { events?: EstateEvent[]; error?: string };
      if (!eventsResponse.ok) throw new Error(eventsPayload.error || "Events could not be loaded.");
      const eventRows = eventsPayload.events || [];

      // One aggregate request replaces one attendance-report request per event.
      const summaryResponse = await fetch(
        base + "/v1/estates/" + encodeURIComponent(assignedEstate.id) + "/events/attendance-summaries",
        { headers },
      );
      const summaryPayload = summaryResponse.ok
        ? await summaryResponse.json() as { summaries?: Array<AttendanceSummary & { eventId: string }> }
        : { summaries: [] };
      const summaryRows = summaryPayload.summaries || [];
      const summaryByEvent = new Map(summaryRows.map((summary) => [summary.eventId, summary]));
      setReportError(!summaryResponse.ok || summaryRows.length !== eventRows.length);
      setEvents(eventRows.map((event) => ({ ...event, summary: summaryByEvent.get(event.id) || null })));
    } catch (cause) {
      setEstate(null);
      setEvents([]);
      setError(cause instanceof Error ? cause.message : "The event dashboard could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [base]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const reports = events.map((event) => event.summary).filter((summary): summary is AttendanceSummary => summary !== null);
  const metricsAvailable = events.length === 0 || reports.length === events.length;
  const totals = reports.reduce(
    (total, summary) => ({
      guests: total.guests + summary.totalGuests,
      checkedIn: total.checkedIn + summary.checkedIn,
      invitations: total.invitations + summary.activeInvitations,
    }),
    { guests: 0, checkedIn: 0, invitations: 0 },
  );
  const upcomingEvents = events.filter((event) => event.status === "published" && event.venue_approval_status !== "pending" && new Date(event.ends_at).getTime() >= Date.now()).length;
  const activeEvents = events.filter((event) => event.status === "published" && event.venue_approval_status !== "pending").length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar barStyle="light-content" backgroundColor={t.bg} />
        <View style={styles.loading}><ActivityIndicator color={t.gold} size="large" /><Text style={styles.muted}>Loading event dashboard…</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadDashboard(true)} tintColor={t.gold} />}
      >
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="calendar-star" size={25} color={t.gold} />
            <Text style={styles.brand}>CB NEST</Text>
          </View>
          <TouchableOpacity onPress={() => void loadDashboard(true)} accessibilityRole="button" accessibilityLabel="Refresh event dashboard" style={styles.refreshButton}>
            <MaterialCommunityIcons name="refresh" size={20} color={t.goldSoft} />
          </TouchableOpacity>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.eyebrow}>EVENT MANAGEMENT</Text>
          <Text style={styles.heading}>Event Dashboard</Text>
          <Text style={styles.subheading}>{estate?.name || "Your assigned estate"}</Text>
        </View>

        {error ? (
          <View style={[CARD, styles.messageCard]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={23} color={t.redText} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => void loadDashboard()} style={styles.retryButton}>
              <Text style={styles.retryText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard label="Upcoming events" value={String(upcomingEvents)} icon="calendar-clock" />
              <StatCard label="Published events" value={String(activeEvents)} icon="calendar-check" />
              <StatCard label="Total guests" value={metricsAvailable ? String(totals.guests) : "—"} icon="account-group-outline" />
              <StatCard label="Checked in" value={metricsAvailable ? String(totals.checkedIn) : "—"} icon="account-check-outline" />
              <StatCard label="Active invitations" value={metricsAvailable ? String(totals.invitations) : "—"} icon="ticket-confirmation-outline" />
              <StatCard label="Awaiting check-in" value={metricsAvailable ? String(Math.max(0, totals.guests - totals.checkedIn)) : "—"} icon="account-clock-outline" />
            </View>

            {reportError ? (
              <View style={styles.notice}>
                <MaterialCommunityIcons name="information-outline" size={17} color={t.goldSoft} />
                <Text style={styles.noticeText}>Some attendance figures could not be retrieved. Unavailable figures are shown as dashes, not zero.</Text>
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <View><Text style={styles.sectionTitle}>Your events</Text><Text style={styles.countText}>{events.length} total</Text></View>
              <TouchableOpacity onPress={() => router.push("/(resident)/create-event")} style={styles.createButton}>
                <MaterialCommunityIcons name="plus" size={17} color="#17130B" /><Text style={styles.createButtonText}>CREATE EVENT</Text>
              </TouchableOpacity>
            </View>

            {events.length === 0 ? (
              <View style={[CARD, styles.emptyCard]}>
                <View style={styles.emptyIcon}><MaterialCommunityIcons name="calendar-plus" size={30} color={t.goldSoft} /></View>
                <Text style={styles.emptyTitle}>No events yet</Text>
                <Text style={styles.emptyText}>Events you create for this estate will appear here with live guest and attendance figures.</Text>
                <TouchableOpacity onPress={() => router.push("/(resident)/create-event")} style={styles.createButton}><MaterialCommunityIcons name="plus" size={17} color="#17130B" /><Text style={styles.createButtonText}>CREATE FIRST EVENT</Text></TouchableOpacity>
              </View>
            ) : (
              events.map((event) => (
                <TouchableOpacity key={event.id} activeOpacity={0.82} onPress={() => router.push({ pathname: "/(resident)/[eventId]", params: { eventId: event.id } })} style={[CARD, styles.eventCard]}>
                  <View style={styles.eventTop}>
                    <View style={styles.eventTitleWrap}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <Text style={styles.eventVenue}>{event.venue}</Text>
                    </View>
                    <View style={[styles.statusPill, event.venue_approval_status === "pending" ? styles.draftPill : event.status === "published" ? styles.publishedPill : event.status === "cancelled" ? styles.cancelledPill : styles.draftPill]}>
                      <Text style={[styles.statusText, event.venue_approval_status === "pending" ? styles.draftText : event.status === "published" ? styles.publishedText : event.status === "cancelled" ? styles.cancelledText : styles.draftText]}>{event.venue_approval_status === "pending" ? "PENDING APPROVAL" : event.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.eventMeta}>
                    <MaterialCommunityIcons name="calendar-outline" size={15} color={t.goldSoft} />
                    <Text style={styles.eventMetaText}>{formatDate(event.starts_at)}</Text>
                  </View>
                  <View style={styles.eventStats}>
                    <View><Text style={styles.eventStatValue}>{event.summary ? event.summary.totalGuests : "—"}</Text><Text style={styles.eventStatLabel}>Guests</Text></View>
                    <View><Text style={styles.eventStatValue}>{event.summary ? event.summary.activeInvitations : "—"}</Text><Text style={styles.eventStatLabel}>Invited</Text></View>
                    <View><Text style={styles.eventStatValue}>{event.summary ? event.summary.checkedIn : "—"}</Text><Text style={styles.eventStatLabel}>Checked in</Text></View>
                    <View><Text style={styles.eventStatValue}>{event.summary ? event.summary.attendancePercentage + "%" : "—"}</Text><Text style={styles.eventStatLabel}>Attendance</Text></View>
                  </View>
                  <View style={styles.openEventRow}><Text style={styles.openEventText}>MANAGE EVENT</Text><MaterialCommunityIcons name="arrow-right" size={16} color={t.goldSoft} /></View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
        <Text style={styles.footer}>Live figures from your estate event records</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 18, paddingBottom: 42 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brand: { color: t.gold, fontSize: 20, fontWeight: "900", letterSpacing: 1.1 },
  refreshButton: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, alignItems: "center", justifyContent: "center" },
  headingBlock: { marginTop: 25, marginBottom: 20, gap: 5 },
  eyebrow: { color: t.goldSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.7 },
  heading: { color: t.text, fontSize: 27, fontWeight: "900" },
  subheading: { color: t.muted, fontSize: 13 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  statCard: { width: "48.3%", minHeight: 112, padding: 14, justifyContent: "center", gap: 5 },
  statValue: { color: t.text, fontSize: 25, fontWeight: "900" },
  statLabel: { color: t.muted, fontSize: 11, fontWeight: "600" },
  messageCard: { padding: 16, gap: 10 },
  errorText: { color: t.redText, fontSize: 13, lineHeight: 19 },
  retryButton: { alignSelf: "flex-start", backgroundColor: "#302718", paddingHorizontal: 15, paddingVertical: 10, borderRadius: 9, marginTop: 2 },
  retryText: { color: t.goldSoft, fontSize: 11, fontWeight: "900" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 13, padding: 12, borderRadius: 11, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.border },
  noticeText: { flex: 1, color: t.goldSoft, fontSize: 11, lineHeight: 17 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: t.text, fontSize: 17, fontWeight: "800" },
  countText: { color: t.muted, fontSize: 11, marginTop: 3 },
  createButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: t.gold, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 9 },
  createButtonText: { color: "#17130B", fontSize: 9, fontWeight: "900" },
  openEventRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: "#292929" },
  openEventText: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  emptyCard: { alignItems: "center", padding: 24, gap: 9 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#211B10", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: t.text, fontSize: 16, fontWeight: "800" },
  emptyText: { color: t.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  eventCard: { padding: 15, marginBottom: 11, gap: 12 },
  eventTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  eventTitleWrap: { flex: 1, gap: 4 },
  eventTitle: { color: t.text, fontSize: 16, fontWeight: "800" },
  eventVenue: { color: t.muted, fontSize: 11 },
  statusPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  publishedPill: { backgroundColor: "#10271B", borderColor: "#245D3B" },
  cancelledPill: { backgroundColor: "#2A1717", borderColor: "#633030" },
  draftPill: { backgroundColor: "#211B10", borderColor: t.border },
  statusText: { fontSize: 9, fontWeight: "900" },
  publishedText: { color: "#83D7A3" },
  cancelledText: { color: "#F2A5A5" },
  draftText: { color: t.goldSoft },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  eventMetaText: { color: t.muted, fontSize: 11 },
  eventStats: { flexDirection: "row", justifyContent: "space-between", paddingTop: 11, borderTopWidth: 1, borderTopColor: "#292929" },
  eventStatValue: { color: t.text, fontSize: 17, fontWeight: "800" },
  eventStatLabel: { color: t.muted, fontSize: 9, marginTop: 2 },
  footer: { color: "#696969", fontSize: 10, textAlign: "center", marginTop: 24 },
  muted: { color: t.muted, fontSize: 12 },
});
