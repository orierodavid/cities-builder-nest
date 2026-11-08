import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";

type Estate = { id: string; name: string; membershipRole?: string | null };
type EventRecord = { id: string; title: string; venue: string; starts_at: string; ends_at: string; status: string };
type VerificationResult = {
  verified: true;
  event: { title: string; venue: string };
  guest: { guest_name: string; email: string | null; phone: string | null };
  invitation: { id: string; status: "active" };
};

const GOLD = "#D4A84B";
const CARD = { backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1, borderRadius: 14, padding: 15 } as const;

export default function SecurityEventGuestsRoute() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const scanHandled = useRef(false);
  const base = getApiBaseUrl();

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
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
      const eventsResponse = await fetch(base + "/v1/estates/" + encodeURIComponent(assigned.id) + "/events", { headers });
      const eventsPayload = await eventsResponse.json() as { events?: EventRecord[]; error?: string };
      if (!eventsResponse.ok) throw new Error(eventsPayload.error || "Estate events could not be loaded.");
      const available = (eventsPayload.events || [])
        .filter(item => item.status === "published")
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      setEvents(available);
      setSelectedEventId(current => available.some(item => item.id === current) ? current : available[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Event guest verification could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [base, getHeaders]);

  useEffect(() => { void load(); }, [load]);

  const verify = async (rawCode: string) => {
    const cleanCode = rawCode.replace(/\D/g, "").slice(0, 6);
    if (cleanCode.length !== 6) {
      setMessage("Enter or scan the six-digit event invitation code.");
      return;
    }
    if (!estate || !selectedEventId) {
      setMessage("Select a published event before verifying an invitation.");
      return;
    }
    setBusy(true);
    setMessage("");
    setResult(null);
    setCameraOpen(false);
    try {
      const headers = await getHeaders();
      const response = await fetch(
        base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events/" + encodeURIComponent(selectedEventId) + "/security-verify",
        { method: "POST", headers, body: JSON.stringify({ code: cleanCode }) },
      );
      const payload = await response.json() as VerificationResult & { error?: string };
      if (!response.ok) {
        const errors: Record<string, string> = {
          event_invitation_not_found_or_inactive: "Invitation not found, expired or revoked. Do not admit this guest.",
          event_guest_already_checked_in: "This guest has already been checked in by the Event Coordinator.",
          event_not_open_for_guest_checkin: "This event is not published and cannot accept guest check-ins.",
          security_membership_required: "Your account is not assigned as Security to this estate.",
        };
        throw new Error(errors[payload.error || ""] || payload.error || "Event guest verification failed.");
      }
      setResult(payload);
      setCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Event guest verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleScan = (data: string) => {
    if (scanHandled.current || busy) return;
    scanHandled.current = true;
    setCameraOpen(false);
    const found = data.match(/\b\d{6}\b/)?.[0];
    if (!found) {
      setMessage("The QR code does not contain a six-digit event invitation code.");
      return;
    }
    setCode(found);
    void verify(found);
  };

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={GOLD} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#080808" }}>
      <View style={{ paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: GOLD, fontWeight: "800" }}>‹ Back</Text></TouchableOpacity>
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "900" }}>EVENT GUESTS</Text>
        <TouchableOpacity onPress={() => void load()}><Text style={{ color: GOLD, fontSize: 11, fontWeight: "800" }}>REFRESH</Text></TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 14 }}>
        <View style={{ gap: 5 }}>
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }}>SECURITY · EVENT ACCESS</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900" }}>Verify event guest</Text>
          <Text style={{ color: "#A7A095", fontSize: 12 }}>{estate?.name || "Assigned estate"} · Scan or enter the guest's invitation code.</Text>
        </View>
        <View style={CARD}>
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>SELECT EVENT</Text>
          {events.length ? events.map(item => (
            <TouchableOpacity key={item.id} onPress={() => { setSelectedEventId(item.id); setResult(null); setMessage(""); }} style={{ marginTop: 9, borderRadius: 10, borderWidth: 1, borderColor: selectedEventId === item.id ? GOLD : "#494133", backgroundColor: selectedEventId === item.id ? "#2A2418" : "#101010", padding: 12 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>{item.title}</Text>
              <Text style={{ color: "#A7A095", fontSize: 10, marginTop: 4 }}>{item.venue} · {new Date(item.starts_at).toLocaleString()}</Text>
            </TouchableOpacity>
          )) : <Text style={{ color: "#B9B9B9", fontSize: 12, marginTop: 9 }}>No published events are available for this estate.</Text>}
        </View>
        <View style={CARD}>
          <TouchableOpacity disabled={!selectedEventId || busy} onPress={() => { scanHandled.current = false; setMessage(""); setCameraOpen(value => !value); }} style={{ backgroundColor: GOLD, borderRadius: 10, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#17130B", fontWeight: "900" }}>{cameraOpen ? "CLOSE SCANNER" : "SCAN EVENT QR CODE"}</Text>
          </TouchableOpacity>
          {cameraOpen ? (
            <View style={{ marginTop: 12, gap: 9 }}>
              {!permission?.granted ? (
                <TouchableOpacity onPress={() => void requestPermission()} style={{ backgroundColor: "#302718", padding: 13, borderRadius: 9 }}>
                  <Text style={{ color: "#F5D58D", fontWeight: "800", textAlign: "center" }}>ALLOW CAMERA ACCESS</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ height: 270, overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: GOLD }}>
                  <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => handleScan(data)} />
                </View>
              )}
            </View>
          ) : null}
          <View style={{ height: 1, backgroundColor: "#393126", marginVertical: 14 }} />
          <Text style={{ color: GOLD, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>OR ENTER INVITATION CODE</Text>
          <TextInput value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="Six-digit invitation code" placeholderTextColor="#777" keyboardType="number-pad" maxLength={6} style={{ marginTop: 9, minHeight: 49, backgroundColor: "#101010", borderColor: "#494133", borderWidth: 1, borderRadius: 10, color: "#FFFFFF", paddingHorizontal: 13, fontSize: 17, letterSpacing: 4 }} />
          <TouchableOpacity disabled={busy || code.length !== 6 || !selectedEventId} onPress={() => void verify(code)} style={{ marginTop: 10, minHeight: 47, borderRadius: 10, backgroundColor: "#302718", borderWidth: 1, borderColor: "#6A552F", alignItems: "center", justifyContent: "center", opacity: busy || code.length !== 6 || !selectedEventId ? 0.5 : 1 }}>
            {busy ? <ActivityIndicator color={GOLD} /> : <Text style={{ color: "#F5D58D", fontWeight: "900" }}>VERIFY INVITATION & AUTHORISE ENTRY</Text>}
          </TouchableOpacity>
        </View>
        {message ? <Text style={{ color: "#FF9292", fontSize: 12, lineHeight: 18 }}>{message}</Text> : null}
        {result ? (
          <View style={[CARD, { borderColor: "#367A52" }]}>
            <Text style={{ color: "#80D9A5", fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>INVITATION VERIFIED · ENTRY AUTHORISED</Text>
            <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginTop: 7 }}>{result.guest.guest_name}</Text>
            <Text style={{ color: "#B9B9B9", fontSize: 12, marginTop: 5 }}>{result.event.title} · {result.event.venue}</Text>
            {result.guest.phone ? <Text style={{ color: "#B9B9B9", fontSize: 12, marginTop: 4 }}>{result.guest.phone}</Text> : null}
            {result.guest.email ? <Text style={{ color: "#B9B9B9", fontSize: 12, marginTop: 4 }}>{result.guest.email}</Text> : null}
            <Text style={{ color: "#80D9A5", fontSize: 11, marginTop: 10 }}>Valid active invitation. Attendance has not been recorded; the Event Coordinator will check in the guest.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
