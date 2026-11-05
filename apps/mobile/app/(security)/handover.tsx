import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";

type Estate = { id: string; name: string; membershipRole?: string | null };
type Handover = {
  id: string; estate_id: string; outgoing_officer: string; shift_label: string;
  shift_started_at: string; shift_ended_at: string; handover_notes: string;
  pending_actions: string | null; status: string; acknowledged_by: string | null;
  acknowledged_at: string | null; created_at: string;
};
const GOLD = "#D4A84B";
const SHIFTS = ["Morning", "Afternoon", "Night"];
const CARD = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 15 } as const;

export default function SecurityHandoverRoute() {
  const router = useRouter();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [userId, setUserId] = useState("");
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [shiftLabel, setShiftLabel] = useState("Morning");
  const [notes, setNotes] = useState("");
  const [pendingActions, setPendingActions] = useState("");
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired. Sign in again.");
      setUserId(user.id);
      const headers = await getHeaders();
      const estateResponse = await fetch(base + "/v1/estates", { headers });
      const estatePayload = await estateResponse.json() as { estates?: Estate[]; error?: string };
      if (!estateResponse.ok) throw new Error(estatePayload.error || "Estate access could not be loaded.");
      const assigned = (estatePayload.estates || []).find(item =>
        (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "security",
      );
      if (!assigned) throw new Error("No active Security membership was found.");
      setEstate(assigned);
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(assigned.id) + "/security/shift-handovers", { headers });
      const payload = await response.json() as { handovers?: Handover[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Shift handovers could not be loaded.");
      setHandovers(payload.handovers || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Shift handovers could not be loaded.");
    } finally { setLoading(false); }
  }, [base, getHeaders]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!estate || notes.trim().length < 10) {
      setNotice("Enter handover notes of at least 10 characters."); return;
    }
    setSaving(true); setNotice("");
    try {
      const headers = await getHeaders();
      const ended = new Date();
      const started = new Date(ended.getTime() - 8 * 60 * 60 * 1000);
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/security/shift-handovers", {
        method: "POST", headers,
        body: JSON.stringify({
          shiftLabel, shiftStartedAt: started.toISOString(), shiftEndedAt: ended.toISOString(),
          handoverNotes: notes.trim(), pendingActions: pendingActions.trim(),
        }),
      });
      const payload = await response.json() as { handover?: Handover; error?: string; message?: string };
      if (!response.ok || !payload.handover) throw new Error(payload.message || payload.error || "Shift handover could not be saved.");
      setHandovers(current => [payload.handover!, ...current]);
      setNotes(""); setPendingActions("");
      setNotice("Shift handover recorded. Another assigned Security officer can acknowledge it.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Shift handover could not be saved.");
    } finally { setSaving(false); }
  };

  const acknowledge = async (item: Handover) => {
    if (!estate) return;
    setBusyId(item.id); setNotice("");
    try {
      const headers = await getHeaders();
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/security/shift-handovers/" + encodeURIComponent(item.id) + "/acknowledge", { method: "POST", headers });
      const payload = await response.json() as { handover?: { id: string; status: string; acknowledged_by: string; acknowledged_at: string }; error?: string };
      if (!response.ok || !payload.handover) throw new Error(payload.error || "Handover acknowledgement failed.");
      setHandovers(current => current.map(row => row.id === item.id ? { ...row, status: "acknowledged", acknowledged_by: payload.handover!.acknowledged_by, acknowledged_at: payload.handover!.acknowledged_at } : row));
      setNotice("Shift handover acknowledged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Handover acknowledgement failed.");
    } finally { setBusyId(""); }
  };

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={GOLD} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#080808" }}>
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: GOLD, fontWeight: "800" }}>‹ Back</Text></TouchableOpacity>
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>SHIFT HANDOVER</Text>
        <TouchableOpacity onPress={() => void load()}><Text style={{ color: GOLD, fontSize: 11, fontWeight: "800" }}>REFRESH</Text></TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 14 }}>
        <View style={{ gap: 5 }}>
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>SECURITY · SHIFT LOG</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900" }}>Shift handover</Text>
          <Text style={{ color: "#A7A095", fontSize: 12 }}>{estate?.name || "Assigned estate"} · Record outstanding matters for the incoming officer.</Text>
        </View>
        <View style={CARD}>
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>NEW HANDOVER</Text>
          <Text style={label}>Shift</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {SHIFTS.map(item => <TouchableOpacity key={item} onPress={() => setShiftLabel(item)} style={{ flex: 1, borderWidth: 1, borderColor: shiftLabel === item ? GOLD : "#494133", backgroundColor: shiftLabel === item ? "#302718" : "#101010", borderRadius: 9, padding: 11, alignItems: "center" }}><Text style={{ color: shiftLabel === item ? "#F5D58D" : "#B9B9B9", fontSize: 10, fontWeight: "800" }}>{item}</Text></TouchableOpacity>)}
          </View>
          <Text style={{ color: "#A7A095", fontSize: 10, marginTop: 9 }}>The handover window is recorded as the last 8 hours up to submission time.</Text>
          <Text style={label}>Handover notes</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline maxLength={4000} placeholder="Summarise patrols, incidents, access issues and anything the next officer must know..." placeholderTextColor="#777" textAlignVertical="top" style={inputLarge} />
          <Text style={label}>Outstanding actions (optional)</Text>
          <TextInput value={pendingActions} onChangeText={setPendingActions} multiline maxLength={3000} placeholder="List unresolved tasks requiring follow-up..." placeholderTextColor="#777" textAlignVertical="top" style={[inputLarge, { minHeight: 82 }]} />
          <TouchableOpacity disabled={saving} onPress={() => void submit()} style={{ marginTop: 14, minHeight: 48, borderRadius: 10, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
            {saving ? <ActivityIndicator color="#17130B" /> : <Text style={{ color: "#17130B", fontWeight: "900" }}>SUBMIT SHIFT HANDOVER</Text>}
          </TouchableOpacity>
        </View>
        {notice ? <Text style={{ color: notice.includes("recorded") || notice.includes("acknowledged") ? "#80D9A5" : "#FF9292", fontSize: 12, lineHeight: 18 }}>{notice}</Text> : null}
        <View style={{ gap: 9 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>Handover history</Text>
          {!handovers.length ? <View style={CARD}><Text style={{ color: "#A7A095", fontSize: 12 }}>No shift handovers have been recorded for this estate.</Text></View> : handovers.map(item => (
            <View key={item.id} style={CARD}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>{item.shift_label} shift</Text>
                <Text style={{ color: item.status === "pending" ? "#F2C66D" : "#80D9A5", fontSize: 9, fontWeight: "900" }}>{item.status.toUpperCase()}</Text>
              </View>
              <Text style={{ color: "#817B70", fontSize: 10, marginTop: 6 }}>{new Date(item.shift_started_at).toLocaleString()} – {new Date(item.shift_ended_at).toLocaleString()}</Text>
              <Text style={{ color: "#D5D0C5", fontSize: 11, lineHeight: 18, marginTop: 9 }}>{item.handover_notes}</Text>
              {item.pending_actions ? <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: GOLD, paddingLeft: 9 }}><Text style={{ color: GOLD, fontSize: 9, fontWeight: "900" }}>PENDING ACTIONS</Text><Text style={{ color: "#B9B9B9", fontSize: 11, lineHeight: 17, marginTop: 4 }}>{item.pending_actions}</Text></View> : null}
              {item.status === "pending" && item.outgoing_officer !== userId ? <TouchableOpacity disabled={busyId === item.id} onPress={() => void acknowledge(item)} style={{ marginTop: 12, minHeight: 40, borderWidth: 1, borderColor: "#6B8E72", borderRadius: 9, alignItems: "center", justifyContent: "center" }}>{busyId === item.id ? <ActivityIndicator color="#80D9A5" /> : <Text style={{ color: "#80D9A5", fontWeight: "800", fontSize: 10 }}>ACKNOWLEDGE HANDOVER</Text>}</TouchableOpacity> : null}
              {item.acknowledged_at ? <Text style={{ color: "#80D9A5", fontSize: 10, marginTop: 9 }}>Acknowledged {new Date(item.acknowledged_at).toLocaleString()}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const label = { color: "#C9B88F", fontSize: 10, fontWeight: "800" as const, marginTop: 14, marginBottom: 7 };
const inputLarge = { minHeight: 112, backgroundColor: "#101010", borderColor: "#494133", borderWidth: 1, borderRadius: 10, color: "#FFFFFF", paddingHorizontal: 12, paddingTop: 12, fontSize: 12 };
