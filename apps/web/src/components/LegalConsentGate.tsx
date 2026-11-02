"use client";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type LegalDocument = { id: string; documentType: "terms" | "privacy"; title: string; version: string; content: string; effectiveAt: string | null };
type LegalStatus = { requiresAcceptance: boolean; configurationRequired: boolean; accepted: boolean; documents: LegalDocument[]; pendingDocumentIds: string[] };

export default function LegalConsentGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setChecking(true);
    setError("");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setError("Your sign-in session could not be verified. Please sign in again.");
      setStatus(null);
      setSessionReady(true);
      setChecking(false);
      return;
    }
    if (!sessionData.session) {
      setStatus(null);
      setSessionReady(true);
      setChecking(false);
      return;
    }
    const { data, error: statusError } = await supabase.rpc("get_legal_consent_status");
    if (statusError || !data) {
      setError("Legal acceptance could not be verified. Refresh the page or sign in again.");
      setStatus(null);
    } else {
      const next = data as LegalStatus;
      setStatus(next);
      setChecked([]);
    }
    setSessionReady(true);
    setChecking(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!alive) return;
      if (sessionError) {
        setStatus(null);
        setError("Your sign-in session could not be verified. Please sign in again.");
        setSessionReady(true);
        setChecking(false);
        return;
      }
      if (!sessionData.session) {
        setStatus(null);
        setError("");
        setSessionReady(true);
        setChecking(false);
        return;
      }
      setChecking(true);
      const { data, error: statusError } = await supabase.rpc("get_legal_consent_status");
      if (!alive) return;
      if (statusError || !data) {
        setStatus(null);
        setError("Legal acceptance could not be verified. Refresh the page or sign in again.");
      } else {
        setStatus(data as LegalStatus);
        setError("");
      }
      setSessionReady(true);
      setChecking(false);
    };
    void check();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { if (alive) void check(); }, 0);
    });
    const onFocus = () => { if (alive) void check(); };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function accept() {
    if (!status || status.documents.length < 2 || checked.length !== status.documents.length) return;
    setBusy(true);
    setError("");
    const { error: acceptError } = await supabase.rpc("accept_legal_documents", {
      p_document_ids: status.documents.map((document) => document.id),
      p_source: "web",
    });
    if (acceptError) {
      setError("Your acceptance could not be saved. Please try again.");
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  }

  if (!sessionReady || checking) return <main className="legal-gate"><section className="legal-gate-card"><p>Verifying your account and current legal documents…</p></section></main>;
  if (!status && error) return <main className="legal-gate"><section className="legal-gate-card"><h1>Verification required</h1><p>{error}</p><div className="legal-gate-actions"><button onClick={() => void refresh()}>Retry</button><button className="legal-secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></section></main>;
  if (status?.requiresAcceptance) {
    return <main className="legal-gate"><section className="legal-gate-card">
      <span className="legal-eyebrow">ACTION REQUIRED</span><h1>Review and accept our legal documents</h1>
      <p>You must read and accept the current Terms and Conditions and Privacy Policy before continuing to the management portal.</p>
      <div className="legal-documents">{status.documents.map((document) => <article className="legal-document" key={document.id}>
        <div className="legal-document-heading"><div><h2>{document.title}</h2><small>Version {document.version}</small></div><a href={"#legal-content-" + document.id}>Read below</a></div>
        <pre id={"legal-content-" + document.id}>{document.content}</pre>
        <label className="legal-check"><input type="checkbox" checked={checked.includes(document.id)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))}/><span>I have read and agree to the {document.documentType === "terms" ? "Terms and Conditions" : "Privacy Policy"}.</span></label>
      </article>)}</div>
      {error && <p className="legal-error">{error}</p>}
      <div className="legal-gate-actions"><button disabled={busy || checked.length !== status.documents.length} onClick={() => void accept()}>{busy ? "Saving acceptance…" : "Accept and continue"}</button><button className="legal-secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></div>
      <small className="legal-note">Your acceptance is recorded against these exact document versions and cannot be edited or deleted from your account.</small>
    </section></main>;
  }
  return <>{children}</>;
}
