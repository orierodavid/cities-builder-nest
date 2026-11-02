"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type LegalDocument = { id: string; documentType: string; title: string; version: string; content: string; effectiveAt: string | null };
type LegalStatus = { documents: LegalDocument[]; configurationRequired: boolean };

export default function LegalDocumentsPanel() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [configurationRequired, setConfigurationRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_legal_consent_status").then(({ data, error: loadError }) => {
      if (!alive) return;
      if (loadError || !data) setError("Legal documents could not be loaded.");
      else {
        const status = data as LegalStatus;
        setDocuments(status.documents || []);
        setConfigurationRequired(Boolean(status.configurationRequired));
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return <section id="legal-documents" className="legal-settings-card">
    <span className="legal-eyebrow">LEGAL & PRIVACY</span><h2>Terms and privacy documents</h2>
    <p>Read the current versions of the documents associated with your CB Nest account.</p>
    {loading ? <p>Loading documents…</p> : error ? <p className="legal-error">{error}</p> : configurationRequired ? <p className="legal-warning">The platform administrator has not published both required documents yet. Mandatory acceptance will activate when both current versions are published.</p> : documents.map((document) => <details className="legal-settings-document" key={document.id}>
      <summary>{document.title} · version {document.version}</summary><pre>{document.content}</pre>
    </details>)}
  </section>;
}
