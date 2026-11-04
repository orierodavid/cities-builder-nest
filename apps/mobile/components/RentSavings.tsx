import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

type Goal = {
  id: string;
  name: string;
  target_amount_kobo: number;
  target_date: string | null;
  status: "active" | "paused" | "cancelled" | "completed";
  created_at: string;
};

type Props = { residentUserId: string; estateId: string | null; onBack: () => void };

const money = (kobo: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(kobo / 100);

export default function RentSavings({ residentUserId, estateId, onBack }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("My Rent");
  const [amount, setAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase
      .from("rent_savings_goals")
      .select("id,name,target_amount_kobo,target_date,status,created_at")
      .eq("resident_user_id", residentUserId)
      .order("created_at", { ascending: false });
    if (error) setMessage("Your savings goals could not be loaded. " + error.message);
    else setGoals((data || []) as Goal[]);
    setLoading(false);
  }, [residentUserId]);

  useEffect(() => { void loadGoals(); }, [loadGoals]);

  async function createGoal() {
    const naira = Number(amount.replace(/,/g, ""));
    if (name.trim().length < 2) { setMessage("Give your savings goal a name."); return; }
    if (!Number.isFinite(naira) || naira <= 0 || naira > 100000000) { setMessage("Enter a valid rent target amount."); return; }
    if (targetDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) { setMessage("Use the date format YYYY-MM-DD."); return; }
    if (targetDate && Number.isNaN(Date.parse(targetDate))) { setMessage("Enter a valid target date."); return; }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("rent_savings_goals").insert({
      resident_user_id: residentUserId,
      estate_id: estateId,
      name: name.trim(),
      target_amount_kobo: Math.round(naira * 100),
      currency: "NGN",
      target_date: targetDate,
      status: "active",
    });
    if (error) setMessage("Goal was not saved. " + error.message);
    else { setName("My Rent"); setAmount(""); setTargetDate(""); setMessage("Your rent-saving goal has been created."); await loadGoals(); }
    setSaving(false);
  }

  async function updateStatus(goal: Goal, status: "active" | "paused" | "cancelled") {
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("rent_savings_goals").update({ status }).eq("id", goal.id).eq("resident_user_id", residentUserId);
    if (error) setMessage("Goal status could not be updated. " + error.message);
    else await loadGoals();
    setSaving(false);
  }

  const activeGoals = goals.filter((goal) => goal.status !== "cancelled");
  return (
    <View style={styles.page}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={17} color="#D4A84B"/><Text style={styles.backText}>BACK TO HOME</Text></TouchableOpacity>
      <Text style={styles.eyebrow}>PLAN AHEAD</Text>
      <Text style={styles.title}>Save for Rent</Text>
      <Text style={styles.subtitle}>Set a rent target and track your savings plan in one place.</Text>

      <View style={styles.notice}>
        <View style={styles.noticeIcon}><Ionicons name="shield-checkmark-outline" size={22} color="#D4A84B"/></View>
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>Your savings plan</Text>
          <Text style={styles.noticeText}>Create and manage your rent target now. Deposits, withdrawals and live savings balances will be enabled when a payment and custody partner is selected.</Text>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.section}>CREATE A SAVINGS GOAL</Text>
        <Text style={styles.label}>Goal name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. 2027 Annual Rent" placeholderTextColor="#888" maxLength={80}/>
        <Text style={styles.label}>Target amount (NGN)</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="e.g. 1500000" placeholderTextColor="#888" keyboardType="numeric"/>
        <Text style={styles.label}>Due date (required)</Text>
        <TextInput style={styles.input} value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-MM-DD (required)" placeholderTextColor="#888" maxLength={10}/>
        <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void createGoal()} disabled={saving}>
          {saving ? <ActivityIndicator color="#071A3A"/> : <Text style={styles.primaryText}>Create savings goal</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}><Text style={styles.section}>YOUR SAVINGS GOALS</Text><TouchableOpacity onPress={() => void loadGoals()}><Text style={styles.refresh}>REFRESH</Text></TouchableOpacity></View>
      {loading ? <ActivityIndicator color="#D4A84B" style={{ margin: 24 }}/> : activeGoals.length === 0 ? (
        <View style={styles.empty}><Ionicons name="wallet-outline" size={30} color="#D4A84B"/><Text style={styles.emptyTitle}>No rent goals yet</Text><Text style={styles.emptyText}>Create your first goal above to start planning for your next rent payment.</Text></View>
      ) : activeGoals.map((goal) => (
        <View key={goal.id} style={styles.goal}>
          <View style={styles.goalTop}><View style={styles.goalIcon}><Ionicons name="home-outline" size={20} color="#D4A84B"/></View><View style={styles.goalCopy}><Text style={styles.goalName}>{goal.name}</Text><Text style={styles.goalStatus}>{goal.status.toUpperCase()}</Text></View></View>
          <Text style={styles.targetLabel}>TARGET AMOUNT</Text><Text style={styles.target}>{money(Number(goal.target_amount_kobo))}</Text>
          <Text style={styles.pending}>Savings balance will appear after payment partner integration.</Text>
          <Text style={styles.date}>Due date: {goal.target_date || "Not set"}</Text>
          <View style={styles.actions}>
            {goal.status === "active" ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void updateStatus(goal,"paused")} disabled={saving}><Text style={styles.secondaryText}>Pause goal</Text></TouchableOpacity> : goal.status === "paused" ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void updateStatus(goal,"active")} disabled={saving}><Text style={styles.secondaryText}>Resume goal</Text></TouchableOpacity> : null}
            {goal.status !== "cancelled" && <TouchableOpacity style={styles.cancelButton} onPress={() => void updateStatus(goal,"cancelled")} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>}
          </View>
        </View>
      ))}
      {!!message && <Text style={message.includes("created") ? styles.success : styles.error}>{message}</Text>}
      <Text style={styles.footnote}>No money is collected or held by CB Nest at this stage. Creating a goal does not initiate a payment.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page:{gap:13,padding:16,paddingBottom:28,backgroundColor:"#080808",minHeight:620,marginHorizontal:-20,marginTop:-18,marginBottom:-30},
  back:{flexDirection:"row",alignItems:"center",gap:8,alignSelf:"flex-start",paddingVertical:5},
  backText:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1},
  eyebrow:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1.8,marginTop:5},
  title:{fontSize:28,color:"#FFFFFF",fontWeight:"900",letterSpacing:-.5},
  subtitle:{fontSize:13,lineHeight:20,color:"#B9B9B9"},
  notice:{flexDirection:"row",gap:12,backgroundColor:"#171717",borderWidth:1,borderColor:"#5A4828",borderRadius:15,padding:14},
  noticeIcon:{width:38,height:38,borderRadius:12,backgroundColor:"#282116",alignItems:"center",justifyContent:"center"},
  noticeCopy:{flex:1,gap:4},
  noticeTitle:{fontSize:13,color:"#F1D28A",fontWeight:"900"},
  noticeText:{fontSize:11,color:"#C8C0B3",lineHeight:17},
  form:{backgroundColor:"#171717",borderWidth:1,borderColor:"#3A3020",borderRadius:16,padding:15,gap:5},
  section:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1.5},
  label:{fontSize:11,color:"#F1D28A",fontWeight:"800",marginTop:8},
  input:{minHeight:47,borderWidth:1,borderColor:"#494133",borderRadius:10,paddingHorizontal:12,paddingVertical:10,color:"#FFFFFF",backgroundColor:"#101010",fontSize:13},
  primaryButton:{minHeight:48,borderRadius:11,backgroundColor:"#D4A84B",alignItems:"center",justifyContent:"center",marginTop:12},
  primaryText:{fontSize:12,color:"#071A3A",fontWeight:"900"},
  disabled:{opacity:.6},
  listHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:9},
  refresh:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1},
  empty:{alignItems:"center",gap:8,backgroundColor:"#171717",borderWidth:1,borderColor:"#3A3020",borderRadius:15,padding:22},
  emptyTitle:{fontSize:14,color:"#FFFFFF",fontWeight:"900"},
  emptyText:{fontSize:11,color:"#B9B9B9",lineHeight:17,textAlign:"center"},
  goal:{backgroundColor:"#171717",borderWidth:1,borderColor:"#3A3020",borderRadius:15,padding:15,gap:7},
  goalTop:{flexDirection:"row",alignItems:"center",gap:11},
  goalIcon:{width:40,height:40,borderRadius:13,backgroundColor:"#282116",alignItems:"center",justifyContent:"center"},
  goalCopy:{flex:1,gap:3},
  goalName:{fontSize:14,color:"#FFFFFF",fontWeight:"900"},
  goalStatus:{fontSize:9,color:"#D4A84B",fontWeight:"900",letterSpacing:1},
  targetLabel:{fontSize:9,color:"#B9B9B9",fontWeight:"800",letterSpacing:1,marginTop:8},
  target:{fontSize:23,color:"#FFFFFF",fontWeight:"900"},
  pending:{fontSize:10,color:"#E4C77E",lineHeight:16},
  date:{fontSize:10,color:"#B9B9B9"},
  actions:{flexDirection:"row",gap:8,marginTop:8},
  secondaryButton:{borderWidth:1,borderColor:"#6A552F",borderRadius:9,paddingHorizontal:13,paddingVertical:9},
  secondaryText:{fontSize:10,color:"#F1D28A",fontWeight:"800"},
  cancelButton:{borderWidth:1,borderColor:"#714040",borderRadius:9,paddingHorizontal:13,paddingVertical:9},
  cancelText:{fontSize:10,color:"#FFAAAA",fontWeight:"800"},
  success:{fontSize:11,color:"#72D6A0",lineHeight:17},
  error:{fontSize:11,color:"#FF9292",lineHeight:17},
  footnote:{fontSize:10,color:"#999",lineHeight:16,marginTop:4},
});
