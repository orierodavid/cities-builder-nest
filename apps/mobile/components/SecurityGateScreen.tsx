import { useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import VisitorDetails, { type Visitor } from "./VisitorDetails";

type GateVisitor = {
  visitor: { name: string; phone: string | null };
  host: { name: string | null };
  pass: { id: string; validFrom: string; validUntil: string; status: string };
  availabilityError: string | null;
};
type Visit = { id: string; checked_in_at: string; visitor_passes?: { visitor_name?: string; visitor_phone?: string } | null };

type Props = {
  estateName: string;
  visitorCode: string;
  visitor: GateVisitor | null;
  busy: boolean;
  message: string;
  visits: Visit[];
  visitsLoading: boolean;
  visitsError: string;
  onCodeChange: (code: string) => void;
  onLookup: (code: string) => void;
  onApprove: () => void;
  onDeny: () => void;
  onRefreshVisits: () => void;
  onCheckout: (visitId: string) => void;
  onClearVisitor: () => void;
  initialScannerOpen?: boolean;
};

export default function SecurityGateScreen(props: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(Boolean(props.initialScannerOpen));
  const [scanMessage, setScanMessage] = useState("");
  const scanHandled = useRef(false);

  function handleScan(data: string) {
    if (!cameraOpen || scanHandled.current) return;
    scanHandled.current = true;
    setCameraOpen(false);
    const code = data.match(/\b\d{6}\b/)?.[0];
    if (!code) {
      setScanMessage("This QR code does not contain a valid six-digit visitor access code.");
      return;
    }
    setScanMessage("");
    props.onLookup(code);
  }

  const card = { backgroundColor: "#121212", borderColor: "#3A2E12", borderWidth: 1, borderRadius: 15, padding: 15, gap: 10 } as const;
  const muted = { color: "#B9B9B9", fontSize: 12, lineHeight: 18 } as const;
  const button = { minHeight: 47, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 14 };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ backgroundColor: "#050505", gap: 15, paddingHorizontal: 18, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 20) + 12 }}>
      <View style={{ gap: 5 }}>
        <Text style={{ color: "#D9A93F", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 }}>GATE OPERATIONS</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 27, fontWeight: "900", letterSpacing: -0.5 }}>Verify Visitor</Text>
        <Text style={muted}>{props.estateName || "Assigned estate"} · Verify access before admitting visitors.</Text>
      </View>
      <View style={card}>
        <TouchableOpacity onPress={() => { setScanMessage(""); setCameraOpen((open) => { if (!open) scanHandled.current = false; return !open; }); }} style={[button, { backgroundColor: "#D9A93F", flexDirection: "row", gap: 9 }]}>
          <Text style={{ color: "#17130B", fontSize: 13, fontWeight: "900" }}>{cameraOpen ? "CLOSE SCANNER" : "SCAN VISITOR QR CODE"}</Text>
        </TouchableOpacity>
        {cameraOpen && (
          <View style={{ gap: 9 }}>
            {!permission?.granted ? (
              <View style={{ padding: 14, borderRadius: 10, backgroundColor: "#211D15", gap: 10 }}>
                <Text style={{ color: "#F0C766", fontWeight: "800" }}>Camera permission required</Text>
                <Text style={muted}>Allow camera access to scan visitor QR codes at the gate.</Text>
                <TouchableOpacity onPress={() => void requestPermission()} style={[button, { backgroundColor: "#D4A84B" }]}><Text style={{ color: "#17130B", fontWeight: "900" }}>ALLOW CAMERA</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", aspectRatio: width < 360 || height < 650 ? 1.05 : 1.2, maxHeight: Math.min(420, height * 0.55), overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: "#D9A93F" }}>
                <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => handleScan(data)} />
                <View pointerEvents="none" style={{ position: "absolute", left: "17%", right: "17%", top: "17%", bottom: "17%", borderWidth: 3, borderColor: "#D4A84B", borderRadius: 14 }} />
              </View>
            )}
          </View>
        )}
        {!!scanMessage && <Text style={{ color: "#FF9292", fontSize: 12 }}>{scanMessage}</Text>}
        <View style={{ height: 1, backgroundColor: "#393126", marginVertical: 2 }} />
        <Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>ENTER ACCESS CODE MANUALLY</Text>
        <TextInput accessibilityLabel="Six-digit visitor access code" value={props.visitorCode} onChangeText={(value) => props.onCodeChange(value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter six-digit code" placeholderTextColor="#777" keyboardType="number-pad" maxLength={6} style={{ minHeight: 49, backgroundColor: "#101010", borderColor: "#494133", borderWidth: 1, borderRadius: 10, color: "#FFFFFF", paddingHorizontal: 13, fontSize: 16, letterSpacing: 3 }} />
        <TouchableOpacity disabled={props.busy || props.visitorCode.length !== 6} onPress={() => props.onLookup(props.visitorCode)} style={[button, { backgroundColor: "#302718", borderWidth: 1, borderColor: "#6A552F", opacity: props.busy || props.visitorCode.length !== 6 ? 0.55 : 1 }]}>
          {props.busy ? <ActivityIndicator color="#D4A84B" /> : <Text style={{ color: "#F5D58D", fontWeight: "900" }}>VERIFY ACCESS CODE</Text>}
        </TouchableOpacity>
      </View>
      {!!props.message && <Text style={{ color: props.message.toLowerCase().includes("found") ? "#7DDAA2" : "#FF9292", fontSize: 12 }}>{props.message}</Text>}
      {props.visitor && (() => {
        const validFrom = new Date(props.visitor.pass.validFrom);
        const validUntil = new Date(props.visitor.pass.validUntil);
        const validFromMs = validFrom.getTime();
        const validUntilMs = validUntil.getTime();
        const now = Date.now();
        const visitorDetails: Visitor = {
          name: props.visitor.visitor.name,
          category: "Personal Visitor",
          valid: !props.visitor.availabilityError
            && props.visitor.pass.status === "active"
            && Number.isFinite(validFromMs)
            && Number.isFinite(validUntilMs)
            && validFromMs <= now
            && now <= validUntilMs,
          accessCode: props.visitorCode,
          host: props.visitor.host.name || "Not available",
          property: props.estateName || "Assigned estate",
          date: Number.isNaN(validFrom.getTime()) ? "Not available" : validFrom.toLocaleDateString(),
          time: Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())
            ? "Not available"
            : validFrom.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " – " + validUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          accessType: "Visitor pass",
        };
        return <VisitorDetails visitor={visitorDetails} busy={props.busy} onBack={props.onClearVisitor} onApprove={props.onApprove} onDeny={props.onDeny} />;
      })()}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }}>VISITORS CURRENTLY INSIDE</Text>
          <TouchableOpacity onPress={props.onRefreshVisits}><Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900" }}>REFRESH</Text></TouchableOpacity>
        </View>
        {props.visitsLoading ? <ActivityIndicator color="#D4A84B" /> : props.visitsError ? <Text style={{ color: "#FF9292", fontSize: 12 }}>{props.visitsError}</Text> : props.visits.length ? props.visits.map((visit) => (
          <View key={visit.id} style={[card, { flexDirection: "row", alignItems: "center" }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>{visit.visitor_passes?.visitor_name || "Visitor"}</Text>
              <Text style={muted}>Checked in {new Date(visit.checked_in_at).toLocaleString()}</Text>
            </View>
            <TouchableOpacity disabled={props.busy} onPress={() => props.onCheckout(visit.id)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: "#6A552F", opacity: props.busy ? 0.5 : 1 }}><Text style={{ color: "#D4A84B", fontSize: 10, fontWeight: "900" }}>CHECK OUT</Text></TouchableOpacity>
          </View>
        )) : <View style={card}><Text style={{ color: "#FFFFFF", fontWeight: "800" }}>No active visits</Text><Text style={muted}>Visitors currently inside the estate will appear here.</Text></View>}
      </View>
    </ScrollView>
  );
}