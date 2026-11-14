import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        const user = session?.user;
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
  if (loading || profileLoading) return <SafeAreaView edges={["left", "right"]} style={s.root}>
    <View style={s.skeletonContent}>
      <View style={s.skeletonTop}>
        <View style={s.skeletonLogo}><View style={s.skeletonLogoInner}/></View>
        <View style={s.skeletonBrandBlock}><View style={s.skeletonBrand}/><View style={s.skeletonCaption}/></View>
        <View style={s.skeletonRolePill}><View style={s.skeletonDot}/><View style={s.skeletonRoleText}/></View>
      </View>
      <View style={s.skeletonWelcome}>
        <View style={[s.skeletonLine,{width:112}]}/>
        <View style={[s.skeletonLine,{width:116,height:14,marginTop:15}]}/>
        <View style={[s.skeletonLine,{width:174,height:29,marginTop:7}]}/>
        <View style={s.skeletonEstateRow}><View style={s.skeletonEstateIcon}/><View style={[s.skeletonLine,{width:"58%"}]}/></View>
      </View>
      <View style={s.skeletonSection}><View style={[s.skeletonLine,{width:112}]}/><View style={[s.skeletonLine,{width:176,marginTop:7}]}/></View>
      <View style={[s.skeletonAction,{height:94,backgroundColor:"#D9A93F",borderColor:"#D9A93F"}]}><View style={s.skeletonPrimaryIcon}/><View style={s.skeletonActionCopy}><View style={[s.skeletonLine,{width:"65%",backgroundColor:"#3A2D13",opacity:0.35}]}/><View style={[s.skeletonLine,{width:"88%",marginTop:8,backgroundColor:"#3A2D13",opacity:0.3}]}/></View></View>
      <View style={s.skeletonAction}><View style={s.skeletonActionIcon}/><View style={s.skeletonActionCopy}><View style={[s.skeletonLine,{width:"62%"}]}/><View style={[s.skeletonLine,{width:"88%",marginTop:8}]}/></View></View>
      <View style={s.skeletonAction}><View style={s.skeletonActionIcon}/><View style={s.skeletonActionCopy}><View style={[s.skeletonLine,{width:"70%"}]}/><View style={[s.skeletonLine,{width:"92%",marginTop:8}]}/></View></View>
      <View style={s.skeletonSection}><View style={[s.skeletonLine,{width:132}]}/></View>
      <View style={s.skeletonAction}><View style={s.skeletonActionIcon}/><View style={s.skeletonActionCopy}><View style={[s.skeletonLine,{width:"64%"}]}/><View style={[s.skeletonLine,{width:"86%",marginTop:8}]}/></View></View>
      <View style={s.skeletonInfo}><View style={s.skeletonInfoIcon}/><View style={s.skeletonActionCopy}><View style={[s.skeletonLine,{width:"38%"}]}/><View style={[s.skeletonLine,{width:"100%",marginTop:8}]}/><View style={[s.skeletonLine,{width:"82%",marginTop:6}]}/></View></View>
    </View>
  </SafeAreaView>;
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
  skeletonContent: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  skeletonTop: { flexDirection: "row", alignItems: "center", marginBottom: 30 },
  skeletonLogo: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#211B10", borderWidth: 1, borderColor: "#3A2E12", alignItems: "center", justifyContent: "center" },
  skeletonLogoInner: { width: 19, height: 19, borderRadius: 6, backgroundColor: "#D9A93F", opacity: 0.35 },
  skeletonBrandBlock: { marginLeft: 10, flex: 1, gap: 6 },
  skeletonBrand: { width: 88, height: 13, borderRadius: 5, backgroundColor: "#9A9A9A", opacity: 0.3 },
  skeletonCaption: { width: 76, height: 7, borderRadius: 4, backgroundColor: "#9A9A9A", opacity: 0.25 },
  skeletonRolePill: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: "#3A2E12", borderRadius: 30, paddingHorizontal: 11, paddingVertical: 10 },
  skeletonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2FB36D", opacity: 0.5 },
  skeletonRoleText: { width: 48, height: 7, borderRadius: 4, backgroundColor: "#F0C766", opacity: 0.35 },
  skeletonWelcome: { backgroundColor: "#121212", borderWidth: 1, borderColor: "#3A2E12", borderRadius: 20, padding: 20, marginBottom: 25 },
  skeletonLine: { height: 10, borderRadius: 6, backgroundColor: "#9A9A9A", opacity: 0.28 },
  skeletonEstateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#3A2E12" },
  skeletonEstateIcon: { width: 16, height: 16, borderRadius: 5, backgroundColor: "#F0C766", opacity: 0.35 },
  skeletonSection: { marginBottom: 12, marginTop: 2, gap: 5 },
  skeletonAction: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "#121212", borderWidth: 1, borderColor: "#3A2E12", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 11 },
  skeletonPrimaryIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.13)" },
  skeletonActionIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: "#211B10" },
  skeletonActionCopy: { flex: 1 },
  skeletonInfo: { flexDirection: "row", gap: 11, backgroundColor: "#10100E", borderWidth: 1, borderColor: "#3A2E12", borderRadius: 15, padding: 15, marginTop: 12 },
  skeletonInfoIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#211B10" },
  messageWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20, gap: 12 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  message: { color: "#A7A095", fontSize: 13, lineHeight: 20 },
  action: { color: "#D9A93F", fontSize: 11, fontWeight: "900", marginTop: 8 },
});
