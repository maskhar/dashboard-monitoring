// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Evidence } from "../../src/components/dashboard/sections/operations";

const existing = { id: "file-1", originalName: "laporan.pdf", size: 2048, createdAt: "2026-11-07T00:00:00Z", uploadedBy: { id: "admin", name: "Admin" } };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("operations evidence", () => {
  it("loads downloadable files and reports upload success inline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [existing] }), { status: 200, headers: { "content-type": "application/json" } })));
    const uploaded = { ...existing, id: "file-2", originalName: "foto.png", size: 4096 };
    const upload = vi.fn().mockResolvedValue(uploaded);
    render(<Evidence type="GATE" id="11111111-1111-4111-8111-111111111111" upload={upload} />);

    const download = await screen.findByRole("link", { name: "Unduh laporan.pdf" });
    expect(download).toHaveAttribute("href", "/api/evidence/file-1");

    const input = screen.getByLabelText("Unggah bukti GATE 11111111-1111-4111-8111-111111111111");
    const file = new File(["image"], "foto.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("status")).toHaveTextContent("foto.png berhasil diunggah.");
    expect(screen.getByRole("link", { name: "Unduh foto.png" })).toHaveAttribute("href", "/api/evidence/file-2");
    expect(upload).toHaveBeenCalledWith(file, "GATE", "11111111-1111-4111-8111-111111111111");
  });

  it("reports list and upload errors next to control", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Tidak dapat memuat bukti" }), { status: 500, headers: { "content-type": "application/json" } })));
    const upload = vi.fn().mockRejectedValue(new Error("File ditolak"));
    render(<Evidence type="GATE" id="11111111-1111-4111-8111-111111111111" upload={upload} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Tidak dapat memuat bukti");
    fireEvent.change(screen.getByLabelText("Unggah bukti GATE 11111111-1111-4111-8111-111111111111"), { target: { files: [new File(["bad"], "bad.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("File ditolak"));
  });
});
