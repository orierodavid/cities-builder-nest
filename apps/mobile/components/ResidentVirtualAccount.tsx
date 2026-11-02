import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";

type VirtualAccount = {
  id: string; provider: string; bank_name: string | null; account_number: string | null;
  account_name: string | null; currency: string; status: "pending" | "active" | "failed" | "disabled";
};

export default function ResidentVirtualAccount({ residentUserId, estateId }: { residentUserId: string; estateId: string | null }) {
  const [account, setAccount] = useState<VirtualAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!estateId) { setAccount(null); setLoading(false); return; }
    setLoading(true); setMessage("");
    const { data, error } = await supabase.from("resident_virtual_accounts")
      .select("id, provider, bank_name, account_number, account_name, currency, status")
      .eq("resident_user_id", residentUserId).eq("estate_id", estateId).maybeSingle();
    if (error) setMessage("Virtual account details could not be loaded. Please refresh later.");
    else setAccount(data as VirtualAccount | null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [residentUserId, estateId]);

  async function create() {
    if (!estateId || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await supabase.functions.invoke("create-resident-virtual-account", { body: { estateId } });
    if (error || data?.error) {
      let detail = data?.message || data?.error || "Virtual account creation is unavailable.";
      try {
        const response = (error as { context?: Response } | null)?.context;
        if (response) {
          const body = await response.clone().json() as { error?: string; message?: string };
          detail = body.message || body.error || detail;
        }
      } catch { /* Keep the function response message. */ }
      setMessage(detail === "virtual_account_provider_not_configured"
        ? "A payment provider has not been selected and configured yet. No account has been created."
        : detail);
    } else {
      await load();
      setMessage("Virtual account details have been refreshed.");
    }
    setBusy(false);
  }

  return <View style={styles.card}>
    <Text style={styles.eyebrow}>RESIDENT PAYMENTS</Text>
    <Text style={styles.title}>Virtual Account</Text>
    <Text style={styles.copy}>A dedicated bank account for matching payments to this resident and estate.</Text>
    {!estateId ? <Text style={styles.message}>Select an active estate to view its virtual account.</Text> : loading ? <ActivityIndicator color="#D4A84B"/> : account?.status === "active" ? <>
      <View style={styles.detail}><Text style={styles.label}>BANK</Text><Text style={styles.value}>{account.bank_name || "—"}</Text></View>
      <View style={styles.detail}><Text style={styles.label}>ACCOUNT NUMBER</Text><Text selectable style={styles.accountNumber}>{account.account_number || "—"}</Text></View>
      <View style={styles.detail}><Text style={styles.label}>ACCOUNT NAME</Text><Text style={styles.value}>{account.account_name || "—"}</Text></View>
      <Text style={styles.status}>ACTIVE · {account.currency}</Text>
    </> : account?.status === "pending" ? <Text style={styles.message}>Your virtual account request is being processed. Refresh shortly.</Text> : <Text style={styles.message}>No virtual account has been created for this estate yet.</Text>}
    {!!message && <Text style={styles.message}>{message}</Text>}
    {estateId && account?.status !== "active" && <TouchableOpacity onPress={() => void create()} disabled={busy || loading} style={[styles.button,(busy || loading) && styles.disabled]}>
      {busy ? <ActivityIndicator color="#17130B"/> : <Text style={styles.buttonText}>{account?.status === "pending" ? "Check Virtual Account" : "Create Virtual Account"}</Text>}
    </TouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  card:{backgroundColor:"#171717",borderWidth:1,borderColor:"#403622",borderRadius:15,padding:15,marginTop:15,gap:9},
  eyebrow:{fontSize:9,color:"#D4A84B",fontWeight:"900",letterSpacing:1.4},
  title:{fontSize:17,color:"#FFFFFF",fontWeight:"900"},
  copy:{fontSize:11,lineHeight:17,color:"#B9B9B9"},
  detail:{borderTopWidth:1,borderTopColor:"#38332A",paddingTop:9,gap:4},
  label:{fontSize:8,color:"#D4A84B",fontWeight:"900",letterSpacing:1.1},
  value:{fontSize:12,color:"#FFFFFF",fontWeight:"700"},
  accountNumber:{fontSize:20,color:"#FFFFFF",fontWeight:"900",letterSpacing:1.3},
  status:{alignSelf:"flex-start",fontSize:9,color:"#A6E3BA",fontWeight:"900",letterSpacing:1,backgroundColor:"#173225",paddingHorizontal:9,paddingVertical:6,borderRadius:12},
  message:{fontSize:11,lineHeight:17,color:"#D5D5D5"},
  button:{minHeight:45,backgroundColor:"#D4A84B",borderRadius:10,alignItems:"center",justifyContent:"center",marginTop:5},
  buttonText:{fontSize:11,color:"#17130B",fontWeight:"900"},
  disabled:{opacity:.55}
});
