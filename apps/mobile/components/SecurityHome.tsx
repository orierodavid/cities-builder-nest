import React from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}
      >
        <View style={s.brandRow}>
          <View style={s.logoMark}>
            <MaterialCommunityIcons name="office-building" size={25} color={t.gold} />
          </View>
          <View style={s.brandCopy}>
            <Text style={s.brand}>CB NEST</Text>
            <Text style={s.tagline}>BUILDING YOUR FUTURE</Text>
          </View>
          <View style={s.roleBadge}>
            <Ionicons name="shield-checkmark" size={12} color={t.goldSoft} />
            <Text style={s.roleBadgeText}>SECURITY</Text>
          </View>
        </View>

        <View style={s.welcome}>
          <View style={s.welcomeCopy}>
            <Text style={s.eyebrow}>YOUR SECURITY DESK</Text>
            <Text style={s.welcomeTitle}>Welcome back,</Text>
            <Text style={s.officerName} numberOfLines={2}>{officerName}</Text>
            <View style={s.estateRow}>
              <Ionicons name="location-outline" size={15} color={t.goldSoft} />
              <Text style={s.estateName} numberOfLines={1}>{estateName}</Text>
            </View>
          </View>
          <View style={s.avatar}>
            <Ionicons name="shield-checkmark" size={29} color={t.gold} />
          </View>
        </View>

        {!!statusMessage && (
          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={19} color={t.gold} />
            <Text style={s.noticeText}>{statusMessage}</Text>
          </View>
        )}

        <View style={s.sectionHeading}>
          <View>
            <Text style={s.sectionTitle}>Your security workspace</Text>
            <Text style={s.sectionSub}>What would you like to do today?</Text>
          </View>
          <View style={s.online}><View style={s.onlineDot} /><Text style={s.onlineText}>ON DUTY</Text></View>
        </View>

        <TouchableOpacity activeOpacity={0.88} style={s.scanCard} onPress={() => onNavigate("/scan")}>
          <View style={s.scanIcon}>
            <MaterialCommunityIcons name="qrcode-scan" size={29} color="#080808" />
          </View>
          <View style={s.actionCopy}>
            <Text style={s.scanEyebrow}>VISITOR VERIFICATION</Text>
            <Text style={s.scanTitle}>Scan Visitor Code</Text>
            <Text style={s.scanSub}>Scan a QR code or enter an access code to verify a visitor.</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={27} color="#17120A" />
        </TouchableOpacity>

        <Text style={s.sectionLabel}>QUICK ACCESS</Text>
        <TouchableOpacity activeOpacity={0.82} style={s.actionCard} onPress={() => onNavigate("/records")}>
          <View style={s.actionIcon}>
            <Ionicons name="document-text-outline" size={24} color={t.goldSoft} />
          </View>
          <View style={s.actionCopy}>
            <Text style={s.actionTitle}>Visitor Entry Records</Text>
            <Text style={s.actionSub}>Review visitors currently inside and check-out activity.</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={t.muted} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.82} style={s.actionCard} onPress={() => onNavigate("/profile")}>
          <View style={s.actionIcon}>
            <Ionicons name="person-circle-outline" size={25} color={t.goldSoft} />
          </View>
          <View style={s.actionCopy}>
            <Text style={s.actionTitle}>My Profile</Text>
            <Text style={s.actionSub}>View your staff details and account information.</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={t.muted} />
        </TouchableOpacity>
        <View style={s.footerBrand}>
          <View style={s.footerLine} />
          <Text style={s.footerText}>SECURE ESTATE. PEACE OF MIND.</Text>
          <View style={s.footerLine} />
        </View>
      </ScrollView>

      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 9) }]}>
        <NavItem icon="home" label="Home" active onPress={() => onNavigate("/")} />
        <NavItem icon="document-text-outline" label="Records" onPress={() => onNavigate("/records")} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Scan visitor code" activeOpacity={0.88} onPress={() => onNavigate("/scan")} style={s.scanTab}>
          <View style={s.scanTabIcon}><MaterialCommunityIcons name="qrcode-scan" size={25} color="#080808" /></View>
          <Text style={s.scanTabLabel}>SCAN</Text>
        </TouchableOpacity>
        <NavItem icon="person-outline" label="Profile" onPress={() => onNavigate("/profile")} />
      </View>
    </View>
  );
}

