import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";

type Estate = { id: string; name: string; membershipRole?: string | null };
type Incident = {
  id: string; title: string; category: string; severity: string; description: string;
  location: string | null; status: string; occurred_at: string; created_at: string;
};
const GOLD = "#D4A84B";
const CATEGORIES = [
  { value: "unauthorised_access", label: "Unauthorised access" },
  { value: "theft", label: "Theft" },
  { value: "property_damage", label: "Property damage" },
  { value: "disturbance", label: "Disturbance" },
  { value: "safety_hazard", label: "Safety hazard" },
  { value: "medical", label: "Medical" },
  { value: "fire", label: "Fire" },
  { value: "other", label: "Other" },
];
const SEVERITIES = ["low", "medium", "high", "critical"];
const CARD = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 15 } as const;

export default function SecurityIncidentsRoute() {
  const router = useRouter();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const base = getApiBaseUrl();

  const headers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      if (!base) throw new Error("Security services are not configured.");
      const requestHeaders = await headers();
      const estateResponse = await fetch(base + "/v1/estates", { headers: requestHeaders });
      const estatePayload = await estateResponse.json() as { estates?: Estate[]; error?: string };
      if (!estateResponse.ok) throw new Error(estatePayload.error || "Estate access could not be loaded.");
      const assigned = (estatePayload.estates || []).find(item =>
        (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "security",
      );
      if (!assigned) throw new Error("No active Security membership was found.");
      setEstate(assigned);
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(assigned.id) + "/security/incidents", { headers: requestHeaders });
      const payload = await response.json() as { incidents?: Incident[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Incident records could not be loaded.");
      setIncidents(payload.incidents || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Incident records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [base, headers]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!estate || title.trim().length < 3 || description.trim().length < 10) {
      setMessage("Enter an incident title and a description of at least 10 characters.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const requestHeaders = await headers();
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/security/incidents", {
        method: "POST", headers: requestHeaders,
        body: JSON.stringify({ title: title.trim(), category, severity, description: description.trim(), location: location.trim() }),
      });
      const payload = await response.json() as { incident?: Incident; error?: string; message?: string };
      if (!response.ok || !payload.incident) throw new Error(payload.message || payload.error || "Incident report could not be submitted.");
      setIncidents(current => [payload.incident!, ...current]);
      setTitle(""); setDescription(""); setLocation(""); setCategory("other"); setSeverity("medium");
      setMessage("Incident report submitted and recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Incident report could not be submitted.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={GOLD} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#080808" }}>
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: GOLD, fontWeight: "800" }}>‹ Back</Text></TouchableOpacity>
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>INCIDENTS</Text>
        <TouchableOpacity onPress={() => void load()}><Text style={{ color: GOLD, fontSize: 11, fontWeight: "800" }}>REFRESH</Text></TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}>
        <View style={{ gap: 5 }}>
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>SECURITY · INCIDENT LOG</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900" }}>Report an incident</Text>
          <Text style={{ color: "#A7A095", fontSize: 12 }}>{estate?.name || "Assigned estate"} · Reports are recorded against this estate and your officer account.</Text>
        </View>
        <View style={CARD}>
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>NEW INCIDENT REPORT</Text>
          <Text style={label}>Incident title</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={160} placeholder="Briefly describe the incident" placeholderTextColor="#777" style={input} />
          <Text style={label}>Category</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {CATEGORIES.map(item => <TouchableOpacity key={item.value} onPress={() => setCategory(item.value)} style={{ borderWidth: 1, borderColor: category === item.value ? GOLD : "#494133", backgroundColor: category === item.value ? "#302718" : "#101010", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 10 }}><Text style={{ color: category === item.value ? "#F5D58D" : "#B9B9B9", fontSize: 10, fontWeight: "700" }}>{item.label}</Text></TouchableOpacity>)}
          </View>
          <Text style={label}>Severity</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {SEVERITIES.map(item => <TouchableOpacity key={item} onPress={() => setSeverity(item)} style={{ flex: 1, borderWidth: 1, borderColor: severity === item ? GOLD : "#494133", backgroundColor: severity === item ? "#302718" : "#101010", borderRadius: 9, paddingVertical: 10, alignItems: "center" }}><Text style={{ color: severity === item ? "#F5D58D" : "#B9B9B9", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{item}</Text></TouchableOpacity>)}
          </View>
          <Text style={label}>Location (optional)</Text>
          <TextInput value={location} onChangeText={setLocation} maxLength={240} placeholder="e.g. Main gate, Block B" placeholderTextColor="#777" style={input} />
          <Text style={label}>Incident details</Text>
          <TextInput value={description} onChangeText={setDescription} multiline maxLength={5000} placeholder="Describe what happened, who was involved and the action taken..." placeholderTextColor="#777" textAlignVertical="top" style={[input, { minHeight: 112, paddingTop: 12 }]} />
          <TouchableOpacity disabled={saving} onPress={() => void submit()} style={{ marginTop: 14, minHeight: 48, borderRadius: 10, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
            {saving ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontWeight: "900" }}>SUBMIT INCIDENT REPORT</Text>}
          </TouchableOpacity>
        </View>
        {message ? <Text style={{ color: message.includes("submitted") ? "#80D9A5" : "#FF9292", fontSize: 12, lineHeight: 18 }}>{message}</Text> : null}
        <View style={{ gap: 9 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>Incident history</Text>
          {!incidents.length ? <View style={CARD}><Text style={{ color: "#A7A095", fontSize: 12 }}>No incident reports have been recorded for this estate.</Text></View> : incidents.map(item => (
            <View key={item.id} style={CARD}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13, flex: 1 }}>{item.title}</Text>
                <Text style={{ color: item.severity === "critical" || item.severity === "high" ? "#FF9A83" : GOLD, fontSize: 9, fontWeight: "900", textTransform: "uppercase" }}>{item.severity}</Text>
              </View>
              <Text style={{ color: GOLD, fontSize: 10, marginTop: 6 }}>{CATEGORIES.find(x => x.value === item.category)?.label || item.category} · {item.status.replace("_", " ").toUpperCase()}</Text>
              <Text style={{ color: "#B9B9B9", fontSize: 11, lineHeight: 17, marginTop: 7 }}>{item.description}</Text>
              <Text style={{ color: "#817B70", fontSize: 10, marginTop: 8 }}>{item.location ? item.location + " · " : ""}{new Date(item.occurred_at).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const label = { color: "#C9B88F", fontSize: 10, fontWeight: "800" as const, marginTop: 14, marginBottom: 7 };
const input = { minHeight: 46, backgroundColor: "#101010", borderColor: "#494133", borderWidth: 1, borderRadius: 10, color: "#FFFFFF", paddingHorizontal: 12, fontSize: 12 };
