import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import MobileConsentGate from "../components/MobileConsentGate";
import { theme } from "../src/theme/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={theme.bg} />
      <MobileConsentGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      </MobileConsentGate>
    </>
  );
}
