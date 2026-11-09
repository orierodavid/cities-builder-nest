import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../src/lib/api-url";
import { theme as t } from "../../src/theme/theme";

type Estate = { id: string; name: string; membershipRole?: string | null; is_enabled?: boolean };
type EstateVenue = { id: string; name: string; location: string | null; status: string };
const inputStyle = { backgroundColor: "#101010", borderColor: t.border, borderWidth: 1, borderRadius: 10, color: t.text, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14 } as const;

function toIso(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function CreateEventScreen() {
  const router = useRouter();
  const base = getApiBaseUrl();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venues, setVenues] = useState<EstateVenue[]>([]);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [publish, setPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const headers = useCallback(async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!base) throw new Error("Event services are not configured.");
        const response = await fetch(base + "/v1/estates", { headers: await headers() });
        const payload = await response.json() as { estates?: Estate[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Estate access could not be loaded.");
        const assigned = (payload.estates || []).find(item => (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "resident" && item.is_enabled !== false);
        if (!assigned) throw new Error("No active resident membership was found.");
        const { data: venueRows, error: venueError } = await supabase.from("estate_venues")
          .select("id,name,location,status")
          .eq("estate_id", assigned.id).eq("status", "available").order("name");
        if (venueError) throw new Error("The estate venue list could not be loaded. Please contact the Facility Manager.");
        if (active) {
          setEstate(assigned);
          setVenues((venueRows || []) as EstateVenue[]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unable to load estate.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [base, headers]);

  const save = async () => {
    setError("");
    const start = toIso(startsAt.trim());
    const end = toIso(endsAt.trim());
    if (title.trim().length < 3 || !venueId || venue.trim().length < 2 || !start || !end || new Date(end) <= new Date(start)) {
      setError("Enter an event title, venue, valid start and end date/time. The end must be after the start.");
      return;
    }
    if (!estate) { setError("Your estate could not be identified."); return; }
    setSaving(true);
    try {
      const response = await fetch(base + "/v1/estates/" + encodeURIComponent(estate.id) + "/events", {
        method: "POST", headers: await headers(),
        body: JSON.stringify({ title: title.trim(), description: description.trim(), venue: venue.trim(), venueId, startsAt: start, endsAt: end, status: publish ? "published" : "draft" }),
      });
      const payload = await response.json() as { event?: { id: string; venue_approval_status?: string }; error?: string; message?: string };
      if (!response.ok || !payload.event) throw new Error(payload.message || payload.error || "Event could not be created.");
      if (payload.event.venue_approval_status === "pending") {
        Alert.alert("Venue approval pending", "Your event has been saved as pending. The Facility Manager or administrator must approve the selected estate facility before the event can be published.");
      }
      router.replace({ pathname: "/(resident)/[eventId]", params: { eventId: payload.event.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Event could not be created.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={t.bg} />
      <View style={s.header}><TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Back</Text></TouchableOpacity><Text style={s.headerTitle}>Create event</Text><View style={{ width: 42 }} /></View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>EVENT SETUP</Text>
        <Text style={s.heading}>Plan an estate event</Text>
        <Text style={s.subheading}>{estate?.name || "Your assigned estate"}</Text>
        {loading ? <ActivityIndicator color={t.gold} style={{ marginTop: 24 }} /> : <>
          <Text style={s.label}>Event title *</Text><TextInput value={title} onChangeText={setTitle} placeholder="e.g. Residents' End of Year Celebration" placeholderTextColor="#777" style={inputStyle} maxLength={160} />
          <Text style={s.label}>Venue *</Text>
          <TouchableOpacity onPress={() => setVenuePickerOpen(value => !value)} style={[inputStyle, { minHeight: 48, justifyContent: "center" }]}>
            <Text style={{ color: venue ? t.text : "#777", fontSize: 14 }}>{venue || "Select Home or an estate facility"}</Text>
          </TouchableOpacity>
          {venuePickerOpen ? <>
            <TouchableOpacity onPress={() => { setVenueId("home"); setVenue("Home"); setVenuePickerOpen(false); }} style={[s.venueOption, venueId === "home" && s.venueOptionSelected]}>
              <Text style={s.venueOptionText}>Home</Text>
              {venueId === "home" ? <Text style={s.venueSelected}>AUTO-APPROVED</Text> : null}
            </TouchableOpacity>
            {venues.map(item => {
            const label = item.location ? item.name + " · " + item.location : item.name;
            return <TouchableOpacity key={item.id} onPress={() => { setVenueId(item.id); setVenue(label); setVenuePickerOpen(false); }} style={[s.venueOption, venueId === item.id && s.venueOptionSelected]}>
              <Text style={s.venueOptionText}>{label}</Text>
              {venueId === item.id ? <Text style={s.venueSelected}>SELECTED</Text> : null}
            </TouchableOpacity>;
          })}
          </> : null}
          {!!venueId && venueId !== "home" ? <Text style={s.hint}>Estate facilities require approval by the Facility Manager or administrator. Your event will remain pending until approved.</Text> : null}
          <Text style={s.label}>Description</Text><TextInput value={description} onChangeText={setDescription} placeholder="What should guests know about this event?" placeholderTextColor="#777" style={[inputStyle, { minHeight: 100, textAlignVertical: "top" }]} multiline maxLength={5000} />
          <Text style={s.label}>Start date and time *</Text><TextInput value={startsAt} onChangeText={setStartsAt} placeholder="YYYY-MM-DDTHH:mm (e.g. 2026-12-20T15:00)" placeholderTextColor="#777" style={inputStyle} autoCapitalize="none" />
          <Text style={s.hint}>Use your estate's local date and time. Example: 2026-12-20T15:00</Text>
          <Text style={s.label}>End date and time *</Text><TextInput value={endsAt} onChangeText={setEndsAt} placeholder="YYYY-MM-DDTHH:mm" placeholderTextColor="#777" style={inputStyle} autoCapitalize="none" />
          <TouchableOpacity onPress={() => setPublish(value => !value)} style={s.publishRow}><View style={[s.checkbox, publish && s.checkboxOn]} /> <View style={{ flex: 1 }}><Text style={s.publishTitle}>Publish event now</Text><Text style={s.hint}>Leave off to save as a draft. Published events can be used for invitations and guest check-in.</Text></View></TouchableOpacity>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity disabled={saving} onPress={() => void save()} style={[s.saveButton, saving && { opacity: 0.6 }]}>{saving ? <ActivityIndicator color="#17130B" /> : <Text style={s.saveText}>{publish ? "CREATE & PUBLISH EVENT" : "SAVE EVENT AS DRAFT"}</Text>}</TouchableOpacity>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  header: { minHeight: 52, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { color: t.goldSoft, fontWeight: "800", width: 42 },
  headerTitle: { color: t.text, fontSize: 16, fontWeight: "800" },
  content: { padding: 18, paddingBottom: 40, gap: 9 },
  eyebrow: { color: t.goldSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginTop: 12 },
  heading: { color: t.text, fontSize: 25, fontWeight: "900" },
  subheading: { color: t.muted, fontSize: 12, marginBottom: 14 },
  label: { color: t.goldSoft, fontSize: 11, fontWeight: "800", marginTop: 9 },
  venueOption: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  venueOptionSelected: { borderColor: t.gold, backgroundColor: "#211B10" },
  venueOptionText: { color: t.text, fontSize: 12, flex: 1 },
  venueSelected: { color: t.goldSoft, fontSize: 9, fontWeight: "900" },
  hint: { color: t.muted, fontSize: 10, lineHeight: 15 },
  publishRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 13, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, marginTop: 12 },
  checkbox: { width: 19, height: 19, borderWidth: 1, borderColor: t.gold, borderRadius: 5, marginTop: 1 },
  checkboxOn: { backgroundColor: t.gold },
  publishTitle: { color: t.text, fontSize: 12, fontWeight: "800", marginBottom: 4 },
  error: { color: "#F2A5A5", fontSize: 12, lineHeight: 18, marginTop: 8 },
  saveButton: { minHeight: 50, borderRadius: 11, backgroundColor: t.gold, alignItems: "center", justifyContent: "center", marginTop: 12 },
  saveText: { color: "#17130B", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
});
