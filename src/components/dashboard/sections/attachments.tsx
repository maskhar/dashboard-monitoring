"use client";

import { ExternalLink, FileText, Link2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatDate, readJson } from "./common";

type EvidenceItem = { id: string; originalName: string; mimeType: string; size: number; scanStatus: string; createdAt: string; uploadedBy: { id: string; name: string } };
type LinkItem = { id: string; label: string; url: string; createdAt: string; createdBy: { id: string; name: string } };

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({ entityType, entityId, setMessage, setError }: { entityType: "PROJECT" | "TASK"; entityId: string; setMessage?: (value: string) => void; setError: (value: string) => void }) {
  const [files, setFiles] = useState<EvidenceItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = `entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`;
      const [fileResult, linkResult] = await Promise.all([
        readJson<{ data: EvidenceItem[] }>(`/api/evidence?${query}`),
        readJson<{ data: LinkItem[] }>(`/api/attachments?${query}`),
      ]);
      setFiles(fileResult.data);
      setLinks(linkResult.data);
    } catch (error) { setError(error instanceof Error ? error.message : "Lampiran gagal dimuat."); }
    finally { setLoading(false); }
  }, [entityId, entityType, setError]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file); form.set("entityType", entityType); form.set("entityId", entityId);
    setUploading(true);
    try { await readJson("/api/evidence", { method: "POST", body: form }); setMessage?.("File lampiran berhasil diunggah."); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Upload lampiran gagal."); }
    finally { setUploading(false); }
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    let parsed: URL;
    try { parsed = new URL(url); }
    catch { setUrlError("Masukkan URL lengkap yang valid."); return; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") { setUrlError("URL harus memakai http atau https."); return; }
    setUrlError(""); setAddingLink(true);
    try {
      await readJson("/api/attachments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType, entityId, label: label.trim(), url: parsed.toString() }) });
      setLabel(""); setUrl(""); setMessage?.("Link lampiran berhasil ditambahkan."); await load();
    } catch (error) { setUrlError(error instanceof Error ? error.message : "Link gagal ditambahkan."); }
    finally { setAddingLink(false); }
  }

  const itemStyle = { padding: 12, border: "1px solid var(--border)", borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 10 } as const;
  return <section className="data-panel attachments-panel" style={{ padding: 16 }} aria-labelledby={`${entityType}-${entityId}-attachments`}>
    <div className="panel-head"><div><p className="eyebrow">LAMPIRAN</p><h2 id={`${entityType}-${entityId}-attachments`}>File desain & bukti</h2></div></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
      <div>
        <label className="secondary-button compact" style={{ display: "inline-flex", cursor: uploading ? "wait" : "pointer" }}><Upload size={16} aria-hidden="true" /> {uploading ? "Mengunggah..." : "Unggah file"}<input type="file" hidden disabled={uploading} accept=".pdf,.png,.jpg,.jpeg,.xlsx" aria-label="Pilih file lampiran" onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; if (file) void upload(file).finally(() => { input.value = ""; }); }} /></label>
        <p className="muted" style={{ marginTop: 8 }}>PDF, PNG, JPG, atau XLSX. Maksimum mengikuti konfigurasi server.</p>
      </div>
      <form className="attachment-link-form" onSubmit={addLink}>
        <label>Nama link<input required maxLength={200} value={label} placeholder="Google Drive desain final" onChange={(event) => setLabel(event.target.value)} /></label>
        <label>URL<input required type="url" maxLength={2048} value={url} aria-invalid={Boolean(urlError)} aria-describedby={urlError ? `${entityType}-${entityId}-url-error` : undefined} placeholder="https://drive.google.com/..." onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} /></label>
        {urlError ? <p id={`${entityType}-${entityId}-url-error`} role="alert" style={{ color: "var(--danger)", margin: 0 }}>{urlError}</p> : null}
        <button className="secondary-button compact" disabled={addingLink || !label.trim() || !url.trim()}><Link2 size={16} aria-hidden="true" /> {addingLink ? "Menambahkan..." : "Tambah link"}</button>
      </form>
    </div>
    <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
      {loading ? <p role="status" className="muted">Memuat lampiran...</p> : null}
      {!loading && files.length === 0 && links.length === 0 ? <p className="muted">Belum ada file atau link lampiran.</p> : null}
      {files.map((file) => <article key={`file-${file.id}`} style={itemStyle}><FileText size={18} aria-hidden="true" /><div style={{ minWidth: 0, flex: 1 }}><a href={`/api/evidence/${file.id}`} style={{ overflowWrap: "anywhere" }}><strong>{file.originalName}</strong></a><small style={{ display: "block" }}>{formatBytes(file.size)} - {file.uploadedBy.name} - {formatDate(file.createdAt, true)}</small><small style={{ display: "block" }}>Status scan: {file.scanStatus}</small></div></article>)}
      {links.map((link) => <article key={`link-${link.id}`} style={itemStyle}><ExternalLink size={18} aria-hidden="true" /><div style={{ minWidth: 0, flex: 1 }}><a href={link.url} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}><strong>{link.label}</strong></a><small style={{ display: "block", overflowWrap: "anywhere" }}>{link.url}</small><small style={{ display: "block" }}>{link.createdBy.name} - {formatDate(link.createdAt, true)}</small></div></article>)}
    </div>
  </section>;
}

