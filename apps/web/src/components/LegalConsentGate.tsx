"use client";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type LegalDocument = { id: string; documentType: "terms" | "privacy"; title: string; version: string; content: string; effectiveAt: string | null };
type LegalStatus = { requiresAcceptance: boolean; configurationRequired: boolean; accepted: boolean; documents: LegalDocument[]; pendingDocumentIds: string[] };

export default function LegalConsentGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [readToEnd, setReadToEnd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setChecking(true);
    setError("");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setError("Your sign-in session could not be verified. Please sign in again.");
      setStatus(null); setSessionReady(true); setChecking(false); return;
    }
    if (!sessionData.session) {
      setStatus(null); setReadToEnd([]); setSessionReady(true); setChecking(false); return;
    }
    const { data, error: statusError } = await supabase.rpc("get_legal_consent_status");
    if (statusError || !data) {
      setError("Legal acceptance could not be verified. Refresh the page or sign in again.");
      setStatus(null);
    } else {
      setStatus(data as LegalStatus);
      setReadToEnd([]);
    }
    setSessionReady(true);
    setChecking(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async (showLoading = true) => {
      if (showLoading) setChecking(true);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!alive) return;
      if (sessionError) {
        setStatus(null); setError("Your sign-in session could not be verified. Please sign in again.");
        setSessionReady(true); if (showLoading) setChecking(false); return;
      }
      if (!sessionData.session) {
        setStatus(null); setReadToEnd([]); setError(""); setSessionReady(true);
        if (showLoading) setChecking(false); return;
      }
      const { data, error: statusError } = await supabase.rpc("get_legal_consent_status");
      if (!alive) return;
      if (statusError || !data) {
        setStatus(null); setError("Legal acceptance could not be verified. Refresh the page or sign in again.");
      } else {
        setStatus(data as LegalStatus); setReadToEnd([]); setError("");
      }
      setSessionReady(true);
      if (showLoading) setChecking(false);
    };
    void check(true);
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
        window.setTimeout(() => { if (alive) void check(true); }, 0);
      }
    });
    const onFocus = () => { if (alive) void check(false); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; authListener.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); };
  }, []);

  async function accept() {
    if (!status || status.documents.length < 2 || readToEnd.length !== status.documents.length || busy) return;
    setBusy(true); setError("");
    const { error: acceptError } = await supabase.rpc("accept_legal_documents", {
      p_document_ids: status.documents.map((document) => document.id), p_source: "web",
    });
    if (acceptError) {
      setError("We couldn't save your agreement. Please check your connection and try again.");
      setBusy(false); return;
    }
    await refresh();
    setBusy(false);
  }

  if (!sessionReady || checking) return <main className="legal-gate legal-gate-loading" role="status" aria-label="Loading"><span className="loading-spinner"/></main>;
  if (!status && error) return <main className="legal-gate"><section className="legal-gate-card"><h1>Verification required</h1><p>{error}</p><div className="legal-gate-actions"><button onClick={() => void refresh()}>Retry</button><button className="legal-secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></section></main>;
  if (status?.requiresAcceptance) {
    return <main className="legal-gate legal-gate-modal" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <section className="legal-gate-card">
        <span className="legal-eyebrow">ACTION REQUIRED</span>
        <h1 id="legal-consent-title">Welcome to CB Nest</h1>
        <p>Please read the current Terms and Conditions and Privacy Policy. Scroll to the end of each document before agreeing. You must accept to continue using CB Nest.</p>
        <div className="legal-documents">{status.documents.map((document) => <article className="legal-document" key={document.id}>
          <div className="legal-document-heading">
            <div><h2>{document.title}</h2><small>Version {document.version}</small></div>
            <strong className={readToEnd.includes(document.id) ? "legal-read-status" : "legal-scroll-status"}>{readToEnd.includes(document.id) ? "READ ✓" : "SCROLL TO END"}</strong>
          </div>
          <div id={"legal-content-" + document.id} className="legal-document-scroll" tabIndex={0} aria-label={document.title + " content"}
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.scrollTop + element.clientHeight >= element.scrollHeight - 12) {
                setReadToEnd((current) => current.includes(document.id) ? current : [...current, document.id]);
              }
            }}>
            {document.content}
            <p className="legal-document-end">End of {document.title}</p>
          </div>
        </article>)}</div>
        {error && <p className="legal-error">{error}</p>}
        <div className="legal-gate-actions">
          <button disabled={busy || readToEnd.length !== status.documents.length} onClick={() => void accept()}>{busy ? "Saving agreement…" : "I Agree"}</button>
          <button className="legal-secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
        <small className="legal-note">{readToEnd.length} of {status.documents.length} documents read. Your agreement is recorded against the exact document versions and acceptance date.</small>
      </section>
    </main>;
  }
  return <>{children}</>;
}
