import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const items = [
  { name: "index", label: "Home", icon: "home-outline" as const },
  { name: "records", label: "Records", icon: "reader-outline" as const },
  { name: "verify", label: "Verify", icon: "scan-outline" as const },
  { name: "alerts", label: "Alerts", icon: "notifications-outline" as const },
  { name: "profile", label: "Profile", icon: "person-circle-outline" as const },
];

export default function SecurityTabBar({ state, descriptors, navigation }: { state: any; descriptors: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  return <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    {items.map((item) => {
      const routeIndex = state.routes.findIndex((route: { name: string }) => route.name === item.name);
      if (routeIndex < 0) return null;
      const route = state.routes[routeIndex];
      const focused = state.index === routeIndex;
      const options = descriptors[route.key]?.options;
      const onPress = () => {
        const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
      };
      return <Pressable key={item.name} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={options?.tabBarAccessibilityLabel || item.label} onPress={onPress}
        onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })} style={s.item}>
        {item.name === "verify" ? <View style={[s.verifyButton, focused && s.verifyActive]}><Ionicons name={item.icon} size={23} color="#0A0A0A" /></View>
          : <Ionicons name={item.icon} size={21} color={focused ? "#D9A93F" : "#8E8E8E"} />}
        <Text style={[s.label, focused && s.labelActive]}>{item.label}</Text>
      </Pressable>;
    })}
  </View>;
}
const s = StyleSheet.create({
  bar: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingTop: 9, paddingHorizontal: 12, backgroundColor: "#0A0A0A", borderTopWidth: 1, borderTopColor: "#302719" },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, minHeight: 56 },
  label: { color: "#8E8E8E", fontSize: 9, fontWeight: "700" },
  labelActive: { color: "#D9A93F", fontWeight: "900" },
  verifyButton: { width: 54, height: 54, borderRadius: 27, marginTop: -31, alignItems: "center", justifyContent: "center", backgroundColor: "#D9A93F", borderWidth: 4, borderColor: "#0A0A0A" },
  verifyActive: { backgroundColor: "#F0C766" },
});
