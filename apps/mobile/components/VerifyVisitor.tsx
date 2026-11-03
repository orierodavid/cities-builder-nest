import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme as t } from "../src/theme/theme";

type Props = { onBack?: () => void; onCode?: (code: string) => void; onEnterManually?: () => void };
export default function VerifyVisitor({ onBack, onCode, onEnterManually }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const handled = useRef(false);
  const handleScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    onCode?.(data);
    setTimeout(() => { handled.current = false; }, 2500);
  };
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={12}><Ionicons name="chevron-back" size={26} color={t.text} /></TouchableOpacity>
        <Text style={s.title}>Verify Visitor</Text><View style={{ width: 26 }} />
      </View>
      <View style={s.cameraWrap}>
        {permission?.granted ? <>
          <CameraView style={StyleSheet.absoluteFill} facing={facing} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleScan} />
          <View style={s.frame} pointerEvents="none"><View style={[s.corner,s.tl]} /><View style={[s.corner,s.tr]} /><View style={[s.corner,s.bl]} /><View style={[s.corner,s.br]} /></View>
        </> : <View style={s.permBox}><Text style={s.permText}>Camera access is needed to scan visitor codes.</Text><TouchableOpacity style={s.permBtn} onPress={requestPermission}><Text style={s.permBtnText}>Allow Camera</Text></TouchableOpacity></View>}
      </View>
      <Text style={s.hint}>Position the QR code within the frame</Text>
      <View style={{ paddingHorizontal:16, paddingBottom:16 + insets.bottom }}>
        <TouchableOpacity style={s.outlineBtn} onPress={onEnterManually}><Text style={s.outlineText}>Enter Code Manually</Text></TouchableOpacity>
        <TouchableOpacity style={[s.outlineBtn,{flexDirection:"row",justifyContent:"center"}]} onPress={() => setFacing(f => f === "back" ? "front" : "back")}>
          <Ionicons name="camera-reverse-outline" size={20} color={t.text} /><Text style={[s.outlineText,{marginLeft:8}]}>Switch Camera</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const C=34;
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:t.bg},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,paddingVertical:12},title:{color:t.text,fontSize:17,fontWeight:"700"},
 cameraWrap:{flex:1,marginHorizontal:16,borderRadius:16,overflow:"hidden",backgroundColor:"#111",alignItems:"center",justifyContent:"center"},frame:{width:240,height:240},corner:{position:"absolute",width:C,height:C,borderColor:t.gold},tl:{top:0,left:0,borderTopWidth:4,borderLeftWidth:4,borderTopLeftRadius:14},tr:{top:0,right:0,borderTopWidth:4,borderRightWidth:4,borderTopRightRadius:14},bl:{bottom:0,left:0,borderBottomWidth:4,borderLeftWidth:4,borderBottomLeftRadius:14},br:{bottom:0,right:0,borderBottomWidth:4,borderRightWidth:4,borderBottomRightRadius:14},
 hint:{color:t.muted,textAlign:"center",fontSize:12,marginVertical:12},outlineBtn:{borderWidth:1,borderColor:t.border,backgroundColor:t.card,borderRadius:12,paddingVertical:15,alignItems:"center",marginBottom:10},outlineText:{color:t.text,fontWeight:"600"},permBox:{padding:24,alignItems:"center"},permText:{color:t.text,textAlign:"center",marginBottom:14},permBtn:{backgroundColor:t.gold,borderRadius:10,paddingHorizontal:20,paddingVertical:12},permBtnText:{color:"#000",fontWeight:"700"}
});
