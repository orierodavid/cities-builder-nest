import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import SecurityHome from "../../components/SecurityHome";
import { supabase } from "../../lib/supabase";
import { useSecurityContext } from "../../src/features/security/SecurityContext";
import { readDashboardCache, writeDashboardCache } from "../../src/lib/dashboard-cache";

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
        const cached = await readDashboardCache<{ officerName?: string }>("security", user.id);
        if (cached?.officerName) {
          if (active) { setOfficerName(cached.officerName); setProfileLoading(false); }
        }
        const { data: profile, error: profileError } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        const name = profile?.full_name || user.user_metadata?.full_name || "Security Officer";
        await writeDashboardCache("security", user.id, { officerName: name });
        if (active) setOfficerName(name);
      } catch { if (active) setOfficerName("Security Officer"); }
      finally { if (active) setProfileLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  if (loading || profileLoading) return <SafeAreaView edges={["left", "right"]} style={s.root}><View style={s.skeletonPage}><View style={s.skeletonTop}><View style={s.skeletonLogo}/><View style={s.skeletonBrand}/></View><View style={s.skeletonWelcome}><View style={s.skeletonLine}/><View style={[s.skeletonLine,{width:"62%",height:24}]}/><View style={[s.skeletonLine,{width:"44%"}]}/></View><View style={s.skeletonLine}/><View style={s.skeletonCard}/><View style={s.skeletonCard}/><View style={s.skeletonCard}/></View></SafeAreaView>;
  if (!estate) return <SafeAreaView edges={["left", "right"]} style={s.root}><View style={s.messageWrap}>
    <Text style={s.title}>Security access unavailable</Text><Text style={s.message}>{error || "An active Security estate membership is required."}</Text>
    <Text onPress={() => void refresh()} style={s.action}>TRY AGAIN</Text>
  </View></SafeAreaView>;
  return <SafeAreaView edges={["left", "right"]} style={s.root}>
    <SecurityHome officerName={officerName} estateName={estate.name} showBottomNav={false} onNavigate={(route) => {
      if (route === "/scan" || route === "/verify") router.push("/(security)/verify" as never);
      else if (route === "/events") router.push("/(security)/event-guests" as never);
      else if (route === "/records") router.push("/(security)/records" as never);
      else if (route === "/profile") router.push("/(security)/profile" as never);
      else router.push("/(security)" as never);
    }} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  skeletonPage: { flex: 1, padding: 20, paddingTop: 28, gap: 16 },
  skeletonTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  skeletonLogo: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#252525" },
  skeletonBrand: { width: 112, height: 14, borderRadius: 7, backgroundColor: "#252525" },
  skeletonWelcome: { height: 156, borderRadius: 20, backgroundColor: "#121212", borderWidth: 1, borderColor: "#3A2E12", padding: 20, justifyContent: "center", gap: 14, marginBottom: 8 },
  skeletonLine: { width: "36%", height: 10, borderRadius: 6, backgroundColor: "#292929" },
  skeletonCard: { height: 82, borderRadius: 16, backgroundColor: "#121212", borderWidth: 1, borderColor: "#3A2E12" },
  messageWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20, gap: 12 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  message: { color: "#A7A095", fontSize: 13, lineHeight: 20 },
  action: { color: "#D9A93F", fontSize: 11, fontWeight: "900", marginTop: 8 },
});
