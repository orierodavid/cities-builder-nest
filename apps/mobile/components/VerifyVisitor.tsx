import React, { useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme as t } from "../src/theme/theme";

type Props = {
  onBack: () => void;
  onCodeSubmit: (code: string) => void;
  onSwitchCamera: () => void;
  camera?: React.ReactNode;
};

const CORNER = 36;

export default function SecurityVerify({ onBack, onCodeSubmit, onSwitchCamera, camera }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const frameSize = Math.max(160, Math.min(240, screenWidth - 80));
  const viewfinderHeight = Math.min(340, Math.max(210, screenHeight * 0.38));
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={21} color={t.goldSoft} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GATE OPERATIONS</Text>
          <Text style={styles.title}>Verify Visitor</Text>
        </View>
        <Ionicons name="shield-checkmark" size={23} color={t.gold} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 20 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.viewfinder, { height: viewfinderHeight }]}>
          {camera}
          <View style={[styles.frame, { width: frameSize, height: frameSize }]} pointerEvents="none">
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          {!camera ? <View style={styles.cameraPlaceholder}><Ionicons name="camera-outline" size={34} color={t.gold} /><Text style={styles.cameraPlaceholderText}>Camera preview</Text></View> : null}
        </View>
        <Text style={styles.hint}>Position the visitor's QR code within the frame.</Text>
        {manual ? (
          <View style={styles.manualCard}>
            <Text style={styles.sectionTitle}>ENTER SIX-DIGIT ACCESS CODE</Text>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              placeholderTextColor="#756B59"
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Six-digit visitor access code"
              style={styles.input}
            />
            <Pressable disabled={code.length !== 6} onPress={() => onCodeSubmit(code)} style={[styles.primaryButton, code.length !== 6 && styles.disabled]}>
              <Text style={styles.primaryButtonText}>VERIFY ACCESS CODE</Text>
              <Ionicons name="arrow-forward" size={17} color="#090909" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setManual(true)} style={styles.secondaryButton}>
            <Ionicons name="keypad-outline" size={18} color={t.goldSoft} />
            <Text style={styles.secondaryButtonText}>ENTER CODE MANUALLY</Text>
          </Pressable>
        )}
        <Pressable onPress={onSwitchCamera} style={styles.secondaryButton}>
          <Ionicons name="camera-reverse-outline" size={18} color={t.goldSoft} />
          <Text style={styles.secondaryButtonText}>SWITCH CAMERA</Text>
        </Pressable>
        {manual ? <Pressable onPress={() => { setManual(false); setCode(""); }} style={styles.textButton}><Text style={styles.textButtonLabel}>RETURN TO QR SCANNER</Text></Pressable> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0A0A" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border, gap: 13 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: t.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: t.text, fontSize: 19, fontWeight: "900", marginTop: 3 },
  content: { padding: 20, gap: 14 },
  viewfinder: { width: "100%", maxWidth: 520, alignSelf: "center", borderRadius: 19, backgroundColor: "#080808", borderWidth: 1, borderColor: t.border, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  cameraPlaceholder: { position: "absolute", alignItems: "center", gap: 9 },
  cameraPlaceholderText: { color: t.muted, fontSize: 11 },
  frame: {},
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: t.gold },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  hint: { color: t.muted, fontSize: 12, textAlign: "center", marginBottom: 3 },
  manualCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 15, gap: 12 },
  sectionTitle: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  input: { height: 60, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: "#090909", color: t.text, fontSize: 26, fontWeight: "900", letterSpacing: 9, textAlign: "center" },
  primaryButton: { minHeight: 51, borderRadius: 12, backgroundColor: t.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryButtonText: { color: "#090909", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  secondaryButton: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  secondaryButtonText: { color: t.goldSoft, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  textButton: { alignItems: "center", padding: 12 },
  textButtonLabel: { color: t.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  disabled: { opacity: 0.4 },
});
