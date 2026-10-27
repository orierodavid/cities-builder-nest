import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

type Estate = { id: string; name: string; address?: string | null; city?: string | null; state?: string | null; country_code?: string | null; is_enabled?: boolean; disabled_reason?: string | null; membershipRole: string | null };
type ProfileResponse = { profile?: { id: string; full_name: string | null; is_active: boolean } | null; profilePending?: boolean; error?: string };
type EstatesResponse = { estates?: Estate[]; error?: string };
type Building = { id: string; name: string };
type Unit = { id: string; unit_code: string; unit_type: string | null; status: string };
type Resident = { id: string; full_name: string | null; phone_e164?: string | null };
type DirectoryResponse<T> = { buildings?: T[]; units?: T[]; residents?: T[]; error?: string; message?: string };

type Dashboard = {
  summary: { units: number; occupiedUnits: number; openMaintenanceRequests: number; publishedAnnouncements: number };
  announcements: { id: string; title: string; body: string; published_at: string | null }[];
  maintenanceRequests: { id: string; title: string; status: string; priority: string }[];
  error?: string;
};

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const green = "#071A3A"; // Official deep navy
const gold = "#FFC400"; // Official bright yellow

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 900;
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  const [tab, setTab] = useState<"home" | "community" | "maintenance" | "profile" | "management">("home");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestPriority, setRequestPriority] = useState("normal");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [managementMessage, setManagementMessage] = useState("");
  const [managementBusy, setManagementBusy] = useState(false);
  const [newEstateName, setNewEstateName] = useState("");
  const [newEstateAddress, setNewEstateAddress] = useState("");
  const [newEstateCity, setNewEstateCity] = useState("");
  const [newEstateState, setNewEstateState] = useState("");
  const [managementBuildingName, setManagementBuildingName] = useState("");
  const [managementBuildingId, setManagementBuildingId] = useState("");
  const [managementUnitCode, setManagementUnitCode] = useState("");
  const [managementUnitType, setManagementUnitType] = useState("");
  const [managementResidentId, setManagementResidentId] = useState("");
  const [managementBuildings, setManagementBuildings] = useState<Building[]>([]);
  const [managementUnits, setManagementUnits] = useState<Unit[]>([]);
  const [managementResidents, setManagementResidents] = useState<Resident[]>([]);
  const [managementUnitId, setManagementUnitId] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);

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

  async function managementRequest(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    if (!session?.access_token || !apiUrl) throw new Error("Sign in and configure the API first.");
    const res = await fetch(apiUrl + path, { method, headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await res.json() as { error?: string; message?: string; building?: { id?: string } };
    if (!res.ok) throw new Error(result.message || result.error || "Request failed (" + res.status + ").");
    return result;
  }

  async function createEstate() {
    if (newEstateName.trim().length < 2) { setManagementMessage("Enter an estate name."); return; }
    setManagementBusy(true); setManagementMessage("");
    try { await managementRequest("/v1/estates", "POST", { name: newEstateName.trim(), address: newEstateAddress.trim() || undefined, city: newEstateCity.trim() || undefined, state: newEstateState.trim() || undefined }); setNewEstateName(""); setNewEstateAddress(""); setNewEstateCity(""); setNewEstateState(""); setManagementMessage("Estate created. Refresh the list to see it."); await loadEstates(session!.access_token); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not create estate."); } finally { setManagementBusy(false); }
  }

  async function toggleEstate(estate: Estate, enabled: boolean) {
    setManagementBusy(true); setManagementMessage("");
    try { await managementRequest("/v1/estates/" + encodeURIComponent(estate.id) + "/subscription", "PATCH", { enabled, reason: enabled ? undefined : "Subscription inactive" }); setManagementMessage(estate.name + (enabled ? " re-enabled." : " disabled.")); await loadEstates(session!.access_token); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not update subscription."); } finally { setManagementBusy(false); }
  }

  async function createBuilding() {
    if (!selectedEstateId || managementBuildingName.trim().length < 2) { setManagementMessage("Choose an estate and enter a building name."); return; }
    setManagementBusy(true); setManagementMessage("");
    try { const r = await managementRequest("/v1/estates/" + encodeURIComponent(selectedEstateId) + "/buildings", "POST", { name: managementBuildingName.trim() }); setManagementBuildingName(""); setManagementMessage("Building created."); await loadManagementDirectory(); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not create building."); } finally { setManagementBusy(false); }
  }

  async function createUnit() {
    if (!selectedEstateId || !managementBuildingId.trim() || !managementUnitCode.trim()) { setManagementMessage("Enter building ID and unit code."); return; }
    setManagementBusy(true); setManagementMessage("");
    try { await managementRequest("/v1/estates/" + encodeURIComponent(selectedEstateId) + "/buildings/" + encodeURIComponent(managementBuildingId.trim()) + "/units", "POST", { unitCode: managementUnitCode.trim(), unitType: managementUnitType.trim() || undefined }); setManagementUnitCode(""); setManagementUnitType(""); setManagementMessage("Unit created and marked available."); await loadManagementDirectory(); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not create unit."); } finally { setManagementBusy(false); }
  }

  async function addResident() {
    if (!selectedEstateId || !managementResidentId.trim()) { setManagementMessage("Enter an existing resident user ID."); return; }
    setManagementBusy(true); setManagementMessage("");
    try { await managementRequest("/v1/estates/" + encodeURIComponent(selectedEstateId) + "/residents", "POST", { userId: managementResidentId.trim() }); setManagementResidentId(""); setManagementMessage("Resident added to the selected estate."); await loadManagementDirectory(); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not add resident."); } finally { setManagementBusy(false); }
  }

  async function loadManagementDirectory() {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    setDirectoryLoading(true);
    try {
      const headers = { Authorization: "Bearer " + session.access_token, Accept: "application/json" };
      const base = apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId);
      const [buildingRes, unitRes, residentRes] = await Promise.all([
        fetch(base + "/buildings", { headers }), fetch(base + "/units", { headers }), fetch(base + "/residents", { headers }),
      ]);
      const [buildingBody, unitBody, residentBody] = await Promise.all([
        buildingRes.json() as Promise<DirectoryResponse<Building>>,
        unitRes.json() as Promise<DirectoryResponse<Unit>>,
        residentRes.json() as Promise<DirectoryResponse<Resident>>,
      ]);
      if (!buildingRes.ok) throw new Error(buildingBody.error || buildingBody.message || "Could not load buildings.");
      if (!unitRes.ok) throw new Error(unitBody.error || unitBody.message || "Could not load units.");
      if (!residentRes.ok) throw new Error(residentBody.error || residentBody.message || "Could not load residents.");
      setManagementBuildings(buildingBody.buildings || []);
      setManagementUnits(unitBody.units || []);
      setManagementResidents(residentBody.residents || []);
      if (managementBuildingId && !(buildingBody.buildings || []).some((item) => item.id === managementBuildingId)) setManagementBuildingId("");
      if (managementUnitId && !(unitBody.units || []).some((item) => item.id === managementUnitId)) setManagementUnitId("");
    } catch (e) {
      setManagementMessage(e instanceof Error ? e.message : "Could not load estate directory.");
    } finally { setDirectoryLoading(false); }
  }

  async function assignResidentToUnit() {
    if (!selectedEstateId || !managementUnitId || !managementResidentId) { setManagementMessage("Select a unit and resident first."); return; }
    setManagementBusy(true); setManagementMessage("");
    try {
      await managementRequest("/v1/estates/" + encodeURIComponent(selectedEstateId) + "/units/" + encodeURIComponent(managementUnitId) + "/assignments", "POST", { residentUserId: managementResidentId });
      setManagementMessage("Resident assigned to unit."); setManagementUnitId(""); setManagementResidentId(""); await loadManagementDirectory();
    } catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not assign resident."); }
    finally { setManagementBusy(false); }
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
  const isPlatformAdmin = estates.some((estate) => estate.membershipRole === "platform_admin");
  const isEstateManager = ["facility_manager", "estate_manager", "estate_admin"].includes(selectedEstate?.membershipRole || "");
  const isSecurity = selectedEstate?.membershipRole === "security";

  useEffect(() => {
    if (tab === "management" && selectedEstateId && session?.access_token && (isEstateManager || isPlatformAdmin)) void loadManagementDirectory();
  }, [tab, selectedEstateId, session?.access_token, isEstateManager, isPlatformAdmin]);

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
            <View style={styles.brandRow}><View style={styles.brandMark}><View style={styles.logoTowerLeft}/><View style={styles.logoTowerCenter}/><View style={styles.logoTowerRight}/></View><View><Text style={styles.brandName}>Cities Builder</Text><Text style={styles.brandCaption}>NEST COMMUNITY</Text></View></View>
            <Text style={styles.navLabel}>YOUR SPACE</Text>
            {([["home","⌂","Home"],["community","◫","Community"],["maintenance","⚒","Maintenance"],...(isPlatformAdmin || isEstateManager || isSecurity ? [["management","▦","Management"] as const] : []),["profile","◉","My profile"]] as const).map(([key,icon,label]) => (
              <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.navItem, tab === key && styles.navItemActive]}><Text style={[styles.navIcon,tab === key && styles.navIconActive]}>{icon}</Text><Text style={[styles.navText,tab === key && styles.navTextActive]}>{label}</Text></TouchableOpacity>
            ))}
            <View style={styles.sidebarBottom}><Text style={styles.sidebarHint}>One platform. Many estates.</Text><Text style={styles.sidebarVersion}>RESIDENT PORTAL · PREVIEW</Text></View>
          </View>
        )}
        <View style={styles.main}>
          <View style={styles.topbar}>
            <View style={styles.brandRow}>{(!session || !wide) && <View style={styles.brandMark}><View style={styles.logoTowerLeft}/><View style={styles.logoTowerCenter}/><View style={styles.logoTowerRight}/></View>}<View><Text style={styles.brandName}>Cities Builder Nest</Text><Text style={styles.brandCaption}>{session ? "YOUR COMMUNITY, CONNECTED" : "ONE PLATFORM · MANY ESTATES"}</Text></View></View>
            {session && <View style={styles.avatar}><Text style={styles.avatarText}>{firstName.slice(0,1).toUpperCase()}</Text></View>}
          </View>

          <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]} keyboardShouldPersistTaps="handled">
            {restoring ? (
              <View style={styles.loadingPage}><ActivityIndicator size="large" color={green}/><Text style={styles.bodyText}>Getting your space ready…</Text></View>
            ) : !session ? (
              <View style={[styles.authLayout,wide && styles.authLayoutWide]}>
                <View style={[styles.welcomePanel, wide && styles.welcomePanelWide]}>
                  <View style={styles.overlinePill}><View style={styles.liveDot}/><Text style={styles.overlineText}>THE RESIDENT EXPERIENCE</Text></View>
                  <Text style={styles.welcomeTitle}>A better way to{"\n"}feel at <Text style={styles.welcomeAccent}>home.</Text></Text>
                  <Text style={styles.welcomeBody}>Your estate life, thoughtfully connected. Stay informed, report issues, and keep your community moving.</Text>
                  <View style={styles.welcomeFeatures}><Text style={styles.welcomeFeature}>✦  Community updates</Text><Text style={styles.welcomeFeature}>✦  Simple maintenance reporting</Text><Text style={styles.welcomeFeature}>✦  One account, many estates</Text></View>
                  <Text style={styles.welcomeFoot}>BUILT AROUND YOUR COMMUNITY</Text>
                </View>
                <View style={[styles.authCard, wide && styles.authCardWide]}>
                  <Text style={styles.formEyebrow}>{mode === "sign-in" ? "WELCOME BACK" : "GET STARTED"}</Text>
                  <Text style={styles.formTitle}>{mode === "sign-in" ? "Sign in to your space" : "Create your account"}</Text>
                  <Text style={styles.formIntro}>{mode === "sign-in" ? "Your community is just a sign in away." : "Join your connected estate community."}</Text>
                  {mode === "sign-up" && <><Text style={styles.fieldLabel}>Full name</Text><TextInput accessibilityLabel="Full name" returnKeyType="next" style={styles.input} value={fullName} onChangeText={setFullName} placeholder="How should we call you?" autoCapitalize="words" autoComplete="name" editable={!busy}/></>}
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <TextInput accessibilityLabel="Email address" returnKeyType="next" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy}/>
                  <View style={styles.passwordLabelRow}><Text style={styles.fieldLabel}>Password</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword((visible) => !visible)} disabled={busy} style={styles.passwordToggle}><Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text></TouchableOpacity></View>
                  <TextInput accessibilityLabel="Password" returnKeyType="go" style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry={!showPassword} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} editable={!busy} onSubmitEditing={() => void submitAuth()}/>
                  {!!message && <Text style={message.toLowerCase().includes("success") || message.toLowerCase().includes("submitted") ? styles.successMessage : styles.errorMessage}>{message}</Text>}
                  {!supabaseConfigured && <Text style={styles.warningMessage}>Supabase setup is required. Check your local mobile environment file.</Text>}
                  <TouchableOpacity style={[styles.button,styles.authButton,busy && styles.disabled]} onPress={() => void submitAuth()} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>{mode === "sign-in" ? "Sign in securely  →" : "Create account  →"}</Text>}</TouchableOpacity>
                  <TouchableOpacity style={styles.switchMode} onPress={() => {setMode(mode === "sign-in" ? "sign-up" : "sign-in");setShowPassword(false);setMessage("");}} disabled={busy}><Text style={styles.switchText}>{mode === "sign-in" ? "New to your community? " : "Already have an account? "}<Text style={styles.switchStrong}>{mode === "sign-in" ? "Create account" : "Sign in"}</Text></Text></TouchableOpacity>
                  <Text style={styles.secureNote}>Your account is protected by Supabase authentication.</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.greetingRow}><View><Text style={styles.greetingEyebrow}>YOUR RESIDENT DASHBOARD</Text><Text style={styles.greetingTitle}>Good to see you, {firstName}.</Text><Text style={styles.greetingSub}>Here’s what’s happening in your community.</Text></View><View style={styles.datePill}><Text style={styles.datePillText}>⌁  RESIDENT SPACE</Text></View></View>
                <View style={styles.heroCard}><View style={styles.heroGlow}/><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>YOUR PLACE. YOUR PEOPLE.</Text><Text style={styles.heroTitle}>{selectedEstate?.name || "Your community awaits"}</Text><Text style={styles.heroSubtitle}>{location || (selectedEstate ? selectedEstate.address || "Your selected estate" : "Select an estate to see your community dashboard.")}</Text><View style={styles.heroStatus}><View style={[styles.liveDot, selectedEstate?.is_enabled === false && { backgroundColor: "#E05252" }]}/><Text style={styles.heroStatusText}>{selectedEstate?.is_enabled === false ? "SUBSCRIPTION INACTIVE" : selectedEstate ? "COMMUNITY SELECTED" : "READY TO CONNECT"}</Text></View></View><View style={styles.heroSymbol}><Text style={styles.heroSymbolText}>⌂</Text></View></View><View>{selectedEstate?.is_enabled === false && <View style={styles.warningBanner}><Text style={styles.warningBannerTitle}>Estate temporarily unavailable</Text><Text style={styles.warningBannerText}>{selectedEstate.disabled_reason || "The estate subscription is inactive. Please contact your estate administrator."}</Text></View>}</View>
                {tab === "home" && <>
                  <View style={styles.statsGrid}>{([[dashboard?.summary.units ?? "—","Total units","⌂"],[dashboard?.summary.occupiedUnits ?? "—","Occupied homes","◫"],[dashboard?.summary.openMaintenanceRequests ?? "—","Open issues","⚒"],[dashboard?.summary.publishedAnnouncements ?? "—","Announcements","✳"]] as const).map(([value,label,icon]) => <View key={label} style={styles.statCard}><View style={styles.statIcon}><Text style={styles.statIconText}>{icon}</Text></View><Text style={styles.statValue}>{String(value)}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>
                  <View style={styles.sectionRow}><SectionTitle title="Your estates" subtitle="Choose where you want to spend time."/>{!!session && <TouchableOpacity style={styles.textAction} onPress={() => void loadEstates(session.access_token)}><Text style={styles.textActionText}>↻ Refresh</Text></TouchableOpacity>}</View>
                  {estatesLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading your estates…</Text></View> : estatesError ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>We couldn't connect</Text><Text style={styles.bodyText}>{estatesError}</Text><Text style={styles.helperText}>Check that the API is running at {apiUrl || "the configured API address"}.</Text><Button title="Try again" secondary onPress={() => void loadEstates(session.access_token)}/></View> : estates.length === 0 ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>No estate membership yet</Text><Text style={styles.bodyText}>Your account is active, but no estate membership was returned. Contact your estate administrator to be added to a community.</Text></View> : <View style={styles.estateGrid}>{estates.map((estate) => {const active = estate.id === selectedEstateId;const place = [estate.city,estate.state,estate.country_code].filter(Boolean).join(", ");return <TouchableOpacity key={estate.id} onPress={() => void chooseEstate(estate.id)} style={[styles.estateCard,active && styles.estateCardActive]}><View style={[styles.estateBadge,active && styles.estateBadgeActive]}><Text style={styles.estateBadgeText}>⌂</Text></View><View style={styles.estateCardCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{[estate.address,place].filter(Boolean).join(" · ") || "Community estate"}</Text><Text style={styles.estateRole}>{(estate.membershipRole || "RESIDENT").replace(/_/g," ").toUpperCase()}</Text></View><Text style={[styles.estateCheck,active && styles.estateCheckActive]}>{active ? "✓" : "→"}</Text></TouchableOpacity>})}</View>}
                  <View style={styles.sectionRow}><SectionTitle title="Community updates" subtitle="The latest from your estate."/>{!!selectedEstateId && <TouchableOpacity style={styles.textAction} onPress={() => void loadDashboard(session.access_token,selectedEstateId)}><Text style={styles.textActionText}>↻ Refresh</Text></TouchableOpacity>}</View>
                  {dashboardLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading community updates…</Text></View> : dashboardError ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Updates temporarily unavailable</Text><Text style={styles.bodyText}>{dashboardError}</Text></View> : dashboard?.announcements.length ? dashboard.announcements.map((item) => <View key={item.id} style={styles.announcementCard}><View style={styles.announcementMark}><Text style={styles.announcementMarkText}>✳</Text></View><View style={styles.announcementCopy}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.bodyText} numberOfLines={3}>{item.body}</Text>{!!item.published_at && <Text style={styles.helperText}>{new Date(item.published_at).toLocaleDateString()}</Text>}</View></View>) : <View style={styles.simpleCard}><Text style={styles.simpleCardTitle}>Nothing new for now</Text><Text style={styles.bodyText}>Published estate announcements will appear here.</Text></View>}
                </>}
                {tab === "community" && <View style={styles.panel}><SectionTitle title="Your community" subtitle="Choose an estate and see its latest updates."/><Text style={styles.panelTitle}>Estate directory</Text>{estates.map((estate) => <TouchableOpacity key={estate.id} style={styles.directoryItem} onPress={() => void chooseEstate(estate.id)}><Text style={styles.directoryIcon}>⌂</Text><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{[estate.address,estate.city,estate.state].filter(Boolean).join(", ")}</Text></View><Text style={styles.estateCheck}>{estate.id === selectedEstateId ? "✓" : "→"}</Text></TouchableOpacity>)}<Text style={styles.panelTitle}>Announcements</Text>{dashboard?.announcements.map((item) => <View key={item.id} style={styles.contentCard}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.bodyText}>{item.body}</Text></View>)}{!dashboard?.announcements.length && <Text style={styles.bodyText}>No published announcements yet.</Text>}</View>}
                {tab === "maintenance" && <View style={styles.panel}><SectionTitle title="Maintenance" subtitle="Tell your estate team what needs attention."/><Text style={styles.fieldLabel}>Issue title</Text><TextInput style={styles.input} value={requestTitle} onChangeText={setRequestTitle} placeholder="e.g. Streetlight not working" maxLength={120}/><Text style={styles.fieldLabel}>Describe the issue</Text><TextInput style={[styles.input,styles.textArea]} value={requestDescription} onChangeText={setRequestDescription} placeholder="Where is it, and what happened?" multiline textAlignVertical="top" maxLength={3000}/><Text style={styles.fieldLabel}>Priority</Text><View style={styles.priorityRow}>{["low","normal","high","urgent"].map((p) => <TouchableOpacity key={p} onPress={() => setRequestPriority(p)} style={[styles.priorityChip,requestPriority === p && styles.priorityChipActive]}><Text style={[styles.priorityChipText,requestPriority === p && styles.priorityChipTextActive]}>{p}</Text></TouchableOpacity>)}</View>{!!requestMessage && <Text style={requestMessage.includes("submitted") ? styles.successMessage : styles.errorMessage}>{requestMessage}</Text>}<Button title={requestBusy ? "Submitting…" : "Submit maintenance request"} onPress={() => void submitMaintenance()} disabled={requestBusy}/><Text style={styles.panelTitle}>Recent open issues</Text>{dashboard?.maintenanceRequests.map((item) => <View key={item.id} style={styles.directoryItem}><View style={styles.issueDot}/><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{item.title}</Text><Text style={styles.estateCardPlace}>{item.status.replace(/_/g," ")} · {item.priority} priority</Text></View></View>)}{!dashboard?.maintenanceRequests.length && <Text style={styles.bodyText}>No open maintenance requests found.</Text>}</View>}
                {tab === "management" && <View style={styles.panel}><SectionTitle title={isPlatformAdmin ? "Platform administration" : isSecurity ? "Gate operations" : "Estate management"} subtitle="Actions depend on your assigned role and estate."/><Text style={styles.bodyText}>{managementMessage}</Text>{isPlatformAdmin && <><Text style={styles.panelTitle}>Create estate</Text><TextInput style={styles.input} value={newEstateName} onChangeText={setNewEstateName} placeholder="Estate name"/><TextInput style={styles.input} value={newEstateAddress} onChangeText={setNewEstateAddress} placeholder="Address"/><TextInput style={styles.input} value={newEstateCity} onChangeText={setNewEstateCity} placeholder="City"/><TextInput style={styles.input} value={newEstateState} onChangeText={setNewEstateState} placeholder="State"/><Button title={managementBusy ? "Working…" : "Create estate"} onPress={() => void createEstate()} disabled={managementBusy}/><Text style={styles.panelTitle}>Subscriptions</Text>{estates.filter((e) => e.membershipRole === "platform_admin").map((estate) => <View key={estate.id} style={styles.directoryItem}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{estate.is_enabled === false ? "Disabled" : "Enabled"}</Text></View><Button title={estate.is_enabled === false ? "Re-enable" : "Disable"} secondary onPress={() => void toggleEstate(estate, estate.is_enabled === false)} disabled={managementBusy}/></View>)}</>}{isEstateManager && <><Text style={styles.panelTitle}>Add resident</Text><TextInput style={styles.input} value={managementResidentId} onChangeText={setManagementResidentId} placeholder="Existing resident user ID" autoCapitalize="none"/><Button title="Add resident" onPress={() => void addResident()} disabled={managementBusy}/><Text style={styles.panelTitle}>Create building</Text><TextInput style={styles.input} value={managementBuildingName} onChangeText={setManagementBuildingName} placeholder="Building name"/><Button title="Create building" secondary onPress={() => void createBuilding()} disabled={managementBusy}/><Text style={styles.panelTitle}>Buildings</Text>{directoryLoading ? <ActivityIndicator color={green}/> : managementBuildings.map((building) => <TouchableOpacity key={building.id} onPress={() => setManagementBuildingId(building.id)} style={[styles.directoryItem, managementBuildingId === building.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{building.name}</Text><Text style={styles.estateCardPlace}>{managementBuildingId === building.id ? "Selected" : "Tap to select"}</Text></View><Text style={styles.textActionText}>{managementBuildingId === building.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}{!directoryLoading && managementBuildings.length === 0 && <Text style={styles.helperText}>Create a building to get started.</Text>}<Text style={styles.panelTitle}>Create unit</Text><Text style={styles.helperText}>Select a building above, then enter the unit details.</Text><TextInput style={styles.input} value={managementUnitCode} onChangeText={setManagementUnitCode} placeholder="Unit code"/><TextInput style={styles.input} value={managementUnitType} onChangeText={setManagementUnitType} placeholder="Unit type (optional)"/><Button title="Create available unit" secondary onPress={() => void createUnit()} disabled={managementBusy || !managementBuildingId}/><Text style={styles.panelTitle}>Assign resident to unit</Text><Text style={styles.helperText}>Select an available unit and an active resident.</Text>{managementUnits.filter((unit) => unit.status === "available").map((unit) => <TouchableOpacity key={unit.id} onPress={() => setManagementUnitId(unit.id)} style={[styles.directoryItem, managementUnitId === unit.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{unit.unit_code}</Text><Text style={styles.estateCardPlace}>{unit.unit_type || "Unit"} · Available</Text></View><Text style={styles.textActionText}>{managementUnitId === unit.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}{managementResidents.map((resident) => <TouchableOpacity key={resident.id} onPress={() => setManagementResidentId(resident.id)} style={[styles.directoryItem, managementResidentId === resident.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{resident.full_name || "Resident"}</Text><Text style={styles.estateCardPlace}>{managementResidentId === resident.id ? "Selected resident" : resident.id}</Text></View><Text style={styles.textActionText}>{managementResidentId === resident.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}<Button title="Assign selected resident" secondary onPress={() => void assignResidentToUnit()} disabled={managementBusy || !managementUnitId || !managementResidentId}/><Button title="Refresh estate directory" secondary onPress={() => void loadManagementDirectory()} disabled={directoryLoading || managementBusy}/></>}{isSecurity && <Text style={styles.bodyText}>Visitor pass and gate check-in/check-out endpoints are not yet implemented; this screen does not record visitor activity.</Text>}</View>}
                {tab === "profile" && <View style={styles.panel}><SectionTitle title="Your profile" subtitle="Your account and sign-in details."/><View style={styles.profileHero}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{firstName.slice(0,1).toUpperCase()}</Text></View><Text style={styles.profileName}>{profile?.profile?.full_name || firstName}</Text><Text style={styles.bodyText}>{session.user.email}</Text><View style={styles.profilePill}><Text style={styles.profilePillText}>{profile?.profile?.is_active ? "ACTIVE ACCOUNT" : "SIGNED IN"}</Text></View></View>{!!profile?.error && <Text style={styles.errorMessage}>{profile.error}</Text>}<Button title="Refresh profile" secondary onPress={() => void loadProfile(session.access_token)}/><Button title={busy ? "Signing out…" : "Sign out"} onPress={() => void signOut()} disabled={busy}/></View>}
                <View style={styles.footer}><Text style={styles.footerBrand}>CITIES BUILDER NEST</Text><Text style={styles.footerText}>One platform · Many estates</Text></View>
              </>
            )}
          </ScrollView>
          {session && !wide && <View style={styles.bottomNav}>{([["home","⌂","Home"],["community","◫","Community"],["maintenance","⚒","Maintain"],...(isPlatformAdmin || isEstateManager || isSecurity ? [["management","▦","Manage"] as const] : []),["profile","◉","Profile"]] as const).map(([key,icon,label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={styles.bottomNavItem}><Text style={[styles.bottomNavIcon,tab === key && styles.bottomNavIconActive]}>{icon}</Text><Text style={[styles.bottomNavText,tab === key && styles.bottomNavTextActive]}>{label}</Text>{tab === key && <View style={styles.bottomNavActiveMark}/>}</TouchableOpacity>)}</View>}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFFFFF"},appFrame:{flex:1,width:"100%",alignSelf:"center",maxWidth:430,flexDirection:"row"},appFrameWide:{padding:0,gap:0},
  sidebar:{width:238,backgroundColor:"#071A3A",borderRadius:24,padding:20,justifyContent:"flex-start"},main:{flex:1,minWidth:0,backgroundColor:"#FFFFFF",overflow:"hidden"},
  topbar:{minHeight:68,paddingHorizontal:20,paddingVertical:12,backgroundColor:"#FFFFFF",borderBottomWidth:0,borderBottomColor:"#FFFFFF",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  brandRow:{flexDirection:"row",alignItems:"center",gap:11},brandMark:{width:42,height:42,borderRadius:0,backgroundColor:"transparent",alignItems:"center",justifyContent:"center",flexDirection:"row",gap:2},logoTowerLeft:{width:8,height:19,backgroundColor:"#FFC400",transform:[{skewY:"-24deg"}],alignSelf:"center",marginTop:7},logoTowerCenter:{width:10,height:34,backgroundColor:"#FFC400",transform:[{skewY:"-8deg"}]},logoTowerRight:{width:8,height:23,backgroundColor:"#FFC400",transform:[{skewY:"24deg"}],alignSelf:"center",marginTop:5},
  brandName:{color:"#071A3A",fontSize:16,fontWeight:"900",letterSpacing:-.3},brandCaption:{color:"#53647F",fontSize:9,fontWeight:"800",letterSpacing:1.1,marginTop:3},avatar:{width:39,height:39,borderRadius:20,backgroundColor:"#FFC400",alignItems:"center",justifyContent:"center"},avatarText:{color:"#071A3A",fontSize:15,fontWeight:"900"},
  content:{paddingHorizontal:20,paddingTop:18,paddingBottom:30,gap:16},contentWide:{paddingHorizontal:18,paddingTop:22,paddingBottom:30,maxWidth:430,width:"100%",alignSelf:"center"},loadingPage:{minHeight:300,alignItems:"center",justifyContent:"center",gap:12},
  authLayout:{gap:16},authLayoutWide:{flexDirection:"row",alignItems:"stretch",gap:28,paddingTop:26,paddingBottom:26},welcomePanel:{backgroundColor:"#071A3A",borderRadius:22,padding:24,overflow:"hidden"},welcomePanelWide:{flex:1,justifyContent:"center",minHeight:540},authCardWide:{flex:1,justifyContent:"center",maxWidth:480},overlinePill:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#E5EAF2",borderRadius:30,paddingHorizontal:12,paddingVertical:8,backgroundColor:"#FFFFFF"},overlineText:{fontSize:9,color:"#071A3A",fontWeight:"900",letterSpacing:1},
  liveDot:{width:7,height:7,borderRadius:4,backgroundColor:gold},welcomeTitle:{fontSize:26,lineHeight:32,fontWeight:"900",color:"#FFFFFF",letterSpacing:-.7,marginTop:16},welcomeAccent:{color:"#FFC400"},welcomeBody:{fontSize:14,lineHeight:23,color:"#DCE6F5",marginTop:14,maxWidth:440},welcomeFeatures:{gap:13,marginTop:22},welcomeFeature:{color:"#FFFFFF",fontSize:13,fontWeight:"700"},welcomeFoot:{fontSize:9,letterSpacing:1.6,fontWeight:"900",color:"#DCE6F5",marginTop:22},
  authCard:{backgroundColor:"#FFFFFF",borderRadius:20,padding:20,borderWidth:1,borderColor:"#E5EAF2"},formEyebrow:{fontSize:10,color:"#A57900",fontWeight:"900",letterSpacing:1.5},formTitle:{fontSize:25,lineHeight:31,fontWeight:"900",letterSpacing:-.7,color:"#071A3A",marginTop:9},formIntro:{fontSize:13,lineHeight:20,color:"#53647F",marginTop:6,marginBottom:18},fieldLabel:{fontSize:12,color:"#071A3A",fontWeight:"800",marginTop:15,marginBottom:7},passwordLabelRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},passwordToggle:{paddingHorizontal:8,paddingVertical:5,marginTop:10,marginBottom:3},passwordToggleText:{fontSize:12,color:"#071A3A",fontWeight:"900"},input:{minHeight:54,borderWidth:1,borderColor:"#DCE3EF",borderRadius:12,paddingHorizontal:14,paddingVertical:13,fontSize:14,color:"#071A3A",backgroundColor:"#FFFFFF"},textArea:{minHeight:120,paddingTop:12},button:{minHeight:49,borderRadius:12,backgroundColor:gold,alignItems:"center",justifyContent:"center",paddingHorizontal:16,marginTop:14},authButton:{marginTop:20},buttonText:{color:"#071A3A",fontSize:14,fontWeight:"900"},buttonSecondary:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE3EF"},buttonSecondaryText:{color:green},disabled:{opacity:.6},switchMode:{alignItems:"center",paddingTop:18,paddingBottom:5},switchText:{fontSize:12,color:"#53647F"},switchStrong:{color:green,fontWeight:"900"},secureNote:{fontSize:10,color:"#7D8AA3",textAlign:"center",marginTop:15},errorMessage:{color:"#B42318",fontSize:12,lineHeight:18,marginTop:12},successMessage:{color:"#167044",fontSize:12,lineHeight:18,marginTop:12},warningMessage:{color:"#8A4B08",fontSize:12,lineHeight:18,backgroundColor:"#FFF4DF",borderRadius:10,padding:11,marginTop:12},
  greetingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:4},greetingEyebrow:{fontSize:9,color:"#A57900",fontWeight:"900",letterSpacing:1.6},greetingTitle:{fontSize:25,lineHeight:32,fontWeight:"900",letterSpacing:-.8,color:"#071A3A",marginTop:5},greetingSub:{fontSize:13,lineHeight:19,color:"#53647F",marginTop:4},datePill:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE3EF",paddingHorizontal:11,paddingVertical:9,borderRadius:30},datePillText:{fontSize:9,color:green,fontWeight:"900",letterSpacing:.4},
  heroCard:{minHeight:170,backgroundColor:"#071A3A",borderRadius:18,padding:22,overflow:"hidden",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},heroGlow:{position:"absolute",right:-40,top:-80,width:220,height:220,borderRadius:110,backgroundColor:"#10264A"},heroCopy:{flex:1,zIndex:1},heroEyebrow:{fontSize:9,color:"#DCE6F5",fontWeight:"900",letterSpacing:1.4},heroTitle:{fontSize:24,lineHeight:30,fontWeight:"900",color:"#FFFFFF",marginTop:10,letterSpacing:-.5},heroSubtitle:{fontSize:12,color:"#DCE6F5",marginTop:5,lineHeight:18},heroStatus:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"#243A60",borderRadius:30,paddingHorizontal:10,paddingVertical:7,marginTop:15},heroStatusText:{fontSize:8,color:"#FFFFFF",fontWeight:"900",letterSpacing:.7},heroSymbol:{width:64,height:64,borderRadius:22,backgroundColor:"#FFFFFF14",borderWidth:1,borderColor:"#FFFFFF25",alignItems:"center",justifyContent:"center",marginLeft:12},heroSymbolText:{fontSize:43,color:"#FFC400",fontWeight:"800"},
  statsGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},statCard:{flexGrow:1,flexBasis:"44%",minWidth:125,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:14,padding:14,minHeight:118},statIcon:{width:34,height:34,borderRadius:11,backgroundColor:"#FFF4C2",alignItems:"center",justifyContent:"center",marginBottom:12},statIconText:{fontSize:19,color:green},statValue:{fontSize:25,fontWeight:"900",color:"#071A3A",letterSpacing:-.7},statLabel:{fontSize:11,color:"#53647F",fontWeight:"700",marginTop:4},
  sectionRow:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",gap:10,marginTop:8},sectionTitleWrap:{flex:1},sectionTitle:{fontSize:19,fontWeight:"900",color:"#071A3A",letterSpacing:-.4},sectionSubtitle:{fontSize:12,color:"#53647F",marginTop:4,lineHeight:18},textAction:{padding:8},textActionText:{fontSize:11,fontWeight:"900",color:green},
  estateGrid:{gap:10},estateCard:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:13,padding:13},estateCardActive:{borderColor:"#FFC400",backgroundColor:"#FFFEF7"},estateBadge:{width:43,height:43,borderRadius:14,backgroundColor:"#F2F5FA",alignItems:"center",justifyContent:"center"},estateBadgeActive:{backgroundColor:"#FFF0A6"},estateBadgeText:{fontSize:25,color:green,fontWeight:"700"},estateCardCopy:{flex:1},estateCardName:{fontSize:13,fontWeight:"900",color:"#071A3A"},estateCardPlace:{fontSize:11,color:"#53647F",marginTop:4,lineHeight:16},estateRole:{fontSize:9,color:"#A57900",fontWeight:"900",letterSpacing:.7,marginTop:6},estateCheck:{fontSize:18,color:"#9AA39B",fontWeight:"800"},estateCheckActive:{color:green},
  noticeCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:16,padding:17},noticeTitle:{fontSize:14,fontWeight:"900",color:"#071A3A",marginBottom:6},bodyText:{fontSize:12,lineHeight:19,color:"#53647F"},helperText:{fontSize:10,color:"#7D8AA3",marginTop:7},inlineLoading:{flexDirection:"row",alignItems:"center",gap:10,padding:15},simpleCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:15,padding:16},simpleCardTitle:{fontSize:13,fontWeight:"900",color:"#071A3A",marginBottom:5},
  announcementCard:{flexDirection:"row",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:13,padding:15},announcementMark:{width:36,height:36,borderRadius:12,backgroundColor:"#FFF4C2",alignItems:"center",justifyContent:"center"},announcementMarkText:{color:green,fontSize:17},announcementCopy:{flex:1},announcementTitle:{fontSize:13,fontWeight:"900",color:"#071A3A",marginBottom:5},
  panel:{backgroundColor:"#FFFFFF",borderRadius:16,borderWidth:1,borderColor:"#E5EAF2",padding:18},panelTitle:{fontSize:14,fontWeight:"900",color:"#071A3A",marginTop:22,marginBottom:10},directoryItem:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF1F6"},directoryIcon:{width:38,height:38,borderRadius:12,backgroundColor:"#F2F5FA",color:green,textAlign:"center",textAlignVertical:"center",fontSize:23},directoryCopy:{flex:1},contentCard:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF1F6"},priorityRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:4},priorityChip:{borderWidth:1,borderColor:"#DCE3EF",borderRadius:25,paddingHorizontal:12,paddingVertical:8},priorityChipActive:{borderColor:green,backgroundColor:"#FFF4C2"},priorityChipText:{fontSize:11,color:"#53647F",fontWeight:"700",textTransform:"capitalize"},priorityChipTextActive:{color:green,fontWeight:"900"},issueDot:{width:9,height:9,borderRadius:5,backgroundColor:gold,marginHorizontal:6},
  profileHero:{alignItems:"center",paddingVertical:25,backgroundColor:"#F2F5FA",borderRadius:17,marginTop:15},profileAvatar:{width:68,height:68,borderRadius:24,backgroundColor:gold,alignItems:"center",justifyContent:"center"},profileAvatarText:{fontSize:29,color:"#071A3A",fontWeight:"900"},profileName:{fontSize:19,fontWeight:"900",color:"#071A3A",marginTop:12,marginBottom:5},profilePill:{backgroundColor:"#FFF4C2",borderRadius:20,paddingHorizontal:11,paddingVertical:7,marginTop:12},profilePillText:{fontSize:9,color:"#071A3A",fontWeight:"900",letterSpacing:1},footer:{alignItems:"center",paddingTop:18,paddingBottom:8},footerBrand:{fontSize:9,color:"#53647F",fontWeight:"900",letterSpacing:1.5},footerText:{fontSize:10,color:"#7D8AA3",marginTop:4},
  warningBanner:{marginTop:14,padding:16,borderRadius:14,backgroundColor:"#FFF0F0",borderWidth:1,borderColor:"#F3CACA"},warningBannerTitle:{fontSize:14,fontWeight:"900",color:"#8E2525"},warningBannerText:{fontSize:12,color:"#6F3030",marginTop:5,lineHeight:18},
  bottomNav:{minHeight:68,backgroundColor:"#FFFFFF",borderTopWidth:1,borderTopColor:"#E5EAF2",flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingHorizontal:6,paddingBottom:Platform.OS === "ios" ? 12 : 3},bottomNavItem:{flex:1,minHeight:60,alignItems:"center",justifyContent:"center",gap:3,position:"relative"},bottomNavIcon:{fontSize:21,color:"#7D8AA3"},bottomNavIconActive:{color:green},bottomNavText:{fontSize:9,color:"#53647F",fontWeight:"700"},bottomNavTextActive:{color:green,fontWeight:"900"},bottomNavActiveMark:{position:"absolute",top:0,width:24,height:3,borderRadius:2,backgroundColor:gold},navLabel:{color:"#DCE6F5",fontSize:9,fontWeight:"900",letterSpacing:1.4,marginTop:38,marginBottom:12},navItem:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:12,paddingVertical:13,borderRadius:12,marginBottom:5},navItemActive:{backgroundColor:"#FFFFFF19"},navIcon:{fontSize:20,color:"#DCE6F5",width:22,textAlign:"center"},navIconActive:{color:"#FFC400"},navText:{fontSize:12,color:"#FFFFFF",fontWeight:"700"},navTextActive:{color:"#FFFFFF",fontWeight:"900"},sidebarBottom:{marginTop:"auto",paddingTop:28},sidebarHint:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},sidebarVersion:{fontSize:8,color:"#DCE6F5",fontWeight:"900",letterSpacing:1,marginTop:8}
});
