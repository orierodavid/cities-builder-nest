import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";

type Estate = { id: string; name: string; membershipRole?: string | null };
type AlertRecord = {
  id: string; alert_type: string; severity: string; title: string; message: string;
  location: string | null; status: string; created_at: string; resolved_at: string | null;
};
const GOLD = "#D4A84B";
const TYPES = [
  { value: "security_threat", label: "Security threat" }, { value: "fire", label: "Fire" },
  { value: "medical", label: "Medical" }, { value: "utility", label: "Utility" },
  { value: "weather", label: "Weather" }, { value: "other", label: "Other" },
];
const CARD = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 15 } as const;

export default function SecurityEmergencyRoute() {
  const router = useRouter();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertType, setAlertType] = useState("security_threat");
  const [severity, setSeverity] = useState("high");
  const [title, setTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const base = getApiBaseUrl();

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      if (!base) throw new Error("Security services are not configured.");
      const headers = await getHeaders();
      const estateResponse = await fetch(base + "/v1/estates", { headers });
      const estatePayload = await estateResponse.json() as { estates?: Estate[]; error?: string };
      if (!estateResponse.ok) throw new Error(estatePayload.error || "Estate access could not be loaded.");
      const assigned = (estatePayload.estates || []).find(item =>
        (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "security",
      );
      if (!assigned) throw new Error("No active Security membership was found.");
      setEstate(assigned);
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(assigned.id) + "/emergency-alerts", { headers });
      const payload = await response.json() as { alerts?: AlertRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Emergency alerts could not be loaded.");
      setAlerts(payload.alerts || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Emergency alerts could not be loaded.");
    } finally { setLoading(false); }
  }, [base, getHeaders]);

  useEffect(() => { void load(); }, [load]);

  const issue = async () => {
    if (!estate || title.trim().length < 3 || messageText.trim().length < 10) {
      setNotice("Enter an alert title and a clear message of at least 10 characters."); return;
    }
    setSaving(true); setNotice("");
    try {
      const headers = await getHeaders();
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/emergency-alerts", {
        method: "POST", headers,
        body: JSON.stringify({ alertType, severity, title: title.trim(), message: messageText.trim(), location: location.trim() }),
      });
      const payload = await response.json() as { alert?: AlertRecord; recipientCount?: number; error?: string; message?: string };
      if (!response.ok || !payload.alert) throw new Error(payload.message || payload.error || "Emergency alert could not be issued.");
      setAlerts(current => [payload.alert!, ...current]);
      setTitle(""); setMessageText(""); setLocation("");
      setNotice(payload.recipientCount
        ? "Emergency alert recorded and delivered to " + payload.recipientCount + " active resident inbox(es)."
        : "Emergency alert recorded. No active resident inboxes were available for delivery.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Emergency alert could not be issued.");
    } finally { setSaving(false); }
  };

  const resolve = async (alert: AlertRecord) => {
    if (!estate) return;
    setBusyId(alert.id); setNotice("");
    try {
      const headers = await getHeaders();
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/emergency-alerts/" + encodeURIComponent(alert.id) + "/resolve", { method: "POST", headers });
      const payload = await response.json() as { alert?: { id: string; status: string; resolved_at: string }; error?: string };
      if (!response.ok || !payload.alert) throw new Error(payload.error || "Alert could not be resolved.");
      setAlerts(current => current.map(item => item.id === alert.id ? { ...item, status: "resolved", resolved_at: payload.alert!.resolved_at } : item));
      setNotice("Emergency alert marked as resolved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Alert could not be resolved.");
    } finally { setBusyId(""); }
  };

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={GOLD} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#080808" }}>
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: GOLD, fontWeight: "800" }}>‹ Back</Text></TouchableOpacity>
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>EMERGENCY ALERTS</Text>
        <TouchableOpacity onPress={() => void load()}><Text style={{ color: GOLD, fontSize: 11, fontWeight: "800" }}>REFRESH</Text></TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 14 }}>
        <View style={{ gap: 5 }}>
          <Text style={{ color: "#F07A65", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>SECURITY · EMERGENCY RESPONSE</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900" }}>Emergency alerts</Text>
          <Text style={{ color: "#A7A095", fontSize: 12 }}>{estate?.name || "Assigned estate"} · Alerts are visible in-app to active members of this estate.</Text>
        </View>
        <View style={[CARD, { borderColor: "#744034" }]}>
          <Text style={{ color: "#F08A73", fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>ISSUE AN EMERGENCY ALERT</Text>
          <Text style={label}>Emergency type</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {TYPES.map(item => <TouchableOpacity key={item.value} onPress={() => setAlertType(item.value)} style={{ borderWidth: 1, borderColor: alertType === item.value ? "#E27660" : "#494133", backgroundColor: alertType === item.value ? "#38201B" : "#101010", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 10 }}><Text style={{ color: alertType === item.value ? "#FFB4A3" : "#B9B9B9", fontSize: 10, fontWeight: "700" }}>{item.label}</Text></TouchableOpacity>)}
          </View>
          <Text style={label}>Severity</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["high", "critical"].map(item => <TouchableOpacity key={item} onPress={() => setSeverity(item)} style={{ flex: 1, borderWidth: 1, borderColor: severity === item ? "#E27660" : "#494133", backgroundColor: severity === item ? "#38201B" : "#101010", borderRadius: 9, padding: 12, alignItems: "center" }}><Text style={{ color: severity === item ? "#FFB4A3" : "#B9B9B9", fontSize: 11, fontWeight: "900", textTransform: "uppercase" }}>{item}</Text></TouchableOpacity>)}
          </View>
          <Text style={label}>Alert title</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={160} placeholder="e.g. Fire reported at Block C" placeholderTextColor="#777" style={input} />
          <Text style={label}>Location (optional)</Text>
          <TextInput value={location} onChangeText={setLocation} maxLength={240} placeholder="Where is the emergency?" placeholderTextColor="#777" style={input} />
          <Text style={label}>Instructions / details</Text>
          <TextInput value={messageText} onChangeText={setMessageText} multiline maxLength={3000} placeholder="Describe the emergency and what residents should do..." placeholderTextColor="#777" textAlignVertical="top" style={[input, { minHeight: 105, paddingTop: 12 }]} />
          <TouchableOpacity disabled={saving} onPress={() => void issue()} style={{ marginTop: 14, minHeight: 48, borderRadius: 10, backgroundColor: "#C95342", alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>ISSUE EMERGENCY ALERT</Text>}
          </TouchableOpacity>
        </View>
        {notice ? <Text style={{ color: notice.includes("recorded") || notice.includes("resolved") ? "#80D9A5" : "#FF9292", fontSize: 12, lineHeight: 18 }}>{notice}</Text> : null}
        <View style={{ gap: 9 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>Alert history</Text>
          {!alerts.length ? <View style={CARD}><Text style={{ color: "#A7A095", fontSize: 12 }}>No emergency alerts have been recorded for this estate.</Text></View> : alerts.map(alert => (
            <View key={alert.id} style={[CARD, { borderColor: alert.status === "active" ? "#744034" : "#3A3020" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13, flex: 1 }}>{alert.title}</Text>
                <Text style={{ color: alert.status === "active" ? "#FF9A83" : "#80D9A5", fontSize: 9, fontWeight: "900" }}>{alert.status.toUpperCase()}</Text>
              </View>
              <Text style={{ color: "#F08A73", fontSize: 10, marginTop: 6 }}>{alert.alert_type.replace("_", " ").toUpperCase()} · {alert.severity.toUpperCase()}</Text>
              <Text style={{ color: "#B9B9B9", fontSize: 11, lineHeight: 17, marginTop: 7 }}>{alert.message}</Text>
              <Text style={{ color: "#817B70", fontSize: 10, marginTop: 8 }}>{alert.location ? alert.location + " · " : ""}{new Date(alert.created_at).toLocaleString()}</Text>
              {alert.status === "active" ? <TouchableOpacity disabled={busyId === alert.id} onPress={() => void resolve(alert)} style={{ marginTop: 11, minHeight: 40, borderWidth: 1, borderColor: "#6B8E72", borderRadius: 9, alignItems: "center", justifyContent: "center" }}>
                {busyId === alert.id ? <ActivityIndicator color="#80D9A5" /> : <Text style={{ color: "#80D9A5", fontWeight: "800", fontSize: 10 }}>MARK AS RESOLVED</Text>}
              </TouchableOpacity> : null}
            </View>
          ))}
        </View>
        <Text style={{ color: "#77716A", fontSize: 10, lineHeight: 15 }}>This release records in-app alerts. SMS, email and push notifications are not enabled yet.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const label = { color: "#C9B88F", fontSize: 10, fontWeight: "800" as const, marginTop: 14, marginBottom: 7 };
const input = { minHeight: 46, backgroundColor: "#101010", borderColor: "#494133", borderWidth: 1, borderRadius: 10, color: "#FFFFFF", paddingHorizontal: 12, fontSize: 12 };