function NavItem({ icon, label, active, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} activeOpacity={0.75} style={s.navItem}>
      <Ionicons name={icon} size={21} color={active ? t.gold : t.muted} />
      <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
      {active ? <View style={s.activeMark} /> : <View style={s.inactiveMark} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 25, minHeight: 50 },
  logoMark: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#1B160C", borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
  brandCopy: { marginLeft: 10, flex: 1, justifyContent: "center" },
  brand: { color: t.text, fontSize: 19, fontWeight: "900", letterSpacing: 1.1 },
  tagline: { color: "#A7A7A7", fontSize: 8, fontWeight: "800", letterSpacing: 1.5, marginTop: 3 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: t.card },
  roleBadgeText: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  welcome: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 18, marginBottom: 23 },
  welcomeCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { color: t.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.8, marginBottom: 9 },
  welcomeTitle: { color: "#D0D0D0", fontSize: 14, fontWeight: "500" },
  officerName: { color: t.text, fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 3 },
  estateRow: { flexDirection: "row", alignItems: "center", marginTop: 11, gap: 6 },
  estateName: { color: t.muted, fontSize: 11, flexShrink: 1 },
  avatar: { width: 59, height: 59, borderRadius: 30, backgroundColor: "#211B10", borderWidth: 1, borderColor: t.gold, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#211D15", borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, marginBottom: 18 },
  noticeText: { flex: 1, color: "#E8D9B6", fontSize: 11, lineHeight: 17 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  sectionTitle: { color: t.text, fontSize: 18, fontWeight: "800" },
  sectionSub: { color: t.muted, fontSize: 11, marginTop: 4 },
  online: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#10271B", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.green },
  onlineText: { color: "#9ADBB4", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  scanCard: { minHeight: 132, flexDirection: "row", alignItems: "center", backgroundColor: t.gold, borderRadius: 18, padding: 16, marginBottom: 24 },
  scanIcon: { width: 49, height: 49, borderRadius: 15, backgroundColor: "#F0C766", alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, marginLeft: 13, marginRight: 8 },
  scanEyebrow: { color: "#4A3816", fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  scanTitle: { color: "#090909", fontSize: 16, fontWeight: "900" },
  scanSub: { color: "#3A2C12", fontSize: 10, lineHeight: 15, marginTop: 5 },
  sectionLabel: { color: t.goldSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 11 },
  actionCard: { minHeight: 83, flexDirection: "row", alignItems: "center", backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, marginBottom: 10 },
  actionIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#211B10", alignItems: "center", justifyContent: "center" },
  actionTitle: { color: t.text, fontSize: 13, fontWeight: "800" },
  actionSub: { color: t.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  footerBrand: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 17, marginBottom: 4 },
  footerLine: { height: 1, flex: 1, backgroundColor: "#272116" },
  footerText: { color: "#706957", fontSize: 7, fontWeight: "800", letterSpacing: 1.1 },
  bottomBar: { minHeight: 73, flexDirection: "row", alignItems: "center", justifyContent: "space-around", backgroundColor: "#0A0A0A", borderTopWidth: 1, borderTopColor: t.border, paddingTop: 7 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 49, gap: 3 },
  navLabel: { color: t.muted, fontSize: 9, fontWeight: "600" },
  navLabelActive: { color: t.gold, fontWeight: "800" },
  activeMark: { position: "absolute", top: -8, width: 25, height: 2, borderRadius: 2, backgroundColor: t.gold },
  inactiveMark: { height: 2 },
  scanTab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, marginTop: -17 },
  scanTabIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: t.gold, borderWidth: 3, borderColor: "#0A0A0A", alignItems: "center", justifyContent: "center" },
  scanTabLabel: { color: t.goldSoft, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
});
