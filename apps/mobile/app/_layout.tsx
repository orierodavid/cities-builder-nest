import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Text, TouchableOpacity, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import MobileConsentGate from "../components/MobileConsentGate";
import { theme } from "../src/theme/theme";
import { supabase } from "../lib/supabase";

const BIOMETRIC_KEY = "cbnest.biometric.enabled";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const biometricEnabled = useRef(false);
  const lockedRef = useRef(false);
  const authenticationInProgress = useRef(false);
  const appState = useRef(AppState.currentState);

  async function authenticate() {
    if (authenticationInProgress.current) return;
    authenticationInProgress.current = true;
    setError("");
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hardware || !enrolled) {
        setError("Biometrics are unavailable. Sign in with your password to continue.");
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Cities Builder Nest",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
        biometricsSecurityLevel: "strong",
      });
      if (result.success) {
        lockedRef.current = false;
        setLocked(false);
      } else {
        setError("Biometric verification was not completed. Try again or use password sign-in.");
      }
    } catch {
      setError("Unable to complete biometric verification. Try again or use password sign-in.");
    } finally {
      authenticationInProgress.current = false;
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data: { session } }, enabled] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem(BIOMETRIC_KEY),
        ]);
        if (!alive) return;
        if (session && enabled === "true") {
          biometricEnabled.current = true;
          lockedRef.current = true;
          setLocked(true);
          await authenticate();
        }
      } catch {
        if (alive) setError("Unable to verify device authentication. Try again.");
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;
      if (!biometricEnabled.current || authenticationInProgress.current) return;
      if (nextState === "background" && previousState !== "background") {
        lockedRef.current = true;
        setLocked(true);
      } else if (nextState === "active" && previousState === "background" && lockedRef.current) {
        void authenticate();
      }
    });
    return () => subscription.remove();
  }, []);

  async function usePassword() {
    await AsyncStorage.removeItem(BIOMETRIC_KEY);
    biometricEnabled.current = false;
    lockedRef.current = false;
    await supabase.auth.signOut({ scope: "local" });
    setLocked(false);
  }

  return (
    <>
      <StatusBar style="light" />
      {ready && locked ? (
        <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 }}>
          <Text style={{ color: "#D4A84B", fontSize: 12, fontWeight: "900", letterSpacing: 2 }}>CB NEST SECURITY</Text>
          <Text style={{ color: "#FFFFFF", fontSize: 25, fontWeight: "900", textAlign: "center" }}>Verify it’s you</Text>
          <Text style={{ color: "#B9B9B9", fontSize: 13, textAlign: "center", lineHeight: 20 }}>Use Face ID or your fingerprint to unlock your account.</Text>
          {!!error && <Text style={{ color: "#FF9292", fontSize: 12, textAlign: "center" }}>{error}</Text>}
          <TouchableOpacity onPress={() => void authenticate()} style={{ minHeight: 48, width: "100%", borderRadius: 12, backgroundColor: "#D4A84B", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#071A3A", fontWeight: "900" }}>UNLOCK WITH BIOMETRICS</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void usePassword()} style={{ padding: 12 }}>
            <Text style={{ color: "#B9B9B9", fontSize: 12, fontWeight: "800" }}>USE PASSWORD INSTEAD</Text>
          </TouchableOpacity>
        </View>
      ) : ready ? (
        <MobileConsentGate>
          <Stack screenOptions={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: theme.bg } }} />
        </MobileConsentGate>
      ) : (
        <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#D4A84B" />
        </View>
      )}
    </>
  );
}
