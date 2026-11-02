"use client";
import { FormEvent, useEffect, useState } from "react";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type LegalDocument = { id: string; document_type: "terms" | "privacy"; title: string; version: string; content: string; status: "draft" | "published" | "archived"; published_at: string | null };

export default function LegalDocumentsPage() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [type, setType] = useState<"terms" | "privacy">("terms");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [content, setContent] = useState("");
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.rpc("list_legal_documents_admin");
    if (loadError) setError("Legal documents could not be loaded. Confirm you are signed in as a Super Admin.");
    else setDocuments((data || []) as LegalDocument[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const { error: saveError } = await supabase.rpc("save_legal_document", {
      p_document_type: type, p_title: title.trim(), p_version: version.trim(),
      p_content: content, p_publish: publish,
    });
    if (saveError) setError(saveError.message.includes("published_legal_versions_are_immutable") ? "Published versions cannot be edited. Create a new version instead." : saveError.message);
    else {
      setSuccess(publish ? "Document version published. Users will be asked to accept the current versions." : "Draft saved. Review it before publishing.");
      setTitle(""); setContent(""); setVersion("1.0"); setPublish(false);
      await load();
    }
    setSaving(false);
  }

  return <PortalFrame title="Legal Documents" description="Publish versioned Terms and Conditions and Privacy Policy documents.">
    <div className="legal-admin-layout">
      <section className="panel legal-admin-card">
        <span className="legal-eyebrow">DOCUMENT VERSIONING</span><h2>Create a legal document version</h2>
        <p>Use text approved by your legal adviser. Publishing a new version archives the previous one and requires affected users to accept the new version.</p>
        <form onSubmit={save} className="legal-admin-form">
          <label>Document type<select value={type} onChange={(event) => setType(event.target.value as "terms" | "privacy")}><option value="terms">Terms and Conditions</option><option value="privacy">Privacy Policy</option></select></label>
          <label>Document title<input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. CB Nest Terms and Conditions"/></label>
          <label>Version<input required maxLength={40} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0"/></label>
          <label>Full document text<textarea required minLength={500} maxLength={100000} rows={16} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste the complete approved document text here."/></label>
          <label className="legal-publish-check"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)}/> Publish this version immediately</label>
          {error && <p className="legal-error">{error}</p>}{success && <p className="legal-success">{success}</p>}
          <button className="primary-action" disabled={saving}>{saving ? "Saving…" : publish ? "Publish version" : "Save draft"}</button>
        </form>
      </section>
      <section className="panel legal-admin-card">
        <h2>Document history</h2><p>Published versions are immutable and retained for audit purposes.</p>
        {loading ? <p>Loading document history…</p> : documents.length ? <div className="legal-admin-history">{documents.map((document) => <article key={document.id}>
          <div><strong>{document.title}</strong><small>{document.document_type.toUpperCase()} · v{document.version}</small></div>
          <span className={"legal-status legal-status-" + document.status}>{document.status}</span>
          {document.status === "draft" && <button className="cookie-text" onClick={() => { setType(document.document_type); setTitle(document.title); setVersion(document.version); setContent(document.content); setPublish(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit draft</button>}
        </article>)}</div> : <p className="legal-warning">No legal documents have been created yet. Add and publish both required document types to activate mandatory acceptance.</p>}
      </section>
    </div>
  </PortalFrame>;
}
