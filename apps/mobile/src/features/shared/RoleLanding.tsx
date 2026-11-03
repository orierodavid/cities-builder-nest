import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { theme } from "../../theme/theme";

export function RoleLanding({ role }: { role: "resident" | "security" | "organiser" }) {
  const { loading, user } = useAuth();
  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.gold}/></View>;
  return <View style={styles.page}><Text style={styles.brand}>CB NEST</Text><Text style={styles.title}>{role === "organiser" ? "Event Organiser" : role === "security" ? "Security" : "Resident"} workspace</Text><Text style={styles.copy}>{user ? "Your authenticated workspace is ready." : "Please sign in to continue."}</Text></View>;
}
const styles = StyleSheet.create({ center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }, page: { flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: "center", gap: 12 }, brand: { color: theme.gold, fontWeight: "900", letterSpacing: 3 }, title: { color: theme.text, fontSize: 26, fontWeight: "900" }, copy: { color: theme.muted, fontSize: 13 } });
