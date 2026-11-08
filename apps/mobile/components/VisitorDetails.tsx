import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme as t } from "../src/theme/theme";

export type Visitor = {
  name: string;
  category: string;
  valid: boolean;
  accessCode: string;
  host: string;
  property: string;
  date: string;
  time: string;
  accessType: string;
  vehicle?: string;
};

type Props = {
  visitor: Visitor;
  busy?: boolean;
  onBack?: () => void;
  onApprove?: () => void;
  onDeny?: () => void;
};

export default function VisitorDetails({ visitor: v, busy = false, onBack, onApprove, onDeny }: Props) {
  const insets = useSafeAreaInsets();
  const rows: [string, string][] = [
    ["Access Code", v.accessCode],
    ["Host", v.host],
    ["Property", v.property],
    ["Date", v.date],
    ["Time", v.time],
    ["Access Type", v.accessType],
    ["Vehicle (Optional)", v.vehicle ?? "-"],
  ];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={s.title}>Visitor Details</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <View style={s.topRow}>
            <View style={s.avatar}><Ionicons name="person" size={30} color="#555" /></View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.name}>{v.name}</Text>
              <Text style={s.category}>{v.category}</Text>
            </View>
          </View>
          <View style={[s.status, { backgroundColor: v.valid ? "#123522" : "#351614" }]}>
            <Text style={{ color: v.valid ? "#80D9A5" : "#F2B5B0", fontSize: 12, fontWeight: "600" }}>
              {v.valid ? "Valid Access Code" : "Invalid / Expired Code"}
            </Text>
          </View>
          {rows.map(([k, val]) => (
            <View key={k} style={s.row}>
              <Text style={s.key}>{k}</Text>
              <Text style={s.val}>{val}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 + insets.bottom }}>
        <TouchableOpacity
          style={[s.approve, (!v.valid || busy) && { opacity: 0.5 }]}
          disabled={!v.valid || busy}
          onPress={onApprove}
          accessibilityRole="button"
        >
          <Text style={s.approveText}>{busy ? "Please wait..." : "Approve Entry"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.deny, busy && { opacity: 0.5 }]} disabled={busy} onPress={onDeny} accessibilityRole="button">
          <Text style={s.denyText}>Deny Entry</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: t.text, fontSize: 17, fontWeight: "700" },
  card: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 17 },
  topRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
  name: { color: t.text, fontSize: 17, fontWeight: "700" },
  category: { color: t.muted, fontSize: 12, marginTop: 2 },
  status: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#292319" },
  key: { color: t.goldSoft, fontSize: 13, flexShrink: 1, paddingRight: 8 },
  val: { color: "#111", fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  approve: { backgroundColor: t.gold, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  approveText: { color: "#000", fontWeight: "700", fontSize: 15 },
  deny: { backgroundColor: "#351614", borderWidth: 1, borderColor: "#8E1B14", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  denyText: { color: t.redText, fontWeight: "700", fontSize: 15 },
});
