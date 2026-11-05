import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import SecurityHome from "../../components/SecurityHome";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";
import { Screen, Card } from "../../src/components/ui";
import { Text } from "react-native";

type Estate = { id: string; name: string; membershipRole?: string | null };
export default function SecurityHomeRoute() {
  const router = useRouter();
  const [officerName, setOfficerName] = useState("Security Officer");
  const [estateName, setEstateName] = useState("Assigned estate");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Your session has expired. Sign in again.");
        const { data: profile, error: profileError } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        if (active && profile?.full_name) setOfficerName(profile.full_name);
        const base = getApiBaseUrl();
        if (!base) throw new Error("Security services are not configured.");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
        const response = await fetch(base + "/v1/estates", { headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" } });
        const result = await response.json() as { estates?: Estate[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Estate access could not be loaded.");
        const estate = (result.estates || []).find(item => (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "security");
        if (!estate) throw new Error("No active Security membership was found for this account.");
        if (active) { setEstateName(estate.name); setStatusMessage(""); }
      } catch (error) {
        if (active) setStatusMessage(error instanceof Error ? error.message : "Security dashboard details could not be loaded.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#D9A93F" size="large" /></View>;
  return <SecurityHome officerName={officerName} estateName={estateName} statusMessage={statusMessage} onNavigate={(route) => router.push(route as never)} />;
}
