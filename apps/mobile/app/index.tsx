import { useEffect, useState } from "react";
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
    } else {
      setProfile(null);
    }
  }, [session?.access_token]);

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
