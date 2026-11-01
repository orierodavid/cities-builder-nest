import { useEffect, useState } from "react";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import RentSavings from "../components/RentSavings";
import ResidentUtilities from "../components/ResidentUtilities";

type Estate = { id: string; name: string; address?: string | null; city?: string | null; state?: string | null; country_code?: string | null; is_enabled?: boolean; disabled_reason?: string | null; membershipRole: string | null };
type ProfileResponse = { profile?: { id: string; full_name: string | null; is_active: boolean } | null; globalRoles?: string[]; estateMemberships?: { id: string; estate_id: string; membership_role: string; status: string; estates?: { name?: string; address?: string; city?: string; state?: string } | null }[]; residentUnits?: { unit_id: string; units?: { unit_code?: string; unit_type?: string | null; buildings?: { name?: string; estate_id?: string; estates?: { name?: string } | null } | null } | null }[]; profilePending?: boolean; error?: string };
type EstatesResponse = { estates?: Estate[]; error?: string };
type Building = { id: string; name: string };
type Unit = { id: string; unit_code: string; unit_type: string | null; status: string };
type Resident = { id: string; full_name: string | null; phone_e164?: string | null };
type VisitorPass = { id: string; visitor_name: string; visitor_phone: string | null; valid_from: string; valid_until: string; status: string; created_at: string };
type EstateEvent = { id: string; title: string; description: string; venue: string; starts_at: string; ends_at: string; status: "draft" | "published" | "cancelled" };
type EventGuest = { id: string; guest_name: string; email: string | null; phone: string | null; notes: string; created_at: string };
type EventInvitation = { id: string; guest_id: string; status: "active" | "revoked"; created_at: string; estate_event_guests: { guest_name: string; email: string | null; phone: string | null } };
type EventCheckIn = { id: string; guest_id: string; invitation_id: string; checked_in_at: string; estate_event_guests: { guest_name: string; email: string | null; phone: string | null } };
type EventAttendanceReport = { event: EstateEvent; summary: { totalGuests: number; checkedIn: number; outstanding: number; activeInvitations: number; attendancePercentage: number }; guests: { id: string; guest_name: string; email: string | null; phone: string | null; invitationStatus: "active" | "none"; checkedInAt: string | null; attendanceStatus: "checked_in" | "not_checked_in" }[] };
type GateVisitorLookup = { visitor: { name: string; phone: string | null }; host: { name: string | null }; pass: { id: string; validFrom: string; validUntil: string; status: string }; availabilityError: string | null };
type DirectoryResponse<T> = { buildings?: T[]; units?: T[]; residents?: T[]; error?: string; message?: string };

type Dashboard = {
  summary: { units: number; occupiedUnits: number; openMaintenanceRequests: number; publishedAnnouncements: number };
  announcements: { id: string; title: string; body: string; published_at: string | null }[];
  maintenanceRequests: { id: string; title: string; status: string; priority: string }[];
  error?: string;
};

function visitorApiErrorMessage(code: string | undefined): string {
  switch (code) {
    case "security_membership_required":
      return "Access denied: only active security staff assigned to this estate can manage gate visits.";
    case "estate_membership_required":
      return "Access denied: only an active resident of this estate can manage your visitor passes.";
    case "estate_subscription_inactive":
      return "This estate is temporarily unavailable because its subscription is inactive.";
    case "invalid_access_code":
      return "Enter the six-digit visitor access code.";
    case "visitor_pass_not_found_or_invalid":
      return "No visitor pass matches that code in this estate.";
    case "visitor_pass_expired_or_inactive":
      return "This visitor pass is expired, revoked, or inactive.";
    case "visitor_pass_already_used":
      return "This visitor pass has already been used and cannot be reused.";
    case "visitor_check_in_failed":
      return "Check-in could not be completed. Please try again.";
    case "active_visits_load_failed":
      return "Active visits could not be loaded. Check your gate permissions and connection.";
    case "open_visit_not_found_or_checkout_failed":
      return "This visit is no longer open or could not be checked out.";
    case "visitor_pass_list_failed":
      return "Visitor pass history could not be loaded.";
    case "visitor_pass_create_failed":
      return "The visitor pass could not be created. Confirm your estate membership and try again.";
    case "estate_not_found_or_unavailable":
      return "The selected estate could not be found or is unavailable.";
    default:
      return code ? "Visitor operation failed (" + code + ")." : "Visitor operation failed. Check your connection and try again.";
  }
}

const configuredApiUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
// On a physical device, localhost points to the device itself, not the computer
// running the Expo/API development servers. Resolve localhost to Expo's LAN host.
const apiUrl = (() => {
  if (!configuredApiUrl) return "";
  try {
    const url = new URL(configuredApiUrl);
    if (Platform.OS !== "web" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      const hostUri = Constants.expoConfig?.hostUri;
      const developmentHost = hostUri?.split(":")[0];
      if (developmentHost) url.hostname = developmentHost;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return configuredApiUrl;
  }
})();
const green = "#071A3A"; // Official deep navy
const gold = "#FFC400"; // Official bright yellow

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 900;
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estatesLoading, setEstatesLoading] = useState(false);
  const [estatesError, setEstatesError] = useState("");
  const [selectedEstateId, setSelectedEstateId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [tab, setTab] = useState<"home" | "community" | "maintenance" | "profile" | "management" | "guests" | "invitations" | "checkin" | "report" | "savings" | "utilities">("home");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventStatus, setEventStatus] = useState<"draft" | "published">("draft");
  const [estateEvents, setEstateEvents] = useState<EstateEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [eventMessage, setEventMessage] = useState("");
  const [guestEvent, setGuestEvent] = useState<EstateEvent | null>(null);
  const [eventGuests, setEventGuests] = useState<EventGuest[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestMessage, setGuestMessage] = useState("");
  const [invitationEvent, setInvitationEvent] = useState<EstateEvent | null>(null);
  const [eventInvitations, setEventInvitations] = useState<EventInvitation[]>([]);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [invitationMessage, setInvitationMessage] = useState("");
  const [generatedInvitation, setGeneratedInvitation] = useState<{ guestId: string; code: string; message: string } | null>(null);
  const [checkInEvent, setCheckInEvent] = useState<EstateEvent | null>(null);
  const [checkInCode, setCheckInCode] = useState("");
  const [eventCheckIns, setEventCheckIns] = useState<EventCheckIn[]>([]);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState("");
  const [reportEvent, setReportEvent] = useState<EstateEvent | null>(null);
  const [attendanceReport, setAttendanceReport] = useState<EventAttendanceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

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
  const [accountFullName, setAccountFullName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountRole, setAccountRole] = useState<"estate_admin" | "resident" | "facility_manager" | "security" | "event_organiser">("resident");
  const [accountUnitId, setAccountUnitId] = useState("");
  const [residentBuildingId, setResidentBuildingId] = useState("");
  const [residentBuildingName, setResidentBuildingName] = useState("");
  const [residentUnitCode, setResidentUnitCode] = useState("");
  const [residentUnitType, setResidentUnitType] = useState("Apartment");
  const [managementBuildings, setManagementBuildings] = useState<Building[]>([]);
  const [managementUnits, setManagementUnits] = useState<Unit[]>([]);
  const [managementResidents, setManagementResidents] = useState<Resident[]>([]);
  const [managementUnitId, setManagementUnitId] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [visitorCode, setVisitorCode] = useState("");
  const [gateVisitor, setGateVisitor] = useState<GateVisitorLookup | null>(null);
  const [issuedVisitorCode, setIssuedVisitorCode] = useState("");
  const [visitorPasses, setVisitorPasses] = useState<VisitorPass[]>([]);
  const [visitorPassesLoading, setVisitorPassesLoading] = useState(false);
  const [visitorPassesError, setVisitorPassesError] = useState("");
  const [gateVisits, setGateVisits] = useState<{id:string;checked_in_at:string;visitor_passes?:{visitor_name?:string;visitor_phone?:string}|null}[]>([]);
  const [gateVisitsLoading, setGateVisitsLoading] = useState(false);
  const [gateVisitsError, setGateVisitsError] = useState("");

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
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("account-login", { body: { email: cleanEmail, password } });
      if (error) throw error;
      if (data?.error) {
        const retry = Number(data.retry_after_seconds || 0);
        throw new Error(data.error === "account_locked"
          ? (data.message || "Account locked. Try again in " + Math.ceil(retry / 60) + " minutes.")
          : (data.message || "Email or password is incorrect."));
      }
      if (!data?.session) throw new Error("Authentication service returned no session. Please try again.");
      const { error: sessionError } = await supabase.auth.setSession(data.session);
      if (sessionError) throw sessionError;
      setMessage("Signed in successfully.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Authentication failed. Please try again."); }
    finally { setBusy(false); }
  }

  async function requestPasswordReset() {
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setMessage("Enter your email address first to receive a password reset link."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;
      setMessage("If an account exists for this email, a password reset link has been sent.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not request a password reset."); }
    finally { setBusy(false); }
  }

  async function createEstateAccount() {
    if (!selectedEstateId || !session?.access_token || !supabaseConfigured) {
      setManagementMessage("Choose an estate and confirm Supabase is configured.");
      return;
    }
    if (accountFullName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail.trim())) {
      setManagementMessage("Enter the person's full name and a valid email address.");
      return;
    }
    if (accountRole === "resident" && (!residentUnitCode.trim() || (!residentBuildingId && residentBuildingName.trim().length < 2) || Boolean(residentBuildingId && residentBuildingName.trim()))) {
      setManagementMessage("Select an existing building or enter a new building name, then provide the apartment number.");
      return;
    }
    setManagementBusy(true);
    setManagementMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("onboard-account", {
        body: {
          estateId: selectedEstateId,
          fullName: accountFullName.trim(),
          email: accountEmail.trim().toLowerCase(),
          role: accountRole,
          ...(accountRole === "resident" ? {
            ...(residentBuildingId ? { buildingId: residentBuildingId } : { buildingName: residentBuildingName.trim() }),
            unitCode: residentUnitCode.trim(),
            unitType: residentUnitType.trim() || "Apartment",
          } : {}),
        },
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (error) {
        let detail = error.message || "Could not create account.";
        try {
          const response = (error as { context?: Response }).context;
          if (response) {
            const body = await response.clone().json() as { error?: string; message?: string };
            detail = body.message || body.error || detail;
          }
        } catch { /* Keep the SDK's error message when no JSON response is available. */ }
        throw new Error(detail);
      }
      if (!data?.account?.invitationSent) throw new Error("The function did not confirm that an invitation was sent.");
      setAccountFullName("");
      setAccountEmail("");
      setAccountUnitId("");
      setResidentBuildingId("");
      setResidentBuildingName("");
      setResidentUnitCode("");
      setResidentUnitType("Apartment");
      setManagementMessage("Account created and estate access configured. The invitation request was accepted by Supabase Auth.");
      await loadManagementDirectory();
      await loadEstates(session.access_token);
    } catch (e) {
      setManagementMessage(e instanceof Error ? e.message : "Could not create estate account.");
    } finally {
      setManagementBusy(false);
    }
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
    if (newEstateName.trim().length < 2 || newEstateAddress.trim().length < 4 || newEstateCity.trim().length < 2 || newEstateState.trim().length < 2) { setManagementMessage("Enter the estate name, full address, city, and state."); return; }
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

  async function visitorRequest(path: string, method: string, body?: unknown) {
    if (!session?.access_token || !selectedEstateId || !apiUrl) throw new Error("Select an estate and confirm the API is configured.");
    const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + path, {
      method, headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as {error?:string;accessCode?:string;visits?:typeof gateVisits;visit?:{id:string};visitorPasses?:VisitorPass[];visitorPass?:VisitorPass};
    if (!response.ok) throw new Error(visitorApiErrorMessage(result.error));
    return result;
  }  async function createVisitorPass() {
    setManagementBusy(true); setManagementMessage(""); setIssuedVisitorCode("");
    try {
      const result = await visitorRequest("/visitor-passes", "POST", { visitorName: visitorName.trim() });
      const accessCode = result.accessCode || "";
      setIssuedVisitorCode(accessCode);
      setVisitorName("");
      if (accessCode) {
        await Clipboard.setStringAsync(accessCode);
        setManagementMessage("Visitor pass generated and copied. Paste the code into WhatsApp, SMS, or another messaging app to send it to your visitor.");
      } else {
        setManagementMessage("Visitor pass created, but no access code was returned. Refresh pass history and contact support.");
      }
    } catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not create visitor pass."); }
    finally { setManagementBusy(false); }
  }

  async function loadVisitorPasses() {
    setVisitorPassesLoading(true); setVisitorPassesError("");
    try {
      const result = await visitorRequest("/visitor-passes", "GET");
      setVisitorPasses(result.visitorPasses || []);
    } catch (e) {
      setVisitorPassesError(e instanceof Error ? e.message : "Could not load visitor pass history.");
    } finally { setVisitorPassesLoading(false); }
  }

  async function loadGateVisits() {
    setGateVisitsLoading(true); setGateVisitsError("");
    try { const result = await visitorRequest("/gate/visits", "GET"); setGateVisits(result.visits || []); }
    catch (e) { setGateVisitsError(e instanceof Error ? e.message : "Could not load active visits."); }
    finally { setGateVisitsLoading(false); }
  }

  async function lookupGateVisitor() {
    setManagementBusy(true); setManagementMessage(""); setGateVisitor(null);
    try { const result = await visitorRequest("/gate/visitor-lookup", "POST", { accessCode: visitorCode.trim() }); setGateVisitor(result as GateVisitorLookup); setManagementMessage("Visitor pass found. Review the details before deciding."); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Visitor lookup failed."); }
    finally { setManagementBusy(false); }
  }

  async function approveGateVisitor() {
    if (!gateVisitor || gateVisitor.availabilityError) return;
    setManagementBusy(true); setManagementMessage("");
    try { await visitorRequest("/gate/check-in", "POST", { accessCode: visitorCode.trim() }); setVisitorCode(""); setGateVisitor(null); setManagementMessage("Entry approved. Visitor checked in."); await loadGateVisits(); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Check-in failed."); }
    finally { setManagementBusy(false); }
  }

  async function denyGateVisitor() {
    if (!gateVisitor) return;
    setManagementBusy(true); setManagementMessage("");
    try { await visitorRequest("/gate/visitor-passes/" + encodeURIComponent(gateVisitor.pass.id) + "/deny", "POST", { reason: "Denied at security gate" }); setVisitorCode(""); setGateVisitor(null); setManagementMessage("Entry denied. Visitor pass revoked."); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Could not deny entry."); }
    finally { setManagementBusy(false); }
  }

  async function checkOutVisitor(visitId: string) {
    setManagementBusy(true); setManagementMessage("");
    try { await visitorRequest("/gate/visits/" + encodeURIComponent(visitId) + "/check-out", "POST"); setManagementMessage("Visitor checked out."); await loadGateVisits(); }
    catch (e) { setManagementMessage(e instanceof Error ? e.message : "Check-out failed."); }
    finally { setManagementBusy(false); }
  }

  async function loadEstateEvents() {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    setEventsLoading(true); setEventMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events", {
        headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" },
      });
      const result = await response.json() as { events?: EstateEvent[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load events.");
      setEstateEvents(result.events || []);
    } catch (e) { setEventMessage(e instanceof Error ? e.message : "Could not load events."); }
    finally { setEventsLoading(false); }
  }

  async function createEstateEvent() {
    if (!session?.access_token || !selectedEstateId || !apiUrl) { setEventMessage("Select your estate and confirm the API is configured."); return; }
    if (eventTitle.trim().length < 3 || eventVenue.trim().length < 2 || !eventStartsAt.trim() || !eventEndsAt.trim()) {
      setEventMessage("Complete the event title, venue, start and end date/time."); return;
    }
    const start = new Date(eventStartsAt), end = new Date(eventEndsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setEventMessage("Use valid date/time values and ensure the end is after the start."); return;
    }
    setEventBusy(true); setEventMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ title: eventTitle.trim(), description: eventDescription.trim(), venue: eventVenue.trim(), startsAt: start.toISOString(), endsAt: end.toISOString(), status: eventStatus }),
      });
      const result = await response.json() as { event?: EstateEvent; error?: string; message?: string };
      if (!response.ok) throw new Error(result.message || result.error || "Event could not be saved.");
      setEventTitle(""); setEventDescription(""); setEventVenue(""); setEventStartsAt(""); setEventEndsAt(""); setEventStatus("draft");
      setEventMessage("Event details saved successfully.");
      await loadEstateEvents();
    } catch (e) { setEventMessage(e instanceof Error ? e.message : "Event could not be saved."); }
    finally { setEventBusy(false); }
  }

  async function loadEventGuests(eventId: string) {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    setGuestLoading(true); setGuestMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(eventId) + "/guests", { headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" } });
      const result = await response.json() as { guests?: EventGuest[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load the guest list.");
      setEventGuests(result.guests || []);
    } catch (e) { setGuestMessage(e instanceof Error ? e.message : "Could not load the guest list."); }
    finally { setGuestLoading(false); }
  }

  async function addEventGuest() {
    if (!session?.access_token || !selectedEstateId || !guestEvent || !apiUrl) return;
    if (guestName.trim().length < 2) { setGuestMessage("Enter the guest's full name."); return; }
    setGuestBusy(true); setGuestMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(guestEvent.id) + "/guests", {
        method: "POST", headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: guestName.trim(), email: guestEmail.trim(), phone: guestPhone.trim(), notes: guestNotes.trim() }),
      });
      const result = await response.json() as { guest?: EventGuest; error?: string; message?: string };
      if (!response.ok) throw new Error(result.message || result.error || "Could not add this guest.");
      setGuestName(""); setGuestEmail(""); setGuestPhone(""); setGuestNotes("");
      setGuestMessage("Guest added to the list."); await loadEventGuests(guestEvent.id);
    } catch (e) { setGuestMessage(e instanceof Error ? e.message : "Could not add this guest."); }
    finally { setGuestBusy(false); }
  }

  async function removeEventGuest(guestId: string) {
    if (!session?.access_token || !selectedEstateId || !guestEvent || !apiUrl) return;
    setGuestBusy(true); setGuestMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(guestEvent.id) + "/guests/" + encodeURIComponent(guestId), { method: "DELETE", headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" } });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not remove this guest.");
      setGuestMessage("Guest removed from the list."); await loadEventGuests(guestEvent.id);
    } catch (e) { setGuestMessage(e instanceof Error ? e.message : "Could not remove this guest."); }
    finally { setGuestBusy(false); }
  }

  async function loadEventInvitations(eventId: string) {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    setInvitationLoading(true); setInvitationMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(eventId) + "/invitations", { headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" } });
      const result = await response.json() as { invitations?: EventInvitation[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load invitations.");
      setEventInvitations(result.invitations || []);
    } catch (e) { setInvitationMessage(e instanceof Error ? e.message : "Could not load invitations."); }
    finally { setInvitationLoading(false); }
  }

  async function generateAndCopyInvitation(guest: EventGuest) {
    if (!session?.access_token || !selectedEstateId || !invitationEvent || !apiUrl) return;
    setInvitationBusy(true); setInvitationMessage(""); setGeneratedInvitation(null);
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(invitationEvent.id) + "/guests/" + encodeURIComponent(guest.id) + "/invitations", {
        method: "POST", headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const result = await response.json() as { code?: string; error?: string; event?: { title: string; venue: string; starts_at: string }; guest?: { guest_name: string } };
      if (!response.ok || !result.code || !result.event || !result.guest) throw new Error(result.error || "Could not generate this invitation code.");
      const message = "You're invited to " + result.event.title + "\nGuest: " + result.guest.guest_name + "\nVenue: " + result.event.venue + "\nDate: " + new Date(result.event.starts_at).toLocaleString() + "\nInvitation code: " + result.code + "\nPlease present this code at the gate.";
      setGeneratedInvitation({ guestId: guest.id, code: result.code, message });
      try {
        await Clipboard.setStringAsync(message);
        setInvitationMessage("Invitation copied. Paste it wherever you want to send it. It has not been sent.");
      } catch {
        setInvitationMessage("Code generated. Clipboard copy failed; copy the invitation text shown below. It has not been sent.");
      }
      await loadEventInvitations(invitationEvent.id);
    } catch (e) { setInvitationMessage(e instanceof Error ? e.message : "Could not generate this invitation."); }
    finally { setInvitationBusy(false); }
  }

  async function revokeEventInvitation(invitationId: string) {
    if (!session?.access_token || !selectedEstateId || !invitationEvent || !apiUrl) return;
    setInvitationBusy(true); setInvitationMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(invitationEvent.id) + "/invitations/" + encodeURIComponent(invitationId) + "/revoke", { method: "POST", headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" } });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not revoke this invitation.");
      setInvitationMessage("Invitation code revoked."); setGeneratedInvitation(null); await loadEventInvitations(invitationEvent.id);
    } catch (e) { setInvitationMessage(e instanceof Error ? e.message : "Could not revoke this invitation."); }
    finally { setInvitationBusy(false); }
  }

  async function loadEventCheckIns(eventId: string) {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    setCheckInLoading(true); setCheckInMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(eventId) + "/check-ins", { headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" } });
      const result = await response.json() as { checkIns?: EventCheckIn[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load event attendance.");
      setEventCheckIns(result.checkIns || []);
    } catch (e) { setCheckInMessage(e instanceof Error ? e.message : "Could not load event attendance."); }
    finally { setCheckInLoading(false); }
  }

  async function loadAttendanceReport(event: EstateEvent) {
    if (!session?.access_token || !selectedEstateId || !apiUrl) return;
    setReportEvent(event); setAttendanceReport(null); setReportError(""); setReportLoading(true);
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(event.id) + "/attendance-report", {
        headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" },
      });
      const result = await response.json() as EventAttendanceReport & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load attendance report.");
      setAttendanceReport(result);
    } catch (e) { setReportError(e instanceof Error ? e.message : "Could not load attendance report."); }
    finally { setReportLoading(false); }
  }

  async function submitEventCheckIn() {
    if (!session?.access_token || !selectedEstateId || !checkInEvent || !apiUrl) return;
    const code = checkInCode.trim();
    if (!/^\\d{6}$/.test(code)) { setCheckInMessage("Enter the six-digit invitation code."); return; }
    setCheckInBusy(true); setCheckInMessage("");
    try {
      const response = await fetch(apiUrl + "/v1/estates/" + encodeURIComponent(selectedEstateId) + "/events/" + encodeURIComponent(checkInEvent.id) + "/check-in", { method: "POST", headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json() as { guest?: { guest_name: string }; error?: string };
      if (!response.ok) throw new Error(result.error === "event_guest_already_checked_in" ? "This guest has already been checked in." : result.error || "Could not check in this guest.");
      setCheckInCode(""); setCheckInMessage((result.guest?.guest_name || "Guest") + " checked in successfully.");
      await loadEventCheckIns(checkInEvent.id);
    } catch (e) { setCheckInMessage(e instanceof Error ? e.message : "Could not check in this guest."); }
    finally { setCheckInBusy(false); }
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
  const isPlatformAdmin = Boolean(profile?.globalRoles?.includes("platform_admin")) || estates.some((estate) => estate.membershipRole === "platform_admin");
  const isEstateManager = ["facility_manager", "estate_manager", "estate_admin"].includes(selectedEstate?.membershipRole || "");
  const isSecurity = selectedEstate?.membershipRole === "security";
  const isEventOrganiser = selectedEstate?.membershipRole === "event_organiser";
  const isResident = selectedEstate?.membershipRole === "resident" || (!selectedEstate && (profile?.residentUnits?.length || 0) > 0);

  useEffect(() => { if (isEventOrganiser && selectedEstateId && session?.access_token) void loadEstateEvents(); }, [isEventOrganiser, selectedEstateId, session?.access_token]);

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
            {(isEventOrganiser ? [["home","calendar-outline","Event Details"],["guests","people-outline","Guest List"],["invitations","mail-outline","Invitations"],["checkin","scan-outline","Check-in"],["report","stats-chart-outline","Attendance Report"]] as const : [["home","home-outline","Home"],["community","business-outline","Community"],["maintenance","construct-outline","Maintenance"],...(isPlatformAdmin || isEstateManager || isSecurity ? [["management","grid-outline","Management"] as const] : []),["profile","person-circle-outline","My profile"]] as const).map(([key,icon,label]) => (
              <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.navItem, tab === key && styles.navItemActive]}><Ionicons name={icon} size={20} color={tab === key ? "#071A3A" : "#B8C5DA"} style={styles.navIcon}/><Text style={[styles.navText,tab === key && styles.navTextActive]}>{label}</Text></TouchableOpacity>
            ))}
            <View style={styles.sidebarBottom}><Text style={styles.sidebarHint}>One platform. Many estates.</Text><Text style={styles.sidebarVersion}>RESIDENT PORTAL · PREVIEW</Text></View>
          </View>
        )}
        <View style={[styles.main, isResident && !wide && tab === "home" && styles.residentMain]}>
          <View style={[styles.topbar, isResident && !wide && tab === "home" && styles.residentTopbar]}>
            <View style={styles.brandRow}>{(!session || !wide) && <View style={styles.brandMark}><View style={styles.logoTowerLeft}/><View style={styles.logoTowerCenter}/><View style={styles.logoTowerRight}/></View>}<View><Text style={[styles.brandName, isResident && !wide && tab === "home" && styles.residentBrandName]}>CB NEST</Text><Text style={[styles.brandCaption, isResident && !wide && tab === "home" && styles.residentBrandCaption]}>{session ? "BUILDING YOUR FUTURE" : "ONE PLATFORM · MANY ESTATES"}</Text></View></View>
            {session && <View style={[styles.avatar, isResident && !wide && tab === "home" && styles.residentAvatar]}><Text style={styles.avatarText}>{firstName.slice(0,1).toUpperCase()}</Text></View>}
          </View>

          <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide, isResident && !wide && tab === "home" && styles.residentContent]} keyboardShouldPersistTaps="handled">
            {restoring ? (
              <View style={styles.loadingPage}><ActivityIndicator size="large" color={green}/><Text style={styles.bodyText}>Getting your space ready…</Text></View>
            ) : !session ? (
              <View style={[styles.authLayout,wide && styles.authLayoutWide]}>
                <View style={[styles.welcomePanel, wide && styles.welcomePanelWide]}>
                  <View style={styles.overlinePill}><View style={styles.liveDot}/><Text style={styles.overlineText}>THE RESIDENT EXPERIENCE</Text></View>
                  <Text style={styles.welcomeTitle}>A better way to{"\n"}feel at <Text style={styles.welcomeAccent}>home.</Text></Text>
                  <Text style={styles.welcomeBody}>Your estate life, thoughtfully connected. Stay informed, report issues, and keep your community moving.</Text>
                  <View style={styles.welcomeFeatures}><View style={styles.welcomeFeatureRow}><Ionicons name="checkmark-circle" size={18} color={gold}/><Text style={styles.welcomeFeature}>Community updates</Text></View><View style={styles.welcomeFeatureRow}><Ionicons name="checkmark-circle" size={18} color={gold}/><Text style={styles.welcomeFeature}>Simple maintenance reporting</Text></View><View style={styles.welcomeFeatureRow}><Ionicons name="checkmark-circle" size={18} color={gold}/><Text style={styles.welcomeFeature}>One account, many estates</Text></View></View>
                  <Text style={styles.welcomeFoot}>BUILT AROUND YOUR COMMUNITY</Text>
                </View>
                <View style={[styles.authCard, wide && styles.authCardWide]}>
                  <Text style={styles.formEyebrow}>WELCOME BACK</Text>
                  <Text style={styles.formTitle}>Sign in to your space</Text>
                  <Text style={styles.formIntro}>Use the email address your estate administrator invited.</Text>
                  
                  <Text style={styles.fieldLabel}>Email address</Text>
                  <TextInput accessibilityLabel="Email address" returnKeyType="next" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy}/>
                  <View style={styles.passwordLabelRow}><Text style={styles.fieldLabel}>Password</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword((visible) => !visible)} disabled={busy} style={styles.passwordToggle}><Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text></TouchableOpacity></View>
                  <TextInput accessibilityLabel="Password" returnKeyType="go" style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry={!showPassword} autoComplete="current-password" editable={!busy} onSubmitEditing={() => void submitAuth()}/>
                  {!!message && <Text style={message.toLowerCase().includes("success") || message.toLowerCase().includes("submitted") ? styles.successMessage : styles.errorMessage}>{message}</Text>}
                  {!supabaseConfigured && <Text style={styles.warningMessage}>Supabase setup is required. Check your local mobile environment file.</Text>}
                  <TouchableOpacity style={[styles.button,styles.authButton,busy && styles.disabled]} onPress={() => void submitAuth()} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Sign in securely  →</Text>}</TouchableOpacity>
                  <TouchableOpacity style={styles.switchMode} onPress={() => void requestPasswordReset()} disabled={busy}><Text style={styles.switchText}><Text style={styles.switchStrong}>Forgot your password?</Text></Text></TouchableOpacity>
                  <Text style={styles.secureNote}>Your account is protected by Supabase authentication.</Text>
                </View>
              </View>
            ) : (
              <>
                {isResident && tab === "savings" ? (
                  <RentSavings residentUserId={session.user.id} estateId={selectedEstateId} onBack={() => setTab("home")} />
                ) : isResident && tab === "utilities" ? (\n                  <View style={styles.panel}><TouchableOpacity onPress={() => setTab("home")} style={styles.eventBack}><Text style={styles.eventRefresh}>← BACK TO HOME</Text></TouchableOpacity><ResidentUtilities estateId={selectedEstateId || ""} /></View>\n                ) : isEventOrganiser && tab === "guests" ? (
                  <View style={styles.eventOrganiserHome}>
                    <TouchableOpacity onPress={() => setTab("home")} style={styles.eventBack}><Text style={styles.eventRefresh}>← BACK TO EVENT DETAILS</Text></TouchableOpacity>
                    <Text style={styles.eventEyebrow}>EVENT ORGANISER</Text><Text style={styles.eventHeading}>Guest List</Text>
                    <Text style={styles.eventSubheading}>{guestEvent?.title || "Select an event from Event Details to manage its guests."}</Text>
                    {guestEvent ? <>
                      <View style={styles.eventForm}><Text style={styles.eventSectionTitle}>ADD GUEST</Text>
                        <Text style={styles.eventLabel}>Full name *</Text><TextInput style={styles.eventInput} value={guestName} onChangeText={setGuestName} placeholder="Guest full name" placeholderTextColor="#888" maxLength={160}/>
                        <Text style={styles.eventLabel}>Email address (optional)</Text><TextInput style={styles.eventInput} value={guestEmail} onChangeText={setGuestEmail} placeholder="guest@example.com" placeholderTextColor="#888" keyboardType="email-address" autoCapitalize="none" maxLength={254}/>
                        <Text style={styles.eventLabel}>Phone number (optional)</Text><TextInput style={styles.eventInput} value={guestPhone} onChangeText={setGuestPhone} placeholder="Phone number" placeholderTextColor="#888" keyboardType="phone-pad" maxLength={32}/>
                        <Text style={styles.eventLabel}>Notes (optional)</Text><TextInput style={[styles.eventInput,styles.eventDescription]} value={guestNotes} onChangeText={setGuestNotes} placeholder="Additional guest details" placeholderTextColor="#888" multiline textAlignVertical="top" maxLength={1000}/>
                        {!!guestMessage && <Text style={guestMessage.includes("added") || guestMessage.includes("removed") ? styles.eventSuccess : styles.eventError}>{guestMessage}</Text>}
                        <TouchableOpacity style={[styles.eventSaveButton,guestBusy && styles.disabled]} onPress={() => void addEventGuest()} disabled={guestBusy}>{guestBusy ? <ActivityIndicator color="#17130B"/> : <Text style={styles.eventSaveText}>Add guest</Text>}</TouchableOpacity>
                      </View>
                      <View style={styles.eventListHeader}><Text style={styles.eventSectionTitle}>GUESTS · {eventGuests.length}</Text><TouchableOpacity onPress={() => void loadEventGuests(guestEvent.id)}><Text style={styles.eventRefresh}>REFRESH</Text></TouchableOpacity></View>
                      {guestLoading ? <ActivityIndicator color="#D4A84B"/> : eventGuests.length ? eventGuests.map((guest) => <View key={guest.id} style={styles.eventCard}><View style={styles.guestCardTop}><Text style={styles.eventCardTitle}>{guest.guest_name}</Text><TouchableOpacity onPress={() => void removeEventGuest(guest.id)} disabled={guestBusy}><Text style={styles.guestRemove}>REMOVE</Text></TouchableOpacity></View>{!!guest.email && <Text style={styles.eventCardMeta}>{guest.email}</Text>}{!!guest.phone && <Text style={styles.eventCardMeta}>{guest.phone}</Text>}{!!guest.notes && <Text style={styles.eventCardDescription}>{guest.notes}</Text>}</View>) : <Text style={styles.eventEmpty}>No guests added to this event yet.</Text>}
                    </> : <Text style={styles.eventEmpty}>Go to Event Details and choose an event to open its guest list.</Text>}
                  </View>
                ) : isEventOrganiser && tab === "invitations" ? (
                  <View style={styles.eventOrganiserHome}>
                    <TouchableOpacity onPress={() => setTab("home")} style={styles.eventBack}><Text style={styles.eventRefresh}>← BACK TO EVENT DETAILS</Text></TouchableOpacity>
                    <Text style={styles.eventEyebrow}>EVENT ORGANISER</Text>
                    <Text style={styles.eventHeading}>Invitations</Text>
                    <Text style={styles.eventSubheading}>{invitationEvent?.title || "Choose an event to prepare invitation codes."}</Text>
                    {!invitationEvent ? (
                      eventsLoading ? <ActivityIndicator color="#D4A84B"/> : estateEvents.length ? estateEvents.map((event) => <View key={event.id} style={styles.eventCard}><Text style={styles.eventCardTitle}>{event.title}</Text><Text style={styles.eventCardMeta}>{event.venue} · {new Date(event.starts_at).toLocaleString()}</Text><TouchableOpacity style={styles.guestOpenButton} onPress={() => { setInvitationEvent(event); setGeneratedInvitation(null); void loadEventGuests(event.id); void loadEventInvitations(event.id); }}><Text style={styles.guestOpenText}>PREPARE INVITATIONS →</Text></TouchableOpacity></View>) : <Text style={styles.eventEmpty}>Create an event first in Event Details.</Text>
                    ) : <>
                      <TouchableOpacity onPress={() => { setInvitationEvent(null); setGeneratedInvitation(null); }} style={styles.eventBack}><Text style={styles.eventRefresh}>← CHOOSE ANOTHER EVENT</Text></TouchableOpacity>
                      <Text style={styles.eventSectionTitle}>GUESTS · {eventGuests.length}</Text>
                      {guestLoading || invitationLoading ? <ActivityIndicator color="#D4A84B"/> : eventGuests.length ? eventGuests.map((guest) => {
                        const active = eventInvitations.find((item) => item.guest_id === guest.id && item.status === "active");
                        return <View key={guest.id} style={styles.eventCard}><Text style={styles.eventCardTitle}>{guest.guest_name}</Text>{!!guest.email && <Text style={styles.eventCardMeta}>{guest.email}</Text>}{!!guest.phone && <Text style={styles.eventCardMeta}>{guest.phone}</Text>}<Text style={styles.eventCardStatus}>{active ? "CODE ACTIVE · NOT SENT" : "NO ACTIVE CODE"}</Text><TouchableOpacity style={styles.guestOpenButton} disabled={invitationBusy} onPress={() => void generateAndCopyInvitation(guest)}><Text style={styles.guestOpenText}>{active ? "REGENERATE & COPY INVITATION" : "GENERATE & COPY INVITATION"}</Text></TouchableOpacity>{active && <TouchableOpacity onPress={() => void revokeEventInvitation(active.id)} disabled={invitationBusy} style={styles.eventBack}><Text style={styles.guestRemove}>REVOKE CODE</Text></TouchableOpacity>}{generatedInvitation?.guestId === guest.id && <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Invitation code</Text><Text style={styles.eventHeading}>{generatedInvitation.code}</Text><Text style={styles.bodyText}>{generatedInvitation.message}</Text><TouchableOpacity style={styles.guestOpenButton} onPress={() => void Clipboard.setStringAsync(generatedInvitation.message)}><Text style={styles.guestOpenText}>COPY INVITATION TEXT</Text></TouchableOpacity></View>}</View>;
                      }) : <Text style={styles.eventEmpty}>Add guests in Guest List before creating invitations.</Text>}
                      {!!invitationMessage && <Text style={invitationMessage.includes("copied") || invitationMessage.includes("revoked") ? styles.eventSuccess : styles.eventError}>{invitationMessage}</Text>}
                      <TouchableOpacity style={styles.eventBack} onPress={() => void loadEventInvitations(invitationEvent.id)}><Text style={styles.eventRefresh}>REFRESH INVITATIONS</Text></TouchableOpacity>
                      <Text style={styles.eventHint}>Copying does not send the invitation or mark it as sent. You decide where to paste the message.</Text>
                    </>}
                  </View>
                ) : isEventOrganiser && tab === "report" ? (
                  <View style={styles.eventOrganiserHome}>
                    <TouchableOpacity onPress={() => { setReportEvent(null); setAttendanceReport(null); setReportError(""); setTab("home"); }} style={styles.eventBack}><Text style={styles.eventRefresh}>← BACK TO EVENT DETAILS</Text></TouchableOpacity>
                    <Text style={styles.eventEyebrow}>EVENT ORGANISER</Text>
                    <Text style={styles.eventHeading}>Attendance Report</Text>
                    <Text style={styles.eventSubheading}>{reportEvent?.title || "Select an event to review guest attendance."}</Text>
                    {!reportEvent ? (
                      eventsLoading ? <ActivityIndicator color="#D4A84B"/> : estateEvents.length ? estateEvents.map((event) => <View key={event.id} style={styles.eventCard}><Text style={styles.eventCardTitle}>{event.title}</Text><Text style={styles.eventCardMeta}>{event.venue} · {new Date(event.starts_at).toLocaleString()}</Text><TouchableOpacity style={styles.guestOpenButton} onPress={() => void loadAttendanceReport(event)}><Text style={styles.guestOpenText}>VIEW ATTENDANCE REPORT →</Text></TouchableOpacity></View>) : <Text style={styles.eventEmpty}>Create an event first in Event Details.</Text>
                    ) : (
                      <>
                        <TouchableOpacity onPress={() => { setReportEvent(null); setAttendanceReport(null); setReportError(""); }} style={styles.eventBack}><Text style={styles.eventRefresh}>← CHOOSE ANOTHER EVENT</Text></TouchableOpacity>
                        {reportLoading ? <ActivityIndicator color="#D4A84B"/> : reportError ? <Text style={styles.eventError}>{reportError}</Text> : attendanceReport ? (
                          <>
                            <View style={styles.eventForm}>
                              <Text style={styles.eventSectionTitle}>ATTENDANCE OVERVIEW</Text>
                              <Text style={styles.eventCardTitle}>{attendanceReport.summary.attendancePercentage}% attendance</Text>
                              <Text style={styles.eventCardMeta}>{attendanceReport.summary.checkedIn} checked in · {attendanceReport.summary.outstanding} outstanding</Text>
                              <View style={styles.eventListHeader}><Text style={styles.eventSectionTitle}>REGISTERED GUESTS</Text><Text style={styles.eventRefresh}>{attendanceReport.summary.totalGuests} TOTAL</Text></View>
                              <Text style={styles.eventCardMeta}>Active invitations: {attendanceReport.summary.activeInvitations}</Text>
                              <Text style={styles.eventCardMeta}>Checked in: {attendanceReport.summary.checkedIn}</Text>
                              <Text style={styles.eventCardMeta}>Not checked in: {attendanceReport.summary.outstanding}</Text>
                            </View>
                            <View style={styles.eventListHeader}><Text style={styles.eventSectionTitle}>GUEST ATTENDANCE · {attendanceReport.guests.length}</Text><TouchableOpacity onPress={() => void loadAttendanceReport(reportEvent)}><Text style={styles.eventRefresh}>REFRESH</Text></TouchableOpacity></View>
                            {attendanceReport.guests.length ? attendanceReport.guests.map((guest) => <View key={guest.id} style={styles.eventCard}>
                              <Text style={styles.eventCardTitle}>{guest.guest_name}</Text>
                              {!!guest.email && <Text style={styles.eventCardMeta}>{guest.email}</Text>}
                              {!!guest.phone && <Text style={styles.eventCardMeta}>{guest.phone}</Text>}
                              <Text style={guest.attendanceStatus === "checked_in" ? styles.eventCardStatus : styles.eventCardMeta}>{guest.attendanceStatus === "checked_in" ? "CHECKED IN" : "NOT CHECKED IN"} · INVITATION {guest.invitationStatus === "active" ? "ACTIVE" : "NOT ACTIVE"}</Text>
                              {!!guest.checkedInAt && <Text style={styles.eventCardMeta}>Checked in {new Date(guest.checkedInAt).toLocaleString()}</Text>}
                            </View>) : <Text style={styles.eventEmpty}>No guests have been added to this event.</Text>}
                          </>
                        ) : null}
                      </>
                    )}
                  </View>
                ) : isEventOrganiser && tab === "checkin" ? (
                  <View style={styles.eventOrganiserHome}>
                    <TouchableOpacity onPress={() => setTab("home")} style={styles.eventBack}><Text style={styles.eventRefresh}>← BACK TO EVENT DETAILS</Text></TouchableOpacity>
                    <Text style={styles.eventEyebrow}>EVENT ORGANISER</Text>
                    <Text style={styles.eventHeading}>Guest Check-in</Text>
                    <Text style={styles.eventSubheading}>{checkInEvent?.title || "Select an event, then verify each guest's six-digit invitation code at the entrance."}</Text>
                    {!checkInEvent ? (
                      eventsLoading ? <ActivityIndicator color="#D4A84B"/> : estateEvents.length ? estateEvents.map((event) => <View key={event.id} style={styles.eventCard}><Text style={styles.eventCardTitle}>{event.title}</Text><Text style={styles.eventCardMeta}>{event.venue} · {new Date(event.starts_at).toLocaleString()}</Text><TouchableOpacity style={styles.guestOpenButton} onPress={() => { setCheckInEvent(event); setCheckInCode(""); setCheckInMessage(""); void loadEventCheckIns(event.id); }}><Text style={styles.guestOpenText}>OPEN EVENT CHECK-IN →</Text></TouchableOpacity></View>) : <Text style={styles.eventEmpty}>Create an event first in Event Details.</Text>
                    ) : <>
                      <TouchableOpacity onPress={() => { setCheckInEvent(null); setCheckInCode(""); setEventCheckIns([]); setCheckInMessage(""); }} style={styles.eventBack}><Text style={styles.eventRefresh}>← CHOOSE ANOTHER EVENT</Text></TouchableOpacity>
                      <View style={styles.eventForm}>
                        <Text style={styles.eventSectionTitle}>VERIFY INVITATION</Text>
                        <Text style={styles.eventLabel}>Six-digit guest code</Text>
                        <TextInput style={styles.eventInput} value={checkInCode} onChangeText={(value) => setCheckInCode(value.replace(/\\D/g, "").slice(0, 6))} placeholder="Enter invitation code" placeholderTextColor="#888" keyboardType="number-pad" maxLength={6}/>
                        <TouchableOpacity style={[styles.eventSaveButton,checkInBusy && styles.disabled]} onPress={() => void submitEventCheckIn()} disabled={checkInBusy || !/^\\d{6}$/.test(checkInCode)}>{checkInBusy ? <ActivityIndicator color="#17130B"/> : <Text style={styles.eventSaveText}>VERIFY CODE & CHECK IN</Text>}</TouchableOpacity>
                        {!!checkInMessage && <Text style={checkInMessage.includes("successfully") ? styles.eventSuccess : styles.eventError}>{checkInMessage}</Text>}
                      </View>
                      <View style={styles.eventListHeader}><Text style={styles.eventSectionTitle}>ATTENDANCE · {eventCheckIns.length}</Text><TouchableOpacity onPress={() => void loadEventCheckIns(checkInEvent.id)}><Text style={styles.eventRefresh}>REFRESH</Text></TouchableOpacity></View>
                      {checkInLoading ? <ActivityIndicator color="#D4A84B"/> : eventCheckIns.length ? eventCheckIns.map((item) => <View key={item.id} style={styles.eventCard}><Text style={styles.eventCardTitle}>{item.estate_event_guests?.guest_name || "Guest"}</Text>{!!item.estate_event_guests?.email && <Text style={styles.eventCardMeta}>{item.estate_event_guests.email}</Text>}{!!item.estate_event_guests?.phone && <Text style={styles.eventCardMeta}>{item.estate_event_guests.phone}</Text>}<Text style={styles.eventCardStatus}>CHECKED IN · {new Date(item.checked_in_at).toLocaleTimeString()}</Text></View>) : <Text style={styles.eventEmpty}>No guests have checked in for this event yet.</Text>}
                    </>}
                  </View>
                ) : isEventOrganiser && tab === "home" ? (
                  <View style={styles.eventOrganiserHome}>
                    <Text style={styles.eventEyebrow}>EVENT ORGANISER</Text>
                    <Text style={styles.eventHeading}>Event Details</Text>
                    <Text style={styles.eventSubheading}>{selectedEstate?.name || "Select your assigned estate"} · Create and manage estate events</Text>
                    <View style={styles.eventForm}>
                      <Text style={styles.eventSectionTitle}>NEW EVENT</Text>
                      <Text style={styles.eventLabel}>Event title</Text>
                      <TextInput style={styles.eventInput} value={eventTitle} onChangeText={setEventTitle} placeholder="e.g. Annual Residents’ Meeting" placeholderTextColor="#888" maxLength={160}/>
                      <Text style={styles.eventLabel}>Description</Text>
                      <TextInput style={[styles.eventInput,styles.eventDescription]} value={eventDescription} onChangeText={setEventDescription} placeholder="What is the event about?" placeholderTextColor="#888" multiline textAlignVertical="top" maxLength={5000}/>
                      <Text style={styles.eventLabel}>Venue</Text>
                      <TextInput style={styles.eventInput} value={eventVenue} onChangeText={setEventVenue} placeholder="Event location" placeholderTextColor="#888" maxLength={240}/>
                      <Text style={styles.eventLabel}>Start date and time</Text>
                      <TextInput style={styles.eventInput} value={eventStartsAt} onChangeText={setEventStartsAt} placeholder="2026-11-15T10:00" placeholderTextColor="#888" autoCapitalize="none"/>
                      <Text style={styles.eventHint}>Use YYYY-MM-DDTHH:mm (estate local time).</Text>
                      <Text style={styles.eventLabel}>End date and time</Text>
                      <TextInput style={styles.eventInput} value={eventEndsAt} onChangeText={setEventEndsAt} placeholder="2026-11-15T14:00" placeholderTextColor="#888" autoCapitalize="none"/>
                      <Text style={styles.eventLabel}>Publication</Text>
                      <View style={styles.eventStatusRow}>
                        {(["draft","published"] as const).map((status) => <TouchableOpacity key={status} onPress={() => setEventStatus(status)} style={[styles.eventStatusChip,eventStatus === status && styles.eventStatusChipActive]}><Text style={[styles.eventStatusText,eventStatus === status && styles.eventStatusTextActive]}>{status.toUpperCase()}</Text></TouchableOpacity>)}
                      </View>
                      {!!eventMessage && <Text style={eventMessage.includes("successfully") ? styles.eventSuccess : styles.eventError}>{eventMessage}</Text>}
                      <TouchableOpacity style={[styles.eventSaveButton,eventBusy && styles.disabled]} onPress={() => void createEstateEvent()} disabled={eventBusy}>{eventBusy ? <ActivityIndicator color="#17130B"/> : <Text style={styles.eventSaveText}>Save event details</Text>}</TouchableOpacity>
                    </View>
                    <View style={styles.eventListHeader}><Text style={styles.eventSectionTitle}>ESTATE EVENTS</Text><TouchableOpacity onPress={() => void loadEstateEvents()}><Text style={styles.eventRefresh}>REFRESH</Text></TouchableOpacity></View>
                    {eventsLoading ? <ActivityIndicator color="#D4A84B"/> : estateEvents.length ? estateEvents.map((event) => <View key={event.id} style={styles.eventCard}><Text style={styles.eventCardTitle}>{event.title}</Text><Text style={styles.eventCardMeta}>{event.venue}</Text><Text style={styles.eventCardMeta}>{new Date(event.starts_at).toLocaleString()} – {new Date(event.ends_at).toLocaleString()}</Text><Text style={styles.eventCardStatus}>{event.status.toUpperCase()}</Text>{!!event.description && <Text style={styles.eventCardDescription}>{event.description}</Text>}<TouchableOpacity style={styles.guestOpenButton} onPress={() => { setGuestEvent(event); setTab("guests"); void loadEventGuests(event.id); }}><Text style={styles.guestOpenText}>MANAGE GUEST LIST →</Text></TouchableOpacity><TouchableOpacity style={styles.guestOpenButton} onPress={() => { setInvitationEvent(event); setTab("invitations"); setGeneratedInvitation(null); void loadEventGuests(event.id); void loadEventInvitations(event.id); }}><Text style={styles.guestOpenText}>MANAGE INVITATIONS →</Text></TouchableOpacity></View>) : <Text style={styles.eventEmpty}>No events have been created for this estate yet.</Text>}
                  </View>
                ) : isResident && !wide && tab === "home" ? (
                  <View style={styles.residentHome}>
                    <View style={styles.residentGreeting}>
                      <Text style={styles.residentEyebrow}>WELCOME HOME</Text>
                      <Text style={styles.residentGreetingTitle}>Hello, {profile?.profile?.full_name || firstName}</Text>
                      <Text style={styles.residentMuted}>{profile?.residentUnits?.[0]?.units?.buildings?.name ? profile.residentUnits[0].units.buildings.name + " · " : ""}{profile?.residentUnits?.[0]?.units?.unit_code ? "Unit " + profile.residentUnits[0].units.unit_code : selectedEstate?.name || "Your resident account"}</Text>
                    </View>
                    <View style={styles.residentWelcomeCard}>
                      <View style={styles.residentWelcomeIcon}><Ionicons name="home" size={35} color="#D4A84B"/></View>
                      <Text style={styles.residentEyebrow}>YOUR COMMUNITY</Text>
                      <Text style={styles.residentWelcomeTitle}>Welcome to CB Nest</Text>
                      <Text style={styles.residentMuted}>{selectedEstate?.name || "Your estate"}{location ? " · " + location : ""}</Text>
                      <Text style={styles.residentWelcomeCopy}>A safer, smarter and more connected community.</Text>
                      <View style={styles.residentStatusPill}><View style={[styles.residentStatusDot, selectedEstate?.is_enabled === false && {backgroundColor:"#E05252"}]}/><Text style={styles.residentStatusText}>{selectedEstate?.is_enabled === false ? "ESTATE UNAVAILABLE" : selectedEstate ? "COMMUNITY CONNECTED" : "AWAITING ESTATE"}</Text></View>
                    </View>
                    <View style={styles.residentSectionHeading}><Text style={styles.residentSectionTitle}>YOUR SERVICES</Text></View>
                    <View style={styles.residentShortcutGrid}>
                      {([
                        ["home-outline","My Property","profile",true],
                        ["people-outline","Visitor Management","management",true],
                        ["qr-code-outline","Generate Access Code","management",true],
                        ["calendar-outline","Events","",false],
                        ["receipt-outline","Service Charges & Payments","utilities",true],\n                        ["flash-outline","Electricity Meter Recharge","utilities",true],
                        ["wallet-outline","Save for Rent","savings",true],
                        ["time-outline","Payment History","",false],
                        ["construct-outline","Maintenance Requests","maintenance",true],
                        ["megaphone-outline","Announcements","community",true],
                      ] as const).map(([icon,label,destination,enabled]) => (
                        <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{disabled:!enabled}} disabled={!enabled} onPress={() => destination && setTab(destination)} style={[styles.residentShortcut,!enabled && styles.residentShortcutDisabled]}>
                          <View style={styles.residentShortcutIcon}><Ionicons name={icon} size={23} color="#D4A84B"/></View>
                          <Text style={styles.residentShortcutLabel}>{label}</Text>
                          {!enabled && <Text style={styles.residentComingSoon}>COMING SOON</Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                    {!!estatesError && <View style={styles.residentErrorCard}><Text style={styles.residentShortcutLabel}>Estate connection issue</Text><Text style={styles.residentMuted}>{estatesError}</Text><TouchableOpacity onPress={() => void loadEstates(session.access_token)}><Text style={styles.residentRetry}>RETRY CONNECTION</Text></TouchableOpacity></View>}
                  </View>
                ) : (
                  <>
                <View style={styles.greetingRow}><View><Text style={styles.greetingEyebrow}>YOUR RESIDENT DASHBOARD</Text><Text style={styles.greetingTitle}>Good to see you, {firstName}.</Text><Text style={styles.greetingSub}>Here’s what’s happening in your community.</Text></View><View style={styles.datePill}><Ionicons name="shield-checkmark-outline" size={14} color={green}/><Text style={styles.datePillText}> RESIDENT SPACE</Text></View></View>
                <View style={styles.heroCard}><View style={styles.heroGlow}/><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>YOUR PLACE. YOUR PEOPLE.</Text><Text style={styles.heroTitle}>{selectedEstate?.name || "Your community awaits"}</Text><Text style={styles.heroSubtitle}>{location || (selectedEstate ? selectedEstate.address || "Your selected estate" : "Select an estate to see your community dashboard.")}</Text><View style={styles.heroStatus}><View style={[styles.liveDot, selectedEstate?.is_enabled === false && { backgroundColor: "#E05252" }]}/><Text style={styles.heroStatusText}>{selectedEstate?.is_enabled === false ? "SUBSCRIPTION INACTIVE" : selectedEstate ? "COMMUNITY SELECTED" : "READY TO CONNECT"}</Text></View></View><View style={styles.heroSymbol}><Ionicons name="business-outline" size={38} color={gold}/></View></View><View>{selectedEstate?.is_enabled === false && <View style={styles.warningBanner}><Text style={styles.warningBannerTitle}>Estate temporarily unavailable</Text><Text style={styles.warningBannerText}>{selectedEstate.disabled_reason || "The estate subscription is inactive. Please contact your estate administrator."}</Text></View>}</View>
                {tab === "home" && <>
                  <View style={styles.statsGrid}>{([[dashboard?.summary.units ?? (dashboardLoading ? "…" : dashboardError ? "!" : "0"),"Total units","business-outline"],[dashboard?.summary.occupiedUnits ?? (dashboardLoading ? "…" : dashboardError ? "!" : "0"),"Occupied homes","home-outline"],[dashboard?.summary.openMaintenanceRequests ?? (dashboardLoading ? "…" : dashboardError ? "!" : "0"),"Open issues","construct-outline"],[dashboard?.summary.publishedAnnouncements ?? (dashboardLoading ? "…" : dashboardError ? "!" : "0"),"Announcements","notifications-outline"]] as const).map(([value,label,icon]) => <View key={label} style={styles.statCard}><View style={styles.statIcon}><Ionicons name={icon} size={19} color={green}/></View><Text style={styles.statValue}>{String(value)}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>
                  <View style={styles.sectionRow}><SectionTitle title="Your estates" subtitle="Choose where you want to spend time."/>{!!session && <TouchableOpacity style={styles.textAction} onPress={() => void loadEstates(session.access_token)}><Text style={styles.textActionText}>↻ Refresh</Text></TouchableOpacity>}</View>
                  {estatesLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading your estates…</Text></View> : estatesError ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>We couldn't connect</Text><Text style={styles.bodyText}>{estatesError}</Text><Text style={styles.helperText}>Check that the API is running at {apiUrl || "the configured API address"}.</Text><Button title="Try again" secondary onPress={() => void loadEstates(session.access_token)}/></View> : estates.length === 0 ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>No estate membership yet</Text><Text style={styles.bodyText}>Your account is active, but no estate membership was returned. Contact your estate administrator to be added to a community.</Text></View> : <View style={styles.estateGrid}>{estates.map((estate) => {const active = estate.id === selectedEstateId;const place = [estate.city,estate.state,estate.country_code].filter(Boolean).join(", ");return <TouchableOpacity key={estate.id} onPress={() => void chooseEstate(estate.id)} style={[styles.estateCard,active && styles.estateCardActive]}><View style={[styles.estateBadge,active && styles.estateBadgeActive]}><Text style={styles.estateBadgeText}>⌂</Text></View><View style={styles.estateCardCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{[estate.address,place].filter(Boolean).join(" · ") || "Community estate"}</Text><Text style={styles.estateRole}>{(estate.membershipRole || "RESIDENT").replace(/_/g," ").toUpperCase()}</Text></View><Text style={[styles.estateCheck,active && styles.estateCheckActive]}>{active ? "✓" : "→"}</Text></TouchableOpacity>})}</View>}
                  <View style={styles.sectionRow}><SectionTitle title="Community updates" subtitle="The latest from your estate."/>{!!selectedEstateId && <TouchableOpacity style={styles.textAction} onPress={() => void loadDashboard(session.access_token,selectedEstateId)}><Text style={styles.textActionText}>↻ Refresh</Text></TouchableOpacity>}</View>
                  {dashboardLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading community updates…</Text></View> : dashboardError ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Updates temporarily unavailable</Text><Text style={styles.bodyText}>{dashboardError}</Text></View> : dashboard?.announcements.length ? dashboard.announcements.map((item) => <View key={item.id} style={styles.announcementCard}><View style={styles.announcementMark}><Text style={styles.announcementMarkText}>✳</Text></View><View style={styles.announcementCopy}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.bodyText} numberOfLines={3}>{item.body}</Text>{!!item.published_at && <Text style={styles.helperText}>{new Date(item.published_at).toLocaleDateString()}</Text>}</View></View>) : <View style={styles.simpleCard}><Text style={styles.simpleCardTitle}>Nothing new for now</Text><Text style={styles.bodyText}>Published estate announcements will appear here.</Text></View>}
                </>}
                {tab === "community" && <View style={styles.panel}><SectionTitle title="Your community" subtitle="Choose an estate and see its latest updates."/><Text style={styles.panelTitle}>Estate directory</Text>{estates.map((estate) => <TouchableOpacity key={estate.id} style={styles.directoryItem} onPress={() => void chooseEstate(estate.id)}><View style={styles.directoryIcon}><Ionicons name="business-outline" size={20} color={green}/></View><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{[estate.address,estate.city,estate.state].filter(Boolean).join(", ")}</Text></View><Text style={styles.estateCheck}>{estate.id === selectedEstateId ? "✓" : "→"}</Text></TouchableOpacity>)}<Text style={styles.panelTitle}>Announcements</Text>{dashboard?.announcements.map((item) => <View key={item.id} style={styles.contentCard}><Text style={styles.announcementTitle}>{item.title}</Text><Text style={styles.bodyText}>{item.body}</Text></View>)}{!dashboard?.announcements.length && <Text style={styles.bodyText}>No published announcements yet.</Text>}</View>}
                {tab === "maintenance" && <View style={styles.panel}><SectionTitle title="Maintenance" subtitle="Tell your estate team what needs attention."/><Text style={styles.fieldLabel}>Issue title</Text><TextInput style={styles.input} value={requestTitle} onChangeText={setRequestTitle} placeholder="e.g. Streetlight not working" maxLength={120}/><Text style={styles.fieldLabel}>Describe the issue</Text><TextInput style={[styles.input,styles.textArea]} value={requestDescription} onChangeText={setRequestDescription} placeholder="Where is it, and what happened?" multiline textAlignVertical="top" maxLength={3000}/><Text style={styles.fieldLabel}>Priority</Text><View style={styles.priorityRow}>{["low","normal","high","urgent"].map((p) => <TouchableOpacity key={p} onPress={() => setRequestPriority(p)} style={[styles.priorityChip,requestPriority === p && styles.priorityChipActive]}><Text style={[styles.priorityChipText,requestPriority === p && styles.priorityChipTextActive]}>{p}</Text></TouchableOpacity>)}</View>{!!requestMessage && <Text style={requestMessage.includes("submitted") ? styles.successMessage : styles.errorMessage}>{requestMessage}</Text>}<Button title={requestBusy ? "Submitting…" : "Submit maintenance request"} onPress={() => void submitMaintenance()} disabled={requestBusy}/><Text style={styles.panelTitle}>Recent open issues</Text>{dashboard?.maintenanceRequests.map((item) => <View key={item.id} style={styles.directoryItem}><View style={styles.issueDot}/><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{item.title}</Text><Text style={styles.estateCardPlace}>{item.status.replace(/_/g," ")} · {item.priority} priority</Text></View></View>)}{!dashboard?.maintenanceRequests.length && <Text style={styles.bodyText}>No open maintenance requests found.</Text>}</View>}
                {tab === "management" && <View style={styles.panel}><SectionTitle title={isPlatformAdmin ? "Platform administration" : isSecurity ? "Gate operations" : "Estate management"} subtitle="Actions depend on your assigned role and estate."/><Text style={styles.bodyText}>{managementMessage}</Text>{(isPlatformAdmin || isEstateManager) && <><Text style={styles.panelTitle}>Create an estate account</Text><Text style={styles.bodyText}>Invite an estate administrator (platform admins only), resident, facility manager, security officer, or event organiser. Residents must be assigned an available unit. Invitees receive an email link to set their password.</Text><Text style={styles.fieldLabel}>Full name</Text><TextInput accessibilityLabel="New account full name" style={styles.input} value={accountFullName} onChangeText={setAccountFullName} placeholder="Full name" autoCapitalize="words" editable={!managementBusy}/><Text style={styles.fieldLabel}>Email address</Text><TextInput accessibilityLabel="New account email" style={styles.input} value={accountEmail} onChangeText={setAccountEmail} placeholder="name@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!managementBusy}/><Text style={styles.fieldLabel}>Role</Text><View style={styles.priorityRow}>{([...(isPlatformAdmin ? [{label:"Estate admin",value:"estate_admin" as const}] : []),{label:"Resident",value:"resident" as const},{label:"Facility manager",value:"facility_manager" as const},{label:"Security",value:"security" as const},{label:"Event organiser",value:"event_organiser" as const}] as const).map((role) => <TouchableOpacity key={role.value} onPress={() => {setAccountRole(role.value);setAccountUnitId("");setResidentBuildingId("");setResidentBuildingName("");setResidentUnitCode("");setResidentUnitType("Apartment");}} style={[styles.priorityChip,accountRole === role.value && styles.priorityChipActive]}><Text style={[styles.priorityChipText,accountRole === role.value && styles.priorityChipTextActive]}>{role.label}</Text></TouchableOpacity>)}</View>{accountRole === "resident" && <><Text style={styles.fieldLabel}>Building</Text>{managementBuildings.map((building) => <TouchableOpacity key={building.id} onPress={() => {setResidentBuildingId(building.id);setResidentBuildingName("");}} style={[styles.directoryItem,residentBuildingId === building.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{building.name}</Text><Text style={styles.estateCardPlace}>Existing building</Text></View><Text style={styles.textActionText}>{residentBuildingId === building.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}<Text style={styles.helperText}>Or enter a new building name to create one for this resident.</Text><TextInput accessibilityLabel="New building name" style={styles.input} value={residentBuildingName} onChangeText={(value) => {setResidentBuildingName(value);if(value.trim())setResidentBuildingId("");}} placeholder="e.g. Block A" autoCapitalize="words" editable={!managementBusy}/><Text style={styles.fieldLabel}>Apartment number</Text><TextInput accessibilityLabel="Apartment number" style={styles.input} value={residentUnitCode} onChangeText={setResidentUnitCode} placeholder="e.g. A-102" autoCapitalize="characters" editable={!managementBusy}/><Text style={styles.fieldLabel}>Apartment type</Text><TextInput accessibilityLabel="Apartment type" style={styles.input} value={residentUnitType} onChangeText={setResidentUnitType} placeholder="e.g. 2-bedroom apartment" autoCapitalize="sentences" editable={!managementBusy}/></>}<Button title={managementBusy ? "Sending invitation…" : "Create account & send invitation"} onPress={() => void createEstateAccount()} disabled={managementBusy || !selectedEstateId || accountFullName.trim().length < 2 || !accountEmail.trim() || (accountRole === "resident" && (!residentUnitCode.trim() || (!residentBuildingId && residentBuildingName.trim().length < 2) || Boolean(residentBuildingId && residentBuildingName.trim())) )}/></>}{isPlatformAdmin && <><Text style={styles.panelTitle}>Create estate</Text><Text style={styles.fieldLabel}>Estate name</Text><TextInput accessibilityLabel="Estate name" style={styles.input} value={newEstateName} onChangeText={setNewEstateName} placeholder="e.g. Greenview Estate" autoCapitalize="words"/><Text style={styles.fieldLabel}>Street address</Text><TextInput accessibilityLabel="Street address" style={styles.input} value={newEstateAddress} onChangeText={setNewEstateAddress} placeholder="House number, street, area" autoCapitalize="words"/><Text style={styles.fieldLabel}>City</Text><TextInput accessibilityLabel="City" style={styles.input} value={newEstateCity} onChangeText={setNewEstateCity} placeholder="e.g. Lagos" autoCapitalize="words"/><Text style={styles.fieldLabel}>State</Text><TextInput accessibilityLabel="State" style={styles.input} value={newEstateState} onChangeText={setNewEstateState} placeholder="e.g. Lagos State" autoCapitalize="words"/><Button title={managementBusy ? "Working…" : "Create estate"} onPress={() => void createEstate()} disabled={managementBusy}/><Text style={styles.helperText}>Enter the estate name, street address, city and state. All four fields are required.</Text><Text style={styles.panelTitle}>Subscriptions</Text>{estates.filter((e) => e.membershipRole === "platform_admin").map((estate) => <View key={estate.id} style={styles.directoryItem}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{estate.name}</Text><Text style={styles.estateCardPlace}>{estate.is_enabled === false ? "Disabled" : "Enabled"}</Text></View><Button title={estate.is_enabled === false ? "Re-enable" : "Disable"} secondary onPress={() => void toggleEstate(estate, estate.is_enabled === false)} disabled={managementBusy}/></View>)}</>}{isEstateManager && <><Text style={styles.panelTitle}>Create building</Text><TextInput style={styles.input} value={managementBuildingName} onChangeText={setManagementBuildingName} placeholder="Building name"/><Button title="Create building" secondary onPress={() => void createBuilding()} disabled={managementBusy}/><Text style={styles.panelTitle}>Buildings</Text>{directoryLoading ? <ActivityIndicator color={green}/> : managementBuildings.map((building) => <TouchableOpacity key={building.id} onPress={() => setManagementBuildingId(building.id)} style={[styles.directoryItem, managementBuildingId === building.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{building.name}</Text><Text style={styles.estateCardPlace}>{managementBuildingId === building.id ? "Selected" : "Tap to select"}</Text></View><Text style={styles.textActionText}>{managementBuildingId === building.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}{!directoryLoading && managementBuildings.length === 0 && <Text style={styles.helperText}>Create a building to get started.</Text>}<Text style={styles.panelTitle}>Create unit</Text><Text style={styles.helperText}>Select a building above, then enter the unit details.</Text><TextInput style={styles.input} value={managementUnitCode} onChangeText={setManagementUnitCode} placeholder="Unit code"/><TextInput style={styles.input} value={managementUnitType} onChangeText={setManagementUnitType} placeholder="Unit type (optional)"/><Button title="Create available unit" secondary onPress={() => void createUnit()} disabled={managementBusy || !managementBuildingId}/><Text style={styles.panelTitle}>Assign resident to unit</Text><Text style={styles.helperText}>Select an available unit and an active resident.</Text>{managementUnits.filter((unit) => unit.status === "available").map((unit) => <TouchableOpacity key={unit.id} onPress={() => setManagementUnitId(unit.id)} style={[styles.directoryItem, managementUnitId === unit.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{unit.unit_code}</Text><Text style={styles.estateCardPlace}>{unit.unit_type || "Unit"} · Available</Text></View><Text style={styles.textActionText}>{managementUnitId === unit.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}{managementResidents.map((resident) => <TouchableOpacity key={resident.id} onPress={() => setManagementResidentId(resident.id)} style={[styles.directoryItem, managementResidentId === resident.id && styles.estateCardActive]}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{resident.full_name || "Resident"}</Text><Text style={styles.estateCardPlace}>{managementResidentId === resident.id ? "Selected resident" : resident.id}</Text></View><Text style={styles.textActionText}>{managementResidentId === resident.id ? "SELECTED" : "SELECT"}</Text></TouchableOpacity>)}<Button title="Assign selected resident" secondary onPress={() => void assignResidentToUnit()} disabled={managementBusy || !managementUnitId || !managementResidentId}/><Button title="Refresh estate directory" secondary onPress={() => void loadManagementDirectory()} disabled={directoryLoading || managementBusy}/></>}{isSecurity ? <><Text style={styles.panelTitle}>Gate check-in</Text><TextInput style={styles.input} value={visitorCode} onChangeText={setVisitorCode} placeholder="6-digit visitor access code" keyboardType="number-pad" maxLength={6}/><Button title="Find visitor" onPress={() => void lookupGateVisitor()} disabled={managementBusy || !/^\d{6}$/.test(visitorCode.trim())}/>{!!gateVisitor && <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Visitor details</Text><Text style={styles.estateCardName}>{gateVisitor.visitor.name}</Text><Text style={styles.bodyText}>Phone: {gateVisitor.visitor.phone || "Not provided"}</Text><Text style={styles.bodyText}>Host: {gateVisitor.host.name || "Not available"}</Text><Text style={styles.bodyText}>Valid from: {new Date(gateVisitor.pass.validFrom).toLocaleString()}</Text><Text style={styles.bodyText}>Valid until: {new Date(gateVisitor.pass.validUntil).toLocaleString()}</Text><Text style={styles.helperText}>Pass status: {gateVisitor.pass.status.toUpperCase()}</Text>{!!gateVisitor.availabilityError && <Text style={styles.errorMessage}>{visitorApiErrorMessage(gateVisitor.availabilityError)}</Text>}<Button title="Approve entry" onPress={() => void approveGateVisitor()} disabled={managementBusy || !!gateVisitor.availabilityError}/><Button title="Deny entry" secondary onPress={() => void denyGateVisitor()} disabled={managementBusy || gateVisitor.pass.status !== "active"}/></View>}<Text style={styles.panelTitle}>Visitors currently inside</Text><Button title={gateVisitsLoading ? "Loading visits…" : "Refresh active visits"} secondary onPress={() => void loadGateVisits()} disabled={gateVisitsLoading || managementBusy}/>{!!gateVisitsError && <View style={styles.warningBanner}><Text style={styles.warningBannerTitle}>Active visits unavailable</Text><Text style={styles.warningBannerText}>{gateVisitsError}</Text></View>}{gateVisitsLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading active visits…</Text></View> : gateVisits.map((visit) => <View key={visit.id} style={styles.directoryItem}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{visit.visitor_passes?.visitor_name || "Visitor"}</Text><Text style={styles.estateCardPlace}>Checked in {new Date(visit.checked_in_at).toLocaleString()}</Text></View><Button title="Check out" secondary onPress={() => void checkOutVisitor(visit.id)} disabled={managementBusy}/></View>)}{!gateVisitsLoading && !gateVisitsError && gateVisits.length === 0 && <View style={styles.simpleCard}><Text style={styles.simpleCardTitle}>No active visits</Text><Text style={styles.bodyText}>Visitors checked in at this estate will appear here.</Text></View>}</> : <>
                <View style={styles.sectionRow}><SectionTitle title="Create visitor pass" subtitle="Invite someone to your estate securely."/></View>
                <Text style={styles.bodyText}>Create a time-limited visitor pass. The access code is shown once; share it privately.</Text>
                <TextInput style={styles.input} value={visitorName} onChangeText={setVisitorName} placeholder="Visitor full name" maxLength={120}/>
                <Button title="Create visitor pass" onPress={() => void createVisitorPass()} disabled={managementBusy || visitorName.trim().length < 2}/>
                {!!issuedVisitorCode && <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Visitor access code</Text><Text style={styles.welcomeTitle}>{issuedVisitorCode}</Text><Text style={styles.bodyText}>Valid for 12 hours. The code has been copied to your clipboard. Paste it into WhatsApp or SMS to send it to your visitor.</Text></View>}
                <View style={styles.sectionRow}><SectionTitle title="Your visitor passes" subtitle="Only passes created by your account are shown."/></View>
                <Button title={visitorPassesLoading ? "Loading passes…" : "Refresh visitor passes"} secondary onPress={() => void loadVisitorPasses()} disabled={visitorPassesLoading || managementBusy}/>
                {!!visitorPassesError && <View style={styles.warningBanner}><Text style={styles.warningBannerTitle}>Pass history unavailable</Text><Text style={styles.warningBannerText}>{visitorPassesError}</Text></View>}
                {visitorPassesLoading ? <View style={styles.inlineLoading}><ActivityIndicator color={green}/><Text style={styles.bodyText}>Loading your visitor passes…</Text></View> : visitorPasses.length === 0 ? <View style={styles.simpleCard}><Text style={styles.simpleCardTitle}>No visitor passes yet</Text><Text style={styles.bodyText}>Passes you create will appear here.</Text></View> : visitorPasses.map((pass) => <View key={pass.id} style={styles.directoryItem}><View style={styles.directoryCopy}><Text style={styles.estateCardName}>{pass.visitor_name}</Text><Text style={styles.estateCardPlace}>Valid until {new Date(pass.valid_until).toLocaleString()}</Text><Text style={styles.helperText}>Created {new Date(pass.created_at).toLocaleDateString()} · {pass.status.replace(/_/g," ")}</Text>{!!pass.visitor_phone && <Text style={styles.helperText}>{pass.visitor_phone}</Text>}</View><View style={[styles.profilePill,{marginTop:0}]}><Text style={styles.profilePillText}>{new Date(pass.valid_until).getTime() <= Date.now() ? "EXPIRED" : pass.status.toUpperCase()}</Text></View></View>)}
              </>}
              </View>}
                {tab === "profile" && <View style={styles.panel}><SectionTitle title="Your profile" subtitle="Your account and sign-in details."/><View style={styles.profileHero}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{firstName.slice(0,1).toUpperCase()}</Text></View><Text style={styles.profileName}>{profile?.profile?.full_name || firstName}</Text><Text style={styles.bodyText}>{session.user.email}</Text><View style={styles.profilePill}><Text style={styles.profilePillText}>{profile?.profile?.is_active ? "ACTIVE ACCOUNT" : "SIGNED IN"}</Text></View></View>{(profile?.estateMemberships || []).map((membership) => <View key={membership.id} style={styles.contentCard}><Text style={styles.announcementTitle}>{membership.membership_role.replace(/_/g," ").replace(/\b\w/g,(letter) => letter.toUpperCase())}</Text><Text style={styles.bodyText}>{membership.estates?.name || "Assigned estate"}</Text><Text style={styles.helperText}>{[membership.estates?.address,membership.estates?.city,membership.estates?.state].filter(Boolean).join(", ")}</Text><Text style={styles.profilePillText}>{membership.status.toUpperCase()} MEMBERSHIP</Text></View>)}{(profile?.residentUnits || []).map((assignment) => <View key={assignment.unit_id} style={styles.contentCard}><Text style={styles.announcementTitle}>Resident apartment</Text><Text style={styles.bodyText}>{assignment.units?.buildings?.estates?.name || "Estate"} · {assignment.units?.buildings?.name || "Building"} · {assignment.units?.unit_code || "Unit"}</Text><Text style={styles.helperText}>{assignment.units?.unit_type || "Residential unit"}</Text></View>)}{!!profile?.error && <Text style={styles.errorMessage}>{profile.error}</Text>}<Button title="Refresh profile" secondary onPress={() => void loadProfile(session.access_token)}/><Button title={busy ? "Signing out…" : "Sign out"} onPress={() => void signOut()} disabled={busy}/></View>}
                <View style={styles.footer}><Text style={styles.footerBrand}>CITIES BUILDER NEST</Text><Text style={styles.footerText}>One platform · Many estates</Text></View>
                  </>
                )}
              </>
            )}
          </ScrollView>
          {session && !wide && <View style={[styles.bottomNav, isResident && tab === "home" && styles.residentBottomNav]}>{(isEventOrganiser ? [["home","calendar-outline","Events"],["guests","people-outline","Guests"],["invitations","mail-outline","Invites"],["checkin","scan-outline","Check-in"],["report","stats-chart-outline","Report"]] as const : [["home","home-outline","Home"],["community","business-outline","Community"],["maintenance","construct-outline","Maintain"],...(isPlatformAdmin || isEstateManager || isSecurity ? [["management","grid-outline","Manage"] as const] : []),["profile","person-circle-outline","Profile"]] as const).map(([key,icon,label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={styles.bottomNavItem}><Ionicons name={icon} size={22} color={isResident && tab === "home" ? (tab === key ? "#D4A84B" : "#8C8C8C") : (tab === key ? green : "#8290A5")}/><Text style={[styles.bottomNavText,tab === key && styles.bottomNavTextActive,isResident && tab === "home" && styles.residentBottomNavText,isResident && tab === "home" && tab === key && styles.residentBottomNavTextActive]}>{label}</Text>{tab === key && <View style={[styles.bottomNavActiveMark,isResident && tab === "home" && styles.residentBottomNavActiveMark]}/>}</TouchableOpacity>)}</View>}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  eventOrganiserHome:{gap:15,backgroundColor:"#080808",minHeight:500,padding:15},eventEyebrow:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1.8},eventHeading:{fontSize:27,color:"#FFFFFF",fontWeight:"900"},eventSubheading:{fontSize:12,lineHeight:19,color:"#B9B9B9"},eventForm:{backgroundColor:"#171717",borderWidth:1,borderColor:"#3A3020",borderRadius:17,padding:15,gap:5},eventSectionTitle:{fontSize:11,color:"#D4A84B",fontWeight:"900",letterSpacing:1.5},eventLabel:{fontSize:11,color:"#F1D28A",fontWeight:"800",marginTop:9},eventInput:{minHeight:47,borderWidth:1,borderColor:"#494133",borderRadius:10,paddingHorizontal:12,paddingVertical:10,color:"#FFFFFF",backgroundColor:"#101010",fontSize:13},eventDescription:{minHeight:90},eventHint:{fontSize:10,color:"#999"},eventStatusRow:{flexDirection:"row",gap:9,marginTop:5},eventStatusChip:{paddingHorizontal:15,paddingVertical:10,borderRadius:22,borderWidth:1,borderColor:"#5A4A2B"},eventStatusChipActive:{backgroundColor:"#D4A84B"},eventStatusText:{fontSize:10,color:"#D4A84B",fontWeight:"900"},eventStatusTextActive:{color:"#17130B"},eventSaveButton:{minHeight:48,backgroundColor:"#D4A84B",borderRadius:11,alignItems:"center",justifyContent:"center",marginTop:14},eventSaveText:{fontSize:13,color:"#17130B",fontWeight:"900"},eventSuccess:{fontSize:12,color:"#7DDAA2",marginTop:10},eventError:{fontSize:12,color:"#FF9292",marginTop:10},eventListHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:10},eventRefresh:{fontSize:10,color:"#D4A84B",fontWeight:"900"},eventCard:{backgroundColor:"#171717",borderWidth:1,borderColor:"#3A3020",borderRadius:14,padding:14,gap:6},eventCardTitle:{fontSize:16,color:"#FFFFFF",fontWeight:"900"},eventCardMeta:{fontSize:11,color:"#C5C5C5"},eventCardStatus:{alignSelf:"flex-start",fontSize:9,color:"#F1D28A",fontWeight:"900",letterSpacing:1,backgroundColor:"#302718",paddingHorizontal:9,paddingVertical:5,borderRadius:12},eventCardDescription:{fontSize:12,lineHeight:18,color:"#B9B9B9"},eventEmpty:{fontSize:12,color:"#B9B9B9",padding:12},eventBack:{alignSelf:"flex-start",paddingVertical:5},guestCardTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},guestRemove:{fontSize:9,color:"#FF9292",fontWeight:"900",letterSpacing:.7},guestOpenButton:{alignSelf:"flex-start",marginTop:7,paddingVertical:8,paddingHorizontal:11,borderWidth:1,borderColor:"#6A552F",borderRadius:9},guestOpenText:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:.5},
    residentBottomNav:{backgroundColor:"#080808",borderTopColor:"#30291D"},residentBottomNavText:{color:"#AFAFAF"},residentBottomNavTextActive:{color:"#D4A84B"},residentBottomNavActiveMark:{backgroundColor:"#D4A84B"},residentMain:{backgroundColor:"#080808"},residentTopbar:{backgroundColor:"#080808",paddingTop:18,paddingBottom:12},residentBrandName:{color:"#FFFFFF",fontSize:19,letterSpacing:.2},residentBrandCaption:{color:"#D4A84B",letterSpacing:1.1},residentAvatar:{backgroundColor:"#D4A84B",borderWidth:2,borderColor:"#F1D28A"},residentContent:{backgroundColor:"#080808",paddingHorizontal:16,paddingTop:18,paddingBottom:28,gap:18},residentHome:{gap:17},residentGreeting:{gap:5},residentEyebrow:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1.7},residentGreetingTitle:{fontSize:25,lineHeight:32,color:"#FFFFFF",fontWeight:"900",letterSpacing:-.5},residentMuted:{fontSize:12,lineHeight:18,color:"#B9B9B9"},residentWelcomeCard:{backgroundColor:"#171717",borderRadius:20,borderWidth:1,borderColor:"#3A3020",padding:17,gap:8,overflow:"hidden"},residentWelcomeIcon:{width:62,height:62,borderRadius:18,backgroundColor:"#282116",borderWidth:1,borderColor:"#5A4828",alignItems:"center",justifyContent:"center",marginBottom:5},residentWelcomeTitle:{fontSize:23,lineHeight:28,color:"#FFFFFF",fontWeight:"900"},residentWelcomeCopy:{fontSize:13,lineHeight:20,color:"#E2E2E2"},residentStatusPill:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"#2A241A",borderRadius:20,paddingHorizontal:11,paddingVertical:8,marginTop:5},residentStatusDot:{width:7,height:7,borderRadius:4,backgroundColor:"#D4A84B"},residentStatusText:{fontSize:9,color:"#F5D58D",fontWeight:"900",letterSpacing:1},residentSectionHeading:{marginTop:2},residentSectionTitle:{fontSize:12,color:"#D4A84B",fontWeight:"900",letterSpacing:1.8},residentShortcutGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},residentShortcut:{width:"31.5%",minHeight:112,flexGrow:1,flexBasis:"29%",backgroundColor:"#171717",borderWidth:1,borderColor:"#38332A",borderRadius:15,padding:10,alignItems:"center",justifyContent:"center",gap:8},residentShortcutDisabled:{opacity:.55},residentShortcutIcon:{width:43,height:43,borderRadius:14,backgroundColor:"#282116",alignItems:"center",justifyContent:"center"},residentShortcutLabel:{fontSize:10,color:"#FFFFFF",fontWeight:"800",textAlign:"center",lineHeight:14},residentComingSoon:{fontSize:7,color:"#D4A84B",fontWeight:"900",letterSpacing:.5},residentErrorCard:{padding:14,backgroundColor:"#241919",borderWidth:1,borderColor:"#633333",borderRadius:14,gap:7},residentRetry:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1,marginTop:4},
  root:{flex:1,backgroundColor:"#F4F6FA"},appFrame:{flex:1,width:"100%",alignSelf:"center",maxWidth:480,flexDirection:"row"},appFrameWide:{padding:0,gap:0},
  sidebar:{width:238,backgroundColor:"#071A3A",borderRadius:24,padding:20,justifyContent:"flex-start"},main:{flex:1,minWidth:0,backgroundColor:"#FFFFFF",overflow:"hidden"},
  topbar:{minHeight:76,paddingHorizontal:20,paddingVertical:14,backgroundColor:"#FFFFFF",borderBottomWidth:0,borderBottomColor:"#FFFFFF",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
  brandRow:{flexDirection:"row",alignItems:"center",gap:11,flexShrink:1,minWidth:0},brandMark:{width:42,height:42,flexShrink:0,borderRadius:0,backgroundColor:"transparent",alignItems:"center",justifyContent:"center",flexDirection:"row",gap:2},logoTowerLeft:{width:8,height:19,backgroundColor:"#FFC400",transform:[{skewY:"-24deg"}],alignSelf:"center"},logoTowerCenter:{width:10,height:34,backgroundColor:"#FFC400",transform:[{skewY:"-8deg"}],alignSelf:"center"},logoTowerRight:{width:8,height:23,backgroundColor:"#FFC400",transform:[{skewY:"24deg"}],alignSelf:"center"},
  brandName:{color:"#071A3A",fontSize:15,fontWeight:"900",letterSpacing:-.3,flexShrink:1},brandCaption:{color:"#53647F",fontSize:8,fontWeight:"800",letterSpacing:.8,marginTop:3,flexShrink:1},avatar:{width:39,height:39,borderRadius:20,backgroundColor:"#FFC400",alignItems:"center",justifyContent:"center"},avatarText:{color:"#071A3A",fontSize:15,fontWeight:"900"},
  content:{paddingHorizontal:20,paddingTop:18,paddingBottom:30,gap:16},contentWide:{paddingHorizontal:18,paddingTop:22,paddingBottom:30,maxWidth:430,width:"100%",alignSelf:"center"},loadingPage:{minHeight:300,alignItems:"center",justifyContent:"center",gap:12},
  authLayout:{gap:16},authLayoutWide:{flexDirection:"row",alignItems:"stretch",gap:28,paddingTop:26,paddingBottom:26},welcomePanel:{backgroundColor:"#071A3A",borderRadius:22,padding:24,overflow:"hidden"},welcomePanelWide:{flex:1,justifyContent:"center",minHeight:540},authCardWide:{flex:1,justifyContent:"center",maxWidth:480},overlinePill:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#E5EAF2",borderRadius:30,paddingHorizontal:12,paddingVertical:8,backgroundColor:"#FFFFFF"},overlineText:{fontSize:9,color:"#071A3A",fontWeight:"900",letterSpacing:1},
  liveDot:{width:7,height:7,borderRadius:4,backgroundColor:gold},welcomeTitle:{fontSize:26,lineHeight:32,fontWeight:"900",color:"#FFFFFF",letterSpacing:-.7,marginTop:16},welcomeAccent:{color:"#FFC400"},welcomeBody:{fontSize:14,lineHeight:23,color:"#DCE6F5",marginTop:14,maxWidth:440},welcomeFeatures:{gap:13,marginTop:22},welcomeFeatureRow:{flexDirection:"row",alignItems:"center",gap:10},welcomeFeature:{color:"#FFFFFF",fontSize:13,fontWeight:"700"},welcomeFoot:{fontSize:9,letterSpacing:1.6,fontWeight:"900",color:"#DCE6F5",marginTop:22},
  authCard:{backgroundColor:"#FFFFFF",borderRadius:20,padding:20,borderWidth:1,borderColor:"#E5EAF2"},formEyebrow:{fontSize:10,color:"#A57900",fontWeight:"900",letterSpacing:1.5},formTitle:{fontSize:25,lineHeight:31,fontWeight:"900",letterSpacing:-.7,color:"#071A3A",marginTop:9},formIntro:{fontSize:13,lineHeight:20,color:"#53647F",marginTop:6,marginBottom:18},fieldLabel:{fontSize:12,color:"#071A3A",fontWeight:"800",marginTop:15,marginBottom:7},passwordLabelRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},passwordToggle:{paddingHorizontal:8,paddingVertical:5,marginTop:10,marginBottom:3},passwordToggleText:{fontSize:12,color:"#071A3A",fontWeight:"900"},input:{minHeight:54,borderWidth:1,borderColor:"#DCE3EF",borderRadius:12,paddingHorizontal:14,paddingVertical:13,fontSize:14,color:"#071A3A",backgroundColor:"#FFFFFF"},textArea:{minHeight:120,paddingTop:12},button:{minHeight:49,borderRadius:12,backgroundColor:gold,alignItems:"center",justifyContent:"center",paddingHorizontal:16,marginTop:14},authButton:{marginTop:20},buttonText:{color:"#071A3A",fontSize:14,fontWeight:"900"},buttonSecondary:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE3EF"},buttonSecondaryText:{color:green},disabled:{opacity:.6},switchMode:{alignItems:"center",paddingTop:18,paddingBottom:5},switchText:{fontSize:12,color:"#53647F"},switchStrong:{color:green,fontWeight:"900"},secureNote:{fontSize:10,color:"#7D8AA3",textAlign:"center",marginTop:15},errorMessage:{color:"#B42318",fontSize:12,lineHeight:18,marginTop:12},successMessage:{color:"#167044",fontSize:12,lineHeight:18,marginTop:12},warningMessage:{color:"#8A4B08",fontSize:12,lineHeight:18,backgroundColor:"#FFF4DF",borderRadius:10,padding:11,marginTop:12},
  greetingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:4},greetingEyebrow:{fontSize:9,color:"#A57900",fontWeight:"900",letterSpacing:1.6},greetingTitle:{fontSize:25,lineHeight:32,fontWeight:"900",letterSpacing:-.8,color:"#071A3A",marginTop:5},greetingSub:{fontSize:13,lineHeight:19,color:"#53647F",marginTop:4},datePill:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE3EF",paddingHorizontal:11,paddingVertical:9,borderRadius:30,flexDirection:"row",alignItems:"center"},datePillText:{fontSize:9,color:green,fontWeight:"900",letterSpacing:.4},
  heroCard:{minHeight:170,backgroundColor:"#071A3A",borderRadius:18,padding:22,overflow:"hidden",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},heroGlow:{position:"absolute",right:-40,top:-80,width:220,height:220,borderRadius:110,backgroundColor:"#10264A"},heroCopy:{flex:1,zIndex:1},heroEyebrow:{fontSize:9,color:"#DCE6F5",fontWeight:"900",letterSpacing:1.4},heroTitle:{fontSize:24,lineHeight:30,fontWeight:"900",color:"#FFFFFF",marginTop:10,letterSpacing:-.5},heroSubtitle:{fontSize:12,color:"#DCE6F5",marginTop:5,lineHeight:18},heroStatus:{alignSelf:"flex-start",flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"#243A60",borderRadius:30,paddingHorizontal:10,paddingVertical:7,marginTop:15},heroStatusText:{fontSize:8,color:"#FFFFFF",fontWeight:"900",letterSpacing:.7},heroSymbol:{width:64,height:64,borderRadius:22,backgroundColor:"#FFFFFF14",borderWidth:1,borderColor:"#FFFFFF25",alignItems:"center",justifyContent:"center",marginLeft:12},heroSymbolText:{fontSize:43,color:"#FFC400",fontWeight:"800"},
  statsGrid:{flexDirection:"row",flexWrap:"wrap",gap:12},statCard:{flexGrow:1,flexBasis:"44%",minWidth:125,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:18,padding:16,minHeight:124,shadowColor:"#10264A",shadowOffset:{width:0,height:3},shadowOpacity:0.04,shadowRadius:10,elevation:1},statIcon:{width:38,height:38,borderRadius:13,backgroundColor:"#FFF4C2",alignItems:"center",justifyContent:"center",marginBottom:12},statIconText:{fontSize:19,color:green},statValue:{fontSize:25,fontWeight:"900",color:"#071A3A",letterSpacing:-.7},statLabel:{fontSize:11,color:"#53647F",fontWeight:"700",marginTop:4},
  sectionRow:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",gap:10,marginTop:8},sectionTitleWrap:{flex:1},sectionTitle:{fontSize:19,fontWeight:"900",color:"#071A3A",letterSpacing:-.4},sectionSubtitle:{fontSize:12,color:"#53647F",marginTop:4,lineHeight:18},textAction:{padding:8},textActionText:{fontSize:11,fontWeight:"900",color:green},
  estateGrid:{gap:10},estateCard:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:13,padding:13},estateCardActive:{borderColor:"#FFC400",backgroundColor:"#FFFEF7"},estateBadge:{width:43,height:43,borderRadius:14,backgroundColor:"#F2F5FA",alignItems:"center",justifyContent:"center"},estateBadgeActive:{backgroundColor:"#FFF0A6"},estateBadgeText:{fontSize:25,color:green,fontWeight:"700"},estateCardCopy:{flex:1},estateCardName:{fontSize:13,fontWeight:"900",color:"#071A3A"},estateCardPlace:{fontSize:11,color:"#53647F",marginTop:4,lineHeight:16},estateRole:{fontSize:9,color:"#A57900",fontWeight:"900",letterSpacing:.7,marginTop:6},estateCheck:{fontSize:18,color:"#9AA39B",fontWeight:"800"},estateCheckActive:{color:green},
  noticeCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:16,padding:17},noticeTitle:{fontSize:14,fontWeight:"900",color:"#071A3A",marginBottom:6},bodyText:{fontSize:12,lineHeight:19,color:"#53647F"},helperText:{fontSize:10,color:"#7D8AA3",marginTop:7},inlineLoading:{flexDirection:"row",alignItems:"center",gap:10,padding:15},simpleCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:15,padding:16},simpleCardTitle:{fontSize:13,fontWeight:"900",color:"#071A3A",marginBottom:5},
  announcementCard:{flexDirection:"row",gap:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF2",borderRadius:13,padding:15},announcementMark:{width:36,height:36,borderRadius:12,backgroundColor:"#FFF4C2",alignItems:"center",justifyContent:"center"},announcementMarkText:{color:green,fontSize:17},announcementCopy:{flex:1},announcementTitle:{fontSize:13,fontWeight:"900",color:"#071A3A",marginBottom:5},
  panel:{backgroundColor:"#FFFFFF",borderRadius:16,borderWidth:1,borderColor:"#E5EAF2",padding:18},panelTitle:{fontSize:14,fontWeight:"900",color:"#071A3A",marginTop:22,marginBottom:10},directoryItem:{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF1F6"},directoryIcon:{width:38,height:38,borderRadius:12,backgroundColor:"#F2F5FA",color:green,textAlign:"center",textAlignVertical:"center",fontSize:23},directoryCopy:{flex:1},contentCard:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#EEF1F6"},priorityRow:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:4},priorityChip:{borderWidth:1,borderColor:"#DCE3EF",borderRadius:25,paddingHorizontal:12,paddingVertical:8},priorityChipActive:{borderColor:green,backgroundColor:"#FFF4C2"},priorityChipText:{fontSize:11,color:"#53647F",fontWeight:"700",textTransform:"capitalize"},priorityChipTextActive:{color:green,fontWeight:"900"},issueDot:{width:9,height:9,borderRadius:5,backgroundColor:gold,marginHorizontal:6},
  profileHero:{alignItems:"center",paddingVertical:25,backgroundColor:"#F2F5FA",borderRadius:17,marginTop:15},profileAvatar:{width:68,height:68,borderRadius:24,backgroundColor:gold,alignItems:"center",justifyContent:"center"},profileAvatarText:{fontSize:29,color:"#071A3A",fontWeight:"900"},profileName:{fontSize:19,fontWeight:"900",color:"#071A3A",marginTop:12,marginBottom:5},profilePill:{backgroundColor:"#FFF4C2",borderRadius:20,paddingHorizontal:11,paddingVertical:7,marginTop:12},profilePillText:{fontSize:9,color:"#071A3A",fontWeight:"900",letterSpacing:1},footer:{alignItems:"center",paddingTop:18,paddingBottom:8},footerBrand:{fontSize:9,color:"#53647F",fontWeight:"900",letterSpacing:1.5},footerText:{fontSize:10,color:"#7D8AA3",marginTop:4},
  warningBanner:{marginTop:14,padding:16,borderRadius:14,backgroundColor:"#FFF0F0",borderWidth:1,borderColor:"#F3CACA"},warningBannerTitle:{fontSize:14,fontWeight:"900",color:"#8E2525"},warningBannerText:{fontSize:12,color:"#6F3030",marginTop:5,lineHeight:18},
  bottomNav:{minHeight:68,backgroundColor:"#FFFFFF",borderTopWidth:1,borderTopColor:"#E5EAF2",flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingHorizontal:6,paddingBottom:Platform.OS === "ios" ? 12 : 3},bottomNavItem:{flex:1,minHeight:60,alignItems:"center",justifyContent:"center",gap:3,position:"relative"},bottomNavIcon:{fontSize:21,color:"#7D8AA3"},bottomNavIconActive:{color:green},bottomNavText:{fontSize:9,color:"#53647F",fontWeight:"700"},bottomNavTextActive:{color:green,fontWeight:"900"},bottomNavActiveMark:{position:"absolute",top:0,width:24,height:3,borderRadius:2,backgroundColor:gold},navLabel:{color:"#DCE6F5",fontSize:9,fontWeight:"900",letterSpacing:1.4,marginTop:38,marginBottom:12},navItem:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:12,paddingVertical:13,borderRadius:12,marginBottom:5},navItemActive:{backgroundColor:"#FFFFFF19"},navIcon:{fontSize:20,color:"#DCE6F5",width:22,textAlign:"center"},navIconActive:{color:"#FFC400"},navText:{fontSize:12,color:"#FFFFFF",fontWeight:"700"},navTextActive:{color:"#FFFFFF",fontWeight:"900"},sidebarBottom:{marginTop:"auto",paddingTop:28},sidebarHint:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},sidebarVersion:{fontSize:8,color:"#DCE6F5",fontWeight:"900",letterSpacing:1,marginTop:8}
});