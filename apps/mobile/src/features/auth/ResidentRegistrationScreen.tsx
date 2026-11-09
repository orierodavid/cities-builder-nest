import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

type EstateOption = { id: string; name: string; state: string; lga: string };
type SelectOption = { label: string; value: string };

function SelectField({
  label, value, placeholder, options, disabled, onSelect,
}: {
  label: string; value: string; placeholder: string; options: SelectOption[];
  disabled?: boolean; onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <Pressable disabled={disabled || options.length === 0} onPress={() => setOpen(true)} style={[s.select, (disabled || !options.length) && s.disabled]}>
        <Text numberOfLines={1} style={[s.selectText, !value && s.placeholder]}>{value || placeholder}</Text>
        <MaterialCommunityIcons name="chevron-down" size={21} color={C.gold} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.modalCard} onPress={() => undefined}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select {label.toLowerCase()}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}><MaterialCommunityIcons name="close" size={22} color={C.text}/></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
              {options.map(option => (
                <Pressable key={option.value} onPress={() => { onSelect(option.value); setOpen(false); }} style={s.option}>
                  <Text style={s.optionText}>{option.label}</Text>
                  {option.value === value && <MaterialCommunityIcons name="check" size={18} color={C.gold}/>}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function ResidentRegistrationScreen({ onBack }: { onBack: () => void }) {
  const [estates, setEstates] = useState<EstateOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [estateId, setEstateId] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.functions.invoke("resident-registration", { body: { action: "options" } })
      .then(({ data, error: invokeError }) => {
        if (!active) return;
        if (invokeError || data?.error) {
          setError("Estate options could not be loaded. Please try again.");
          return;
        }
        setEstates((data?.estates || []) as EstateOption[]);
      })
      .catch(() => { if (active) setError("Estate options could not be loaded. Check your connection and try again."); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, []);

  const states = useMemo(() => [...new Set(estates.map(item => item.state))].sort(), [estates]);
  const lgas = useMemo(() => [...new Set(estates.filter(item => item.state === state).map(item => item.lga))].sort(), [estates, state]);
  const estateOptions = useMemo(() => estates.filter(item => item.state === state && item.lga === lga), [estates, state, lga]);
  const selectedEstate = estateOptions.find(item => item.id === estateId);

  async function submit() {
    setError("");
    if (firstName.trim().length < 2 || lastName.trim().length < 2) { setError("Enter your first name and last name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (phone.trim().length < 10) { setError("Enter a valid Nigerian phone number."); return; }
    if (password.length < 8 || password.length > 128) { setError("Your password must be between 8 and 128 characters."); return; }
    if (password !== confirmPassword) { setError("Your passwords do not match."); return; }
    if (!state || !lga || !estateId || !selectedEstate) { setError("Select your State, LGA and Estate."); return; }
    setSubmitting(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("resident-registration", {
        body: {
          action: "register", firstName: firstName.trim(), lastName: lastName.trim(),
          email: email.trim().toLowerCase(), phone: phone.trim(), password,
          state, lga, estateId,
        },
      });
      if (invokeError || data?.error) {
        const detail = data?.message || (data?.error === "email_already_registered"
          ? "An account already exists for this email address."
          : "Your account could not be created. Please check your details and try again.");
        throw new Error(detail);
      }
      setEmailSent(data?.emailSent === true);
      setSuccess(data?.message || "Your account has been created and is awaiting administrator approval.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration could not be completed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.brand}>
            <View style={s.logo}><MaterialCommunityIcons name="home-city-outline" size={34} color={C.gold}/></View>
            <Text style={s.wordmark}>CB NEST</Text>
            <Text style={s.kicker}>RESIDENT REGISTRATION</Text>
          </View>
          <View style={s.card}>
            {success ? (
              <>
                <Text style={s.eyebrow}>REGISTRATION RECEIVED</Text>
                <Text style={s.title}>You’re almost home.</Text>
                <Text style={s.subtitle}>{success}</Text>
                <View style={s.notice}>
                  <MaterialCommunityIcons name={emailSent ? "email-check-outline" : "email-alert-outline"} size={21} color={C.gold}/>
                  <Text style={s.noticeText}>{emailSent
                    ? "We have sent you an email confirming that your account is awaiting approval."
                    : "Your application is saved, but we could not send the confirmation email just now. The estate administrator can still review your account."}</Text>
                </View>
                <Pressable onPress={onBack} style={s.button}><Text style={s.buttonText}>BACK TO SIGN IN</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#17130B"/></Pressable>
              </>
            ) : (
              <>
                <Text style={s.eyebrow}>JOIN YOUR COMMUNITY</Text>
                <Text style={s.title}>Create your account.</Text>
                <Text style={s.subtitle}>Register as a resident. Your account will be activated after your estate administrator approves it.</Text>
                <View style={s.row}>
                  <View style={s.half}><Text style={s.label}>FIRST NAME</Text><TextInput style={s.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#777" autoCapitalize="words" textContentType="givenName"/></View>
                  <View style={s.half}><Text style={s.label}>LAST NAME</Text><TextInput style={s.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#777" autoCapitalize="words" textContentType="familyName"/></View>
                </View>
                <Text style={s.label}>EMAIL ADDRESS</Text>
                <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor="#777" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} textContentType="emailAddress"/>
                <Text style={s.label}>PHONE NUMBER</Text>
                <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="08012345678 or +2348012345678" placeholderTextColor="#777" keyboardType="phone-pad" textContentType="telephoneNumber"/>
                <SelectField label="STATE" value={state} placeholder={loadingOptions ? "Loading estates…" : "Select State"} options={states.map(value => ({ label: value, value }))} disabled={loadingOptions} onSelect={value => { setState(value); setLga(""); setEstateId(""); }}/>
                <SelectField label="LGA" value={lga} placeholder={state ? "Select LGA" : "Select State first"} options={lgas.map(value => ({ label: value, value }))} disabled={!state} onSelect={value => { setLga(value); setEstateId(""); }}/>
                <SelectField label="ESTATE" value={selectedEstate?.name || ""} placeholder={lga ? "Select Estate" : "Select LGA first"} options={estateOptions.map(item => ({ label: item.name, value: item.id }))} disabled={!lga} onSelect={setEstateId}/>
                <Text style={s.label}>PASSWORD</Text>
                <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Create a password (8+ characters)" placeholderTextColor="#777" secureTextEntry textContentType="newPassword"/>
                <Text style={s.label}>CONFIRM PASSWORD</Text>
                <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter password again" placeholderTextColor="#777" secureTextEntry textContentType="newPassword"/>
                {loadingOptions && <Text style={s.helper}>Loading available estates…</Text>}
                {!loadingOptions && estates.length === 0 && <Text style={s.helper}>No active estates are currently available for registration.</Text>}
                {!!error && <View style={s.errorBox}><MaterialCommunityIcons name="alert-circle-outline" size={17} color={C.danger}/><Text style={s.errorText}>{error}</Text></View>}
                <Pressable onPress={() => void submit()} disabled={submitting || loadingOptions || estates.length === 0} style={[s.button, (submitting || loadingOptions || estates.length === 0) && s.disabled]}>
                  {submitting ? <ActivityIndicator color="#17130B"/> : <><Text style={s.buttonText}>CREATE RESIDENT ACCOUNT</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#17130B"/></>}
                </Pressable>
                <Pressable onPress={onBack} style={s.back}><Text style={s.backText}>Already have an account? <Text style={s.gold}>Sign in</Text></Text></Pressable>
              </>
            )}
          </View>
          <Text style={s.footer}>SECURE ACCESS TO YOUR ESTATE</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const C = { bg: "#080808", panel: "#121212", field: "#0B0B0B", gold: "#D4A84B", text: "#F7F3EA", muted: "#A7A095", danger: "#F28B82" };
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingVertical: 28 },
  brand: { alignItems: "center", marginBottom: 22 },
  logo: { width: 68, height: 68, borderRadius: 21, borderWidth: 1, borderColor: "#6A542B", backgroundColor: "#17130B", alignItems: "center", justifyContent: "center" },
  wordmark: { color: C.text, fontSize: 25, fontWeight: "900", letterSpacing: 4, marginTop: 10 },
  kicker: { color: C.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2.6, marginTop: 5 },
  card: { width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: C.panel, borderWidth: 1, borderColor: "#40331E", borderRadius: 22, padding: 22 },
  eyebrow: { color: C.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: C.text, fontSize: 27, fontWeight: "900", marginTop: 9 },
  subtitle: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 7, marginBottom: 18 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1, minWidth: 0 },
  label: { color: "#D9CBAE", fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 7, marginTop: 8 },
  input: { minHeight: 49, borderRadius: 11, borderWidth: 1, borderColor: "#3B352B", backgroundColor: C.field, color: C.text, fontSize: 13, paddingHorizontal: 12, marginBottom: 7 },
  select: { minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 11, borderWidth: 1, borderColor: "#3B352B", backgroundColor: C.field, paddingHorizontal: 12, marginBottom: 7 },
  selectText: { color: C.text, fontSize: 13, flex: 1 },
  placeholder: { color: "#777" },
  disabled: { opacity: .45 },
  helper: { color: C.muted, fontSize: 10, marginTop: 8 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2A1715", borderRadius: 10, padding: 11, marginTop: 12 },
  errorText: { flex: 1, color: C.danger, fontSize: 11, lineHeight: 16 },
  button: { minHeight: 52, borderRadius: 12, backgroundColor: C.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 16 },
  buttonText: { color: "#17130B", fontSize: 11, fontWeight: "900", letterSpacing: .8 },
  back: { alignItems: "center", paddingTop: 18 },
  backText: { color: C.muted, fontSize: 11 },
  gold: { color: C.gold, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderColor: "#40331E", borderRadius: 12, backgroundColor: "#17130B", padding: 13 },
  noticeText: { flex: 1, color: "#E7DDC7", fontSize: 11, lineHeight: 17 },
  footer: { color: "#8B7A58", fontSize: 8, fontWeight: "800", letterSpacing: 1.3, textAlign: "center", marginTop: 20 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.72)", justifyContent: "center", padding: 22 },
  modalCard: { maxWidth: 480, width: "100%", maxHeight: "75%", alignSelf: "center", borderRadius: 16, backgroundColor: "#171717", borderWidth: 1, borderColor: "#5A4725", padding: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#39332A" },
  modalTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  option: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#292929", paddingHorizontal: 4 },
  optionText: { color: C.text, fontSize: 12 },
});
