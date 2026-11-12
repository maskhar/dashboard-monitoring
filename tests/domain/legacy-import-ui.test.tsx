// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegacyImportPanel } from "../../src/components/dashboard/sections/admin";

const users = [
  { id: "user-siti", name: "Siti", email: "siti@example.com", role: "STAFF" as const, status: "ACTIVE" as const, phone: null },
  { id: "user-ari-1", name: "Ari", email: "ari.one@example.com", role: "STAFF" as const, status: "ACTIVE" as const, phone: null },
  { id: "user-ari-2", name: "Ari", email: "ari.two@example.com", role: "STAFF" as const, status: "ACTIVE" as const, phone: null },
  { id: "user-inactive", name: "Windi", email: "windi@example.com", role: "STAFF" as const, status: "SUSPENDED" as const, phone: null },
];

const previewPayload = {
  previewId: "preview-legacy-1",
  fileName: "legacy.json",
  checksum: "abcdef1234567890",
  projects: [
    { sourceId: "legacy-new", name: "Rumah Baru", client: "Klien A", valid: true, suggestedCode: "DP-901" },
    { sourceId: "legacy-existing", name: "Rumah Lama", client: "Klien B", valid: true, suggestedProjectId: "project-existing" },
  ],
  teamMembers: [
    { sourceName: "Siti", role: "PIC", candidates: [{ id: "user-siti" }] },
    { sourceName: "Ari", role: "Desainer", candidates: [{ id: "user-ari-1" }, { id: "user-ari-2" }], ambiguous: true },
  ],
  existingProjects: [
    { id: "project-existing", code: "DP-010", brand: "Rumah Existing", version: 7, workspaceVersion: 3, hasWorkspace: true },
  ],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function fetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/projects?")) return jsonResponse({ data: [] });
    if (url !== "/api/projects/workspace-imports") return jsonResponse({ error: "Unexpected request" }, 404);
    if (init?.body instanceof FormData) {
      const action = String(init.body.get("action"));
      if (action === "preview" && init.body.has("projectMapping")) return jsonResponse({
        canCommit: true,
        projects: [
          { legacyId: "legacy-new", previewId: "11111111-1111-4111-8111-111111111111" },
          { legacyId: "legacy-existing", previewId: "22222222-2222-4222-8222-222222222222" },
        ],
        reconciliation: {
          totals: { create: 2, update: 0, unchanged: 0, skipped: 0, mappedUsers: 1, unmappedUsers: 1, errors: 0 },
          hpp: { create: 10, update: 0, unchanged: 3, actualZeroAmbiguous: 1, sourceTotal: 15000000, targetTotal: 15000000 },
        },
        issues: [
          { severity: "WARNING", code: "ACTUAL_ZERO_AMBIGUOUS", legacyId: "legacy-new", message: "Nilai aktual nol ambigu" },
          { severity: "WARNING", code: "LEGACY_COMPLETION_REQUIRES_REVIEW", legacyId: "legacy-existing", message: "Tahap selesai perlu review" },
        ],
      });
      if (action === "commit") return jsonResponse({ status: "SUCCEEDED", idempotent: true, message: "Checksum sudah pernah dikomit.", succeeded: 2, failed: 0, results: [{ legacyId: "legacy-new", idempotent: true }, { legacyId: "legacy-existing", idempotent: true }] });
      return jsonResponse(previewPayload);
    }
    return jsonResponse({ error: "Unknown action" }, 400);
  });
}

async function previewFile() {
  const file = new File([JSON.stringify({ projects: {} })], "legacy.json", { type: "application/json" });
  fireEvent.change(screen.getByLabelText("Pilih berkas JSON legacy"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Preview di server" }));
  await screen.findByText("Mapping proyek");
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("legacy import admin UI", () => {
  it("requires version-aware project mapping and only auto-maps unique active names", async () => {
    vi.stubGlobal("fetch", fetchMock());
    render(<LegacyImportPanel users={users} reload={vi.fn().mockResolvedValue(undefined)} setMessage={vi.fn()} />);

    await previewFile();

    expect(screen.getByLabelText("Kode proyek baru Rumah Baru")).toHaveValue("DP-901");
    expect(screen.getByText("Proyek v7 · Workspace v3")).toBeVisible();
    expect(screen.getByLabelText("Pengguna untuk Siti")).toHaveValue("user-siti");
    expect(screen.getByLabelText("Pengguna untuk Ari")).toHaveValue("");
    expect(screen.getByText(/Ambigu: 2 kandidat/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Jalankan dry-run" })).toBeDisabled();

    expect(screen.getByText(/Workspace existing tidak dapat ditimpa/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Tujuan proyek Rumah Lama"), { target: { value: "__create_new__" } });
    fireEvent.change(screen.getByLabelText("Kode proyek baru Rumah Lama"), { target: { value: "DP-902" } });
    expect(screen.getByRole("button", { name: "Jalankan dry-run" })).toBeEnabled();
  });

  it("shows HPP warnings, requires acknowledgement, and commits idempotently", async () => {
    const request = fetchMock();
    const reload = vi.fn().mockResolvedValue(undefined);
    const setMessage = vi.fn();
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    render(<LegacyImportPanel users={users} reload={reload} setMessage={setMessage} />);

    await previewFile();
    fireEvent.change(screen.getByLabelText("Tujuan proyek Rumah Lama"), { target: { value: "__create_new__" } });
    fireEvent.change(screen.getByLabelText("Kode proyek baru Rumah Lama"), { target: { value: "DP-902" } });
    fireEvent.click(screen.getByRole("button", { name: "Jalankan dry-run" }));

    await screen.findByText("ACTUAL_ZERO_AMBIGUOUS");
    expect(screen.getByText("LEGACY_COMPLETION_REQUIRES_REVIEW")).toBeVisible();
    expect(screen.getByText("10", { selector: ".legacy-hpp-reconciliation strong" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Konfirmasi & commit" })).toBeDisabled();

    const dryRunCall = request.mock.calls.find(([, init]) => init?.body instanceof FormData && init.body.get("action") === "preview" && init.body.has("projectMapping"));
    const dryRunBody = JSON.parse(String((dryRunCall?.[1]?.body as FormData).get("projectMapping")));
    expect(dryRunBody).toMatchObject({
      "legacy-new": { create: { code: "DP-901", brand: "Rumah Baru" } },
      "legacy-existing": { create: { code: "DP-902", brand: "Rumah Lama" } },
    });

    fireEvent.click(screen.getByLabelText("Saya sudah meninjau warning dan memahami dampaknya."));
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi & commit" }));

    await screen.findByText("Import idempotent");
    expect(setMessage).toHaveBeenCalledWith("Import sudah pernah diproses; tidak ada data duplikat.");
    expect(reload).toHaveBeenCalled();
  });
});
