"use client";

import { useMemo, useState } from "react";
import { Calculator, CirclePlus, LockKeyhole, Save, Trash2, WalletCards, X } from "lucide-react";
import { jsonRequest, workspaceRequest } from "./api";
import { formatCurrency, formatPercent, multiplyDecimalStrings } from "./format";
import styles from "./workspace.module.css";
import type { MutationRunner, WorkspaceCostItem, WorkspaceSnapshot } from "./types";

type Props = { projectId: string; snapshot: WorkspaceSnapshot; runMutation: MutationRunner; canEditCommercial: boolean; canManagePlan: boolean; canManageActual: boolean };
type CostDraft = { category: string; description: string; quantity: string; unit: string; unitPrice: string; actualAmount: string };
type CommercialDraft = {
  contractValue: string; targetMarginPct: string; retentionPct: string; overheadPct: string; contingencyPct: string;
  vatEnabled: boolean; vatPct: string; withholdingEnabled: boolean; withholdingPct: string;
};

const categories = ["FRAME_PANEL_MATERIAL", "FINISHING", "ELECTRICAL", "PRINTING_BRANDING", "SUPPORTING_MATERIAL", "LABOR", "OPERATIONS", "SHIPPING"];
const categoryLabels: Record<string, string> = { FRAME_PANEL_MATERIAL: "Material frame & panel", FINISHING: "Finishing", ELECTRICAL: "Elektrikal", PRINTING_BRANDING: "Printing & branding", SUPPORTING_MATERIAL: "Material pendukung", LABOR: "Tenaga kerja", OPERATIONS: "Operasional", SHIPPING: "Pengiriman" };
const emptyCost: CostDraft = { category: "FRAME_PANEL_MATERIAL", description: "", quantity: "1", unit: "unit", unitPrice: "0", actualAmount: "" };

function draftFromItem(item: WorkspaceCostItem): CostDraft {
  return { category: item.category, description: item.description, quantity: String(item.quantity), unit: item.unit, unitPrice: String(item.unitPrice), actualAmount: item.actualAmount == null ? "" : String(item.actualAmount) };
}

