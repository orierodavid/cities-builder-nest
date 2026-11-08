import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme as t } from "../src/theme/theme";

type Props = {
  officerName?: string;
  estateName?: string;
  statusMessage?: string;
  onNavigate?: (route: string) => void;
};

export default function SecurityHome({
  officerName = "Security Officer",
  estateName = "Assigned estate",
  statusMessage,
  onNavigate = () => {},
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28 }}
      >
        <View style={s.brandRow}>
          <Ionicons name="business" size={30} color={t.gold} />
          <View style={s.brandCopy}>
            <Text style={s.brand}>CB NEST</Text>
            <Text style={s.tagline}>BUILDING YOUR FUTURE</Text>
          </View>
          <View style={s.roleBadge}>
            <Text style={s.roleBadgeText}>SECURITY</Text>
          </View>
        </View>

        <View style={s.welcome}>
          <View style={s.welcomeCopy}>
            <Text style={s.eyebrow}>SECURITY TEAM</Text>
            <Text style={s.welcomeTitle}>Welcome back,</Text>
            <Text style={s.officerName} numberOfLines={2}>{officerName}</Text>
            <View style={s.estateRow}>
              <Ionicons name="location-outline" size={14} color={t.goldSoft} />
              <Text style={s.estateName} numberOfLines={1}>{estateName}</Text>
            </View>
          </View>
          <View style={s.avatar}>
            <Ionicons name="shield-checkmark" size={28} color={t.gold} />
          </View>
        </View>

        {statusMessage ? (
          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={18} color={t.gold} />
            <Text style={s.noticeText}>{statusMessage}</Text>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Your security workspace</Text>
        <Text style={s.sectionSub}>Choose what you would like to do.</Text>

        <TouchableOpacity
          activeOpacity={0.86}
          style={s.scanCard}
          onPress={() => onNavigate("/scan")}
        >
          <View style={s.scanIcon}>
            <MaterialCommunityIcons name="qrcode-scan" size={30} color="#080808" />
          </View>
          <View style={s.actionCopy}>
            <Text style={s.scanTitle}>Scan Visitor Code</Text>
            <Text style={s.scanSub}>Scan a QR code or enter an access code to verify a visitor.</Text>
          </View>
          <Ionicons name="chevron-forward" size={21} color="#17120A" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.86}
          style={s.actionCard}
          onPress={() => onNavigate("/records")}
        >
          <View style={s.actionIcon}>
            <Ionicons name="document-text-outline" size={25} color={t.goldSoft} />
          </View>
          <View style={s.actionCopy}>
            <Text style={s.actionTitle}>Visitor Entry Records</Text>
            <Text style={s.actionSub}>View visitor activity and entry history.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.muted} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.86}
          style={s.actionCard}
          onPress={() => onNavigate("/profile")}
        >
          <View style={s.actionIcon}>
            <Ionicons name="person-circle-outline" size={27} color={t.goldSoft} />
          </View>
          <View style={s.actionCopy}>
            <Text style={s.actionTitle}>My Profile</Text>
            <Text style={s.actionSub}>View your staff details and account information.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.muted} />
        </TouchableOpacity>
      </ScrollView>

      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <NavItem icon="home" label="Home" active onPress={() => onNavigate("/")} />
        <NavItem icon="document-text-outline" label="Records" onPress={() => onNavigate("/records")} />
        <NavItem icon="scan-outline" label="Scan" onPress={() => onNavigate("/scan")} />
        <NavItem icon="person-outline" label="Profile" onPress={() => onNavigate("/profile")} />
      </View>
    </View>
  );
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      activeOpacity={0.75}
      style={s.navItem}
    >
      <Ionicons name={icon} size={23} color={active ? t.gold : t.muted} />
      <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
      {active ? <View style={s.activeMark} /> : <View style={s.inactiveMark} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 25, minHeight: 48 },
  brandCopy: { marginLeft: 9, flex: 1, justifyContent: "center" },
  brand: { color: t.text, fontSize: 20, fontWeight: "900", letterSpacing: 0.3 },
  tagline: { color: "#A7A7A7", fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginTop: 3 },
  roleBadge: { borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: t.card },
  roleBadgeText: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  welcome: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 18, marginBottom: 22 },
  welcomeCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { color: t.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.7, marginBottom: 8 },
  welcomeTitle: { color: "#D0D0D0", fontSize: 14, fontWeight: "500" },
  officerName: { color: t.text, fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 2 },
  estateRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 5 },
  estateName: { color: t.muted, fontSize: 11, flexShrink: 1 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.gold, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#211D15", borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, marginBottom: 18 },
  noticeText: { flex: 1, color: "#E8D9B6", fontSize: 11, lineHeight: 17 },
  sectionTitle: { color: t.text, fontSize: 19, fontWeight: "800" },
  sectionSub: { color: t.muted, fontSize: 12, marginTop: 4, marginBottom: 14 },
  scanCard: { minHeight: 104, flexDirection: "row", alignItems: "center", backgroundColor: t.gold, borderRadius: 16, padding: 16, marginBottom: 12 },
  scanIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#F0C766", alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, marginLeft: 13, marginRight: 8 },
  scanTitle: { color: "#090909", fontSize: 16, fontWeight: "900" },
  scanSub: { color: "#3A2C12", fontSize: 11, lineHeight: 16, marginTop: 5 },
  actionCard: { minHeight: 88, flexDirection: "row", alignItems: "center", backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 15, marginBottom: 11 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#211B10", alignItems: "center", justifyContent: "center" },
  actionTitle: { color: t.text, fontSize: 14, fontWeight: "800" },
  actionSub: { color: t.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  bottomBar: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: "#0A0A0A", borderTopWidth: 1, borderTopColor: t.border, paddingTop: 8 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, gap: 3 },
  navLabel: { color: t.muted, fontSize: 10, fontWeight: "600" },
  navLabelActive: { color: t.gold, fontWeight: "800" },
  activeMark: { position: "absolute", top: -9, width: 28, height: 3, borderRadius: 2, backgroundColor: t.gold },
  inactiveMark: { height: 3 },
});
