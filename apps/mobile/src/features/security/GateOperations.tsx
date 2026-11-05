import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { getApiBaseUrl } from "../..//lib/api-url";
import SecurityGateScreen from "../../../components/SecurityGateScreen";
import VisitorDetails, { type Visitor } from "../../../components/VisitorDetails";

type Estate = { id: string; name: string; membershipRole?: string | null };
type GateVisitor = { visitor: { name: string; phone: string | null }; host: { name: string | null }; pass: { id: string; validFrom: string; validUntil: string; status: string }; availabilityError: string | null };
type Visit = { id: string; checked_in_at: string; visitor_passes?: { visitor_name?: string; visitor_phone?: string } | null };
type Props = { initialScannerOpen?: boolean };
const apiBase = getApiBaseUrl();

export default function GateOperations({ initialScannerOpen = false }: Props) {
  const router = useRouter();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [visitorCode, setVisitorCode] = useState("");
  const [visitor, setVisitor] = useState<GateVisitor | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [visitsError, setVisitsError] = useState("");

  const request = useCallback(async (path: string, method: "GET" | "POST", body?: unknown) => {
    if (!apiBase) throw new Error("Security services are not configured. Set EXPO_PUBLIC_API_URL.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    const response = await fetch(apiBase + path, {
      method, headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as Record<string, any>;
    if (!response.ok) {
      const errors: Record<string, string> = {
        security_membership_required: "Your account does not have active Security access to this estate.",
        visitor_pass_not_found_or_invalid: "No visitor pass matches this code.",
        visitor_pass_not_active: "This visitor pass is no longer active or valid.",
        visitor_pass_already_checked_in: "This visitor has already been checked in.",
        estate_subscription_inactive: "This estate is currently unavailable.",
      };
      throw new Error(errors[result.error] || result.message || "The security request could not be completed.");
    }
    return result;
  }, []);

  const loadVisits = useCallback(async (estateId: string) => {
    try {
      const result = await request("/v1/estates/" + encodeURIComponent(estateId) + "/gate/visits", "GET");
      setVisits((result.visits || []) as Visit[]);
      setVisitsError("");
    } catch (error) {
      setVisitsError(error instanceof Error ? error.message : "Active visits could not be loaded.");
    }
  }, [request]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await request("/v1/estates", "GET");
        const selected = ((result.estates || []) as Estate[]).find(item => (item.membershipRole || "").toLowerCase().replace(/[- ]/g, "_") === "security");
        if (!selected) throw new Error("No active Security membership was found for this account.");
        if (!active) return;
        setEstate(selected);
        await loadVisits(selected.id);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Security services could not be loaded.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [loadVisits, request]);

  const lookup = async (code: string) => {
    if (!estate || code.length !== 6) return;
    setBusy(true); setMessage(""); setVisitor(null); setVisitorCode(code);
    try {
      const result = await request("/v1/estates/" + encodeURIComponent(estate.id) + "/gate/visitor-lookup", "POST", { accessCode: code });
      setVisitor(result as GateVisitor);
      if (result.availabilityError) setMessage("Pass found, but it is not currently valid: " + result.availabilityError);
      else setMessage("Visitor pass found. Review the details before granting entry.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Visitor verification failed.");
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!estate || !visitor) return;
    setBusy(true); setMessage("");
    try {
      await request("/v1/estates/" + encodeURIComponent(estate.id) + "/gate/check-in", "POST", { accessCode: visitorCode });
      setMessage("Entry approved. Visitor checked in successfully.");
      setVisitor(null); setVisitorCode("");
      await loadVisits(estate.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Visitor check-in failed."); }
    finally { setBusy(false); }
  };

  const deny = async () => {
    if (!estate || !visitor) return;
    setBusy(true); setMessage("");
    try {
      await request("/v1/estates/" + encodeURIComponent(estate.id) + "/gate/visitor-passes/" + encodeURIComponent(visitor.pass.id) + "/deny", "POST", { reason: "Denied by security at gate." });
      setMessage("Entry denied. The visitor pass has been revoked.");
      setVisitor(null); setVisitorCode("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Visitor denial failed."); }
    finally { setBusy(false); }
  };

  const checkout = async (visitId: string) => {
    if (!estate) return;
    setBusy(true);
    try {
      await request("/v1/estates/" + encodeURIComponent(estate.id) + "/gate/visits/" + encodeURIComponent(visitId) + "/check-out", "POST");
      await loadVisits(estate.id);
      setMessage("Visitor checked out successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Visitor checkout failed."); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#D4A84B" size="large" /></View>;
  if (!estate) return <View style={{ flex: 1, backgroundColor: "#080808", padding: 24, justifyContent: "center" }}><Text style={{ color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginBottom: 8 }}>Security access unavailable</Text><Text style={{ color: "#B9B9B9", lineHeight: 20 }}>{message || "An active Security estate membership is required."}</Text></View>;
  if (visitor) {
    const validFrom = new Date(visitor.pass.validFrom);
    const validUntil = new Date(visitor.pass.validUntil);
    const valid = !visitor.availabilityError
      && visitor.pass.status === "active"
      && Number.isFinite(validFrom.getTime())
      && Number.isFinite(validUntil.getTime())
      && validFrom.getTime() <= Date.now()
      && Date.now() <= validUntil.getTime();
    const details: Visitor = {
      name: visitor.visitor.name,
      category: "Personal Visitor",
      valid,
      accessCode: visitorCode,
      host: visitor.host.name || "Not available",
      property: estate.name,
      date: Number.isFinite(validFrom.getTime()) ? validFrom.toLocaleDateString() : "Not available",
      time: Number.isFinite(validFrom.getTime()) && Number.isFinite(validUntil.getTime())
        ? validFrom.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " – " + validUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "Not available",
      accessType: "Visitor pass",
    };
    return <VisitorDetails
      visitor={details}
      busy={busy}
      onBack={() => { setVisitor(null); setVisitorCode(""); setMessage(""); }}
      onApprove={approve}
      onDeny={deny}
    />;
  }

  return <View style={{ flex: 1, backgroundColor: "#080808", paddingTop: 12 }}>
    <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text onPress={() => router.back()} style={{ color: "#D4A84B", fontWeight: "700" }}>‹ Back</Text>
      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>CB NEST · SECURITY</Text>
      <Text onPress={() => router.replace("/" as never)} style={{ color: "#D4A84B", fontWeight: "700" }}>Home</Text>
    </View>
    <SecurityGateScreen
      estateName={estate.name}
      visitorCode={visitorCode}
      visitor={null}
      busy={busy}
      message={message}
      visits={visits}
      visitsLoading={false}
      visitsError={visitsError}
      onCodeChange={setVisitorCode}
      onLookup={lookup}
      onApprove={approve}
      onDeny={deny}
      onRefreshVisits={() => void loadVisits(estate.id)}
      onCheckout={checkout}
      onClearVisitor={() => { setVisitor(null); setVisitorCode(""); }}
      initialScannerOpen={initialScannerOpen}
    />
  </View>;
}