export function CostTab({ projectId, snapshot, runMutation, canEditCommercial, canManagePlan, canManageActual }: Props) {
  const { workspace, metrics, costItems } = snapshot;
  const commercialLocked = workspace.commercialStatus !== "DRAFT";
  const commercialEditable = canEditCommercial && !commercialLocked;
  const planEditable = canManagePlan && !commercialLocked;
  const actualEditable = canManageActual && !commercialLocked;
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<CostDraft>(emptyCost);
  const [commercial, setCommercial] = useState<CommercialDraft>({
    contractValue: String(workspace.contractValue ?? "0"), targetMarginPct: String(workspace.targetMarginPct ?? "0"), retentionPct: String(workspace.retentionPct ?? "0"),
    overheadPct: String(workspace.overheadPct ?? "0"), contingencyPct: String(workspace.contingencyPct ?? "0"), vatEnabled: workspace.vatEnabled ?? false,
    vatPct: String(workspace.vatPct ?? 11), withholdingEnabled: workspace.withholdingEnabled ?? false, withholdingPct: String(workspace.withholdingPct ?? 2),
  });

  const commercialDirty = useMemo(() => JSON.stringify(commercial) !== JSON.stringify({
    contractValue: String(workspace.contractValue ?? ""), targetMarginPct: String(workspace.targetMarginPct ?? ""), retentionPct: String(workspace.retentionPct ?? ""),
    overheadPct: String(workspace.overheadPct ?? ""), contingencyPct: String(workspace.contingencyPct ?? ""), vatEnabled: workspace.vatEnabled ?? false,
    vatPct: String(workspace.vatPct ?? 11), withholdingEnabled: workspace.withholdingEnabled ?? false, withholdingPct: String(workspace.withholdingPct ?? 2),
  }), [commercial, workspace]);

  async function saveCommercial(event: React.FormEvent) {
    event.preventDefault();
    await runMutation(() => workspaceRequest(`/api/projects/${projectId}/workspace`, jsonRequest("PATCH", {
      ...commercial,
      contractValue: commercial.contractValue || "0",
      targetMarginPct: commercial.targetMarginPct || "0",
      retentionPct: commercial.retentionPct || "0",
      overheadPct: commercial.overheadPct || "0",
      contingencyPct: commercial.contingencyPct || "0",
      vatPct: commercial.vatPct || "0",
      withholdingPct: commercial.withholdingPct || "0",
      version: workspace.version,
    })), "Parameter komersial tersimpan.");
  }

  async function createCostItem(event: React.FormEvent) {
    event.preventDefault();
    await runMutation(() => workspaceRequest(`/api/projects/${projectId}/cost-items`, jsonRequest("POST", { ...newItem, actualAmount: newItem.actualAmount || null })), "Item biaya ditambahkan.");
    setNewItem(emptyCost);
    setShowAdd(false);
  }

  if (!snapshot.financialsVisible) return <section className={`${styles.panel} ${styles.restrictionPanel}`} role="note"><LockKeyhole size={28} aria-hidden="true" /><h2>Data finansial dibatasi</h2><p>HPP, harga jual, margin, dan item biaya hanya tersedia untuk PIC, Project Leader, Finance & Admin, atau Administrator.</p></section>;

  return <div className={styles.tabStack}>
    {commercialLocked ? <div className={styles.lockedNotice} role="status"><LockKeyhole size={18} aria-hidden="true" /><div><strong>Data komersial dikunci</strong><span>Status {workspace.commercialStatus.toLowerCase()} menonaktifkan perubahan parameter dan item biaya.</span></div></div> : null}
    <section className={styles.metricGrid} aria-label="Ringkasan HPP dan harga jual">
      <FinanceMetric label="HPP rencana" value={formatCurrency(metrics.plannedHpp, workspace.currency ?? "IDR")} note={`${costItems.length} item biaya`} />
      <FinanceMetric label="Biaya aktual" value={formatCurrency(metrics.actualHpp, workspace.currency ?? "IDR")} note="Nilai yang sudah dilaporkan" />
      <FinanceMetric label="Harga jual minimum" value={formatCurrency(metrics.minimumPrice, workspace.currency ?? "IDR")} note={`Margin target ${formatPercent(workspace.targetMarginPct)}`} />
      <FinanceMetric label="Margin rencana" value={formatCurrency(metrics.plannedMargin, workspace.currency ?? "IDR")} note={formatPercent(metrics.plannedMarginPct)} />
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span>KOMERSIAL</span><h2>Parameter harga jual</h2></div><small>Kalkulasi akhir berasal dari server.</small></div>
      <form className={styles.commercialGrid} onSubmit={saveCommercial}>
        <NumberField disabled={!commercialEditable} label="Nilai kontrak" value={commercial.contractValue} onChange={(value) => setCommercial((draft) => ({ ...draft, contractValue: value }))} />
        <NumberField disabled={!commercialEditable} label="Target margin (%)" value={commercial.targetMarginPct} onChange={(value) => setCommercial((draft) => ({ ...draft, targetMarginPct: value }))} max="100" />
        <NumberField disabled={!commercialEditable} label="Retensi (%)" value={commercial.retentionPct} onChange={(value) => setCommercial((draft) => ({ ...draft, retentionPct: value }))} max="100" />
        <NumberField disabled={!commercialEditable} label="Overhead (%)" value={commercial.overheadPct} onChange={(value) => setCommercial((draft) => ({ ...draft, overheadPct: value }))} max="100" />
        <NumberField disabled={!commercialEditable} label="Kontinjensi (%)" value={commercial.contingencyPct} onChange={(value) => setCommercial((draft) => ({ ...draft, contingencyPct: value }))} max="100" />
        <label className={styles.toggleField}><span><input disabled={!commercialEditable} type="checkbox" checked={commercial.vatEnabled} onChange={(event) => setCommercial((draft) => ({ ...draft, vatEnabled: event.target.checked }))} /> PPN aktif</span><input aria-label="Persentase PPN" type="number" min="0" max="100" step="0.01" disabled={!commercialEditable || !commercial.vatEnabled} value={commercial.vatPct} onChange={(event) => setCommercial((draft) => ({ ...draft, vatPct: event.target.value }))} /></label>
        <label className={styles.toggleField}><span><input disabled={!commercialEditable} type="checkbox" checked={commercial.withholdingEnabled} onChange={(event) => setCommercial((draft) => ({ ...draft, withholdingEnabled: event.target.checked }))} /> PPh aktif</span><input aria-label="Persentase PPh" type="number" min="0" max="100" step="0.01" disabled={!commercialEditable || !commercial.withholdingEnabled} value={commercial.withholdingPct} onChange={(event) => setCommercial((draft) => ({ ...draft, withholdingPct: event.target.value }))} /></label>
        <div className={styles.formActions}>{commercialLocked ? <span className={styles.permissionNote}>Parameter terkunci pada status {workspace.commercialStatus.toLowerCase()}.</span> : !canEditCommercial ? <span className={styles.permissionNote}>Parameter komersial hanya dapat diubah oleh Admin.</span> : null}<button type="submit" className={styles.primaryButton} disabled={!commercialEditable || !commercialDirty}><Save size={16} aria-hidden="true" />Simpan parameter</button></div>
      </form>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><span>RAB / HPP</span><h2>Item biaya proyek</h2></div>
        {planEditable ? <button type="button" className={styles.secondaryButton} onClick={() => setShowAdd((value) => !value)} aria-expanded={showAdd}><CirclePlus size={17} aria-hidden="true" />{showAdd ? "Tutup form" : "Tambah item"}</button> : null}
      </div>
      {showAdd ? <form className={styles.addCostForm} onSubmit={createCostItem}>
        <CostFields draft={newItem} setDraft={setNewItem} prefix="new-cost" />
        <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setShowAdd(false)}><X size={16} aria-hidden="true" />Batal</button><button type="submit" className={styles.primaryButton} disabled={!newItem.description.trim() || !newItem.unit.trim()}>Tambah item</button></div>
      </form> : null}

      {costItems.length ? <>
        <div className={styles.costTableWrap}><table className={styles.costTable}><thead><tr><th>Kategori</th><th>Uraian</th><th>Volume</th><th>Harga satuan</th><th>Rencana</th><th>Aktual</th><th>Aksi</th></tr></thead><tbody>{costItems.map((item) => <CostRow key={item.id} projectId={projectId} item={item} currency={workspace.currency ?? "IDR"} runMutation={runMutation} canManagePlan={planEditable} canManageActual={actualEditable} />)}</tbody></table></div>
        <div className={styles.costMobileList}>{costItems.map((item) => <CostCard key={item.id} projectId={projectId} item={item} currency={workspace.currency ?? "IDR"} runMutation={runMutation} canManagePlan={planEditable} canManageActual={actualEditable} />)}</div>
      </> : <div className={styles.emptyState}><Calculator size={28} aria-hidden="true" /><h3>Belum ada item biaya</h3><p>Tambahkan material, tenaga kerja, vendor, atau biaya operasional lain.</p></div>}
    </section>
  </div>;
}

function FinanceMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className={styles.metricCard}><span><WalletCards size={19} aria-hidden="true" /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function NumberField({ label, value, onChange, max, disabled }: { label: string; value: string; onChange: (value: string) => void; max?: string; disabled?: boolean }) {
  return <label><span>{label}</span><input disabled={disabled} type="number" min="0" max={max} step="0.01" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function CostFields({ draft, setDraft, prefix, disabledPlan = false, disabledActual = false }: { draft: CostDraft; setDraft: React.Dispatch<React.SetStateAction<CostDraft>>; prefix: string; disabledPlan?: boolean; disabledActual?: boolean }) {
  return <div className={styles.costFields}>
    <label><span>Kategori</span><select disabled={disabledPlan} id={`${prefix}-category`} value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value }))}>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
    <label className={styles.costDescription}><span>Uraian biaya</span><input disabled={disabledPlan} value={draft.description} maxLength={500} required onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></label>
    <label><span>Volume</span><input disabled={disabledPlan} type="number" min="0.0001" step="0.0001" required value={draft.quantity} onChange={(event) => setDraft((value) => ({ ...value, quantity: event.target.value }))} /></label>
    <label><span>Satuan</span><input disabled={disabledPlan} required value={draft.unit} onChange={(event) => setDraft((value) => ({ ...value, unit: event.target.value }))} /></label>
    <label><span>Harga satuan</span><input disabled={disabledPlan} type="number" min="0" step="0.01" required value={draft.unitPrice} onChange={(event) => setDraft((value) => ({ ...value, unitPrice: event.target.value }))} /></label>
    <label><span>Realisasi</span><input disabled={disabledActual} type="number" min="0" step="0.01" value={draft.actualAmount} placeholder="Belum dilaporkan" onChange={(event) => setDraft((value) => ({ ...value, actualAmount: event.target.value }))} /></label>
  </div>;
}

function changedCostFields(item: WorkspaceCostItem, draft: CostDraft) {
  const original = draftFromItem(item);
  return Object.fromEntries(Object.entries(draft).filter(([field, value]) => value !== original[field as keyof CostDraft]).map(([field, value]) => [field, field === "actualAmount" && value === "" ? null : value]));
}

