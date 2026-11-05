import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme as t } from "../src/theme/theme";

type Props = { officerName?: string; estateName?: string; statusMessage?: string; onNavigate?: (route: string) => void };
type Tile = { label: string; route: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; danger?: boolean };
const TILES: Tile[] = [
  { label: "Event Guest\nVerification", route: "/event-guests", icon: "account-check-outline" },
  { label: "Vehicle\nRegistration", route: "/vehicles", icon: "car-outline" },
  { label: "Visitor Entry\nRecords", route: "/entry-records", icon: "login" },
  { label: "Visitor Exit\nRecords", route: "/exit-records", icon: "logout" },
  { label: "Incident\nReporting", route: "/incidents", icon: "shield-alert-outline" },
  { label: "Emergency\nAlerts", route: "/emergency", icon: "alert-octagon", danger: true },
];

export default function SecurityHome({ officerName = "Security Officer", estateName = "Assigned estate", statusMessage, onNavigate = () => {} }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={s.brandRow}>
          <Ionicons name="business" size={26} color={t.gold} />
          <Text style={s.brand}>CB NEST</Text>
          <View style={s.badge}><Text style={s.badgeText}>Security</Text></View>
        </View>
        <View style={s.officerRow}>
          <View style={s.avatar}><Ionicons name="person" size={26} color={t.gold} /></View>
          <View style={{ marginLeft: 12, flex: 1 }}><Text style={s.greet}>Good day,</Text><Text style={s.officer}>{officerName}</Text><Text style={s.estateCaption}>{estateName}</Text></View>
          <TouchableOpacity onPress={() => onNavigate("/profile")}><Ionicons name="person-circle-outline" size={27} color={t.text} /></TouchableOpacity>
        </View>
        {statusMessage ? <View style={s.notice}><Ionicons name="information-circle-outline" size={18} color={t.gold}/><Text style={s.noticeText}>{statusMessage}</Text></View> : null}
        <View style={s.sectionHead}><Text style={s.sectionEyebrow}>GATE OPERATIONS</Text><Text style={s.sectionTitle}>Visitor access</Text><Text style={s.sectionSub}>Verify every visitor before granting entry.</Text></View>
        <TouchableOpacity style={s.primary} onPress={() => onNavigate("/scan")}>
          <MaterialCommunityIcons name="qrcode-scan" size={26} color="#000" /><View style={{flex:1,marginLeft:12}}><Text style={s.primaryText}>Scan Visitor Code</Text><Text style={s.primarySub}>Use the camera to verify a QR pass</Text></View><Ionicons name="chevron-forward" size={20} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={() => onNavigate("/enter-code")}>
          <MaterialCommunityIcons name="keyboard-outline" size={24} color="#000" /><View style={{flex:1,marginLeft:12}}><Text style={s.secondaryText}>Enter Access Code</Text><Text style={s.secondarySub}>Verify a six-digit code manually</Text></View><Ionicons name="chevron-forward" size={20} color="#333" />
        </TouchableOpacity>
        <View style={s.sectionHead}><Text style={s.sectionEyebrow}>SECURITY TOOLS</Text><Text style={s.sectionTitle}>Estate operations</Text></View>
        <View style={s.grid}>{TILES.map(tile => (
          <TouchableOpacity key={tile.route} style={s.tile} activeOpacity={0.8} onPress={() => onNavigate(tile.route)}>
            <MaterialCommunityIcons name={tile.icon} size={27} color={tile.danger ? "#E5392E" : t.goldSoft} />
            <Text style={s.tileLabel}>{tile.label}</Text>
          </TouchableOpacity>
        ))}</View>
        <TouchableOpacity style={s.handover} onPress={() => onNavigate("/handover")}>
          <MaterialCommunityIcons name="clipboard-text-clock-outline" size={20} color={t.goldSoft} /><Text style={s.handoverText}>Shift Handover</Text><Ionicons name="chevron-forward" size={18} color={t.muted}/>
        </TouchableOpacity>
      </ScrollView>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <BarItem icon="home" label="Home" active onPress={() => onNavigate("/")} />
        <BarItem icon="document-text-outline" label="Records" onPress={() => onNavigate("/records")} />
        <TouchableOpacity style={s.scanFab} onPress={() => onNavigate("/scan")}><MaterialCommunityIcons name="qrcode-scan" size={26} color="#000" /></TouchableOpacity>
        <BarItem icon="notifications-outline" label="Alerts" onPress={() => onNavigate("/alerts")} />
        <BarItem icon="person-outline" label="Profile" onPress={() => onNavigate("/profile")} />
      </View>
    </View>
  );
}
function BarItem({ icon, label, active, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; active?: boolean; onPress: () => void }) {
  return <TouchableOpacity style={s.barItem} onPress={onPress}><Ionicons name={icon} size={22} color={active ? t.gold : t.muted} /><Text style={[s.barLabel, active && { color: t.gold }]}>{label}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  root:{flex:1,backgroundColor:t.bg},brandRow:{flexDirection:"row",alignItems:"center",marginBottom:18},brand:{color:t.gold,fontSize:20,fontWeight:"800",letterSpacing:1,marginLeft:8,flex:1},badge:{borderWidth:1,borderColor:t.gold,borderRadius:12,paddingHorizontal:10,paddingVertical:3},badgeText:{color:t.gold,fontSize:11,fontWeight:"600"},
  officerRow:{flexDirection:"row",alignItems:"center",marginBottom:16},avatar:{width:54,height:54,borderRadius:27,borderWidth:2,borderColor:t.gold,backgroundColor:t.card,alignItems:"center",justifyContent:"center"},greet:{color:t.muted,fontSize:12},officer:{color:t.text,fontSize:18,fontWeight:"700"},estateCaption:{color:t.muted,fontSize:11,marginTop:3},
  notice:{flexDirection:"row",alignItems:"flex-start",gap:9,backgroundColor:"#211D15",borderWidth:1,borderColor:t.border,borderRadius:11,padding:12,marginBottom:15},noticeText:{flex:1,color:"#E8D9B6",fontSize:11,lineHeight:17},
  sectionHead:{marginTop:8,marginBottom:11},sectionEyebrow:{color:t.gold,fontSize:9,fontWeight:"900",letterSpacing:1.6},sectionTitle:{color:t.text,fontSize:19,fontWeight:"800",marginTop:4},sectionSub:{color:t.muted,fontSize:11,marginTop:3},
  primary:{flexDirection:"row",alignItems:"center",backgroundColor:t.gold,borderRadius:14,paddingHorizontal:16,paddingVertical:17,marginBottom:10},primaryText:{color:"#000",fontWeight:"800",fontSize:15},primarySub:{color:"#35280F",fontSize:10,marginTop:3},
  secondary:{flexDirection:"row",alignItems:"center",backgroundColor:"#F4F4F4",borderRadius:14,paddingHorizontal:16,paddingVertical:15,marginBottom:13},secondaryText:{color:"#000",fontWeight:"800",fontSize:14},secondarySub:{color:"#555",fontSize:10,marginTop:3},
  grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between"},tile:{width:"48.5%",minHeight:96,backgroundColor:t.card,borderWidth:1,borderColor:t.border,borderRadius:14,alignItems:"center",justifyContent:"center",paddingVertical:16,paddingHorizontal:8,marginBottom:10},tileLabel:{color:t.text,fontSize:11,fontWeight:"600",textAlign:"center",marginTop:8},
  handover:{flexDirection:"row",alignItems:"center",gap:9,backgroundColor:t.card,borderWidth:1,borderColor:t.border,borderRadius:12,padding:13},handoverText:{flex:1,color:t.text,fontWeight:"600",fontSize:12},
  bar:{position:"absolute",left:0,right:0,bottom:0,flexDirection:"row",alignItems:"center",justifyContent:"space-around",backgroundColor:"#0A0A0A",borderTopWidth:1,borderTopColor:t.border,paddingTop:8},barItem:{alignItems:"center",minWidth:52},barLabel:{color:t.muted,fontSize:9,marginTop:2},scanFab:{width:54,height:54,borderRadius:27,backgroundColor:t.gold,alignItems:"center",justifyContent:"center",marginTop:-26,borderWidth:4,borderColor:t.bg}
});
