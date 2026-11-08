import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import SecurityHome from "../../components/SecurityHome";
import { supabase } from "../../lib/supabase";
import { useSecurityContext } from "../../src/features/security/SecurityContext";

export default function SecurityHomeRoute() {
  const router = useRouter();
  const { estate, loading, error, refresh } = useSecurityContext();
  const [officerName, setOfficerName] = useState("Security Officer");
  const [profileLoading, setProfileLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Your session has expired. Sign in again.");
        const { data: profile, error: profileError } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        if (active) setOfficerName(profile?.full_name || user.user_metadata?.full_name || "Security Officer");
      } catch { if (active) setOfficerName("Security Officer"); }
      finally { if (active) setProfileLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  if (loading || profileLoading) return <SafeAreaView edges={["left", "right"]} style={s.root}><ActivityIndicator color="#D9A93F" size="large" /></SafeAreaView>;
  if (!estate) return <SafeAreaView edges={["left", "right"]} style={s.root}><View style={s.messageWrap}>
    <Text style={s.title}>Security access unavailable</Text><Text style={s.message}>{error || "An active Security estate membership is required."}</Text>
    <Text onPress={() => void refresh()} style={s.action}>TRY AGAIN</Text>
  </View></SafeAreaView>;
  return <SafeAreaView edges={["left", "right"]} style={s.root}>
    <SecurityHome officerName={officerName} estateName={estate.name} onNavigate={(route) => {
      if (route === "/scan" || route === "/verify") router.push("/(security)/verify" as never);
      else if (route === "/records") router.push("/(security)/records" as never);
      else if (route === "/profile") router.push("/(security)/profile" as never);
      else router.push("/(security)" as never);
    }} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A", justifyContent: "center" },
  messageWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20, gap: 12 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  message: { color: "#A7A095", fontSize: 13, lineHeight: 20 },
  action: { color: "#D9A93F", fontSize: 11, fontWeight: "900", marginTop: 8 },
});
