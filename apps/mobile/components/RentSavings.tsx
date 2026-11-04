import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

type Goal = {
  id: string;
  name: string;
  target_amount_kobo: number;
  target_date: string | null;
  duration_months: 3 | 6;
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
  const [durationMonths, setDurationMonths] = useState<3 | 6>(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [contributions, setContributions] = useState<Array<{goal_id:string;amount_kobo:number;status:string;created_at:string}>>([]);
  const [contributionAmount, setContributionAmount] = useState("");
  const [fundingGoalId, setFundingGoalId] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.from("rent_savings_goals")
      .select("id,name,target_amount_kobo,target_date,duration_months,status,created_at")
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
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("rent_savings_goals").insert({
      resident_user_id: residentUserId,
      estate_id: estateId,
      name: name.trim(),
      target_amount_kobo: Math.round(naira * 100),
      currency: "NGN",
      duration_months: durationMonths,
      status: "active",
    });
    if (error) setMessage("Goal was not saved. " + error.message);
    else {
      setName("My Rent");
      setAmount("");
      setDurationMonths(3);
      setMessage("Your rent-saving goal has been created.");
      await loadGoals();
    }
    setSaving(false);
  }

  async function fundGoal(goalId: string) {
    const naira = Number(contributionAmount.replace(/,/g, ""));
    if (!Number.isFinite(naira) || naira < 100 || naira > 100000000) {
      setMessage("Enter a contribution of at least ₦100.");
      return;
    }
    setFundingGoalId(goalId); setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("initiate-squad-payment", {
        body: { paymentType: "rent_savings", goalId, amountKobo: Math.round(naira * 100) },
      });
      if (error) throw error;
      if (!data?.checkoutUrl || typeof data.checkoutUrl !== "string" || !data.checkoutUrl.startsWith("https://")) {
        throw new Error(data?.error || "Squad did not return a valid checkout link.");
      }
      await Linking.openURL(data.checkoutUrl);
      setContributionAmount("");
      setMessage("Squad checkout opened. Your contribution will appear after Squad verifies the payment. Return here and refresh after checkout.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start Squad checkout.");
    } finally { setFundingGoalId(null); }
  }

  const visibleGoals = goals;
  return (
    <View style={styles.page}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={17} color="#D4A84B"/><Text style={styles.backText}>BACK TO HOME</Text></TouchableOpacity>
      <Text style={styles.eyebrow}>PLAN AHEAD</Text>
      <Text style={styles.title}>Save for Rent</Text>
      <Text style={styles.subtitle}>Choose a fixed savings period and set the amount you want to build towards.</Text>

      <View style={styles.notice}>
        <View style={styles.noticeIcon}><Ionicons name="shield-checkmark-outline" size={22} color="#D4A84B"/></View>
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>A committed savings plan</Text>
          <Text style={styles.noticeText}>Once started, a goal runs for its full 3- or 6-month term. It cannot be paused or cancelled. You can contribute through Squad checkout. Only server-verified payments appear in your contribution history; this is not a withdrawable wallet balance.</Text>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.section}>CREATE A SAVINGS GOAL</Text>
        <Text style={styles.label}>Goal name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Annual Rent" placeholderTextColor="#888" maxLength={80}/>
        <Text style={styles.label}>Target amount (NGN)</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="e.g. 1500000" placeholderTextColor="#888" keyboardType="numeric"/>
        <Text style={styles.label}>Savings period</Text>
        <View style={styles.durationOptions}>
          <TouchableOpacity onPress={() => setDurationMonths(3)} style={[styles.durationOption, durationMonths === 3 && styles.durationSelected]}><Text style={[styles.durationText, durationMonths === 3 && styles.durationTextSelected]}>3 months</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setDurationMonths(6)} style={[styles.durationOption, durationMonths === 6 && styles.durationSelected]}><Text style={[styles.durationText, durationMonths === 6 && styles.durationTextSelected]}>6 months</Text></TouchableOpacity>
        </View>
        <Text style={styles.durationHint}>Your goal starts when created. The due date is automatically set to the end of the selected term.</Text>
        <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void createGoal()} disabled={saving}>
          {saving ? <ActivityIndicator color="#071A3A"/> : <Text style={styles.primaryText}>Start savings goal</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}><Text style={styles.section}>YOUR SAVINGS GOALS</Text><TouchableOpacity onPress={() => void loadGoals()}><Text style={styles.refresh}>REFRESH</Text></TouchableOpacity></View>
      {loading ? <ActivityIndicator color="#D4A84B" style={{ margin: 24 }}/> : visibleGoals.length === 0 ? (
        <View style={styles.empty}><Ionicons name="wallet-outline" size={30} color="#D4A84B"/><Text style={styles.emptyTitle}>No rent goals yet</Text><Text style={styles.emptyText}>Create your first fixed-term savings goal above.</Text></View>
      ) : visibleGoals.map((goal) => (
        <View key={goal.id} style={styles.goal}>
          <View style={styles.goalTop}><View style={styles.goalIcon}><Ionicons name="home-outline" size={20} color="#D4A84B"/></View><View style={styles.goalCopy}><Text style={styles.goalName}>{goal.name}</Text><Text style={styles.goalStatus}>{goal.status.toUpperCase()}</Text></View></View>
          <Text style={styles.targetLabel}>TARGET AMOUNT</Text><Text style={styles.target}>{money(Number(goal.target_amount_kobo))}</Text>
          <Text style={styles.date}>{goal.duration_months}-month commitment · Started {new Date(goal.created_at).toLocaleDateString("en-NG")}</Text>
          <Text style={styles.date}>Due date: {goal.target_date || "Pending setup"}</Text>
          <Text style={styles.commitment}>This goal cannot be paused or cancelled. It is intended to run until its due date.</Text>
          <Text style={styles.targetLabel}>VERIFIED CONTRIBUTIONS (NOT A CUSTODIAL WALLET BALANCE)</Text><Text style={styles.date}>{money(contributions.filter(x => x.goal_id === goal.id && x.status === "successful").reduce((sum,x) => sum + Number(x.amount_kobo),0))}</Text>
          <TextInput style={styles.input} value={contributionAmount} onChangeText={setContributionAmount} placeholder="Contribution amount (NGN)" placeholderTextColor="#888" keyboardType="numeric"/>
          <TouchableOpacity style={[styles.primaryButton, fundingGoalId === goal.id && styles.disabled]} onPress={() => void fundGoal(goal.id)} disabled={!!fundingGoalId || goal.status !== "active"}>{fundingGoalId === goal.id ? <ActivityIndicator color="#071A3A"/> : <Text style={styles.primaryText}>Add money with Squad</Text>}</TouchableOpacity>
          <Text style={styles.date}>{contributions.filter(x => x.goal_id === goal.id).length} contribution transactions recorded</Text>
        </View>
      ))}
      {!!message && <Text style={message.includes("created") ? styles.success : styles.error}>{message}</Text>}
      <Text style={styles.footnote}>Payments are collected through the configured Squad merchant account. CB Nest records only server-verified transactions; this screen does not represent funds as segregated or withdrawable savings.</Text>
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
  durationOptions:{flexDirection:"row",gap:10,marginTop:5},
  durationOption:{flex:1,minHeight:45,borderWidth:1,borderColor:"#494133",borderRadius:10,alignItems:"center",justifyContent:"center",backgroundColor:"#101010"},
  durationSelected:{borderColor:"#D4A84B",backgroundColor:"#302719"},
  durationText:{fontSize:12,color:"#B9B9B9",fontWeight:"800"},
  durationTextSelected:{color:"#F1D28A"},
  durationHint:{fontSize:10,color:"#999",lineHeight:15,marginTop:3},
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
  date:{fontSize:10,color:"#B9B9B9"},
  commitment:{fontSize:10,color:"#E4C77E",lineHeight:15},
  pending:{fontSize:10,color:"#E4C77E",lineHeight:16},
  success:{fontSize:11,color:"#72D6A0",lineHeight:17},
  error:{fontSize:11,color:"#FF9292",lineHeight:17},
  footnote:{fontSize:10,color:"#999",lineHeight:16,marginTop:4},
});
