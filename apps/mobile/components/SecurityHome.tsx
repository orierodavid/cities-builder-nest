import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme as t } from "../src/theme/theme";

type Props = { officerName?: string; estateName?: string; onNavigate?: (route: string) => void };
type Tile = { label: string; route: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; danger?: boolean };
const TILES: Tile[] = [
  { label: "Event Guest\nVerification", route: "/security/event-guests", icon: "account-check-outline" },
  { label: "Vehicle\nRegistration", route: "/security/vehicles", icon: "car-outline" },
  { label: "Visitor Entry\nRecords", route: "/security/entry-records", icon: "login" },
  { label: "Visitor Exit\nRecords", route: "/security/exit-records", icon: "logout" },
  { label: "Incident\nReporting", route: "/security/incidents", icon: "shield-alert-outline" },
  { label: "Emergency\nAlerts", route: "/security/emergency", icon: "alert-octagon", danger: true },
];

export default function SecurityHome({ officerName = "Officer", estateName = "Greenwood Estate", onNavigate = () => {} }: Props) {
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
          <View style={{ marginLeft: 12 }}><Text style={s.greet}>Good Morning,</Text><Text style={s.officer}>{officerName}</Text></View>
        </View>
        <TouchableOpacity style={s.selector} onPress={() => onNavigate("/security/select-estate")}>
          <Text style={s.selectorText}>{estateName}</Text><Ionicons name="chevron-down" size={18} color={t.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.primary} onPress={() => onNavigate("/security/scan")}>
          <MaterialCommunityIcons name="qrcode-scan" size={26} color="#000" /><Text style={s.primaryText}>Scan Visitor Code</Text><Ionicons name="chevron-forward" size={20} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity style={s.secondary} onPress={() => onNavigate("/security/enter-code")}>
          <MaterialCommunityIcons name="key-outline" size={24} color="#000" /><Text style={s.secondaryText}>Enter Access Code</Text><Ionicons name="chevron-forward" size={20} color={t.muted} />
        </TouchableOpacity>
        <View style={s.grid}>{TILES.map(tile => (
          <TouchableOpacity key={tile.route} style={s.tile} activeOpacity={0.8} onPress={() => onNavigate(tile.route)}>
            <MaterialCommunityIcons name={tile.icon} size={28} color={tile.danger ? "#E5392E" : t.goldSoft} />
            <Text style={s.tileLabel}>{tile.label}</Text>
          </TouchableOpacity>
        ))}</View>
        <TouchableOpacity style={s.handover} onPress={() => onNavigate("/security/handover")}>
          <MaterialCommunityIcons name="clipboard-text-clock-outline" size={20} color={t.goldSoft} /><Text style={s.handoverText}>Shift Handover</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <BarItem icon="home" label="Home" active onPress={() => onNavigate("/security")} />
        <BarItem icon="document-text-outline" label="Records" onPress={() => onNavigate("/security/records")} />
        <TouchableOpacity style={s.scanFab} onPress={() => onNavigate("/security/scan")}><MaterialCommunityIcons name="qrcode-scan" size={26} color="#000" /></TouchableOpacity>
        <BarItem icon="notifications-outline" label="Alerts" onPress={() => onNavigate("/security/alerts")} />
        <BarItem icon="person-outline" label="Profile" onPress={() => onNavigate("/security/profile")} />
      </View>
    </View>
  );
}
function BarItem({ icon, label, active, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; active?: boolean; onPress: () => void }) {
  return <TouchableOpacity style={s.barItem} onPress={onPress}><Ionicons name={icon} size={22} color={active ? t.gold : t.muted} /><Text style={[s.barLabel, active && { color: t.gold }]}>{label}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  root:{flex:1,backgroundColor:t.bg},brandRow:{flexDirection:"row",alignItems:"center",marginBottom:16},brand:{color:t.gold,fontSize:20,fontWeight:"800",letterSpacing:1,marginLeft:8,flex:1},badge:{borderWidth:1,borderColor:t.gold,borderRadius:12,paddingHorizontal:10,paddingVertical:3},badgeText:{color:t.gold,fontSize:11,fontWeight:"600"},
  officerRow:{flexDirection:"row",alignItems:"center",marginBottom:16},avatar:{width:54,height:54,borderRadius:27,borderWidth:2,borderColor:t.gold,backgroundColor:t.card,alignItems:"center",justifyContent:"center"},greet:{color:t.muted,fontSize:12},officer:{color:t.text,fontSize:18,fontWeight:"700"},
  selector:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:t.card,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:14,paddingVertical:13,marginBottom:14},selectorText:{color:t.text,fontWeight:"600"},
  primary:{flexDirection:"row",alignItems:"center",backgroundColor:t.gold,borderRadius:14,paddingHorizontal:16,paddingVertical:18,marginBottom:10},primaryText:{flex:1,color:"#000",fontWeight:"700",fontSize:15,marginLeft:12},
  secondary:{flexDirection:"row",alignItems:"center",backgroundColor:"#F4F4F4",borderRadius:14,paddingHorizontal:16,paddingVertical:16,marginBottom:14},secondaryText:{flex:1,color:"#000",fontWeight:"600",fontSize:15,marginLeft:12},
  grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between"},tile:{width:"48.5%",backgroundColor:t.card,borderWidth:1,borderColor:t.border,borderRadius:14,alignItems:"center",justifyContent:"center",paddingVertical:20,marginBottom:10},tileLabel:{color:t.text,fontSize:12,fontWeight:"600",textAlign:"center",marginTop:8},
  handover:{flexDirection:"row",alignItems:"center",justifyContent:"center",backgroundColor:t.card,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:12},handoverText:{color:t.text,fontWeight:"600",marginLeft:8},
  bar:{position:"absolute",left:0,right:0,bottom:0,flexDirection:"row",alignItems:"center",justifyContent:"space-around",backgroundColor:"#0A0A0A",borderTopWidth:1,borderTopColor:t.border,paddingTop:8},barItem:{alignItems:"center",minWidth:60},barLabel:{color:t.muted,fontSize:10,marginTop:2},scanFab:{width:54,height:54,borderRadius:27,backgroundColor:t.gold,alignItems:"center",justifyContent:"center",marginTop:-26,borderWidth:4,borderColor:t.bg}
});
