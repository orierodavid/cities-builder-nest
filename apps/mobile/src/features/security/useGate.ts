import { useCallback, useState } from "react";
import { useSecurityContext } from "./SecurityContext";
import { visitorRequest, type GateVisit } from "./visitor-api";

export type GateVisitorLookup = {
  visitor: { name: string; phone: string | null }; host: { name: string | null };
  pass: { id: string; validFrom: string; validUntil: string; status: string };
  availabilityError: string | null;
};

export function useGate() {
  const { accessToken, selectedEstateId, apiUrl } = useSecurityContext();
  const [visitorCode, setVisitorCode] = useState("");
  const [gateVisitor, setGateVisitor] = useState<GateVisitorLookup | null>(null);
  const [gateVisits, setGateVisits] = useState<GateVisit[]>([]);
  const [gateVisitsLoading, setGateVisitsLoading] = useState(false);
  const [gateVisitsError, setGateVisitsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const request = useCallback((path: string, method: string, body?: unknown) =>
    visitorRequest({ accessToken, estateId: selectedEstateId, apiUrl }, path, method, body),
  [accessToken, selectedEstateId, apiUrl]);

  const loadGateVisits = useCallback(async () => {
    setGateVisitsLoading(true); setGateVisitsError("");
    try { const result = await request("/gate/visits", "GET"); setGateVisits(result.visits || []); }
    catch (cause) { setGateVisitsError(cause instanceof Error ? cause.message : "Could not load active visits."); }
    finally { setGateVisitsLoading(false); }
  }, [request]);

  const lookupGateVisitor = useCallback(async (code = visitorCode) => {
    const accessCode = code.trim();
    if (!/^\d{6}$/.test(accessCode)) { setMessage("Enter the six-digit visitor access code."); return; }
    setVisitorCode(accessCode); setBusy(true); setMessage(""); setGateVisitor(null);
    try {
      const result = await request("/gate/visitor-lookup", "POST", { accessCode });
      setGateVisitor(result as unknown as GateVisitorLookup);
      setMessage("Visitor pass found. Review the details before deciding.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Visitor lookup failed."); }
    finally { setBusy(false); }
  }, [request, visitorCode]);

  const approveGateVisitor = useCallback(async () => {
    if (!gateVisitor || gateVisitor.availabilityError) return;
    setBusy(true); setMessage("");
    try {
      await request("/gate/check-in", "POST", { accessCode: visitorCode.trim() });
      setVisitorCode(""); setGateVisitor(null); setMessage("Entry approved. Visitor checked in."); await loadGateVisits();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Check-in failed."); }
    finally { setBusy(false); }
  }, [gateVisitor, visitorCode, request, loadGateVisits]);

  const denyGateVisitor = useCallback(async () => {
    if (!gateVisitor) return;
    setBusy(true); setMessage("");
    try {
      await request("/gate/visitor-passes/" + encodeURIComponent(gateVisitor.pass.id) + "/deny", "POST", { reason: "Denied at security gate" });
      setVisitorCode(""); setGateVisitor(null); setMessage("Entry denied. Visitor pass revoked.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not deny entry."); }
    finally { setBusy(false); }
  }, [gateVisitor, request]);

  const checkOutVisitor = useCallback(async (visitId: string) => {
    setBusy(true); setMessage("");
    try {
      await request("/gate/visits/" + encodeURIComponent(visitId) + "/check-out", "POST");
      setMessage("Visitor checked out."); await loadGateVisits();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Check-out failed."); }
    finally { setBusy(false); }
  }, [request, loadGateVisits]);

  const clearGateVisitor = useCallback(() => { setGateVisitor(null); setVisitorCode(""); setMessage(""); }, []);
  return {
    visitorCode, setVisitorCode, gateVisitor, gateVisits, gateVisitsLoading, gateVisitsError,
    busy, message, setMessage, loadGateVisits, lookupGateVisitor, approveGateVisitor,
    denyGateVisitor, checkOutVisitor, clearGateVisitor,
  };
}
