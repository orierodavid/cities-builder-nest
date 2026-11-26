import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import MobileConsentGate from "../components/MobileConsentGate";
import ConnectionStatusBanner from "../src/components/ConnectionStatusBanner";
import { supabaseConfigured, supabaseConfigurationError } from "../lib/supabase";
import { getApiBaseUrl } from "../src/lib/api-url";

void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn("[CB Nest splash] Could not hold native splash:", error);
});

function hideNativeSplash() {
  return SplashScreen.hideAsync().catch((error) => {
    console.warn("[CB Nest splash] Could not hide native splash:", error);
  });
}

function StartupFallback({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.brand}>CB NEST</Text>
      <Text style={styles.title}>Unable to start CB Nest</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Pressable onPress={onRetry} style={styles.button}><Text style={styles.buttonText}>TRY AGAIN</Text></Pressable> : null}
      <Text style={styles.hint}>Check your internet connection and the apps/mobile/.env configuration.</Text>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    let mounted = true;
    // The app shell can render immediately; never keep the native splash visible
    // while authentication, legal checks, or remote services are being restored.
    const safetyTimer = setTimeout(() => {
      if (mounted) void hideNativeSplash();
    }, 5_000);

    void (async () => {
      try {
        await Promise.resolve();
      } catch (error) {
        console.error("[CB Nest startup] Root initialization failed:", error);
      } finally {
        if (mounted) {
          await hideNativeSplash();
          clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  const apiBaseUrl = getApiBaseUrl();
  const startupConfigurationError = !supabaseConfigured
    ? supabaseConfigurationError
    : !apiBaseUrl
      ? "EXPO_PUBLIC_API_URL must be a publicly reachable HTTPS URL. Localhost and private network IP addresses are not supported on iPhone."
      : "";

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {startupConfigurationError ? (
        <StartupFallback message={startupConfigurationError} />
      ) : (
        <MobileConsentGate>
          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              contentStyle: { backgroundColor: "#000000" },
            }}
          />
        </MobileConsentGate>
      )}
      <ConnectionStatusBanner />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    void hideNativeSplash();
  }, []);
  return (
    <View style={styles.fallback}>
      <Text style={styles.brand}>CB NEST</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error?.message || "The app could not finish starting."}</Text>
      <Pressable onPress={retry} style={styles.button}><Text style={styles.buttonText}>RETRY</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  fallback: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  brand: { color: "#D9A93F", fontSize: 13, fontWeight: "900", letterSpacing: 3 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", textAlign: "center" },
  message: { color: "#C2C2C2", fontSize: 13, lineHeight: 20, textAlign: "center" },
  hint: { color: "#8F8F8F", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 8 },
  button: { backgroundColor: "#D9A93F", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 },
  buttonText: { color: "#090909", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
});
