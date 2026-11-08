import React from "react";
import { Tabs } from "expo-router";
import { SecurityProvider } from "../../src/features/security/SecurityContext";
import SecurityTabBar from "../../components/security/SecurityTabBar";

export default function SecurityLayout() {
  return <SecurityProvider><Tabs tabBar={(props) => <SecurityTabBar {...props} />}
    screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: "#0A0A0A" } }}>
    <Tabs.Screen name="index" options={{ title: "Home" }} />
    <Tabs.Screen name="records" options={{ title: "Records" }} />
    <Tabs.Screen name="verify" options={{ title: "Verify" }} />
    <Tabs.Screen name="alerts" options={{ title: "Alerts" }} />
    <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    <Tabs.Screen name="[section]" options={{ href: null }} />
    <Tabs.Screen name="emergency" options={{ href: null }} />
    <Tabs.Screen name="enter-code" options={{ href: null }} />
    <Tabs.Screen name="event-guests" options={{ href: null }} />
    <Tabs.Screen name="handover" options={{ href: null }} />
    <Tabs.Screen name="incidents" options={{ href: null }} />
    <Tabs.Screen name="scan" options={{ href: null }} />
  </Tabs></SecurityProvider>;
}
