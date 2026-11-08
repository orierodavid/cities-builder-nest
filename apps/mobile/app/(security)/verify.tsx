import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import SecurityVerify from "../../components/VerifyVisitor";
import VisitorDetails, { type Visitor } from "../../components/VisitorDetails";
import { useGate } from "../../src/features/security/useGate";
import { visitorApiErrorMessage } from "../../src/features/security/visitor-api";
import { useSecurityContext } from "../../src/features/security/SecurityContext";

export default function SecurityVerifyRoute() {
  const router = useRouter();
  const gate = useGate();
  const { estate } = useSecurityContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [scanned, setScanned] = useState(false);
  const visitor = gate.gateVisitor;
  const from = visitor ? new Date(visitor.pass.validFrom) : null;
  const until = visitor ? new Date(visitor.pass.validUntil) : null;
  const valid = !!visitor && !visitor.availabilityError && visitor.pass.status === "active" && !!from && !!until
    && Number.isFinite(from.getTime()) && Number.isFinite(until.getTime())
    && from.getTime() <= Date.now() && Date.now() <= until.getTime();
  const details: Visitor | null = visitor && from && until ? {
    name: visitor.visitor.name, category: "Personal Visitor", valid, accessCode: gate.visitorCode,
    host: visitor.host.name || "Not available", property: estate?.name || "Assigned estate",
    date: Number.isFinite(from.getTime()) ? from.toLocaleDateString() : "Not available",
    time: Number.isFinite(from.getTime()) && Number.isFinite(until.getTime())
      ? from.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " – " + until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "Not available",
    accessType: "Visitor pass",
  } : null;
  if (details) return <SafeAreaView edges={["left", "right"]} style={s.root}>
    <VisitorDetails visitor={details} busy={gate.busy} denyDisabled={visitor.pass.status !== "active"} onBack={gate.clearGateVisitor}
      onApprove={() => void gate.approveGateVisitor()} onDeny={() => void gate.denyGateVisitor()} />
    {visitor.availabilityError ? <Text style={s.status}>{visitorApiErrorMessage(visitor.availabilityError)}</Text> : !!gate.message && <Text style={s.status}>{gate.message}</Text>}
  </SafeAreaView>;
  const camera = permission?.granted ? <CameraView style={StyleSheet.absoluteFill} facing={facing}
    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
    onBarcodeScanned={scanned ? undefined : ({ data }) => { setScanned(true); void gate.lookupGateVisitor(data).finally(() => setScanned(false)); }} /> : undefined;
  return <SafeAreaView edges={["left", "right"]} style={s.root}><View style={s.fill}>
    <SecurityVerify onBack={() => router.replace("/(security)" as never)}
      onCodeSubmit={(code) => void gate.lookupGateVisitor(code)}
      onSwitchCamera={() => { if (!permission?.granted) void requestPermission(); else setFacing((current) => current === "back" ? "front" : "back"); }}
      camera={camera} />
    {!!gate.message && <Text style={s.status}>{gate.message}</Text>}
  </View></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: "#0A0A0A" }, fill: { flex: 1 }, status: { color: "#F0C766", fontSize: 11, lineHeight: 17, paddingHorizontal: 20, paddingBottom: 10 } });
