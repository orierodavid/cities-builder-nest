import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { getApiBaseUrl } from "../../lib/api-url";
import { readDashboardCache, writeDashboardCache } from "../../lib/dashboard-cache";
import { subscribeConnectionRestored } from "../../lib/connection-events";

export type SecurityEstate = { id: string; name: string; membershipRole?: string | null };
type Value = {
  session: Session | null; accessToken: string | null; selectedEstateId: string | null;
  estate: SecurityEstate | null; apiUrl: string; loading: boolean; error: string; refresh: () => Promise<void>;
};
const Context = createContext<Value | null>(null);

export function SecurityProvider({ children }: PropsWithChildren) {
  const apiUrl = getApiBaseUrl();
  const [session, setSession] = useState<Session | null>(null);
  const [estate, setEstate] = useState<SecurityEstate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (activeSession: Session | null) => {
    setSession(activeSession);
    if (!activeSession?.access_token) {
      setEstate(null); setError("Your session has expired. Sign in again."); setLoading(false); return;
    }
    if (!apiUrl) {
      setEstate(null); setError("Security services are not configured."); setLoading(false); return;
    }
    const cached = await readDashboardCache<{ estate?: SecurityEstate }>("security", activeSession.user.id);
    if (cached?.estate?.id) { setEstate(cached.estate); setLoading(false); }
    else setLoading(true);
    setError("");
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(apiUrl + "/v1/estates", { headers: { Authorization: "Bearer " + activeSession.access_token, Accept: "application/json" }, signal: controller.signal });
      const result = await response.json() as { estates?: SecurityEstate[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Estate access could not be loaded.");
      const selected = (result.estates || []).find((item) => (item.membershipRole || "").trim().toLowerCase().replace(/[- ]/g, "_") === "security");
      if (!selected) throw new Error("No active Security membership was found for this account.");
      setEstate(selected);
      await writeDashboardCache("security", activeSession.user.id, { estate: selected });
    } catch (cause) {
      if (!cached?.estate?.id) setEstate(null);
      setError(cause instanceof Error && cause.name === "AbortError"
        ? "Connection is taking longer than expected. Check your internet connection and try again."
        : cause instanceof Error ? cause.message : "Security services could not be loaded.");
    } finally { clearTimeout(requestTimeout); setLoading(false); }
  }, [apiUrl]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) { setError(sessionError.message); setLoading(false); return; }
      void load(data.session);
    }).catch((cause) => {
      if (active) { setError(cause instanceof Error ? cause.message : "Your session could not be restored."); setLoading(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (active) void load(nextSession); });
    const unsubscribe = subscribeConnectionRestored(() => {
      if (active) void supabase.auth.getSession().then(({ data: sessionData }) => load(sessionData.session));
    });
    return () => { active = false; data.subscription.unsubscribe(); unsubscribe(); };
  }, [load]);

  const value = useMemo<Value>(() => ({
    session, accessToken: session?.access_token || null, selectedEstateId: estate?.id || null,
    estate, apiUrl, loading, error,
    refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session); },
  }), [session, estate, apiUrl, loading, error, load]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSecurityContext() {
  const value = useContext(Context);
  if (!value) throw new Error("useSecurityContext must be used inside SecurityProvider.");
  return value;
}
