import React, { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { theme as t } from "../../src/theme/theme";

export default function SecurityProfileRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("Security Officer");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Your session has expired. Sign in again.");
        const { data: profile, error: profileError } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        if (active) {
          setName(profile?.full_name || user.user_metadata?.full_name || "Security Officer");
          setEmail(user.email || "");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Profile could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const signOut = async () => {
    setBusy(true);
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    setBusy(false);
    if (signOutError) { setError(signOutError.message); return; }
    router.replace("/" as never);
  };

  return (
    <SafeAreaView edges={["left", "right"]} style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={24} color={t.goldSoft} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>MY PROFILE</Text>
        <View style={{ width: 34 }} />
      </View>
      {loading ? <ActivityIndicator color={t.gold} size="large" style={{ marginTop: 60 }} /> : (
        <View style={s.content}>
          <View style={s.profileCard}>
            <View style={s.avatar}><Ionicons name="shield-checkmark" size={34} color={t.gold} /></View>
            <Text style={s.name}>{name}</Text>
            <Text style={s.role}>SECURITY OFFICER</Text>
            <View style={s.divider} />
            <View style={s.infoRow}>
              <Ionicons name="mail-outline" size={19} color={t.goldSoft} />
              <View style={{ flex: 1 }}>
                <Text style={s.label}>EMAIL ADDRESS</Text>
                <Text style={s.value}>{email || "Not available"}</Text>
              </View>
            </View>
            <View style={s.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={19} color={t.goldSoft} />
              <View style={{ flex: 1 }}>
                <Text style={s.label}>ACCOUNT ROLE</Text>
                <Text style={s.value}>Security</Text>
              </View>
            </View>
          </View>
          {!!error && <Text style={s.error}>{error}</Text>}
          <TouchableOpacity disabled={busy} onPress={() => void signOut()} style={[s.signOut, busy && { opacity: 0.6 }]}>
            <Ionicons name="log-out-outline" size={19} color="#F2B5B0" />
            <Text style={s.signOutText}>{busy ? "SIGNING OUT…" : "SIGN OUT"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  back: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: t.text, fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  content: { padding: 20 },
  profileCard: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 22, alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.gold, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  name: { color: t.text, fontSize: 21, fontWeight: "900", textAlign: "center" },
  role: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.7, marginTop: 7 },
  divider: { height: 1, backgroundColor: t.border, alignSelf: "stretch", marginVertical: 22 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 13, alignSelf: "stretch", marginBottom: 18 },
  label: { color: t.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  value: { color: t.text, fontSize: 13, fontWeight: "600" },
  error: { color: "#FF9292", fontSize: 12, lineHeight: 18, marginTop: 14 },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 51, borderWidth: 1, borderColor: "#6C2924", borderRadius: 13, backgroundColor: "#24110F", marginTop: 18 },
  signOutText: { color: "#F2B5B0", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
});
