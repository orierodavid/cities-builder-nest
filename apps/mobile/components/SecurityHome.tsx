import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme as t } from "../src/theme/theme";

type Props = {
  officerName: string;
  estateName: string;
  statusMessage?: string;
  showBottomNav?: boolean;
  onNavigate: (route: string) => void;
};

type ActionProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  onPress: () => void;
  primary?: boolean;
};

function ActionCard({ icon, title, description, onPress, primary = false }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        primary && styles.primaryCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.actionIcon, primary && styles.primaryIcon]}>
        <Ionicons name={icon} size={23} color={primary ? "#090909" : t.goldSoft} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, primary && styles.primaryTitle]}>{title}</Text>
        <Text style={[styles.actionDescription, primary && styles.primaryDescription]}>
          {description}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={19}
        color={primary ? "#211A0B" : t.muted}
      />
    </Pressable>
  );
}

export default function SecurityHome({
  officerName,
  estateName,
  statusMessage,
  showBottomNav = true,
  onNavigate,
}: Props) {
  const insets = useSafeAreaInsets();
  const firstName = officerName.trim().split(/\\s+/)[0] || "Officer";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 18) + (showBottomNav ? 104 : 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topLine}>
          <View style={styles.brandMark}>
            <Ionicons name="shield-checkmark" size={20} color={t.gold} />
          </View>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandName}>CB NEST</Text>
            <Text style={styles.brandCaption}>ESTATE SECURITY</Text>
          </View>
          <View style={styles.rolePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.roleText}>SECURITY</Text>
          </View>
        </View>

        <View style={styles.welcome}>
          <Text style={styles.eyebrow}>SECURITY DASHBOARD</Text>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.officerName}>{firstName}</Text>
          <View style={styles.estateRow}>
            <Ionicons name="business-outline" size={16} color={t.goldSoft} />
            <Text style={styles.estateName} numberOfLines={1}>{estateName}</Text>
          </View>
        </View>

        {statusMessage ? (
          <View style={styles.notice}>
            <Ionicons name="alert-circle-outline" size={18} color="#F2B5B0" />
            <Text style={styles.noticeText}>{statusMessage}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>GATE OPERATIONS</Text>
          <Text style={styles.sectionHint}>Choose an action to continue</Text>
        </View>

        <ActionCard
          primary
          icon="qr-code-outline"
          title="Scan Visitor Code"
          description="Verify a visitor's QR pass at the gate"
          onPress={() => onNavigate("/scan")}
        />
        <ActionCard
          icon="keypad-outline"
          title="Enter Access Code"
          description="Look up a visitor using their access code"
          onPress={() => onNavigate("/scan")}
        />

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>VISITOR MANAGEMENT</Text>
        </View>
        <ActionCard
          icon="list-outline"
          title="Visitor Entry Records"
          description="View active visits and check visitors out"
          onPress={() => onNavigate("/records")}
        />

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="information-circle-outline" size={20} color={t.goldSoft} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoTitle}>Gate activity</Text>
            <Text style={styles.infoText}>
              Approved visitor check-ins are recorded for your estate. Use Visitor Entry Records to review active visits and complete check-outs.
            </Text>
          </View>
        </View>
      </ScrollView>

      {showBottomNav ? <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.tab} onPress={() => onNavigate("/")}>
          <Ionicons name="home" size={21} color={t.gold} />
          <Text style={[styles.tabLabel, styles.activeTabLabel]}>Home</Text>
        </Pressable>
        <Pressable style={styles.tab} onPress={() => onNavigate("/records")}>
          <Ionicons name="receipt-outline" size={21} color={t.muted} />
          <Text style={styles.tabLabel}>Records</Text>
        </Pressable>
        <Pressable
          style={styles.scanTab}
          onPress={() => onNavigate("/scan")}
          accessibilityRole="button"
          accessibilityLabel="Scan visitor code"
        >
          <Ionicons name="scan" size={25} color="#090909" />
        </Pressable>
        <Pressable style={styles.tab} onPress={() => onNavigate("/profile")}>
          <Ionicons name="person-circle-outline" size={21} color={t.muted} />
          <Text style={styles.tabLabel}>Profile</Text>
        </Pressable>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  topLine: { flexDirection: "row", alignItems: "center", marginBottom: 30 },
  brandMark: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: "#211B10",
    borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center",
  },
  brandTextWrap: { marginLeft: 10, flex: 1 },
  brandName: { color: t.text, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  brandCaption: { color: t.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1.5, marginTop: 3 },
  rolePill: {
    flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1,
    borderColor: t.border, borderRadius: 30, paddingHorizontal: 11, paddingVertical: 7,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.green },
  roleText: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  welcome: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    borderRadius: 20, padding: 20, marginBottom: 25,
  },
  eyebrow: { color: t.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.8, marginBottom: 15 },
  greeting: { color: t.muted, fontSize: 14, fontWeight: "500" },
  officerName: { color: t.text, fontSize: 29, fontWeight: "900", marginTop: 3 },
  estateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border },
  estateName: { color: t.goldSoft, fontSize: 12, fontWeight: "700", flex: 1 },
  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13,
    borderRadius: 12, backgroundColor: "#24110F", borderWidth: 1, borderColor: "#6C2924",
    marginBottom: 20,
  },
  noticeText: { color: "#F2B5B0", fontSize: 12, lineHeight: 18, flex: 1 },
  sectionHeading: { marginBottom: 12, marginTop: 2 },
  sectionTitle: { color: t.goldSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  sectionHint: { color: t.muted, fontSize: 11, marginTop: 5 },
  actionCard: {
    minHeight: 82, flexDirection: "row", alignItems: "center", gap: 13,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 11,
  },
  primaryCard: { backgroundColor: t.gold, borderColor: t.gold, minHeight: 94 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  actionIcon: {
    width: 46, height: 46, borderRadius: 13, backgroundColor: "#211B10",
    alignItems: "center", justifyContent: "center",
  },
  primaryIcon: { backgroundColor: "rgba(0,0,0,0.10)" },
  actionCopy: { flex: 1 },
  actionTitle: { color: t.text, fontSize: 14, fontWeight: "800" },
  primaryTitle: { color: "#090909", fontSize: 16 },
  actionDescription: { color: t.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  primaryDescription: { color: "#3A2D13" },
  infoCard: {
    flexDirection: "row", gap: 11, backgroundColor: "#10100E",
    borderWidth: 1, borderColor: t.border, borderRadius: 15,
    padding: 15, marginTop: 12,
  },
  infoIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#211B10", alignItems: "center", justifyContent: "center" },
  infoCopy: { flex: 1 },
  infoTitle: { color: t.text, fontSize: 12, fontWeight: "800", marginBottom: 5 },
  infoText: { color: t.muted, fontSize: 11, lineHeight: 17 },
  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 75,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 10, paddingHorizontal: 14, backgroundColor: "#0D0D0D",
    borderTopWidth: 1, borderTopColor: t.border,
  },
  tab: { minWidth: 55, alignItems: "center", justifyContent: "center", gap: 4 },
  tabLabel: { color: t.muted, fontSize: 9, fontWeight: "700" },
  activeTabLabel: { color: t.gold },
  scanTab: {
    width: 54, height: 54, borderRadius: 18, backgroundColor: t.gold,
    alignItems: "center", justifyContent: "center", marginTop: -25,
    borderWidth: 4, borderColor: "#0D0D0D",
  },
});
