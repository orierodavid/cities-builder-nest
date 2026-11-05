import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";

type Estate = { id: string; name: string; membershipRole?: string | null };
type Visit = { id: string; checked_in_at: string; visitor_passes?: { visitor_name?: string; visitor_phone?: string } | null };
export default function SecurityRecordsRoute() {
  const router = useRouter();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const base = getApiBaseUrl();
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
      const headers = { Authorization: "Bearer " + session.access_token, Accept: "application/json" };
      const estateResponse = await fetch(base + "/v1/estates", { headers });
      const estateResult = await estateResponse.json() as { estates?: Estate[]; error?: string };
      if (!estateResponse.ok) throw new Error(estateResult.error || "Estate access could not be loaded.");
      const selected = (estateResult.estates || []).find(item => (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "security");
      if (!selected) throw new Error("No active Security membership was found.");
      setEstate(selected);
      const visitsResponse = await fetch(base + "/v1/estates/" + encodeURIComponent(selected.id) + "/gate/visits", { headers });
      const visitsResult = await visitsResponse.json() as { visits?: Visit[]; error?: string };
      if (!visitsResponse.ok) throw new Error(visitsResult.error || "Visitor records could not be loaded.");
      setVisits(visitsResult.visits || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Visitor records could not be loaded."); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  const checkout = async (visitId: string) => {
    if (!estate) return;
    setBusyId(visitId); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/gate/visits/" + encodeURIComponent(visitId) + "/check-out", {
        method: "POST", headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" },
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Visitor checkout failed.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Visitor checkout failed."); }
    finally { setBusyId(""); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: "#080808" }}>
    <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ color: "#D4A84B", fontSize: 14, fontWeight: "700" }}>‹ Back</Text></TouchableOpacity>
      <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "900" }}>VISITOR RECORDS</Text>
      <TouchableOpacity onPress={() => void load()}><Text style={{ color: "#D4A84B", fontSize: 12, fontWeight: "800" }}>REFRESH</Text></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
      <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>GATE ACTIVITY</Text>
      <Text style={{ color: "#FFFFFF", fontSize: 23, fontWeight: "900", marginTop: 5 }}>Visitors currently inside</Text>
      <Text style={{ color: "#A7A095", fontSize: 12, marginTop: 5, marginBottom: 18 }}>{estate?.name || "Assigned estate"} · Live active visits</Text>
      {error ? <Text style={{ color: "#FF9292", marginBottom: 14, lineHeight: 18 }}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#D4A84B" size="large" /> : visits.length ? visits.map(visit => (
        <View key={visit.id} style={{ backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800", flex: 1 }}>{visit.visitor_passes?.visitor_name || "Visitor"}</Text>
            <View style={{ backgroundColor: "#173B29", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ color: "#80D9A5", fontSize: 9, fontWeight: "900" }}>INSIDE</Text></View>
          </View>
          <Text style={{ color: "#A7A095", fontSize: 11, marginTop: 7 }}>{visit.visitor_passes?.visitor_phone || "Phone not provided"}</Text>
          <Text style={{ color: "#A7A095", fontSize: 11, marginTop: 4 }}>Checked in {new Date(visit.checked_in_at).toLocaleString()}</Text>
          <TouchableOpacity disabled={!!busyId} onPress={() => void checkout(visit.id)} style={{ marginTop: 13, borderRadius: 9, borderWidth: 1, borderColor: "#6A552F", paddingVertical: 11, alignItems: "center", opacity: busyId && busyId !== visit.id ? 0.45 : 1 }}>
            <Text style={{ color: "#F5D58D", fontWeight: "900", fontSize: 10 }}>{busyId === visit.id ? "CHECKING OUT…" : "CHECK OUT VISITOR"}</Text>
          </TouchableOpacity>
        </View>
      )) : <View style={{ backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 20, alignItems: "center" }}><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>No active visitors</Text><Text style={{ color: "#A7A095", fontSize: 11, textAlign: "center", marginTop: 5 }}>Visitors who have checked in will appear here until they are checked out.</Text></View>}
    </ScrollView>
  </SafeAreaView>;
}