function CostRow({ projectId, item, currency, runMutation, canManagePlan, canManageActual }: { projectId: string; item: WorkspaceCostItem; currency: string; runMutation: MutationRunner; canManagePlan: boolean; canManageActual: boolean }) {
  const [draft, setDraft] = useState(() => draftFromItem(item));
  const planned = draft.quantity === String(item.quantity) && draft.unitPrice === String(item.unitPrice) && item.plannedAmount != null ? item.plannedAmount : multiplyDecimalStrings(draft.quantity, draft.unitPrice);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromItem(item));
  const save = () => runMutation(() => workspaceRequest(`/api/projects/${projectId}/cost-items/${item.id}`, jsonRequest("PATCH", { ...changedCostFields(item, draft), version: item.version })), "Item biaya diperbarui.");
  const remove = () => { if (window.confirm(`Hapus item biaya ${item.description}?`)) return runMutation(() => workspaceRequest(`/api/projects/${projectId}/cost-items/${item.id}`, jsonRequest("DELETE", { version: item.version })), "Item biaya dihapus."); return Promise.resolve(); };
  return <tr><td><select disabled={!canManagePlan} aria-label={`Kategori ${item.description}`} value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value }))}>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></td><td><input disabled={!canManagePlan} aria-label={`Uraian ${item.description}`} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></td><td><div className={styles.quantityCell}><input disabled={!canManagePlan} aria-label={`Volume ${item.description}`} type="number" min="0.0001" step="0.0001" value={draft.quantity} onChange={(event) => setDraft((value) => ({ ...value, quantity: event.target.value }))} /><input disabled={!canManagePlan} aria-label={`Satuan ${item.description}`} value={draft.unit} onChange={(event) => setDraft((value) => ({ ...value, unit: event.target.value }))} /></div></td><td><input disabled={!canManagePlan} aria-label={`Harga satuan ${item.description}`} type="number" min="0" step="0.01" value={draft.unitPrice} onChange={(event) => setDraft((value) => ({ ...value, unitPrice: event.target.value }))} /></td><td className={styles.moneyCell}>{formatCurrency(planned, currency)}</td><td><input disabled={!canManageActual} aria-label={`Realisasi ${item.description}`} type="number" min="0" step="0.01" value={draft.actualAmount} placeholder="-" onChange={(event) => setDraft((value) => ({ ...value, actualAmount: event.target.value }))} /></td><td><div className={styles.rowActions}><button type="button" aria-label={`Simpan ${item.description}`} className={styles.iconButton} disabled={!dirty} onClick={() => void save()}><Save size={16} /></button>{canManagePlan ? <button type="button" aria-label={`Hapus ${item.description}`} className={`${styles.iconButton} ${styles.dangerButton}`} onClick={() => void remove()}><Trash2 size={16} /></button> : null}</div></td></tr>;
}

function CostCard({ projectId, item, currency, runMutation, canManagePlan, canManageActual }: { projectId: string; item: WorkspaceCostItem; currency: string; runMutation: MutationRunner; canManagePlan: boolean; canManageActual: boolean }) {
  const [draft, setDraft] = useState(() => draftFromItem(item));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromItem(item));
  const planned = draft.quantity === String(item.quantity) && draft.unitPrice === String(item.unitPrice) && item.plannedAmount != null ? item.plannedAmount : multiplyDecimalStrings(draft.quantity, draft.unitPrice);
  const save = () => runMutation(() => workspaceRequest(`/api/projects/${projectId}/cost-items/${item.id}`, jsonRequest("PATCH", { ...changedCostFields(item, draft), version: item.version })), "Item biaya diperbarui.");
  const remove = () => { if (window.confirm(`Hapus item biaya ${item.description}?`)) return runMutation(() => workspaceRequest(`/api/projects/${projectId}/cost-items/${item.id}`, jsonRequest("DELETE", { version: item.version })), "Item biaya dihapus."); return Promise.resolve(); };
  return <article className={styles.costCard}><CostFields draft={draft} setDraft={setDraft} prefix={`cost-${item.id}`} disabledPlan={!canManagePlan} disabledActual={!canManageActual} /><div className={styles.costCardTotal}><span>Rencana</span><strong>{formatCurrency(planned, currency)}</strong></div><div className={styles.formActions}>{canManagePlan ? <button type="button" className={`${styles.secondaryButton} ${styles.dangerText}`} onClick={() => void remove()}><Trash2 size={16} aria-hidden="true" />Hapus</button> : null}<button type="button" className={styles.primaryButton} disabled={!dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" />Simpan</button></div></article>;
}
