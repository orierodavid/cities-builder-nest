import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

type Estate = { id: string; name: string; address?: string | null; city?: string | null; state?: string | null; country_code?: string | null; membershipRole: string | null };
type ProfileResponse = { profile?: { id: string; full_name: string | null; is_active: boolean } | null; profilePending?: boolean; error?: string };
type EstatesResponse = { estates?: Estate[]; error?: string };
type Dashboard = {
  summary: { units: number; occupiedUnits: number; openMaintenanceRequests: number; publishedAnnouncements: number };
  announcements: { id: string; title: string; body: string; published_at: string | null }[];
  maintenanceRequests: { id: string; title: string; status: string; priority: string }[];
  error?: string;
};

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const green = "#123B32";
const gold = "#E8B923";

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 900;
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estatesLoading, setEstatesLoading] = useState(false);
  const [estatesError, setEstatesError] = useState("");
  const [selectedEstateId, setSelectedEstateId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [tab, setTab] = useState<"home" | "community" | "maintenance" | "profile">("home");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestPriority, setRequestPriority] = useState("normal");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setRestoring(false); }
    }).catch(() => {
      if (mounted) { setRestoring(false); setMessage("We couldn't restore your session. Please sign in again."); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setProfile(null); setEstates([]); setEstatesError(""); setSelectedEstateId(null); setDashboard(null); return;
    }
    void loadProfile(session.access_token);
    void loadEstates(session.access_token);
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token && selectedEstateId) void loadDashboard(session.access_token, selectedEstateId);
    else setDashboard(null);
  }, [session?.access_token, selectedEstateId]);

  async function loadProfile(token: string) {
    if (!apiUrl) { setProfile({ error: "API address is not configured." }); return; }
    try {
      const res = await fetch(apiUrl + "/v1/me", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      const body = await res.json() as ProfileResponse;
      setProfile(res.ok ? body : { error: body.error || "Profile request failed (" + res.status + ")." });
    } catch {
      setProfile({ error: "API is offline or unreachable. Start the API service on port 4000, then refresh." });
    }
  }

  async function loadEstates(token: string) {
    if (!apiUrl) { setEstatesError("API address is not configured."); return; }
    setEstatesLoading(true); setEstatesError("");
    try {
      const res = await fetch(apiUrl + "/v1/estates", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      const body = await res.json() as EstatesResponse;
      if (!res.ok) throw new Error(body.error || "Estate request failed (" + res.status + ").");
      const list = body.estates || [];
      setEstates(list);
      const saved = await AsyncStorage.getItem("cities-builder-nest.selected-estate-id");
      setSelectedEstateId(saved && list.some((e) => e.id === saved) ? saved : list[0]?.id || null);
    } catch (e) {
      setEstatesError(e instanceof Error ? e.message : "Could not load estates. Check the API connection.");
    } finally { setEstatesLoading(false); }
  }

  async function loadDashboard(token: string, estateId: string) {
    if (!apiUrl) { setDashboardError("API address is not configured."); return; }
    setDashboardLoading(true); setDashboardError("");
    try {
      const res = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(estateId) + "/dashboard", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      const body = await res.json() as Dashboard;
      if (!res.ok) throw new Error(body.error || "Dashboard request failed (" + res.status + ").");
      setDashboard(body);
    } catch (e) {
      setDashboard(null);
      setDashboardError(e instanceof Error ? e.message : "Could not load community data.");
    } finally { setDashboardLoading(false); }
  }

  async function submitAuth() {
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    if (!supabaseConfigured) { setMessage("Supabase configuration is missing. Check apps/mobile/.env."); return; }
    if (!cleanEmail || !password) { setMessage("Enter your email address and password."); return; }
    if (password.length < 8) { setMessage("Your password must contain at least 8 characters."); return; }
    if (mode === "sign-up" && !fullName.trim()) { setMessage("Enter your full name."); return; }
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { full_name: fullName.trim() } } });
        if (error) throw error;
        setMessage(data.session ? "Account created. Welcome to your community." : "Account request submitted. Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        setMessage("Signed in successfully.");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Authentication failed. Please try again."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setMessage(error.message);
    else { setMessage("Signed out."); setTab("home"); }
  }

  async function chooseEstate(id: string) {
    setSelectedEstateId(id);
    try { await AsyncStorage.setItem("cities-builder-nest.selected-estate-id", id); } catch { /* selection remains active for this session */ }
  }

  async function submitMaintenance() {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    if (requestTitle.trim().length < 3 || requestDescription.trim().length < 5) {
      setRequestMessage("Add a title (3+ characters) and description (5+ characters)."); return;
    }
    setRequestBusy(true); setRequestMessage("");
    try {
      const res = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/maintenance", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ title: requestTitle.trim(), description: requestDescription.trim(), priority: requestPriority }),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error || "Request failed (" + res.status + ").");
      setRequestTitle(""); setRequestDescription(""); setRequestMessage("Your maintenance request has been submitted.");
      await loadDashboard(session.access_token, selectedEstateId);
    } catch (e) { setRequestMessage(e instanceof Error ? e.message : "Could not submit the request."); }
    finally { setRequestBusy(false); }
  }

  const selectedEstate = estates.find((e) => e.id === selectedEstateId);
  const location = selectedEstate ? [selectedEstate.city, selectedEstate.state, selectedEstate.country_code].filter(Boolean).join(", ") : "";
  const firstName = profile?.profile?.full_name?.trim().split(/\s+/)[0] || session?.user.email?.split("@")[0] || "Resident";

  const Button = ({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) => (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}>
      {disabled && requestBusy ? <ActivityIndicator color={secondary ? green : "#fff"} /> : <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>}
    </TouchableOpacity>
  );

  const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>{title}</Text>{!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}</View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.appFrame, wide && styles.appFrameWide]}>
        {session && wide && (
          <View style={styles.sidebar}>
            <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View><View><Text style={styles.brandName}>Cities Builder</Text><Text style={styles.brandCaption}>NEST COMMUNITY</Text></View></View>
            <Text style={styles.navLabel}>YOUR SPACE</Text>
            {([["home","⌂","Home"],["community","◫","Community"],["maintenance","⚒","Maintenance"],["profile","◉","My profile"]] as const).map(([key,icon,label]) => (
              <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.navItem, tab === key && styles.navItemActive]}><Text style={[styles.navIcon,tab === key && styles.navIconActive]}>{icon}</Text><Text style={[styles.navText,tab === key && styles.navTextActive]}>{label}</Text></TouchableOpacity>
            ))}
            <View style={styles.sidebarBottom}><Text style={styles.sidebarHint}>One platform. Many estates.</Text><Text style={styles.sidebarVersion}>RESIDENT PORTAL · PREVIEW</Text></View>
          </View>
        )}
        <View style={styles.main}>
          <View style={styles.topbar}>
            <View style={styles.brandRow}>{(!session || !wide) && <View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View>}<View><Text style={styles.brandName}>Cities Builder Nest</Text><Text style={styles.brandCaption}>{session ? "YOUR COMMUNITY, CONNECTED" : "ONE PLATFORM · MANY ESTATES"}</Text></View></View>
            {session && <View style={styles.avatar}><Text style={styles.avatarText}>{firstName.slice(0,1).toUpperCase()}</Text></View>}
          </View>

          <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]} keyboardShouldPersistTaps="handled">
            {restoring ? (
              <View style={styles.loadingPage}><ActivityIndicator size="large" color={green}/><Text style={styles.bodyText}>Getting your space ready…</Text></View>
            ) : !session ? (
              <View style={[styles.authLayout,wide && styles.authLayoutWide]}>
                <View style={styles.welcomePanel}>
                  <View style={styles.overlinePill}><View style={styles.liveDot}/><Text style={styles.overlineText}>THE RESIDENT EXPERIENCE</Text></View>
                  <Text style={styles.welcomeTitle}>A better way to{"\n"}feel at <Text style={styles.welcomeAccent}>home.</Text></Text>
                  <Text style={styles.welcomeBody}>Your estate life, thoughtfully connected. Stay informed, report issues, and keep your community moving.</Text>
                  <View style={styles.welcomeFeatures}><Text style={styles.welcomeFeature}>✦  Community updates</Text><Text style={styles.welcomeFeature}>✦  Simple maintenance reporting</Text><Text style={styles.welcomeFeature}>✦  One account, many estates</Text></View>
                  <Text style={styles.welcomeFoot}>BUILT AROUND YOUR COMMUNITY</Text>
                </View>
                <View style={styles.authCard}>
                  <Text style={styles.formEyebrow}>{mode === "sign-in" ? "WELCOME BACK" : "GET STARTED"}</Text>
                  <Text style={styles.formTitle}>{mode === "sign-in" ? "Sign in to your space" : "Create your account"}</Text>
                  <Text style={styles.formIntro}>{mode === "sign-in" ? "Your community is just a sign in away." : "Join your connected estate community."}</Text>
                  {mode === "sign-up" && <><Text style={styles.fieldLabel}>Full name</Text><TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="How should we call you?" autoCapitalize="words" editable={!busy}/></>}
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy}/>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoComplete={mode === "sign-up" ? "new-password" : "current-password"} editable={!busy} onSubmitEditing={() => void submitAuth()}/>
                  {!!message && <Text style={message.toLowerCase().includes("success") || message.toLowerCase().includes("submitted") ? styles.successMessage : styles.errorMessage}>{message}</Text>}
                  {!supabaseConfigured && <Text style={styles.warningMessage}>Supabase setup is required. Check your local mobile environment file.</Text>}
                  <TouchableOpacity style={[styles.button,styles.authButton,busy && styles.disabled]} onPress={() => void submitAuth()} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>{mode === "sign-in" ? "Sign in securely  →" : "Create account  →"}</Text>}</TouchableOpacity>
                  <TouchableOpacity style={styles.switchMode} onPress={() => {setMode(mode === "sign-in" ? "sign-up" : "sign-in");setMessage("");}} disabled={busy}><Text style={styles.switchText}>{mode === "sign-in" ? "New to your community? " : "Already have an account? "}<Text style={styles.switchStrong}>{mode === "sign-in" ? "Create account" : "Sign in"}</Text></Text></TouchableOpacity>
                  <Text style={styles.secureNote}>Your account is protected by Supabase authentication.</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.greetingRow}><View><Text style={styles.greetingEyebrow}>YOUR RESIDENT DASHBOARD</Text><Text style={styles.greetingTitle}>Good to see you, {firstName}.</Text><Text style={styles.greetingSub}>Here’s what’s happening in your community.</Text></View><View style={styles.datePill}><Text style={styles.datePillText}>⌁  RESIDENT SPACE</Text></View></View>
                <View style={styles.heroCard}><View style={styles.heroGlow}/><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>YOUR PLACE. YOUR PEOPLE.</Text><Text style={styles.heroTitle}>{selectedEstate?.name || "Your community awaits"}</Text><Text style={styles.heroSubtitle}>{location || (selectedEstate ? selectedEstate.address || "Your selected estate" : "Select an estate to see your community dashboard.")}</Text><View style={styles.heroStatus}><View style={styles.liveDot}/><Text style={styles.heroStatusText}>{selectedEstate ? "COMMUNITY SELECTED" : "READY TO CONNECT"}</Text></View></View><View style={styles.heroSymbol}><Text style={styles.heroSymbolText}>⌂</Text></View></View>
                {tab === "home" && <>
                  <View style={styles.statsGrid}>{([[dashboard?.summary.units ?? "—","Total units","⌂"],[dashboard?.summary.occupiedUnits ?? "—","Occupied homes","◫"],[dashboard?.summary.openMaintenanceRequests ?? "—","Open issues","⚒"],[dashboard?.summary.publishedAnnouncements ?? "—","Announcements","✳"]] as const).map(([value,label,icon]) => <View key={label} style={styles.statCard}><View style={styles.statIcon}><Text style={styles.statIconText}>{icon}</Text></View><Text style={styles.statValue}>{String(value)}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>
                  <View style={styles.sectionRow}><SectionTitle title="Your estates" subtitle="Choose where you want to spend time."/>{!!session && <TouchableOpacity style={styles.textAction} onPress={() => void loadEstates(session.access_token)}><Text style={styles.textActionText}>↻ Refresh</Text></TouchableOpacity>}</View>
                  {estatesLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading your estates…</Text></View> : estatesError ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>We couldn't connect</Text><Text style={styles.bodyText}>{estatesError}</Text><Text style={styles.helperText}>Check that the API is running at {apiUrl || "the configured API address"}.</Text><Button title="Try again" secondary onPress={() => void loadEstates(session.access_token)}/></View> : estates.length === 0 ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>No estate membership yet</Text><Text style={styles.bodyText}>Your account is active, but no estate membership was returned. Contact your estate administrator to be added to a community.</Text></View> : <View style={styles.estateGrid}>{estates.map((estate) => {const active = estate.id === selectedEstateId;const place = [estate.city,estate.state,estate.country_code].filter(Boolean).join(", ");return <TouchableOpacity key={estate.id} onPress={() => void chooseEstate(estate.id)} style={[styles.estateCard,active && styles.estateCardActive]}><View style={[styles.estateBadge,active && styles.estateBadgeActive]}><Text style={styles.estateBadgeText}>⌂</Text></View><View style={styles.estateCardCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{[estate.address,place].filter(Boolean).join(" · ") || "Community estate"}</Text><Text style={styles.estateRole}>{(estate.membershipRole || "RESIDENT").replace(/_/g," ").toUpperCase()}</Text></View><Text style={[styles.estateCheck,active && styles.estateCheckActive]}>{active ? "✓" : "→"}</Text></TouchableOpacity>})}</View>}
                  <View style={styles.sectionRow}><SectionTitle title="Community updates" subtitle="The latest from your estate."/>{!!selectedEstateId && <TouchableOpacity style={styles.textAction} onPress={() => void loadDashboard(session.access_token,selectedEstateId)}><Text style={styles.textActionText}>↻ Refresh</Text></TouchableOpacity>}</View>
                  {dashboardLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading community updates…</Text></View> : dashboardError ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Updates temporarily unavailable</Text><Text style={styles.bodyText}>{dashboardError}</Text></View> : dashboard?.announcements.length ? dashboard.announcements.map((item) => <View key={item.id} style={styles.announcementCard}><View style={styles.announcementMark}><Text style={styles.announcementMarkText}>✳</Text></View><View style={styles.announcementCopy}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.bodyText} numberOfLines={3}>{item.body}</Text>{!!item.published_at && <Text style={styles.helperText}>{new Date(item.published_at).toLocaleDateString()}</Text>}</View></View>) : <View style={styles.simpleCard}><Text style={styles.simpleCardTitle}>Nothing new for now</Text><Text style={styles.bodyText}>Published estate announcements will appear here.</Text></View>}
                </>}
                {tab === "community" && <View style={styles.panel}><SectionTitle title="Your community" subtitle="Choose an estate and see its latest updates."/><Text style={styles.panelTitle}>Estate directory</Text>{estates.map((estate) => <TouchableOpacity key={estate.id} style={styles.directoryItem} onPress={() => void chooseEstate(estate.id)}><Text style={styles.directoryIcon}>⌂</Text><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{[estate.address,estate.city,estate.state].filter(Boolean).join(", ")}</Text></View><Text style={styles.estateCheck}>{estate.id === selectedEstateId ? "✓" : "→"}</Text></TouchableOpacity>)}<Text style={styles.panelTitle}>Announcements</Text>{dashboard?.announcements.map((item) => <View key={item.id} style={styles.contentCard}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.bodyText}>{item.body}</Text></View>)}{!dashboard?.announcements.length && <Text style={styles.bodyText}>No published announcements yet.</Text>}</View>}
                {tab === "maintenance" && <View style={styles.panel}><SectionTitle title="Maintenance" subtitle="Tell your estate team what needs attention."/><Text style={styles.fieldLabel}>Issue title</Text><TextInput style={styles.input} value={requestTitle} onChangeText={setRequestTitle} placeholder="e.g. Streetlight not working" maxLength={120}/><Text style={styles.fieldLabel}>Describe the issue</Text><TextInput style={[styles.input,styles.textArea]} value={requestDescription} onChangeText={setRequestDescription} placeholder="Where is it, and what happened?" multiline textAlignVertical="top" maxLength={3000}/><Text style={styles.fieldLabel}>Priority</Text><View style={styles.priorityRow}>{["low","normal","high","urgent"].map((p) => <TouchableOpacity key={p} onPress={() => setRequestPriority(p)} style={[styles.priorityChip,requestPriority === p && styles.priorityChipActive]}><Text style={[styles.priorityChipText,requestPriority === p && styles.priorityChipTextActive]}>{p}</Text></TouchableOpacity>)}</View>{!!requestMessage && <Text style={requestMessage.includes("submitted") ? styles.successMessage : styles.errorMessage}>{requestMessage}</Text>}<Button title={requestBusy ? "Submitting…" : "Submit maintenance request"} onPress={() => void submitMaintenance()} disabled={requestBusy}/><Text style={styles.panelTitle}>Recent open issues</Text>{dashboard?.maintenanceRequests.map((item) => <View key={item.id} style={styles.directoryItem}><View style={styles.issueDot}/><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{item.title}</Text><Text style={styles.estateCardPlace}>{item.status.replace(/_/g," ")} · {item.priority} priority</Text></View></View>)}{!dashboard?.maintenanceRequests.length && <Text style={styles.bodyText}>No open maintenance requests found.</Text>}</View>}
                {tab === "profile" && <View style={styles.panel}><SectionTitle title="Your profile" subtitle="Your account and sign-in details."/><View style={styles.profileHero}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{firstName.slice(0,1).toUpperCase()}</Text></View><Text style={styles.profileName}>{profile?.profile?.full_name || firstName}</Text><Text style={styles.bodyText}>{session.user.email}</Text><View style={styles.profilePill}><Text style={styles.profilePillText}>{profile?.profile?.is_active ? "ACTIVE ACCOUNT" : "SIGNED IN"}</Text></View></View>{!!profile?.error && <Text style={styles.errorMessage}>{profile.error}</Text>}<Button title="Refresh profile" secondary onPress={() => void loadProfile(session.access_token)}/><Button title={busy ? "Signing out…" : "Sign out"} onPress={() => void signOut()} disabled={busy}/></View>}
                <View style={styles.footer}><Text style={styles.footerBrand}>CITIES BUILDER NEST</Text><Text style={styles.footerText}>One platform · Many estates</Text></View>
              </>
            )}
          </ScrollView>
          {session && !wide && <View style={styles.bottomNav}>{([["home","⌂","Home"],["community","◫","Community"],["maintenance","⚒","Maintain"],["profile","◉","Profile"]] as const).map(([key,icon,label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={styles.bottomNavItem}><Text style={[styles.bottomNavIcon,tab === key && styles.bottomNavIconActive]}>{icon}</Text><Text style={[styles.bottomNavText,tab === key && styles.bottomNavTextActive]}>{label}</Text>{tab === key && <View style={styles.bottomNavActiveMark}/>}</TouchableOpacity>)}</View>}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#F3F5F1"},appFrame:{flex:1,width:"100%",alignSelf:"center",maxWidth:1440,flexDirection:"row"},appFrameWide:{padding:18,gap:18},
  sidebar:{width:238,backgroundColor:green,borderRadius:24,padding:20,justifyContent:"flex-start"},main:{flex:1,minWidth:0,backgroundColor:"#F7F8F5",overflow:"hidden"},
  topbar:{minHeight:78,paddingHorizontal:24,paddingVertical:14,backgroundColor:"#FFFFFF",borderBottomWidth:1,borderBottomColor:"#E9ECE6",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  brandRow:{flexDirection:"row",alignItems:"center",gap:11},brandMark:{width:42,height:42,borderRadius:14,backgroundColor:green,alignItems:"center",justifyContent:"center"},brandMarkText:{color:"#FFFFFF",fontSize:25,fontWeight:"900"},
  brandName:{color:"#182720",fontSize:16,fontWeight:"900",letterSpacing:-.3},brandCaption:{color:"#819087",fontSize:9,fontWeight:"800",letterSpacing:1.1,marginTop:3},avatar:{width:39,height:39,borderRadius:20,backgroundColor:"#F2E8BB",alignItems:"center",justifyContent:"center"},avatarText:{color:green,fontSize:15,fontWeight:"900"},
  content:{paddingHorizontal:18,paddingTop:22,paddingBottom:30,gap:16},contentWide:{paddingHorizontal:36,paddingTop:30,paddingBottom:42,maxWidth:1160,width:"100%",alignSelf:"center"},loadingPage:{minHeight:300,alignItems:"center",justifyContent:"center",gap:12},
  authLayout:{gap:16},authLayoutWide:{flexDirection:"row",alignItems:"stretch",gap:28,paddingTop:26,paddingBottom:26},welcomePanel:{backgroundColor:green,borderRadius:24,padding:24,overflow:"hidden"},authLayoutWideWelcomePanel:{flex:1},overlinePill:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#51776B",borderRadius:30,paddingHorizontal:12,paddingVertical:8,backgroundColor:"#1B493E"},overlineText:{fontSize:9,color:"#D4E7DC",fontWeight:"900",letterSpacing:1},
  liveDot:{width:7,height:7,borderRadius:4,backgroundColor:gold},welcomeTitle:{fontSize:34,lineHeight:41,fontWeight:"900",color:"#FFFFFF",letterSpacing:-1.2,marginTop:26},welcomeAccent:{color:"#F0D36A"},welcomeBody:{fontSize:14,lineHeight:23,color:"#D4E3DB",marginTop:14,maxWidth:440},welcomeFeatures:{gap:13,marginTop:28},welcomeFeature:{color:"#FFFFFF",fontSize:13,fontWeight:"700"},welcomeFoot:{fontSize:9,letterSpacing:1.6,fontWeight:"900",color:"#9BBDB0",marginTop:30},
  authCard:{backgroundColor:"#FFFFFF",borderRadius:24,padding:22,borderWidth:1,borderColor:"#E6EAE4"},formEyebrow:{fontSize:10,color:"#9A7B12",fontWeight:"900",letterSpacing:1.5},formTitle:{fontSize:25,lineHeight:31,fontWeight:"900",letterSpacing:-.7,color:"#17251E",marginTop:9},formIntro:{fontSize:13,lineHeight:20,color:"#758078",marginTop:6,marginBottom:18},fieldLabel:{fontSize:12,color:"#2C3C33",fontWeight:"800",marginTop:15,marginBottom:7},input:{minHeight:48,borderWidth:1,borderColor:"#DDE4DC",borderRadius:12,paddingHorizontal:13,paddingVertical:12,fontSize:14,color:"#1B2B22",backgroundColor:"#FBFCFA"},textArea:{minHeight:120,paddingTop:12},button:{minHeight:49,borderRadius:13,backgroundColor:green,alignItems:"center",justifyContent:"center",paddingHorizontal:16,marginTop:14},authButton:{marginTop:20},buttonText:{color:"#FFFFFF",fontSize:14,fontWeight:"900"},buttonSecondary:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#C9D7CD"},buttonSecondaryText:{color:green},disabled:{opacity:.6},switchMode:{alignItems:"center",paddingTop:18,paddingBottom:5},switchText:{fontSize:12,color:"#68756D"},switchStrong:{color:green,fontWeight:"900"},secureNote:{fontSize:10,color:"#929B94",textAlign:"center",marginTop:15},errorMessage:{color:"#B42318",fontSize:12,lineHeight:18,marginTop:12},successMessage:{color:"#167044",fontSize:12,lineHeight:18,marginTop:12},warningMessage:{color:"#8A4B08",fontSize:12,lineHeight:18,backgroundColor:"#FFF4DF",borderRadius:10,padding:11,marginTop:12},
  greetingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:4},greetingEyebrow:{fontSize:9,color:"#8C7B3E",fontWeight:"900",letterSpacing:1.6},greetingTitle:{fontSize:25,lineHeight:32,fontWeight:"900",letterSpacing:-.8,color:"#17251E",marginTop:5},greetingSub:{fontSize:13,lineHeight:19,color:"#77827A",marginTop:4},datePill:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5E9E2",paddingHorizontal:11,paddingVertical:9,borderRadius:30},datePillText:{fontSize:9,color:green,fontWeight:"900",letterSpacing:.4},
  heroCard:{minHeight:170,backgroundColor:green,borderRadius:22,padding:22,overflow:"hidden",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},heroGlow:{position:"absolute",right:-40,top:-80,width:220,height:220,borderRadius:110,backgroundColor:"#1E4A3D"},heroCopy:{flex:1,zIndex:1},heroEyebrow:{fontSize:9,color:"#B8D6C8",fontWeight:"900",letterSpacing:1.4},heroTitle:{fontSize:24,lineHeight:30,fontWeight:"900",color:"#FFFFFF",marginTop:10,letterSpacing:-.5},heroSubtitle:{fontSize:12,color:"#D5E4DC",marginTop:5,lineHeight:18},heroStatus:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"#234F42",borderRadius:30,paddingHorizontal:10,paddingVertical:7,marginTop:15},heroStatusText:{fontSize:8,color:"#E6F1EB",fontWeight:"900",letterSpacing:.7},heroSymbol:{width:64,height:64,borderRadius:22,backgroundColor:"#FFFFFF14",borderWidth:1,borderColor:"#FFFFFF25",alignItems:"center",justifyContent:"center",marginLeft:12},heroSymbolText:{fontSize:43,color:"#F0D36A",fontWeight:"800"},
  statsGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},statCard:{flexGrow:1,flexBasis:"44%",minWidth:125,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E8ECE5",borderRadius:17,padding:14,minHeight:126},statIcon:{width:34,height:34,borderRadius:11,backgroundColor:"#F7F1D7",alignItems:"center",justifyContent:"center",marginBottom:12},statIconText:{fontSize:19,color:green},statValue:{fontSize:25,fontWeight:"900",color:"#1B2A21",letterSpacing:-.7},statLabel:{fontSize:11,color:"#78837B",fontWeight:"700",marginTop:4},
  sectionRow:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",gap:10,marginTop:8},sectionTitleWrap:{flex:1},sectionTitle:{fontSize:19,fontWeight:"900",color:"#1A2920",letterSpacing:-.4},sectionSubtitle:{fontSize:12,color:"#818A82",marginTop:4,lineHeight:18},textAction:{padding:8},textActionText:{fontSize:11,fontWeight:"900",color:green},
  estateGrid:{gap:10},estateCard:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAE3",borderRadius:16,padding:13},estateCardActive:{borderColor:"#D7B63A",backgroundColor:"#FFFEF7"},estateBadge:{width:43,height:43,borderRadius:14,backgroundColor:"#F0F3EE",alignItems:"center",justifyContent:"center"},estateBadgeActive:{backgroundColor:"#F7EDBD"},estateBadgeText:{fontSize:25,color:green,fontWeight:"700"},estateCardCopy:{flex:1},estateCardName:{fontSize:13,fontWeight:"900",color:"#243229"},estateCardPlace:{fontSize:11,color:"#7A857D",marginTop:4,lineHeight:16},estateRole:{fontSize:9,color:"#9B7B10",fontWeight:"900",letterSpacing:.7,marginTop:6},estateCheck:{fontSize:18,color:"#9AA39B",fontWeight:"800"},estateCheckActive:{color:green},
  noticeCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAE3",borderRadius:16,padding:17},noticeTitle:{fontSize:14,fontWeight:"900",color:"#26362B",marginBottom:6},bodyText:{fontSize:12,lineHeight:19,color:"#748077"},helperText:{fontSize:10,color:"#929B94",marginTop:7},inlineLoading:{flexDirection:"row",alignItems:"center",gap:10,padding:15},simpleCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E7EBE5",borderRadius:15,padding:16},simpleCardTitle:{fontSize:13,fontWeight:"900",color:"#27362C",marginBottom:5},
  announcementCard:{flexDirection:"row",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E7EBE5",borderRadius:16,padding:15},announcementMark:{width:36,height:36,borderRadius:12,backgroundColor:"#F8F0D1",alignItems:"center",justifyContent:"center"},announcementMarkText:{color:green,fontSize:17},announcementCopy:{flex:1},announcementTitle:{fontSize:13,fontWeight:"900",color:"#26362B",marginBottom:5},
  panel:{backgroundColor:"#FFFFFF",borderRadius:20,borderWidth:1,borderColor:"#E5EAE3",padding:18},panelTitle:{fontSize:14,fontWeight:"900",color:"#25352A",marginTop:22,marginBottom:10},directoryItem:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF1EC"},directoryIcon:{width:38,height:38,borderRadius:12,backgroundColor:"#F3F5EF",color:green,textAlign:"center",textAlignVertical:"center",fontSize:23},directoryCopy:{flex:1},contentCard:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF1EC"},priorityRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:4},priorityChip:{borderWidth:1,borderColor:"#DDE4DC",borderRadius:25,paddingHorizontal:12,paddingVertical:8},priorityChipActive:{borderColor:green,backgroundColor:"#E9F1EB"},priorityChipText:{fontSize:11,color:"#69756C",fontWeight:"700",textTransform:"capitalize"},priorityChipTextActive:{color:green,fontWeight:"900"},issueDot:{width:9,height:9,borderRadius:5,backgroundColor:gold,marginHorizontal:6},
  profileHero:{alignItems:"center",paddingVertical:25,backgroundColor:"#F7F8F4",borderRadius:17,marginTop:15},profileAvatar:{width:68,height:68,borderRadius:24,backgroundColor:green,alignItems:"center",justifyContent:"center"},profileAvatarText:{fontSize:29,color:"#FFFFFF",fontWeight:"900"},profileName:{fontSize:19,fontWeight:"900",color:"#203026",marginTop:12,marginBottom:5},profilePill:{backgroundColor:"#E6F2E9",borderRadius:20,paddingHorizontal:11,paddingVertical:7,marginTop:12},profilePillText:{fontSize:9,color:green,fontWeight:"900",letterSpacing:1},footer:{alignItems:"center",paddingTop:18,paddingBottom:8},footerBrand:{fontSize:9,color:"#829087",fontWeight:"900",letterSpacing:1.5},footerText:{fontSize:10,color:"#A0A8A0",marginTop:4},
  bottomNav:{minHeight:68,backgroundColor:"#FFFFFF",borderTopWidth:1,borderTopColor:"#E8ECE6",flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingHorizontal:6,paddingBottom:Platform.OS === "ios" ? 12 : 3},bottomNavItem:{flex:1,minHeight:60,alignItems:"center",justifyContent:"center",gap:3,position:"relative"},bottomNavIcon:{fontSize:21,color:"#87938A"},bottomNavIconActive:{color:green},bottomNavText:{fontSize:9,color:"#87938A",fontWeight:"700"},bottomNavTextActive:{color:green,fontWeight:"900"},bottomNavActiveMark:{position:"absolute",top:0,width:24,height:3,borderRadius:2,backgroundColor:gold},navLabel:{color:"#92B7A8",fontSize:9,fontWeight:"900",letterSpacing:1.4,marginTop:38,marginBottom:12},navItem:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:12,paddingVertical:13,borderRadius:12,marginBottom:5},navItemActive:{backgroundColor:"#FFFFFF19"},navIcon:{fontSize:20,color:"#B8D2C6",width:22,textAlign:"center"},navIconActive:{color:"#F0D36A"},navText:{fontSize:12,color:"#D6E5DD",fontWeight:"700"},navTextActive:{color:"#FFFFFF",fontWeight:"900"},sidebarBottom:{marginTop:"auto",paddingTop:28},sidebarHint:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},sidebarVersion:{fontSize:8,color:"#91B6A7",fontWeight:"900",letterSpacing:1,marginTop:8}
});
