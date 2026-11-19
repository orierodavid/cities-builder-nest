import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import MobileConsentGate from "../components/MobileConsentGate";
import ConnectionStatusBanner from "../src/components/ConnectionStatusBanner";

void SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn("[CB Nest splash] Could not hold native splash:", error);
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" backgroundColor="#000000" />
      {ready ? (
        <MobileConsentGate>
          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              contentStyle: { backgroundColor: "#000000" },
            }}
          />
        </MobileConsentGate>
      ) : null}
      <ConnectionStatusBanner />
    </View>
  );
}
