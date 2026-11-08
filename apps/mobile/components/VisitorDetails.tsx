import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme as t } from "../src/theme/theme";

export type Visitor = {
  name: string;
  category: string;
  photoUrl?: string;
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
  onBack: () => void;
  onApprove: () => void;
  onDeny: () => void;
};

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function VisitorDetails({ visitor: v, busy = false, onBack, onApprove, onDeny }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={21} color={t.goldSoft} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>GATE OPERATIONS</Text>
          <Text style={styles.headerTitle}>Visitor Details</Text>
        </View>
        <View style={styles.headerShield}><Ionicons name="shield-checkmark" size={20} color={t.gold} /></View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 20 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.identityCard}>
          <View style={styles.identity}>
            {v.photoUrl ? (
              <Image source={{ uri: v.photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}><Ionicons name="person" size={27} color={t.goldSoft} /></View>
            )}
            <View style={styles.identityCopy}>
              <Text style={styles.name}>{v.name}</Text>
              <Text style={styles.category}>{v.category}</Text>
            </View>
          </View>
          <View style={[styles.statusPill, v.valid ? styles.validPill : styles.invalidPill]}>
            <View style={[styles.statusDot, { backgroundColor: v.valid ? t.green : t.redText }]} />
            <Text style={[styles.statusText, { color: v.valid ? t.green : t.redText }]}>{v.valid ? "VALID ACCESS CODE" : "INVALID OR EXPIRED CODE"}</Text>
          </View>
        </View>
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>VISIT INFORMATION</Text>
          <DetailRow label="Access code" value={v.accessCode} />
          <DetailRow label="Host" value={v.host} />
          <DetailRow label="Property" value={v.property} />
          <DetailRow label="Date" value={v.date} />
          <DetailRow label="Time" value={v.time} />
          <DetailRow label="Access type" value={v.accessType} />
          <DetailRow label="Vehicle" value={v.vehicle} />
        </View>
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={t.goldSoft} />
          <Text style={styles.noticeText}>Confirm the visitor and visit details with the host before allowing entry.</Text>
        </View>
        <Pressable disabled={busy || !v.valid} onPress={onApprove} style={({ pressed }) => [styles.approveButton, (busy || !v.valid) && styles.disabled, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color="#090909" /> : <Ionicons name="checkmark-circle-outline" size={19} color="#090909" />}
          <Text style={styles.approveText}>{busy ? "PLEASE WAIT…" : "APPROVE ENTRY"}</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={onDeny} style={({ pressed }) => [styles.denyButton, busy && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="close-circle-outline" size={19} color={t.redText} />
          <Text style={styles.denyText}>DENY ENTRY</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0A0A" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: t.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  headerTitle: { color: t.text, fontSize: 19, fontWeight: "900", marginTop: 3 },
  headerShield: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#211B10", alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14 },
  identityCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 17, gap: 16 },
  identity: { flexDirection: "row", alignItems: "center", gap: 13 },
  photo: { width: 62, height: 62, borderRadius: 17 },
  photoFallback: { backgroundColor: "#211B10", borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
  identityCopy: { flex: 1 },
  name: { color: t.text, fontSize: 18, fontWeight: "900" },
  category: { color: t.muted, fontSize: 12, marginTop: 5 },
  statusPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 30, borderWidth: 1 },
  validPill: { backgroundColor: "#102219", borderColor: "#245A3C" },
  invalidPill: { backgroundColor: "#24110F", borderColor: "#6C2924" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  detailsCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 17, gap: 0 },
  sectionTitle: { color: t.goldSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginBottom: 7 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#292319" },
  detailLabel: { color: t.muted, fontSize: 12, flexShrink: 0 },
  detailValue: { color: t.text, fontSize: 12, fontWeight: "700", textAlign: "right", flex: 1 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.border, borderRadius: 13, padding: 13 },
  noticeText: { color: t.goldSoft, fontSize: 11, lineHeight: 17, flex: 1 },
  approveButton: { minHeight: 54, borderRadius: 13, backgroundColor: t.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 3 },
  approveText: { color: "#090909", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  denyButton: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: "#6C2924", backgroundColor: "#1B100F", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  denyText: { color: t.redText, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
