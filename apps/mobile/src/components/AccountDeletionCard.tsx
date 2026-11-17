import React, { useState } from "react";
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function AccountDeletionCard() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    if (password.length < 8) {
      setError("Enter your current password to continue.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("account-access", {
      body: { action: "delete_self", password },
    });
    if (invokeError || data?.error) {
      setError(data?.message || "Your account could not be deleted. Please try again.");
      setBusy(false);
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/" as never);
  }

  return (
    <>
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#3A2E12", gap: 8 }}>
        <Text style={{ color: "#F28B82", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }}>DELETE ACCOUNT</Text>
        <Text style={{ color: "#A7A095", fontSize: 11, lineHeight: 17 }}>
          Permanently deactivate your account and anonymise your profile. Financial and audit records required by law are retained.
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => { setError(""); setPassword(""); setVisible(true); }}
          style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#6C2924", backgroundColor: "#24110F", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#F2B5B0", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }}>DELETE MY ACCOUNT</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) setVisible(false); }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", padding: 22 }}>
          <View style={{ backgroundColor: "#121212", borderWidth: 1, borderColor: "#6C2924", borderRadius: 16, padding: 20, gap: 12 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "900" }}>Confirm account deletion</Text>
            <Text style={{ color: "#A7A095", fontSize: 12, lineHeight: 19 }}>
              Access will be revoked immediately. Your personal profile will be anonymised. Required financial and audit records will remain.
            </Text>
            <Text style={{ color: "#D9A93F", fontSize: 10, fontWeight: "800" }}>CURRENT PASSWORD</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
              placeholder="Enter your password" placeholderTextColor="#777"
              style={{ minHeight: 48, borderWidth: 1, borderColor: "#3A2E12", borderRadius: 9, paddingHorizontal: 12, color: "#FFFFFF", backgroundColor: "#080808" }} />
            {!!error && <Text accessibilityRole="alert" style={{ color: "#FF9292", fontSize: 11 }}>{error}</Text>}
            <TouchableOpacity accessibilityRole="button" disabled={busy || !password} onPress={() => void deleteAccount()}
              style={{ minHeight: 46, borderRadius: 9, backgroundColor: "#8E1B14", alignItems: "center", justifyContent: "center", opacity: busy || !password ? 0.55 : 1 }}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>CONFIRM DELETE</Text>}
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setVisible(false)}
              style={{ minHeight: 42, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#D9A93F", fontSize: 10, fontWeight: "800" }}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
