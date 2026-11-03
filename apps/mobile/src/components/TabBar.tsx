import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme/theme";

export type TabItem = { key: string; label: string };
export function TabBar({ items, active, onChange }: { items: TabItem[]; active: string; onChange: (key: string) => void }) {
  return <View style={styles.bar}>{items.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active === item.key }} onPress={() => onChange(item.key)} style={styles.item}><Text style={[styles.label, active === item.key && styles.selected]}>{item.label}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: "row", backgroundColor: theme.card, borderTopWidth: 1, borderColor: theme.border, paddingVertical: 10 }, item: { flex: 1, alignItems: "center", padding: 8 }, label: { color: theme.muted, fontSize: 11, fontWeight: "700" }, selected: { color: theme.goldSoft } });
