import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("My Rent");
  const [amount, setAmount] = useState("");
  const [durationMonths, setDurationMonths] = useState<3 | 6>(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [contributions, setContributions] = useState<Array<{id:string;goal_id:string;amount_kobo:number;status:string;created_at:string;provider_reference:string|null}>>([]);
  const [contributionAmount, setContributionAmount] = useState("");
  const [fundingGoalId, setFundingGoalId] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    const goalsQuery = supabase.from("rent_savings_goals")
      .select("id,name,target_amount_kobo,target_date,duration_months,status,created_at")
      .eq("resident_user_id", residentUserId)
      .order("created_at", { ascending: false });
    let contributionsQuery = supabase.from("rent_savings_contributions")
      .select("id,goal_id,amount_kobo,status,created_at,provider_reference")
      .eq("resident_user_id", residentUserId)
      .order("created_at", { ascending: false });
    if (estateId) contributionsQuery = contributionsQuery.eq("estate_id", estateId);
    const [goalsResult, contributionsResult] = await Promise.all([goalsQuery, contributionsQuery]);
    if (goalsResult.error) {
      setMessage("Your savings goals could not be loaded. Please try again.");
    } else {
      setGoals((goalsResult.data || []) as Goal[]);
      if (contributionsResult.error) {
        setContributions([]);
        setMessage("Your goals are available, but contribution history could not be loaded. Please refresh.");
      } else {
        setContributions((contributionsResult.data || []) as Array<{id:string;goal_id:string;amount_kobo:number;status:string;created_at:string;provider_reference:string|null}>);
        setMessage("");
      }
    }
    setLoading(false);
  }, [residentUserId, estateId]);

  useEffect(() => { void loadGoals(); }, [loadGoals]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if ((previousState === "background" || previousState === "inactive") && nextState === "active") {
        void loadGoals();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [loadGoals]);

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
    if (error) setMessage("Your savings goal could not be saved. Please check the details and try again.");
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
      if (typeof data?.transactionReference !== "string" || !data.transactionReference) {
        throw new Error("We could not confirm the payment attempt. Please try again.");
      }
      if (data.checkoutUrl && (typeof data.checkoutUrl !== "string" || !data.checkoutUrl.startsWith("https://"))) {
        throw new Error("The payment link could not be validated.");
      }
      setContributionAmount("");
      router.push({ pathname: "/payment-checkout", params: {
        checkoutUrl: typeof data.checkoutUrl === "string" ? data.checkoutUrl : "",
        reference: data.transactionReference,
        paymentType: "rent_savings",
      } });
    } catch (error) {
      setMessage("Unable to start your payment. Please try again.");
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
          <Text style={styles.noticeText}>Once started, a goal runs for its full 3- or 6-month term and cannot be paused or cancelled. You can add money at any time during the term. Contributions appear in your history after payment is confirmed. Withdrawals are not available through this feature.</Text>
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
          {(() => {
            const goalContributions = contributions.filter(x => x.goal_id === goal.id);
            const successful = goalContributions.filter(x => x.status === "successful");
            const savedKobo = successful.reduce((sum, x) => sum + Number(x.amount_kobo || 0), 0);
            const targetKobo = Math.max(0, Number(goal.target_amount_kobo || 0));
            const remainingKobo = Math.max(0, targetKobo - savedKobo);
            const progress = targetKobo > 0 ? Math.min(100, Math.max(0, (savedKobo / targetKobo) * 100)) : 0;
            const pendingCount = goalContributions.filter(x => x.status === "pending").length;
            return (
              <View style={styles.progressCard}>
                <Text style={styles.targetLabel}>SAVINGS PROGRESS</Text>
                <View style={styles.progressNumbers}>
                  <Text style={styles.progressPercent}>{progress.toFixed(1)}%</Text>
                  <Text style={styles.progressTarget}>of {money(targetKobo)}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <View style={styles.progressStats}>
                  <View style={styles.progressStat}><Text style={styles.progressStatLabel}>VERIFIED SAVED</Text><Text style={styles.progressStatValue}>{money(savedKobo)}</Text></View>
                  <View style={styles.progressStat}><Text style={styles.progressStatLabel}>REMAINING</Text><Text style={styles.progressStatValue}>{money(remainingKobo)}</Text></View>
                </View>
                <Text style={styles.progressFootnote}>Only successful, server-verified contributions count toward this percentage. Pending: {pendingCount}.</Text>
              </View>
            );
          })()}
          <TextInput style={styles.input} value={contributionAmount} onChangeText={setContributionAmount} placeholder="Contribution amount (NGN)" placeholderTextColor="#888" keyboardType="numeric"/>
          <TouchableOpacity style={[styles.primaryButton, fundingGoalId === goal.id && styles.disabled]} onPress={() => void fundGoal(goal.id)} disabled={!!fundingGoalId || goal.status !== "active"}>{fundingGoalId === goal.id ? <ActivityIndicator color="#071A3A"/> : <Text style={styles.primaryText}>Add Money</Text>}</TouchableOpacity>
          <View style={styles.historyHeader}><Text style={styles.targetLabel}>CONTRIBUTION HISTORY</Text><Text style={styles.date}>{contributions.filter(x => x.goal_id === goal.id).length} records</Text></View>
          {contributions.filter(x => x.goal_id === goal.id).length === 0 ? <Text style={styles.date}>No contributions yet.</Text> : contributions.filter(x => x.goal_id === goal.id).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyCopy}>
                <Text style={styles.historyAmount}>{money(Number(item.amount_kobo || 0))}</Text>
                <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</Text>
                {item.provider_reference ? <Text style={styles.historyReference}>Ref: {item.provider_reference}</Text> : null}
              </View>
              <Text style={[styles.historyStatus, item.status === "successful" ? styles.historySuccess : item.status === "pending" ? styles.historyPending : styles.historyFailed]}>{item.status.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ))}
      {!!message && <Text style={message.includes("created") ? styles.success : styles.error}>{message}</Text>}
      <Text style={styles.footnote}>Your contributions count toward your rent goal after payment is confirmed. This feature tracks progress toward your goal and is not a withdrawable wallet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page:{gap:13,padding:16,paddingBottom:28,backgroundColor:"#080808",width:"100%"},
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
  progressCard:{backgroundColor:"#101010",borderWidth:1,borderColor:"#514126",borderRadius:12,padding:12,gap:9,marginTop:7},
  progressNumbers:{flexDirection:"row",alignItems:"baseline",gap:7},
  progressPercent:{fontSize:27,color:"#F1D28A",fontWeight:"900"},
  progressTarget:{fontSize:10,color:"#B9B9B9"},
  progressTrack:{height:10,borderRadius:99,backgroundColor:"#38332A",overflow:"hidden"},
  progressFill:{height:10,borderRadius:99,backgroundColor:"#D4A84B"},
  progressStats:{flexDirection:"row",gap:10},
  progressStat:{flex:1,gap:3},
  progressStatLabel:{fontSize:8,color:"#AFA89B",fontWeight:"900",letterSpacing:.7},
  progressStatValue:{fontSize:13,color:"#FFFFFF",fontWeight:"900"},
  progressFootnote:{fontSize:9,color:"#B9B9B9",lineHeight:14},
  historyHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:7},
  historyRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,paddingVertical:9,borderBottomWidth:1,borderBottomColor:"#38332A"},
  historyCopy:{flex:1,gap:3},
  historyAmount:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},
  historyDate:{fontSize:9,color:"#B9B9B9"},
  historyReference:{fontSize:8,color:"#8F8F8F"},
  historyStatus:{fontSize:8,fontWeight:"900",letterSpacing:.5},
  historySuccess:{color:"#72D6A0"},
  historyPending:{color:"#E4C77E"},
  historyFailed:{color:"#FF9292"},
  target:{fontSize:23,color:"#FFFFFF",fontWeight:"900"},
  date:{fontSize:10,color:"#B9B9B9"},
  commitment:{fontSize:10,color:"#E4C77E",lineHeight:15},
  pending:{fontSize:10,color:"#E4C77E",lineHeight:16},
  success:{fontSize:11,color:"#72D6A0",lineHeight:17},
  error:{fontSize:11,color:"#FF9292",lineHeight:17},
  footnote:{fontSize:10,color:"#999",lineHeight:16,marginTop:4},
});
