import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import ResidentElectricity from "./ResidentElectricity";
import ResidentCableTV from "./ResidentCableTV";

const card = {
  backgroundColor: "#171717", borderColor: "#3A3020", borderWidth: 1,
  borderRadius: 14, padding: 16,
} as const;

export default function ResidentUtilityHub({ estateId, onBack }: { estateId: string; onBack: () => void }) {
  const [showElectricity, setShowElectricity] = useState(false);
  const [showCableTV, setShowCableTV] = useState(false);

  if (showElectricity) {
    return <ResidentElectricity estateId={estateId} onBack={() => setShowElectricity(false)} />;
  }
  if (showCableTV) {
    return <ResidentCableTV estateId={estateId} onBack={() => setShowCableTV(false)} />;
  }


  return (
    <View style={{ gap: 12, paddingBottom: 30 }}>
      <TouchableOpacity onPress={onBack} style={{ paddingVertical: 8 }}>
        <Text style={{ color: "#D4A84B", fontWeight: "900" }}>‹ BACK TO HOME</Text>
      </TouchableOpacity>
      <View style={card}>
        <Text style={{ color: "#D4A84B", fontWeight: "900", fontSize: 11 }}>RESIDENT UTILITIES</Text>
        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 24, marginTop: 6 }}>Utilities</Text>
        <Text style={{ color: "#B9B9B9", fontSize: 12, lineHeight: 18, marginTop: 5 }}>
          Pay supported estate utilities and keep your transaction receipts in one place.
        </Text>
      </View>
      <Text style={{ color: "#D4A84B", fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>AVAILABLE NOW</Text>
      <TouchableOpacity onPress={() => setShowElectricity(true)} style={[card, { flexDirection: "row", alignItems: "center", gap: 13 }]}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#D9A93F", alignItems: "center", justifyContent: "center" }}>
          <MaterialCommunityIcons name="flash" size={25} color="#17130B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Electricity</Text>
          <Text style={{ color: "#B9B9B9", fontSize: 11, marginTop: 3 }}>Verify meters, buy tokens and view receipts</Text>
        </View>
        <Text style={{ color: "#D4A84B", fontSize: 22 }}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowCableTV(true)} style={[card, { flexDirection: "row", alignItems: "center", gap: 13 }]}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#302719", alignItems: "center", justifyContent: "center" }}>
          <MaterialCommunityIcons name="television-classic" size={23} color="#D9A93F" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Cable TV</Text>
          <Text style={{ color: "#B9B9B9", fontSize: 11, marginTop: 3 }}>Verify decoder and renew your subscription</Text>
        </View>
        <Text style={{ color: "#D4A84B", fontSize: 22 }}>›</Text>
      </TouchableOpacity>
    </View>
  );
}
