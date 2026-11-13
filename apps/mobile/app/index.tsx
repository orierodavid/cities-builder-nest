import React, { useCallback, useEffect, useRef, useState } from "react";
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
type RoleErrorKind = "network" | "access" | "verification";
class RoleCheckError extends Error {
  kind: RoleErrorKind;
  status?: number;
  constructor(message: string, kind: RoleErrorKind, status?: number) {
    super(message);
    this.name = "RoleCheckError";
    this.kind = kind;
    this.status = status;
  }
}
const isTransientRoleError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const details = (error.name + " " + error.message).toLowerCase();
  const status = (error as Error & { status?: number }).status;
  return error.name === "TypeError" || error.name === "AbortError" ||
    error.name === "TimeoutError" || details.includes("fetchrequestcanceled") ||
    details.includes("network request failed") || details.includes("failed to fetch") ||
    (typeof status === "number" && status >= 500);
};
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export default function MobileEntryRoute() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [checkingRole, setCheckingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [roleErrorKind, setRoleErrorKind] = useState<RoleErrorKind | null>(null);
  const roleCheckInFlight = useRef<{ token: string; promise: Promise<Role> } | null>(null);
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("[CB Nest Supabase session restore] Failed", {
          name: error.name,
          message: error.message,
          status: (error as typeof error & { status?: number }).status,
        });
        setMessage("We couldn't restore your session. Please sign in again.");
      }
      setSession(data.session);
      setRestoring(false);
    }).catch(() => {
      if (active) { setMessage("We couldn't restore your session. Please sign in again."); setRestoring(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const refreshRole = useCallback((token: string): Promise<Role> => {
    if (roleCheckInFlight.current) {
      const activeCheck = roleCheckInFlight.current;
      if (activeCheck.token === token) return activeCheck.promise;
      return activeCheck.promise.catch(() => null as unknown as Role).then(() => refreshRole(token));
    }
    const run = async (): Promise<Role> => {
      const apiBaseUrl = getApiBaseUrl();
      if (!apiBaseUrl) throw new RoleCheckError(
        "The mobile API address is missing. Set EXPO_PUBLIC_API_URL in apps/mobile/.env, then restart Expo with --clear.",
        "verification"
      );
      setCheckingRole(true);
      setRoleError("");
      setRoleErrorKind(null);
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          // Avoid AbortSignal.timeout on iOS: native fetch cancellation was
          // previously being surfaced as a false role/access failure.
          const [profileResponse, estatesResponse] = await Promise.all([
            fetch(apiBaseUrl + "/v1/me", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } }),
            fetch(apiBaseUrl + "/v1/estates", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } }),
          ]);
          console.info("[CB Nest role check] API response statuses", {
            attempt, profileStatus: profileResponse.status, estatesStatus: estatesResponse.status,
          });
          if ([401, 403].includes(profileResponse.status) || [401, 403].includes(estatesResponse.status)) {
            const status = [401, 403].includes(profileResponse.status) ? profileResponse.status : estatesResponse.status;
            throw new RoleCheckError("Your session is not authorised for mobile access. Sign in again or contact your estate administrator.", "access", status);
          }
          if (!profileResponse.ok || !estatesResponse.ok) {
            const response = !profileResponse.ok ? profileResponse : estatesResponse;
            const body = await response.json().catch(() => ({})) as { error?: string };
            const failure = new Error(body.error || "The CB Nest service could not verify your account.") as Error & { status?: number };
            failure.status = response.status;
            throw failure;
          }
          const [profileBody, estatesBody] = await Promise.all([
            profileResponse.json() as Promise<ProfileResponse>,
            estatesResponse.json() as Promise<EstateResponse>,
          ]);
          const nextEstates = estatesBody.estates || [];
          const activeMemberships = (profileBody.estateMemberships || []).filter(m => m.status?.trim().toLowerCase() === "active");
          const roles = new Set(activeMemberships.map(m => normalizeRole(m.membership_role)));
          const estateRoles = new Set(nextEstates.map(e => normalizeRole(e.membershipRole)));
          const hasResidentUnit = (profileBody.residentUnits || []).length > 0;
          const role: Role | null =
            roles.has("resident") || hasResidentUnit || estateRoles.has("resident") ? "resident" :
            roles.has("security") || estateRoles.has("security") ? "security" : null;
          if (!role) throw new RoleCheckError(
            "No active Resident or Security role was found. Facility Manager and Super Admin accounts must use the web portal.",
            "access"
          );
          return role;
        } catch (error) {
          console.error("[CB Nest role check] Request failed", {
            attempt,
            name: error instanceof Error ? error.name : typeof error,
            message: error instanceof Error ? error.message : String(error),
            status: error instanceof RoleCheckError ? error.status : (error as { status?: number } | null)?.status,
          });
          if (error instanceof RoleCheckError && error.kind === "access") throw error;
          if (isTransientRoleError(error)) {
            if (attempt < 3) { await wait(500 * attempt); continue; }
            throw new RoleCheckError("Can't connect to CB Nest right now. Check your internet connection and tap to retry.", "network");
          }
          throw new RoleCheckError(error instanceof Error ? error.message : "We couldn't verify your account. Please try again.", "verification");
        }
      }
      throw new RoleCheckError("Can't connect to CB Nest right now. Check your internet connection and tap to retry.", "network");
    };
    const pending = run().finally(() => {
      setCheckingRole(false);
      if (roleCheckInFlight.current?.promise === pending) roleCheckInFlight.current = null;
    });
    roleCheckInFlight.current = { token, promise: pending };
    return pending;
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
      if (active) {
        setRoleError(error instanceof Error ? error.message : "Unable to verify your mobile role.");
        setRoleErrorKind(error instanceof RoleCheckError ? error.kind : "verification");
      }
    });
    return () => { active = false; };
  }, [session?.access_token, refreshRole]);

  const submitAuth = async (email: string, password: string) => {
    setMessage("");
    if (!supabaseConfigured) throw new Error("Sign-in configuration is missing. Contact your administrator.");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@") || !password) throw new Error("Enter your registered email address and password.");
    const { data, error } = await supabase.functions.invoke("account-login", { body: { email: cleanEmail, password } });
    if (error) {
      const response = (error as { context?: Response }).context;
      const status = response?.status;
      const body = response
        ? await response.clone().json().catch(() => ({})) as { error?: string; message?: string; retry_after_seconds?: number }
        : {};
      console.error("[CB Nest account login] Edge Function rejected request", {
        status,
        error: body.error || error.name,
        message: body.message || error.message,
      });
      const retry = Number(body.retry_after_seconds || 0);
      if (body.error === "invalid_credentials" || status === 401) {
        throw new Error("Email or password is incorrect. Check your details and try again.");
      }
      if (body.error === "account_locked" || status === 423) {
        throw new Error(body.message || "Your account is temporarily locked. Please try again later.");
      }
      if (body.error === "email_not_confirmed") {
        throw new Error(body.message || "Your email address has not been confirmed.");
      }
      if (body.error === "account_pending_approval") {
        throw new Error(body.message || "Your account is awaiting administrator approval.");
      }
      if (status === 429) {
        throw new Error(body.message || "Too many sign-in attempts. Please wait and try again.");
      }
      throw new Error(body.message || (status && status >= 500
        ? "CB Nest sign-in is temporarily unavailable. Please try again shortly."
        : "Sign-in could not be completed. Please try again."));
    }
    if (data?.error) {
      const retry = Number(data.retry_after_seconds || 0);
      throw new Error(data.message || (data.error === "account_locked" ? "Account locked. Try again in " + Math.ceil(retry / 60) + " minutes." : "Email or password is incorrect."));
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
        <Text style={styles.heading}>{roleErrorKind === "access" ? "Mobile access unavailable" : roleErrorKind === "network" ? "Can't connect" : "Unable to verify access"}</Text>
        <Text style={styles.body}>{roleErrorKind === "network" ? "Can't connect, tap to retry. Check your internet connection and try again." : roleError}</Text>
        <Pressable disabled={checkingRole} onPress={() => void refreshRole(session.access_token).then(role => { setVerifiedRole(role); setRoleError(""); setRoleErrorKind(null); }).catch(e => { setRoleError(e instanceof Error ? e.message : "Role check failed."); setRoleErrorKind(e instanceof RoleCheckError ? e.kind : "verification"); })} style={styles.retry}>
          <Text style={styles.retryText}>{checkingRole ? "CONNECTING..." : "RETRY"}</Text>
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
