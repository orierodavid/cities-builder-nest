import React, { useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useGate } from "../../src/features/security/useGate";
import { useSecurityContext } from "../../src/features/security/SecurityContext";

export default function SecurityRecordsRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { estate } = useSecurityContext();
  const gate = useGate();
  useEffect(() => { void gate.loadGateVisits(); }, [gate.loadGateVisits]);
  return <SafeAreaView edges={["left", "right"]} style={s.root}><View style={{ flex: 1, paddingTop: insets.top }}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.replace("/(security)" as never)}><Text style={s.back}>‹ Back</Text></TouchableOpacity>
      <Text style={s.headerTitle}>VISITOR RECORDS</Text>
      <TouchableOpacity onPress={() => void gate.loadGateVisits()}><Text style={s.refresh}>REFRESH</Text></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]}>
      <Text style={s.eyebrow}>GATE ACTIVITY</Text><Text style={s.title}>Visitors currently inside</Text>
      <Text style={s.subtitle}>{estate?.name || "Assigned estate"} · Live active visits</Text>
      {!!gate.gateVisitsError && <Text style={s.error}>{gate.gateVisitsError}</Text>}
      {!!gate.message && <Text style={s.message}>{gate.message}</Text>}
      {gate.gateVisitsLoading ? <ActivityIndicator color="#D9A93F" size="large" /> : gate.gateVisits.length ? gate.gateVisits.map((visit) =>
        <View key={visit.id} style={s.card}>
          <View style={s.row}><Text style={s.visitorName}>{visit.visitor_passes?.visitor_name || "Visitor"}</Text><Text style={s.inside}>INSIDE</Text></View>
          <Text style={s.meta}>{visit.visitor_passes?.visitor_phone || "Phone not provided"}</Text>
          <Text style={s.meta}>Checked in {new Date(visit.checked_in_at).toLocaleString()}</Text>
          <TouchableOpacity disabled={gate.busy} onPress={() => void gate.checkOutVisitor(visit.id)} style={[s.checkout, gate.busy && s.disabled]}>
            <Text style={s.checkoutText}>CHECK OUT VISITOR</Text>
          </TouchableOpacity>
        </View>) : <View style={s.empty}><Text style={s.visitorName}>No active visitors</Text>
          <Text style={s.meta}>Visitors who have checked in will appear here until they are checked out.</Text></View>}
    </ScrollView>
  </View></SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  header: { minHeight: 56, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  back: { color: "#D9A93F", fontSize: 14, fontWeight: "700" }, headerTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  refresh: { color: "#D9A93F", fontSize: 10, fontWeight: "900" }, content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  eyebrow: { color: "#D9A93F", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, title: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  subtitle: { color: "#A7A095", fontSize: 12, marginBottom: 8 }, error: { color: "#FF9292", fontSize: 12, lineHeight: 18 },
  message: { color: "#F0C766", fontSize: 11, lineHeight: 17 }, card: { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 15 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, visitorName: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", flex: 1 },
  inside: { color: "#80D9A5", backgroundColor: "#173B29", overflow: "hidden", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, fontSize: 9, fontWeight: "900" },
  meta: { color: "#A7A095", fontSize: 11, lineHeight: 17, marginTop: 6 }, checkout: { marginTop: 13, borderRadius: 9, borderWidth: 1, borderColor: "#6A552F", paddingVertical: 11, alignItems: "center" },
  checkoutText: { color: "#F5D58D", fontWeight: "900", fontSize: 10 }, disabled: { opacity: 0.45 }, empty: { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 20, alignItems: "center", gap: 5 },
});
