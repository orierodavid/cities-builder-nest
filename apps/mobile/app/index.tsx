import { ScrollView, StyleSheet, Text, View } from "react-native";

const features = [
  ["Community updates", "Read announcements from your estate management."],
  ["Maintenance requests", "Report issues and follow their progress."],
  ["Visitor access", "Prepare visitor passes for security verification."],
  ["Save for Rent", "Set savings goals and view verified payment status."],
];

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR COMMUNITY, CONNECTED</Text>
        <Text style={styles.title}>Cities Builder Nest</Text>
        <Text style={styles.subtitle}>
          A simpler way to stay connected to your estate, services, and community.
        </Text>
        <View style={styles.pill}><Text style={styles.pillText}>Starter preview</Text></View>
      </View>
      <Text style={styles.sectionTitle}>Everything in one place</Text>
      {features.map(([title, description]) => (
        <View key={title} style={styles.card}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardText}>{description}</Text>
        </View>
      ))}
      <Text style={styles.note}>
        This is an early UI scaffold. Sign-in, role permissions, live services, and financial provider integration are not yet enabled.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: "#F5F7FA", padding: 22, paddingTop: 60, paddingBottom: 40 },
  hero: { backgroundColor: "#123B32", borderRadius: 24, padding: 24, marginBottom: 28 },
  eyebrow: { color: "#B7E4D4", fontSize: 11, fontWeight: "700", letterSpacing: 1.3, marginBottom: 12 },
  title: { color: "#FFFFFF", fontSize: 31, lineHeight: 37, fontWeight: "800", marginBottom: 12 },
  subtitle: { color: "#E1EEE9", fontSize: 15, lineHeight: 23 },
  pill: { alignSelf: "flex-start", backgroundColor: "#D8F3E7", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, marginTop: 20 },
  pillText: { color: "#123B32", fontWeight: "700", fontSize: 12 },
  sectionTitle: { color: "#17212B", fontSize: 20, fontWeight: "800", marginBottom: 14 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: "#E5EAF0" },
  cardTitle: { color: "#17212B", fontSize: 16, fontWeight: "700", marginBottom: 6 },
  cardText: { color: "#5C6673", fontSize: 14, lineHeight: 21 },
  note: { color: "#687483", fontSize: 12, lineHeight: 18, marginTop: 12 }
});
