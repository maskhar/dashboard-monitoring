"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Calculator, FileText, LayoutDashboard, RefreshCw, Route, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdministrationTab } from "./administration-tab";
import { normalizeWorkspaceSnapshot, WorkspaceApiError, workspaceRequest } from "./api";
import { CostTab } from "./cost-tab";
import { formatWorkspaceDate, statusLabel } from "./format";
import { StatusPill } from "./status-pill";
import { SummaryTab } from "./summary-tab";
import { TeamTab } from "./team-tab";
import { TimelineTab } from "./timeline-tab";
import styles from "./workspace.module.css";
import type { MutationRunner, SaveStatus, WorkspaceRole, WorkspaceSnapshot, WorkspaceViewer } from "./types";

type TabId = "summary" | "cost" | "team" | "timeline" | "administration";
const tabs = [
  { id: "summary" as const, label: "Ringkasan", icon: LayoutDashboard },
  { id: "cost" as const, label: "HPP & Harga Jual", icon: Calculator },
  { id: "team" as const, label: "Tim", icon: UsersRound },
  { id: "timeline" as const, label: "Timeline", icon: Route },
  { id: "administration" as const, label: "Administrasi", icon: FileText },
];

export function ProjectWorkspace({ projectId, viewer, returnToProjects }: { projectId: string; viewer: WorkspaceViewer; returnToProjects: boolean }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadErrorStatus, setLoadErrorStatus] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const savedTimer = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loadWorkspace = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError("");
    setLoadErrorStatus(0);
    try {
      const payload = await workspaceRequest<unknown>(`/api/projects/${projectId}/workspace`);
      setSnapshot(normalizeWorkspaceSnapshot(payload));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Ruang proyek gagal dimuat.");
      setLoadErrorStatus(error instanceof WorkspaceApiError ? error.status : 0);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { const timer = window.setTimeout(() => { void loadWorkspace(); }, 0); return () => window.clearTimeout(timer); }, [loadWorkspace]);
  useEffect(() => () => { if (savedTimer.current) window.clearTimeout(savedTimer.current); }, []);

  const runMutation = useCallback<MutationRunner>(async (request, successMessage) => {
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    setSaveStatus("saving");
    setSaveMessage("Menyimpan perubahan...");
    try {
      await request();
      await loadWorkspace(true);
      setSaveStatus("saved");
      setSaveMessage(successMessage);
      savedTimer.current = window.setTimeout(() => { setSaveStatus("idle"); setSaveMessage(""); }, 4500);
      return { ok: true };
    } catch (error) {
      if (error instanceof WorkspaceApiError && error.status === 409) {
        setSaveStatus("conflict");
        setSaveMessage("Konflik versi terdeteksi. Muat data terbaru sebelum mengulang perubahan.");
        return { ok: false, error: error.message, conflict: true };
      }
      setSaveStatus("error");
      const message = error instanceof Error ? error.message : "Perubahan gagal disimpan.";
      setSaveMessage(message);
      return { ok: false, error: message };
    }
  }, [loadWorkspace]);

  function goBack() {
    if (returnToProjects && window.history.length > 1) router.back();
    else router.push("/");
  }

  async function initializeWorkspace() {
    setLoading(true);
    setLoadError("");
    try {
      await workspaceRequest(`/api/projects/${projectId}/workspace`, { method: "POST" });
      await loadWorkspace();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Workspace gagal diinisialisasi.");
      setLoadErrorStatus(error instanceof WorkspaceApiError ? error.status : 0);
      setLoading(false);
    }
  }

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  const saveLabel = useMemo(() => {
    if (saveStatus === "saving") return "Menyimpan";
    if (saveStatus === "saved") return "Tersimpan";
    if (saveStatus === "conflict") return "Konflik versi";
    if (saveStatus === "error") return "Gagal tersimpan";
    return snapshot ? `Sinkron v${snapshot.workspace.version}` : "Memuat";
  }, [saveStatus, snapshot]);

  if (loading) return <WorkspaceLoading />;
  if (loadError || !snapshot) return <WorkspaceLoadError message={loadError || "Ruang proyek tidak tersedia."} retry={() => void loadWorkspace()} initialize={viewer.role === "ADMIN" && loadErrorStatus === 404 ? () => void initializeWorkspace() : undefined} back={goBack} />;

  const viewerRoles = new Set(snapshot.assignments.filter((assignment) => assignment.active !== false && (assignment.userId === viewer.id || assignment.user?.id === viewer.id)).map((assignment) => assignment.role));
  const canEditProfile = viewer.role === "ADMIN" || viewerRoles.has("PIC") || viewerRoles.has("PROJECT_LEADER");
  const canManagePlan = viewer.role === "ADMIN" || viewerRoles.has("PROJECT_LEADER");
  const canManageActual = canManagePlan || viewerRoles.has("FINANCE_ADMIN");

  return <div className={styles.workspacePage}>
    <header className={styles.topbar}>
      <div className={styles.topbarBrand}><span>UT</span><div><strong>Utero Monitor</strong><small>Project workspace</small></div></div>
      <div className={styles.topbarActions}><div className={`${styles.syncBadge} ${styles[saveStatus]}`} role="status" aria-live="polite"><i aria-hidden="true" />{saveLabel}</div><ThemeToggle /></div>
    </header>

    <main className={styles.workspaceMain}>
      <button type="button" className={styles.backButton} onClick={goBack}><ArrowLeft size={18} aria-hidden="true" />{returnToProjects ? "Kembali ke daftar proyek" : "Kembali ke dashboard"}</button>
      <section className={styles.hero} aria-labelledby="workspace-title">
        <div className={styles.heroCopy}><p>RUANG PROYEK</p><div className={styles.heroTitle}><h1 id="workspace-title" ref={headingRef} tabIndex={-1}>{snapshot.project.code} - {snapshot.project.brand}</h1><StatusPill status={snapshot.workspace.commercialStatus} /></div><span>{snapshot.project.program ?? "Tanpa program"} · {snapshot.project.category ?? "Tanpa kategori"}</span></div>
        <dl className={styles.heroMeta}><div><dt>Fase aktif</dt><dd>{snapshot.workspace.currentPhase} / 6</dd></div><div><dt>Pembaruan</dt><dd>{formatWorkspaceDate(snapshot.workspace.updatedAt, true)}</dd></div><div><dt>Akses</dt><dd>{viewer.role === "ADMIN" ? "Administrator" : "Anggota proyek"}</dd></div></dl>
      </section>

      <section className={styles.phaseRail} aria-label="Fase proyek">
        {snapshot.phases.map((phase) => <article key={phase.id} className={`${styles.phaseRailItem} ${phase.phaseNumber === snapshot.workspace.currentPhase ? styles.phaseActive : ""}`}><span>{phase.phaseNumber}</span><div><small>{phase.code}</small><strong>{phase.name}</strong><em>{statusLabel(phase.status)}</em></div></article>)}
      </section>

      {saveMessage ? <div className={`${styles.saveNotice} ${styles[saveStatus]}`} role={saveStatus === "error" || saveStatus === "conflict" ? "alert" : "status"}><span>{saveMessage}</span>{saveStatus === "conflict" ? <button type="button" onClick={() => void loadWorkspace()}>Muat terbaru</button> : null}</div> : null}

      <nav className={styles.tabs} aria-label="Bagian ruang proyek">
        {tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? styles.tabActive : undefined} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => selectTab(tab.id)}><tab.icon size={17} aria-hidden="true" /><span>{tab.label}</span></button>)}
      </nav>

      <div className={styles.tabContent}>
        {activeTab === "summary" ? <SummaryTab key={`summary:${snapshot.workspace.version}`} projectId={projectId} snapshot={snapshot} runMutation={runMutation} canEditProfile={canEditProfile} viewerRole={viewer.role} viewerRoles={[...viewerRoles] as WorkspaceRole[]} /> : null}
        {activeTab === "cost" ? <CostTab key={`cost:${snapshot.workspace.version}`} projectId={projectId} snapshot={snapshot} runMutation={runMutation} canEditCommercial={viewer.role === "ADMIN"} canManagePlan={canManagePlan} canManageActual={canManageActual} /> : null}
        {activeTab === "team" ? <TeamTab key={`team:${snapshot.workspace.version}`} projectId={projectId} snapshot={snapshot} runMutation={runMutation} editable={viewer.role === "ADMIN"} /> : null}
        {activeTab === "timeline" ? <TimelineTab key={`timeline:${snapshot.workspace.version}`} projectId={projectId} snapshot={snapshot} runMutation={runMutation} viewerId={viewer.id} canManageAll={viewer.role === "ADMIN" || viewerRoles.has("PROJECT_LEADER")} /> : null}
        {activeTab === "administration" ? <AdministrationTab key={`administration:${snapshot.workspace.version}`} projectId={projectId} snapshot={snapshot} runMutation={runMutation} viewerRole={viewer.role} viewerRoles={[...viewerRoles] as WorkspaceRole[]} /> : null}
      </div>
    </main>
  </div>;
}

export function WorkspaceLoading() {
  return <div className={styles.routeState} role="status"><div className={styles.loadingMark}><RefreshCw size={22} aria-hidden="true" /></div><h1>Memuat ruang proyek</h1><p>Mengambil snapshot terbaru dari PostgreSQL...</p><div className={styles.skeletonGrid}>{[1, 2, 3, 4].map((item) => <i key={item} />)}</div></div>;
}

function WorkspaceLoadError({ message, retry, initialize, back }: { message: string; retry: () => void; initialize?: () => void; back: () => void }) {
  return <div className={styles.routeState} role="alert"><div className={`${styles.loadingMark} ${styles.errorMark}`}>!</div><h1>Ruang proyek belum dapat dibuka</h1><p>{message}</p><div className={styles.stateActions}><button type="button" className={styles.secondaryButton} onClick={back}><ArrowLeft size={17} aria-hidden="true" />Kembali</button>{initialize ? <button type="button" className={styles.primaryButton} onClick={initialize}>Aktifkan Ruang Proyek</button> : <button type="button" className={styles.primaryButton} onClick={retry}><RefreshCw size={17} aria-hidden="true" />Coba lagi</button>}</div></div>;
}
