import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import LoginScreen from "../../src/features/auth/LoginScreen";
import { supabase, supabaseConfigured } from "../../lib/supabase";

const BIOMETRIC_KEY = "cbnest.biometric.enabled";

export default function BiometricSignInScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [{ data: { session } }, enabled] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem(BIOMETRIC_KEY),
        ]);
        if (!mounted) return;
        if (!session || enabled !== "true") {
          router.replace("/" as never);
          return;
        }
        setReady(true);
      } catch {
        if (mounted) {
          setMessage("Your saved sign-in session could not be checked. Use your password to sign in.");
          setReady(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  async function authenticateWithBiometrics() {
    const [{ data: { session } }, enabled] = await Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem(BIOMETRIC_KEY),
    ]);
    if (!session || enabled !== "true") {
      throw new Error("Your saved session is no longer available. Sign in with your password.");
    }
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled) {
      throw new Error("Face ID or fingerprint is not available on this device. Sign in with your password.");
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: Platform.OS === "ios" ? "Sign in to Cities Builder Nest with Face ID" : "Sign in to Cities Builder Nest",
      cancelLabel: "Cancel",
      disableDeviceFallback: true,
      biometricsSecurityLevel: "strong",
    });
    if (!result.success) {
      throw new Error(result.error === "user_cancel" ? "Biometric sign-in was cancelled." : "Biometric verification failed. Try again or use your password.");
    }
    router.replace("/" as never);
  }

  async function submitPassword(email: string, password: string) {
    if (!supabaseConfigured) throw new Error("Supabase configuration is missing. Contact your administrator.");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@") || password.length < 8) {
      throw new Error("Enter your registered email address and password.");
    }
    const { data, error } = await supabase.functions.invoke("account-login", {
      body: { email: cleanEmail, password },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.message || "Email or password is incorrect.");
    if (!data?.session) throw new Error("Authentication service returned no session. Please try again.");
    const { error: sessionError } = await supabase.auth.setSession(data.session);
    if (sessionError) throw sessionError;
    await AsyncStorage.removeItem(BIOMETRIC_KEY);
    router.replace("/" as never);
  }

  async function requestPasswordReset(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage("Enter your registered email address to request a password reset.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) throw error;
    setMessage("If an account exists for this email, a password reset link has been sent.");
  }

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color="#D4A84B" />
    </View>;
  }

  return <View style={{ flex: 1, backgroundColor: "#050505" }}>
    <LoginScreen onSubmit={submitPassword} onForgotPassword={(email) => { void requestPasswordReset(email).catch((error) => setMessage(error instanceof Error ? error.message : "Could not request a password reset.")); }} onBiometric={authenticateWithBiometrics} />
    {!!message && <Text style={{ color: "#D4AF37", textAlign: "center", paddingHorizontal: 20, paddingBottom: 16 }}>{message}</Text>}
  </View>;
}
