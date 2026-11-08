import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
export default function SecurityAlertsRoute() {
  return <SafeAreaView style={s.root}><View style={s.content}>
    <View style={s.icon}><Ionicons name="notifications-outline" size={28} color="#D9A93F" /></View>
    <Text style={s.eyebrow}>SECURITY CENTRE</Text><Text style={s.title}>Alerts</Text>
    <Text style={s.body}>Security alerts will appear here when they are enabled for your estate.</Text>
  </View></SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#0A0A0A"},content:{flex:1,paddingHorizontal:20,justifyContent:"center",alignItems:"flex-start",gap:10},icon:{width:58,height:58,borderRadius:17,backgroundColor:"#211B10",alignItems:"center",justifyContent:"center",marginBottom:8},eyebrow:{color:"#D9A93F",fontSize:9,fontWeight:"900",letterSpacing:1.6},title:{color:"#FFFFFF",fontSize:26,fontWeight:"900"},body:{color:"#A7A095",fontSize:13,lineHeight:20}});
