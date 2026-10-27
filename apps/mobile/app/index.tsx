import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";

type Estate = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country_code?: string | null;
  timezone?: string | null;
  membershipRole: string | null;
};

type EstatesResponse = { estates?: Estate[]; error?: string };
type EstateDashboard = {
  estate: Estate;
  summary: { units: number; occupiedUnits: number; openMaintenanceRequests: number; publishedAnnouncements: number };
  announcements: { id: string; title: string; body: string; published_at: string | null; created_at: string }[];
  maintenanceRequests: { id: string; title: string; status: string; priority: string; created_at: string }[];
};
type EstateDashboardResponse = EstateDashboard & { error?: string };

type ProfileResponse = {
  user?: { id: string; email: string | null; emailConfirmed: boolean };
  profile?: {
    id: string;
    full_name: string | null;
    phone_e164: string | null;
    is_active: boolean;
  } | null;
  profilePending?: boolean;
  error?: string;
};

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estatesLoading, setEstatesLoading] = useState(false);
  const [estatesError, setEstatesError] = useState("");
  const [selectedEstateId, setSelectedEstateId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<EstateDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [maintenanceTitle, setMaintenanceTitle] = useState("");
  const [maintenanceDescription, setMaintenanceDescription] = useState("");
  const [maintenancePriority, setMaintenancePriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoadingSession(false);
      }
    }).catch(() => {
      if (mounted) {
        setLoadingSession(false);
        setMessage("Could not restore your session. Please sign in again.");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.access_token) {
      void loadProfile(session.access_token);
      void loadEstates(session.access_token);
    } else {
      setProfile(null);
      setEstates([]);
      setEstatesError("");
      setSelectedEstateId(null);
      setDashboard(null);
      setDashboardError("");
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token && selectedEstateId) {
      void loadEstateDashboard(session.access_token, selectedEstateId);
    } else {
      setDashboard(null);
    }
  }, [session?.access_token, selectedEstateId]);

  async function loadEstateDashboard(accessToken: string, estateId: string) {
    if (!apiUrl) {
      setDashboardError("Set EXPO_PUBLIC_API_URL to load community dashboard data.");
      return;
    }
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const response = await fetch(`${apiUrl}/v1/estates/${encodeURIComponent(estateId)}/dashboard`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const body = (await response.json()) as EstateDashboardResponse;
      if (!response.ok) throw new Error(body.error || `Dashboard request failed (${response.status})`);
      setDashboard(body);
    } catch (error) {
      setDashboard(null);
      setDashboardError(error instanceof Error ? error.message : "Could not load this estate dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }


  async function submitMaintenanceRequest() {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    const title = maintenanceTitle.trim();
    const description = maintenanceDescription.trim();
    if (title.length < 3 || description.length < 5) {
      setMaintenanceMessage("Enter a title (at least 3 characters) and description (at least 5 characters).");
      return;
    }
    setMaintenanceSubmitting(true);
    setMaintenanceMessage("");
    try {
      const response = await fetch(`${apiUrl}/v1/estates/${encodeURIComponent(selectedEstateId)}/maintenance`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority: maintenancePriority }),
      });
      const body = (await response.json()) as { error?: string; maintenanceRequest?: { title: string } };
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setMaintenanceTitle("");
      setMaintenanceDescription("");
      setMaintenancePriority("normal");
      setMaintenanceMessage("Maintenance request submitted.");
      await loadEstateDashboard(session.access_token, selectedEstateId);
    } catch (error) {
      setMaintenanceMessage(error instanceof Error ? error.message : "Could not submit maintenance request.");
    } finally {
      setMaintenanceSubmitting(false);
    }
  }

  async function loadProfile(accessToken: string) {
    if (!apiUrl) {
      setProfile({ error: "Set EXPO_PUBLIC_API_URL to connect to the API." });
      return;
    }
    setProfileLoading(true);
    try {
      const response = await fetch(`${apiUrl}/v1/me`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const body = (await response.json()) as ProfileResponse;
      if (!response.ok) {
        setProfile({ error: body.error || `API request failed (${response.status})` });
      } else {
        setProfile(body);
      }
    } catch {
      setProfile({ error: "Could not reach the API. Check EXPO_PUBLIC_API_URL and that the API is running." });
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadEstates(accessToken: string) {
    if (!apiUrl) {
      setEstatesError("Set EXPO_PUBLIC_API_URL to load your estate memberships.");
      return;
    }
    setEstatesLoading(true);
    setEstatesError("");
    try {
      const response = await fetch(`${apiUrl}/v1/estates`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const body = (await response.json()) as EstatesResponse;
      if (!response.ok) throw new Error(body.error || `Estate request failed (${response.status})`);
      const available = body.estates ?? [];
      setEstates(available);
      const savedId = await AsyncStorage.getItem("cities-builder-nest.selected-estate-id");
      setSelectedEstateId(savedId && available.some((estate) => estate.id === savedId) ? savedId : available[0]?.id ?? null);
    } catch (error) {
      setEstatesError(error instanceof Error ? error.message : "Could not load estate memberships.");
    } finally {
      setEstatesLoading(false);
    }
  }

  async function chooseEstate(estateId: string) {
    setSelectedEstateId(estateId);
    try {
      await AsyncStorage.setItem("cities-builder-nest.selected-estate-id", estateId);
    } catch {
      setEstatesError("Estate selected for this session, but could not save the preference on this device.");
    }
  }

  async function submitAuth() {
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!supabaseConfigured) {
      setMessage("Supabase is not configured. Add the public project URL and publishable/anon key to apps/mobile/.env.");
      return;
    }
    if (!normalizedEmail || !password) {
      setMessage("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (mode === "sign-up" && !fullName.trim()) {
      setMessage("Enter your full name.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Account request submitted. Check your email to confirm your account, then sign in.");
        } else {
          setMessage("Account created. Your profile is being loaded.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        setMessage("Signed in successfully.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setMessage(error.message);
    else setMessage("You have signed out.");
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ONE PLATFORM · MANY ESTATES</Text>
          <Text style={styles.title}>Cities Builder Nest</Text>
          <Text style={styles.subtitle}>
            A connected estate experience for residents, estate teams, and communities.
          </Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Multi-estate platform preview</Text>
          </View>
        </View>

        {loadingSession ? (
          <View style={styles.centerRow}><ActivityIndicator color="#123B32" /><Text style={styles.muted}>Restoring session…</Text></View>
        ) : session ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>You're signed in</Text>
            <Text style={styles.cardText}>{session.user.email || "Authenticated user"}</Text>
            <View style={styles.divider} />
            <Text style={styles.label}>API profile status</Text>
            {profileLoading ? (
              <View style={styles.centerRow}><ActivityIndicator color="#123B32" /><Text style={styles.muted}>Checking profile…</Text></View>
            ) : profile?.error ? (
              <Text style={styles.errorText}>{profile.error}</Text>
            ) : profile?.profile ? (
              <>
                <Text style={styles.cardTitle}>{profile.profile.full_name || "Profile created"}</Text>
                <Text style={styles.cardText}>Profile active: {profile.profile.is_active ? "Yes" : "No"}</Text>
                <Text style={styles.smallText}>User ID: {profile.profile.id}</Text>
              </>
            ) : (
              <Text style={styles.cardText}>
                {profile?.profilePending ? "Your profile is not available yet. If you just registered, wait for email confirmation and refresh by signing in again." : "Waiting for profile details."}
              </Text>
            )}
            <View style={styles.divider} />
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionTitle}>Your estates</Text>
                <Text style={styles.cardText}>Choose the community you want to view.</Text>
              </View>
              <TouchableOpacity onPress={() => void loadEstates(session.access_token)} disabled={estatesLoading} style={styles.refreshButton}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {estatesLoading ? (
              <View style={styles.centerRow}><ActivityIndicator color="#E6B800" /><Text style={styles.muted}>Loading estate memberships…</Text></View>
            ) : estatesError ? (
              <Text style={styles.errorText}>{estatesError}</Text>
            ) : estates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No active estate yet</Text>
                <Text style={styles.cardText}>Your account is signed in, but no active estate membership was returned. Ask your estate administrator to add your membership.</Text>
              </View>
            ) : (
              <View style={styles.estateList}>
                {estates.map((estate) => {
                  const selected = estate.id === selectedEstateId;
                  const location = [estate.city, estate.state, estate.country_code].filter(Boolean).join(", ");
                  return (
                    <TouchableOpacity
                      key={estate.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.estateItem, selected && styles.estateItemSelected]}
                      onPress={() => void chooseEstate(estate.id)}
                    >
                      <View style={[styles.estateIcon, selected && styles.estateIconSelected]}>
                        <Text style={[styles.estateIconText, selected && styles.estateIconTextSelected]}>⌂</Text>
                      </View>
                      <View style={styles.estateCopy}>
                        <Text style={styles.estateName}>{estate.name}</Text>
                        {!!(estate.address || location) && <Text style={styles.estateLocation}>{[estate.address, location].filter(Boolean).join(" · ")}</Text>}
                        {!!estate.membershipRole && <Text style={styles.roleText}>{estate.membershipRole.replace(/_/g, " ")}</Text>}
                      </View>
                      <View style={[styles.selectionMark, selected && styles.selectionMarkSelected]}>
                        {selected && <Text style={styles.selectionCheck}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {selectedEstateId && estates.some((estate) => estate.id === selectedEstateId) && (
              <Text style={styles.selectedHint}>Selected community: {estates.find((estate) => estate.id === selectedEstateId)?.name}. This preference is saved on this device; estate access is still enforced by the API and database policies.</Text>
            )}
            {!!selectedEstateId && (
              <View style={styles.dashboardSection}>
                <View style={styles.divider} />
                <View style={styles.sectionHeadingRow}>
                  <View style={styles.sectionHeadingCopy}>
                    <Text style={styles.sectionTitle}>Community overview</Text>
                    <Text style={styles.cardText}>Live data available to your account for the selected estate.</Text>
                  </View>
                  <TouchableOpacity onPress={() => void loadEstateDashboard(session.access_token, selectedEstateId)} disabled={dashboardLoading} style={styles.refreshButton}>
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  </TouchableOpacity>
                </View>
                {dashboardLoading ? (
                  <View style={styles.centerRow}><ActivityIndicator color="#E6B800" /><Text style={styles.muted}>Loading community data…</Text></View>
                ) : dashboardError ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>Dashboard unavailable</Text>
                    <Text style={styles.cardText}>{dashboardError}</Text>
                    <Text style={styles.smallText}>Access is denied unless the API confirms an active membership and database policies permit the requested data.</Text>
                  </View>
                ) : dashboard ? (
                  <>
                    <View style={styles.statGrid}>
                      {[
                        ["Total units", dashboard.summary.units],
                        ["Occupied", dashboard.summary.occupiedUnits],
                        ["Open maintenance", dashboard.summary.openMaintenanceRequests],
                        ["Announcements", dashboard.summary.publishedAnnouncements],
                      ].map(([label, value]) => (
                        <View key={String(label)} style={styles.statCard}>
                          <Text style={styles.statValue}>{String(value)}</Text>
                          <Text style={styles.statLabel}>{String(label)}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.subsectionTitle}>Latest announcements</Text>
                    {dashboard.announcements.length ? dashboard.announcements.map((item) => (
                      <View key={item.id} style={styles.contentItem}>
                        <Text style={styles.contentItemTitle}>{item.title}</Text>
                        <Text style={styles.contentItemBody} numberOfLines={3}>{item.body}</Text>
                        {!!item.published_at && <Text style={styles.contentItemMeta}>{new Date(item.published_at).toLocaleDateString()}</Text>}
                      </View>
                    )) : <Text style={styles.muted}>No published announcements yet.</Text>}
                    <Text style={styles.subsectionTitle}>Maintenance to follow up</Text>
                    {dashboard.maintenanceRequests.length ? dashboard.maintenanceRequests.map((item) => (
                      <View key={item.id} style={styles.maintenanceItem}>
                        <View style={styles.maintenanceCopy}>
                          <Text style={styles.contentItemTitle}>{item.title}</Text>
                          <Text style={styles.contentItemMeta}>{item.status.replace(/_/g, " ")} · {item.priority} priority</Text>
                        </View>
                        <View style={[styles.priorityDot, item.priority === "urgent" || item.priority === "high" ? styles.priorityDotHigh : null]} />
                      </View>
                    )) : <Text style={styles.muted}>No open maintenance requests.</Text>}
                  </>
                ) : (
                  <Text style={styles.muted}>Select an estate to load its community overview.</Text>
                )}
              </View>
            )}

            {!!selectedEstateId && (
              <View style={styles.requestForm}>
                <Text style={styles.subsectionTitle}>Report a maintenance issue</Text>
                <Text style={styles.cardText}>Your request is linked to the selected estate and submitted using your signed-in account.</Text>
                <Text style={styles.label}>Issue title</Text>
                <TextInput style={styles.input} value={maintenanceTitle} onChangeText={setMaintenanceTitle} placeholder="e.g. Streetlight not working" maxLength={120} editable={!maintenanceSubmitting} />
                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, styles.multilineInput]} value={maintenanceDescription} onChangeText={setMaintenanceDescription} placeholder="Describe where the issue is and what happened…" multiline textAlignVertical="top" maxLength={3000} editable={!maintenanceSubmitting} />
                <Text style={styles.label}>Priority</Text>
                <View style={styles.priorityChoices}>
                  {(["low", "normal", "high", "urgent"] as const).map((priority) => (
                    <TouchableOpacity key={priority} accessibilityRole="button" accessibilityState={{ selected: maintenancePriority === priority }} onPress={() => setMaintenancePriority(priority)} style={[styles.priorityChoice, maintenancePriority === priority && styles.priorityChoiceSelected]}>
                      <Text style={[styles.priorityChoiceText, maintenancePriority === priority && styles.priorityChoiceTextSelected]}>{priority}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!!maintenanceMessage && <Text style={maintenanceMessage.includes("submitted") ? styles.successText : styles.errorText}>{maintenanceMessage}</Text>}
                <TouchableOpacity style={[styles.primaryButton, maintenanceSubmitting && styles.disabledButton]} onPress={() => void submitMaintenanceRequest()} disabled={maintenanceSubmitting}>
                  {maintenanceSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Submit maintenance request</Text>}
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadProfile(session.access_token)} disabled={profileLoading}>
              <Text style={styles.secondaryButtonText}>Refresh profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void signOut()} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Sign out</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{mode === "sign-in" ? "Welcome back" : "Create your account"}</Text>
            <Text style={styles.cardText}>
              {mode === "sign-in" ? "Sign in to access your connected estate services." : "Create your resident account. Estate membership and permissions are managed separately."}
            </Text>

            {mode === "sign-up" && (
              <>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!busy}
                />
              </>
            )}
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              editable={!busy}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              textContentType={mode === "sign-up" ? "newPassword" : "password"}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              editable={!busy}
            />
            {!!message && <Text style={message.toLowerCase().includes("success") || message.toLowerCase().includes("submitted") || message.toLowerCase().includes("created") ? styles.successText : styles.errorText}>{message}</Text>}
            {!supabaseConfigured && (
              <Text style={styles.warningText}>Setup required: configure the public Supabase URL and key in your local mobile environment.</Text>
            )}
            <TouchableOpacity style={[styles.primaryButton, busy && styles.disabledButton]} onPress={() => void submitAuth()} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{mode === "sign-in" ? "Sign in" : "Create account"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}
              disabled={busy}
            >
              <Text style={styles.linkText}>{mode === "sign-in" ? "New here? Create an account" : "Already registered? Sign in"}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Built for connected communities</Text>
        {[
          ["Community updates", "Read announcements published for your estate."],
          ["Maintenance", "Report issues and follow their progress."],
          ["Visitor access", "Prepare visitor passes for estate security."],
          ["Save for Rent", "Track savings goals and verified payment status."],
        ].map(([title, description]) => (
          <View key={title} style={styles.featureCard}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardText}>{description}</Text>
          </View>
        ))}
        <Text style={styles.note}>
          Authentication is being integrated. Estate membership, staff administration, and financial transactions remain restricted until their server-side authorization and tests are complete.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FA" },
  page: { flexGrow: 1, padding: 22, paddingTop: 54, paddingBottom: 44, maxWidth: 620, width: "100%", alignSelf: "center" },
  hero: { backgroundColor: "#123B32", borderRadius: 24, padding: 24, marginBottom: 22 },
  eyebrow: { color: "#B7E4D4", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 12 },
  title: { color: "#FFFFFF", fontSize: 31, lineHeight: 38, fontWeight: "800", marginBottom: 12 },
  subtitle: { color: "#E1EEE9", fontSize: 15, lineHeight: 23 },
  pill: { alignSelf: "flex-start", backgroundColor: "#D8F3E7", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, marginTop: 18 },
  pillText: { color: "#123B32", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, marginBottom: 28, borderWidth: 1, borderColor: "#E5EAF0" },
  sectionTitle: { color: "#17212B", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  sectionHeadingCopy: { flex: 1 },
  refreshButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#FFF4C2" },
  refreshButtonText: { color: "#725800", fontSize: 12, fontWeight: "800" },
  emptyState: { backgroundColor: "#FFFBEB", borderColor: "#F3E2A1", borderWidth: 1, padding: 14, borderRadius: 12, marginTop: 8 },
  emptyStateTitle: { color: "#725800", fontSize: 14, fontWeight: "800", marginBottom: 5 },
  estateList: { gap: 10 },
  estateItem: { flexDirection: "row", alignItems: "center", padding: 13, borderWidth: 1, borderColor: "#E5EAF0", borderRadius: 14, backgroundColor: "#FFFFFF", gap: 12 },
  estateItemSelected: { borderColor: "#E6B800", backgroundColor: "#FFFCED" },
  estateIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#F1F4F6", alignItems: "center", justifyContent: "center" },
  estateIconSelected: { backgroundColor: "#FCEB99" },
  estateIconText: { fontSize: 25, color: "#5C6673", fontWeight: "700" },
  estateIconTextSelected: { color: "#725800" },
  estateCopy: { flex: 1 },
  estateName: { color: "#17212B", fontSize: 14, fontWeight: "800", marginBottom: 4 },
  estateLocation: { color: "#687483", fontSize: 12, lineHeight: 17 },
  roleText: { color: "#725800", fontSize: 11, fontWeight: "700", textTransform: "capitalize", marginTop: 5 },
  selectionMark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#D7DEE6", alignItems: "center", justifyContent: "center" },
  selectionMarkSelected: { backgroundColor: "#E6B800", borderColor: "#E6B800" },
  selectionCheck: { color: "#302700", fontSize: 13, fontWeight: "900" },
  selectedHint: { color: "#687483", fontSize: 11, lineHeight: 17, marginTop: 12 },
  dashboardSection: { marginTop: 2 },
  requestForm: { marginTop: 20, paddingTop: 4 },
  multilineInput: { minHeight: 100, paddingTop: 12 },
  priorityChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  priorityChoice: { borderWidth: 1, borderColor: "#D7DEE6", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFFFFF" },
  priorityChoiceSelected: { backgroundColor: "#FFF4C2", borderColor: "#E6B800" },
  priorityChoiceText: { color: "#5C6673", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  priorityChoiceTextSelected: { color: "#725800" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 18 },
  statCard: { width: "48%", flexGrow: 1, minHeight: 82, backgroundColor: "#FFF9DF", borderWidth: 1, borderColor: "#F3E5A8", borderRadius: 13, padding: 13, justifyContent: "center" },
  statValue: { color: "#4B3B00", fontSize: 24, fontWeight: "900", marginBottom: 5 },
  statLabel: { color: "#725800", fontSize: 11, fontWeight: "700" },
  subsectionTitle: { color: "#17212B", fontSize: 15, fontWeight: "800", marginTop: 10, marginBottom: 9 },
  contentItem: { borderWidth: 1, borderColor: "#E8EDF1", borderRadius: 12, padding: 12, marginBottom: 9, backgroundColor: "#FFFFFF" },
  contentItemTitle: { color: "#17212B", fontSize: 13, fontWeight: "800", marginBottom: 5 },
  contentItemBody: { color: "#5C6673", fontSize: 12, lineHeight: 18 },
  contentItemMeta: { color: "#7A8490", fontSize: 10, textTransform: "capitalize", marginTop: 6 },
  maintenanceItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EDF0F3", paddingVertical: 10 },
  maintenanceCopy: { flex: 1, paddingRight: 10 },
  priorityDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#E6B800" },
  priorityDotHigh: { backgroundColor: "#C43D36" },
  cardTitle: { color: "#17212B", fontSize: 16, fontWeight: "700", marginBottom: 5 },
  cardText: { color: "#5C6673", fontSize: 14, lineHeight: 21 },
  label: { color: "#263541", fontSize: 13, fontWeight: "700", marginTop: 16, marginBottom: 7 },
  input: { backgroundColor: "#FFFFFF", color: "#17212B", borderWidth: 1, borderColor: "#D7DEE6", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15 },
  primaryButton: { minHeight: 48, borderRadius: 12, backgroundColor: "#123B32", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 18 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryButton: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: "#C8D8D1", alignItems: "center", justifyContent: "center", marginTop: 16 },
  secondaryButtonText: { color: "#123B32", fontSize: 14, fontWeight: "700" },
  linkButton: { alignItems: "center", paddingTop: 18, paddingBottom: 4 },
  linkText: { color: "#17644F", fontSize: 14, fontWeight: "700" },
  disabledButton: { opacity: 0.65 },
  errorText: { color: "#B42318", fontSize: 13, lineHeight: 19, marginTop: 12 },
  successText: { color: "#167044", fontSize: 13, lineHeight: 19, marginTop: 12 },
  warningText: { color: "#8A4B08", backgroundColor: "#FFF4DF", borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 18, marginTop: 14 },
  note: { color: "#687483", fontSize: 12, lineHeight: 18, marginTop: 4 },
  featureCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#E5EAF0" },
  smallText: { color: "#687483", fontSize: 11, marginTop: 8 },
  muted: { color: "#687483", fontSize: 13 },
  centerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  divider: { height: 1, backgroundColor: "#E8EDF1", marginVertical: 16 },
});
