// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  jsonRequest,
  normalizeWorkspaceSnapshot,
  WorkspaceApiError,
  workspaceRequest,
} from "../../src/components/project-workspace/api";
import { formatCurrency, formatPercent, multiplyDecimalStrings } from "../../src/components/project-workspace/format";
import { CostTab } from "../../src/components/project-workspace/cost-tab";
import { SummaryTab } from "../../src/components/project-workspace/summary-tab";
import { StatusPill } from "../../src/components/project-workspace/status-pill";

const projectId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("project workspace UI data handling", () => {
  it("normalizes enveloped snapshots and defaults malformed collections", () => {
    const snapshot = normalizeWorkspaceSnapshot({
      data: {
        project: { id: projectId, code: "DP-001", brand: "Utero" },
        workspace: { version: "7", currentPhase: "3", commercialStatus: null, currency: null },
        metrics: null,
        assignments: "invalid",
        phases: [{ id: "phase-1" }],
        stages: null,
        costItems: {},
        documents: undefined,
      },
    });

    expect(snapshot.workspace).toMatchObject({ version: 7, currentPhase: 3, commercialStatus: "DRAFT", currency: "IDR" });
    expect(snapshot.metrics).toEqual({});
    expect(snapshot.assignments).toEqual([]);
    expect(snapshot.phases).toEqual([{ id: "phase-1" }]);
    expect(snapshot.stages).toEqual([]);
    expect(snapshot.costItems).toEqual([]);
    expect(snapshot.documents).toEqual([]);
  });

  it("accepts a top-level snapshot and rejects incomplete payloads with context", () => {
    const payload = {
      project: { id: projectId, code: "DP-001", brand: "Utero" },
      workspace: { version: 1, currentPhase: 1 },
    };
    expect(normalizeWorkspaceSnapshot(payload).project.id).toBe(projectId);

    for (const incomplete of [{}, { project: { id: projectId } }, { workspace: { version: 1 } }]) {
      try {
        normalizeWorkspaceSnapshot(incomplete);
        throw new Error("Expected normalization to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(WorkspaceApiError);
        expect(error).toMatchObject({ message: "Snapshot ruang proyek tidak lengkap.", status: 500, payload: incomplete });
      }
    }
  });

  it("returns JSON, disables fetch caching, and preserves explicit request options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(workspaceRequest("/api/workspace")).resolves.toEqual({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith("/api/workspace", { cache: "no-store" });

    await workspaceRequest("/api/workspace", { method: "POST", cache: "reload" });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/workspace", { cache: "reload", method: "POST" });
  });

  it("surfaces API error payloads and falls back for non-JSON responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Versi bentrok", message: "Ignored" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("Service unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(workspaceRequest("/api/workspace")).rejects.toMatchObject({
      name: "WorkspaceApiError",
      message: "Versi bentrok",
      status: 409,
      payload: { error: "Versi bentrok", message: "Ignored" },
    });
    await expect(workspaceRequest("/api/workspace")).rejects.toMatchObject({
      message: "Request gagal (503).",
      status: 503,
      payload: null,
    });
  });

  it("builds JSON mutations without sending phantom bodies", () => {
    expect(jsonRequest("GET")).toEqual({ method: "GET", headers: undefined, body: undefined });
    expect(jsonRequest("PATCH", { actualAmount: null })).toEqual({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actualAmount: null }),
    });
  });

  it("renders normalized and fallback status labels", () => {
    const { rerender } = render(<StatusPill status="IN_PROGRESS" />);
    expect(screen.getByText("Berjalan")).toBeVisible();

    rerender(<StatusPill status="CUSTOM_REVIEW" />);
    expect(screen.getByText("Custom review")).toBeVisible();
  });

  it("preserves exact numeric(19,2) money values beyond Number.MAX_SAFE_INTEGER", () => {
    const formatted = formatCurrency("90071992547409931.67", "IDR");

    expect(formatted).toContain("90.071.992.547.409.931,67");
    expect(formatted).not.toContain("90.071.992.547.409.936");
    expect(multiplyDecimalStrings("9007199254740993.11", "2.50")).toBe("22517998136852482.78");
    expect(multiplyDecimalStrings("0.005", "1")).toBe("0.01");
  });

  it("keeps negative fractional percentages signed", () => {
    expect(formatPercent("-0.25")).toBe("-0,25%");
  });

  it("detects redacted financial snapshots without inventing zero values", () => {
    const snapshot = normalizeWorkspaceSnapshot({
      project: { id: projectId, code: "DP-001", brand: "Utero" },
      workspace: { version: 1, currentPhase: 1, commercialStatus: "DRAFT", contractValue: null, currency: null },
      metrics: { completedStages: 2 },
      costItems: [],
    });

    expect(snapshot.financialsVisible).toBe(false);
    expect(snapshot.workspace.contractValue).toBeNull();
    expect(snapshot.costItems).toEqual([]);
  });

  it("renders financial restriction messaging instead of empty money values", () => {
    const snapshot = normalizeWorkspaceSnapshot({
      project: { id: projectId, code: "DP-001", brand: "Utero" },
      workspace: { version: 1, currentPhase: 1, commercialStatus: "DRAFT", contractValue: null, currency: null },
      metrics: { completedStages: 0, lateStages: 0, acceptedDocuments: 0, requiredDocuments: 0 },
      assignments: [], phases: [], stages: [], costItems: [], documents: [],
    });
    const runMutation = vi.fn(async () => ({ ok: true as const }));

    const { rerender } = render(<SummaryTab projectId={projectId} snapshot={snapshot} runMutation={runMutation} canEditProfile={false} viewerRole="STAFF" viewerRoles={[]} />);
    expect(screen.getByText("Data finansial dibatasi")).toBeVisible();
    expect(screen.queryByText("Nilai kontrak")).not.toBeInTheDocument();

    rerender(<CostTab projectId={projectId} snapshot={snapshot} runMutation={runMutation} canEditCommercial={false} canManagePlan={false} canManageActual={false} />);
    expect(screen.getByRole("heading", { name: "Data finansial dibatasi" })).toBeVisible();
    expect(screen.queryByText("HPP rencana")).not.toBeInTheDocument();
  });

  it("shows READY phase submission only to decision owner or Admin", () => {
    const snapshot = normalizeWorkspaceSnapshot({
      project: { id: projectId, code: "DP-001", brand: "Utero" },
      workspace: { version: 1, currentPhase: 1, commercialStatus: "DRAFT", contractValue: "1000000.00", currency: "IDR" },
      metrics: { plannedHpp: "500000.00" },
      assignments: [], stages: [], costItems: [], documents: [],
      phases: [{ id: "phase-1", phaseNumber: 1, code: "G1", name: "Penawaran", decisionOwnerRole: "PIC", status: "READY", version: 2 }],
    });
    const runMutation = vi.fn(async () => ({ ok: true as const }));

    const { rerender } = render(<SummaryTab projectId={projectId} snapshot={snapshot} runMutation={runMutation} canEditProfile={false} viewerRole="STAFF" viewerRoles={[]} />);
    expect(screen.queryByRole("button", { name: "Ajukan fase" })).not.toBeInTheDocument();

    rerender(<SummaryTab projectId={projectId} snapshot={snapshot} runMutation={runMutation} canEditProfile={false} viewerRole="STAFF" viewerRoles={["PIC"]} />);
    expect(screen.getByRole("button", { name: "Ajukan fase" })).toBeVisible();
  });
});
