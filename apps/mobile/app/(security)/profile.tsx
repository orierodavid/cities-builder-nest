import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function SecurityProfileRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    setBusy(true); setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) { setError(signOutError.message); return; }
    router.replace("/" as never);
  };

  return <SafeAreaView edges={["left", "right"]} style={s.root}>
    <View style={[s.content, { paddingTop: insets.top + 20 }]}>
      <View style={s.icon}><Ionicons name="person-circle-outline" size={34} color="#D9A93F" /></View>
      <Text style={s.eyebrow}>ACCOUNT</Text>
      <Text style={s.title}>Profile</Text>
      <Text style={s.body}>Officer profile details and account preferences will be available here.</Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity disabled={busy} onPress={() => void signOut()} style={[s.signOut, busy && s.disabled]}>
        {busy ? <ActivityIndicator color="#F2B5B0" /> : <Ionicons name="log-out-outline" size={18} color="#F2B5B0" />}
        <Text style={s.signOutText}>{busy ? "SIGNING OUT…" : "SIGN OUT"}</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  content: { flex: 1, paddingHorizontal: 20, justifyContent: "center", alignItems: "flex-start", gap: 11 },
  icon: { width: 62, height: 62, borderRadius: 18, backgroundColor: "#211B10", borderWidth: 1, borderColor: "#3A2E12", alignItems: "center", justifyContent: "center", marginBottom: 7 },
  eyebrow: { color: "#D9A93F", fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  body: { color: "#A7A095", fontSize: 13, lineHeight: 20 },
  error: { color: "#FF9292", fontSize: 12, lineHeight: 18 },
  signOut: { minHeight: 49, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderWidth: 1, borderColor: "#6C2924", borderRadius: 12, backgroundColor: "#24110F", marginTop: 14 },
  signOutText: { color: "#F2B5B0", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  disabled: { opacity: 0.5 },
});
