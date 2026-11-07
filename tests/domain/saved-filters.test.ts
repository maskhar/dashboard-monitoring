import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), list: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/server/authz", () => ({ requireUser: mocks.requireUser, apiError: (error: { message: string; status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 400 }) }));
vi.mock("@/lib/server/saved-filters", () => ({ listSavedFilters: mocks.list, saveFilter: mocks.save, deleteSavedFilter: mocks.remove }));

const route = await import("../../src/app/api/saved-filters/route");
const actor = { id: "8e081fd4-44d8-45a8-ada9-267c8843f818", role: "STAFF" };
const id = "71ffc5a8-e873-4fd0-933a-3e9686a74998";
const filters = { query: "launch", type: "day", status: "IN_PROGRESS", assigneeId: "unassigned" };

describe("saved filters API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue(actor); });

  it("scopes list, save, and delete operations to authenticated actor", async () => {
    mocks.list.mockResolvedValue([]); mocks.save.mockResolvedValue({ id, name: "Mine", filters }); mocks.remove.mockResolvedValue({ id });
    expect((await route.GET()).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(actor);
    const created = await route.POST(new Request("http://localhost/api/saved-filters", { method: "POST", body: JSON.stringify({ name: " Mine ", filters }) }));
    expect(created.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith(actor, { name: "Mine", filters });
    expect((await route.DELETE(new Request(`http://localhost/api/saved-filters?id=${id}`, { method: "DELETE" }))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(actor, id);
  });

  it("rejects malformed names, filter values, extra fields, and delete IDs", async () => {
    for (const body of [
      { name: " ", filters },
      { name: "Mine", filters: { ...filters, type: "month" } },
      { name: "Mine", filters: { ...filters, assigneeId: "someone" } },
      { name: "Mine", filters, userId: actor.id },
    ]) expect((await route.POST(new Request("http://localhost/api/saved-filters", { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    expect((await route.DELETE(new Request("http://localhost/api/saved-filters?id=bad", { method: "DELETE" }))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
