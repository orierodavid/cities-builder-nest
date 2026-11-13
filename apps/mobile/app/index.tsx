import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase, supabaseConfigured } from "../lib/supabase";
import LoginScreen from "../src/features/auth/LoginScreen";
import ResidentRegistrationScreen from "../src/features/auth/ResidentRegistrationScreen";
import SplashScreen from "../components/SplashScreen";
import { getApiBaseUrl } from "../src/lib/api-url";
type Role = "resident" | "security";
type Membership = { estate_id: string; membership_role: string; status: string };
type ProfileResponse = {
  estateMemberships?: Membership[];
  residentUnits?: { units?: { buildings?: { estate_id?: string } | null } | null }[];
  globalRoles?: string[];
  error?: string;
};
type Estate = { id: string; membershipRole?: string | null };
type EstateResponse = { estates?: Estate[]; error?: string };
const normalizeRole = (value?: string | null) => value?.trim().toLowerCase().replace(/-/g, "_") || "";

export default function MobileEntryRoute() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [checkingRole, setCheckingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("We couldn't restore your session. Please sign in again.");
      setSession(data.session);
      setRestoring(false);
    }).catch(() => {
      if (active) { setMessage("We couldn't restore your session. Please sign in again."); setRestoring(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const refreshRole = useCallback(async (token: string) => {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) throw new Error("The mobile API address is missing. Set EXPO_PUBLIC_API_URL in apps/mobile/.env, then restart Expo with --clear.");
    setCheckingRole(true);
    setRoleError("");
    try {
      const [profileResponse, estatesResponse] = await Promise.all([
        fetch(apiBaseUrl + "/v1/me", { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, signal: AbortSignal.timeout(15000) }),
        fetch(apiBaseUrl + "/v1/estates", { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, signal: AbortSignal.timeout(15000) }),
      ]);
      const profileBody = await profileResponse.json() as ProfileResponse;
      const estatesBody = await estatesResponse.json() as EstateResponse;
      if (!profileResponse.ok) throw new Error(profileBody.error || "Account role verification failed.");
      if (!estatesResponse.ok) throw new Error(estatesBody.error || "Estate role verification failed.");
      const nextEstates = estatesBody.estates || [];
      const activeMemberships = (profileBody.estateMemberships || []).filter(m => m.status?.trim().toLowerCase() === "active");
      const roles = new Set(activeMemberships.map(m => normalizeRole(m.membership_role)));
      const estateRoles = new Set(nextEstates.map(e => normalizeRole(e.membershipRole)));
      const hasResidentUnit = (profileBody.residentUnits || []).length > 0;
      const role: Role | null =
        roles.has("resident") || hasResidentUnit || estateRoles.has("resident") ? "resident" :
        roles.has("security") || estateRoles.has("security") ? "security" : null;
      if (!role) {
        throw new Error("No active Resident or Security role was found. Facility Manager and Super Admin accounts must use the web portal.");
      }
      return role;
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error("The CB Nest API did not respond within 15 seconds. Check the API URL and that your phone can reach it.");
      }
      if (error instanceof TypeError) {
        throw new Error("The CB Nest API could not be reached from this device. Check EXPO_PUBLIC_API_URL; do not use localhost on a physical phone unless it is resolved to your computer’s LAN address.");
      }
      throw error;
    } finally {
      setCheckingRole(false);
    }
  }, []);

  const [verifiedRole, setVerifiedRole] = useState<Role | null>(null);
  useEffect(() => {
    let active = true;
    setVerifiedRole(null);
    setRoleError("");
    if (!session?.access_token) return () => { active = false; };
    void refreshRole(session.access_token).then(role => {
      if (active) setVerifiedRole(role);
    }).catch(error => {
      if (active) setRoleError(error instanceof Error ? error.message : "Unable to verify your mobile role.");
    });
    return () => { active = false; };
  }, [session?.access_token, refreshRole]);

  const submitAuth = async (email: string, password: string) => {
    setMessage("");
    if (!supabaseConfigured) throw new Error("Sign-in configuration is missing. Contact your administrator.");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@") || !password) throw new Error("Enter your registered email address and password.");
    const { data, error } = await supabase.functions.invoke("account-login", { body: { email: cleanEmail, password } });
    if (error) throw error;
    if (data?.error) {
      const retry = Number(data.retry_after_seconds || 0);
      throw new Error(data.data?.message || data.message || (data.error === "account_locked" ? "Account locked. Try again in " + Math.ceil(retry / 60) + " minutes." : "Email or password is incorrect."));
    }
    if (!data?.session) throw new Error("Authentication service returned no session. Please try again.");
    const { error: sessionError } = await supabase.auth.setSession(data.session);
    if (sessionError) throw sessionError;
  };

  const resetPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@")) { setMessage("Enter your registered email address first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    setMessage(error ? error.message : "If an account exists for this email, a password reset link has been sent.");
  };

  if (restoring || (session && (checkingRole || (!verifiedRole && !roleError)))) return <SplashScreen />;
  if (session && verifiedRole === "resident") return <Redirect href={"/(resident)" as never} />;
  if (session && verifiedRole === "security") return <Redirect href={"/(security)" as never} />;

  if (session && roleError) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.brand}>CB NEST</Text>
        <Text style={styles.heading}>Mobile access unavailable</Text>
        <Text style={styles.body}>{roleError}</Text>
        <Pressable onPress={() => void refreshRole(session.access_token).then(setVerifiedRole).catch(e => setRoleError(e instanceof Error ? e.message : "Role check failed."))} style={styles.retry}>
          <Text style={styles.retryText}>RETRY ROLE CHECK</Text>
        </Pressable>
        <Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.signOut}>SIGN OUT</Text></Pressable>
      </View>
    </SafeAreaView>
  );

  if (registration && !session) return <ResidentRegistrationScreen onBack={() => setRegistration(false)} />;
  return (
    <View style={styles.safe}>
      <LoginScreen onSubmit={submitAuth} onForgotPassword={resetPassword} onCreateAccount={() => setRegistration(true)} />
      {!!message && <Text style={styles.notice}>{message}</Text>}
      {!supabaseConfigured && <Text style={styles.notice}>Sign-in configuration is missing. Contact your administrator.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080808" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, gap: 14 },
  brand: { color: "#D4A84B", fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  heading: { color: "#F7F3EA", fontSize: 21, fontWeight: "800", textAlign: "center" },
  body: { color: "#A7A095", fontSize: 13, lineHeight: 20, textAlign: "center" },
  retry: { borderWidth: 1, borderColor: "#6B5324", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13, marginTop: 8 },
  retryText: { color: "#D9A93F", fontSize: 11, fontWeight: "900" },
  signOut: { color: "#A7A095", fontSize: 11, fontWeight: "800", padding: 12 },
  notice: { color: "#D4AF37", textAlign: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: "#080808" },
});
