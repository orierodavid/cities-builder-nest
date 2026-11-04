import { ReactNode, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import LegalConsentScreen, { type MobileLegalDocument } from "./LegalConsentScreen";
import SplashScreen from "./SplashScreen";

type LegalStatus = { requiresAcceptance: boolean; configurationRequired: boolean; accepted: boolean; documents: MobileLegalDocument[] };

export default function MobileConsentGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setChecking(true);
    setError("");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setStatus(null); setError("Your session could not be verified. Please sign in again.");
      setSessionChecked(true); setChecking(false); return;
    }
    if (!sessionData.session) {
      setStatus(null); setSessionChecked(true); setChecking(false); return;
    }
    const { data, error: legalError } = await supabase.rpc("get_legal_consent_status");
    if (legalError || !data) {
      setStatus(null); setError("Legal acceptance could not be verified. Retry before using the app.");
    } else setStatus(data as LegalStatus);
    setSessionChecked(true);
    setChecking(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async (showLoading = true) => {
      if (!alive) return;
      if (showLoading) setChecking(true);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!alive) return;
      if (sessionError) {
        setStatus(null); setError("Your session could not be verified. Please sign in again.");
        setSessionChecked(true); setChecking(false); return;
      }
      if (!sessionData.session) {
        setStatus(null); setError(""); setSessionChecked(true); setChecking(false); return;
      }
      const { data, error: legalError } = await supabase.rpc("get_legal_consent_status");
      if (!alive) return;
      if (legalError || !data) {
        setStatus(null); setError("Legal acceptance could not be verified. Retry before using the app.");
      } else { setStatus(data as LegalStatus); setError(""); }
      setSessionChecked(true);
      if (showLoading) setChecking(false);
    };
    void check(true);
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
        setTimeout(() => { if (alive) void check(true); }, 0);
      }
    });
    const appStateListener = AppState.addEventListener("change", (state) => {
      if (state === "active" && alive) void check(false);
    });
    return () => { alive = false; authListener.subscription.unsubscribe(); appStateListener.remove(); };
  }, []);

  if (!sessionChecked || checking) return <SplashScreen />;
  if (error) return <View style={styles.center}><Text style={styles.title}>Verification required</Text><Text style={styles.copy}>{error}</Text><TouchableOpacity onPress={() => void refresh()} style={styles.button}><Text style={styles.buttonText}>Retry</Text></TouchableOpacity><TouchableOpacity onPress={() => void supabase.auth.signOut()} style={styles.secondary}><Text style={styles.secondaryText}>Sign out</Text></TouchableOpacity></View>;
  if (status?.requiresAcceptance) return <ScrollView style={styles.shell} contentContainerStyle={styles.shellContent} keyboardShouldPersistTaps="handled"><LegalConsentScreen documents={status.documents || []} onAccepted={() => void refresh()} onSignOut={() => void supabase.auth.signOut()}/></ScrollView>;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center:{flex:1,backgroundColor:"#080808",alignItems:"center",justifyContent:"center",padding:24,gap:13},
  shell:{flex:1,backgroundColor:"#080808"},
  shellContent:{padding:16,paddingTop:32,paddingBottom:40},
  title:{fontSize:21,color:"#FFFFFF",fontWeight:"900"},
  copy:{fontSize:12,lineHeight:18,color:"#C5C5C5",textAlign:"center"},
  button:{backgroundColor:"#D4A84B",paddingHorizontal:22,paddingVertical:13,borderRadius:10,marginTop:8},
  buttonText:{fontSize:12,color:"#17130B",fontWeight:"900"},
  secondary:{padding:12},
  secondaryText:{fontSize:11,color:"#D4A84B",fontWeight:"800"}
});
