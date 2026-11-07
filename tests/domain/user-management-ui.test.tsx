// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementSection } from "../../src/components/dashboard/sections/admin";

const viewer = { id: "admin-1", role: "ADMIN" as const, name: "Admin" };
const users = [
  { id: "admin-1", name: "Admin", email: "admin@example.com", role: "ADMIN" as const, status: "ACTIVE" as const, phone: "0811" },
  { id: "staff-1", name: "Staff Lama", email: "staff@example.com", role: "STAFF" as const, status: "ACTIVE" as const, phone: null },
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("user management UI", () => {
  it("edits profile name and phone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(<UserManagementSection viewer={viewer} users={users} reload={reload} setMessage={vi.fn()} setError={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    fireEvent.change(screen.getByLabelText("Nama lengkap"), { target: { value: "Staff Baru" } });
    fireEvent.change(screen.getByLabelText("Nomor kontak / WhatsApp"), { target: { value: "081234" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan profil" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users/staff-1", expect.objectContaining({ method: "PATCH" })));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ name: "Staff Baru", phone: "081234" });
    expect(reload).toHaveBeenCalled();
  });

  it("deletes another user but protects current account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    render(<UserManagementSection viewer={viewer} users={users} reload={vi.fn().mockResolvedValue(undefined)} setMessage={vi.fn()} setError={vi.fn()} />);

    const deleteButtons = screen.getAllByRole("button", { name: "Hapus" });
    expect(deleteButtons[0]).toBeDisabled();
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users/staff-1", expect.objectContaining({ method: "DELETE" })));
  });
});
