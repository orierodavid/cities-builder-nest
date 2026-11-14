import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";

type ConnectionState = "checking" | "online" | "slow" | "offline";

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const SLOW_CONNECTION_MS = 2500;
const CHECK_TIMEOUT_MS = 7000;
const CHECK_INTERVAL_MS = 20000;

export default function ConnectionStatusBanner() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [restored, setRestored] = useState(false);
  const checking = useRef(false);
  const previousState = useRef<ConnectionState>("checking");

  const checkConnection = useCallback(async () => {
    if (checking.current || !supabaseUrl || !anonKey) return;
    checking.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const response = await fetch(supabaseUrl + "/auth/v1/health", {
        method: "GET",
        headers: { apikey: anonKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Connection check failed");
      const next: ConnectionState = Date.now() - startedAt >= SLOW_CONNECTION_MS ? "slow" : "online";
      setState(next);
      if ((previousState.current === "offline" || previousState.current === "slow") && next === "online") {
        setRestored(true);
        setTimeout(() => setRestored(false), 2500);
      }
      previousState.current = next;
    } catch {
      setState("offline");
      previousState.current = "offline";
      setRestored(false);
    } finally {
      clearTimeout(timeout);
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void checkConnection();
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void checkConnection();
    }, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void checkConnection();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [checkConnection]);

  if (state !== "offline" && state !== "slow" && !restored) return null;

  const offline = state === "offline";
  const message = restored
    ? "Connection restored. Updating..."
    : offline
      ? "You're offline. Showing saved information where available."
      : "Your connection is slow. Loading may take longer.";

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={[styles.banner, offline ? styles.offline : restored ? styles.restored : styles.slow]}>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        {!restored ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Retry connection" onPress={() => void checkConnection()} hitSlop={10} style={styles.retry}>
            <Text style={styles.retryText}>RETRY</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: Platform.OS === "ios" ? 48 : (StatusBar.currentHeight || 24) + 8,
    left: 12,
    right: 12,
    zIndex: 10000,
    elevation: 20,
  },
  banner: {
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  offline: { backgroundColor: "#211311", borderColor: "#8E1B14" },
  slow: { backgroundColor: "#211B10", borderColor: "#8A6B2A" },
  restored: { backgroundColor: "#102017", borderColor: "#2FB36D" },
  message: { color: "#F5F1E8", fontSize: 11, lineHeight: 15, flex: 1 },
  retry: { paddingHorizontal: 5, paddingVertical: 5 },
  retryText: { color: "#F0C766", fontSize: 10, fontWeight: "800" },
});
