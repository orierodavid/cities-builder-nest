import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import MobileConsentGate from "../components/MobileConsentGate";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <MobileConsentGate><Stack screenOptions={{ headerShown: false }} /></MobileConsentGate>
    </>
  );
}
