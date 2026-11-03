import React from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ImageBackground, StyleSheet, StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme as t } from "../src/theme/theme";

export type EventInfo = {
  title: string;
  date: string;
  time: string;
  venue: string;
  type: string;
  image?: string;
  invited: number;
  registered: number;
  checkedIn: number;
  pending: number;
};

type Props = {
  event: EventInfo;
  onBack?: () => void;
  onNavigate?: (route: string) => void;
};

type Action = {
  label: string;
  route: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
};

const ACTIONS: Action[] = [
  { label: "Manage Guest List", route: "guest-list", icon: "account-group-outline" },
  { label: "Send Invitations", route: "invitations", icon: "email-outline" },
  { label: "Check-In Guests", route: "check-in", icon: "qrcode-scan" },
  { label: "Attendance Report", route: "attendance", icon: "chart-bar" },
  { label: "Event Settings", route: "settings", icon: "cog-outline" },
];

export default function EventDetails({ event: e, onBack, onNavigate = () => {} }: Props) {
  const insets = useSafeAreaInsets();
  const stats: { label: string; value: number; highlight?: boolean }[] = [
    { label: "Invited", value: e.invited },
    { label: "Registered", value: e.registered },
    { label: "Checked In", value: e.checkedIn, highlight: true },
    { label: "Pending", value: e.pending },
  ];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Event Details</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={e.image ? { uri: e.image } : undefined}
          style={s.hero}
          imageStyle={{ borderRadius: 16 }}
        >
          <View style={s.heroOverlay}>
            <Text style={s.eventTitle}>{e.title}</Text>
            <View style={s.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={t.goldSoft} />
              <Text style={s.meta}>{e.date}</Text>
              <Ionicons name="time-outline" size={13} color={t.goldSoft} style={{ marginLeft: 12 }} />
              <Text style={s.meta}>{e.time}</Text>
            </View>
            <View style={[s.metaRow, { justifyContent: "space-between" }]}>
              <View style={s.metaRow}>
                <Ionicons name="location-outline" size={13} color={t.goldSoft} />
                <Text style={s.meta}>{e.venue}</Text>
              </View>
              <View style={s.typeChip}><Text style={s.typeText}>{e.type}</Text></View>
            </View>
          </View>
        </ImageBackground>
        <View style={s.statsRow}>
          {stats.map(st => (
            <View key={st.label} style={[s.stat, st.highlight && { borderColor: t.green }]}>
              <Text style={s.statValue}>{st.value}</Text>
              <Text style={[s.statLabel, st.highlight && { color: t.green }]}>{st.label}</Text>
            </View>
          ))}
        </View>
        <View style={s.actions}>
          {ACTIONS.map((a, i) => (
            <TouchableOpacity
              key={a.route}
              style={[s.action, i < ACTIONS.length - 1 && s.actionDivider]}
              onPress={() => onNavigate(a.route)}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name={a.icon} size={22} color={t.goldSoft} />
              <Text style={s.actionText}>{a.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={t.muted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { color: t.text, fontSize: 17, fontWeight: "700" },
  hero: { height: 190, borderRadius: 16, backgroundColor: "#1B1B1B", overflow: "hidden", marginBottom: 14 },
  heroOverlay: { flex: 1, padding: 14, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  eventTitle: { color: t.text, fontSize: 19, fontWeight: "800", marginBottom: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  meta: { color: "#E6E6E6", fontSize: 12, marginLeft: 5, flexShrink: 1 },
  typeChip: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: "rgba(255,255,255,0.08)" },
  typeText: { color: t.text, fontSize: 10 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  stat: { width: "23.5%", backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  statValue: { color: t.text, fontSize: 20, fontWeight: "800" },
  statLabel: { color: t.muted, fontSize: 10, marginTop: 2 },
  actions: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14 },
  action: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 16 },
  actionDivider: { borderBottomWidth: 1, borderBottomColor: "#1F1F1F" },
  actionText: { flex: 1, color: t.text, fontSize: 14, fontWeight: "600", marginLeft: 14 },
});
