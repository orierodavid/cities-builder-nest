import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
const TITLES: Record<string, string> = {
  "event-guests": "Event Guest Verification", vehicles: "Vehicle Registration", "entry-records": "Visitor Entry Records",
  "exit-records": "Visitor Exit Records", incidents: "Incident Reporting", emergency: "Emergency Alerts",
  handover: "Shift Handover", alerts: "Security Alerts", profile: "Security Profile",
};
export default function SecuritySectionRoute() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const title = TITLES[String(section || "")] || "Security Workspace";
  return <View style={{ flex: 1, backgroundColor: "#080808" }}>
    <View style={{ padding: 18, paddingTop: 56, flexDirection: "row", justifyContent: "space-between" }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ color: "#D4A84B", fontWeight: "800" }}>‹ Back</Text></TouchableOpacity>
      <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900" }}>CB NEST · SECURITY</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 22, flexGrow: 1, justifyContent: "center" }}>
      <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>SECURITY WORKSPACE</Text>
      <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 8 }}>{title}</Text>
      <Text style={{ color: "#A7A095", fontSize: 13, lineHeight: 21, marginTop: 10 }}>This module is not connected to live estate records yet. No sample records or placeholder figures are shown.</Text>
    </ScrollView>
  </View>;
}
