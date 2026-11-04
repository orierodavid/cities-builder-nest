import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import MobileConsentGate from "../components/MobileConsentGate";
import { theme } from "../src/theme/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <>
      <StatusBar style="light" />
      {ready ? (
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
