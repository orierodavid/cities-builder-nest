import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme/theme";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.wrap}><Text style={styles.title}>{title}</Text>{!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>;
}
const styles = StyleSheet.create({ wrap: { gap: 5, paddingVertical: 12 }, title: { color: theme.text, fontSize: 24, fontWeight: "900" }, subtitle: { color: theme.muted, fontSize: 12 } });
