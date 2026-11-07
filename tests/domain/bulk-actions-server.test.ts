import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: mock }));
vi.mock("@/db/schema", async () => await import("../../src/db/schema"));
vi.mock("../../src/lib/server/authz", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));

import { auditEvents } from "../../src/db/schema";
import { bulkUpdateProjects } from "../../src/lib/server/projects";
import { bulkUpdateTasks } from "../../src/lib/server/tasks";

function chain(rows: unknown[] = []) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["from", "where", "for", "limit", "set", "values", "returning"]) query[name] = vi.fn(() => query);
  query.then = vi.fn((resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)));
  return query;
}
function select(rows: unknown[]) { const query = chain(rows); mock.select.mockReturnValueOnce(query); return query; }

const admin = { id: "admin", role: "ADMIN" as const };
const activeTask = { id: "task", assigneeId: null, status: "IN_PROGRESS", progress: 60, archivedAt: null, deletedAt: null };
const activeProject = { id: "project", status: "IN_PROGRESS", progress: 50, archivedAt: null, deletedAt: null };

beforeEach(() => {
  vi.resetAllMocks();
  mock.transaction.mockImplementation((fn) => fn(mock));
  mock.update.mockImplementation(() => chain([]));
  mock.insert.mockImplementation(() => chain([]));
});

describe("bulk action server helpers", () => {
  it("normalizes completed task progress and records bulk audit", async () => {
    select([activeTask]);
    await expect(bulkUpdateTasks(admin, { ids: ["task"], action: "status", status: "COMPLETED" })).resolves.toMatchObject({ updated: 1 });
    expect(mock.update.mock.results[0].value.set).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED", progress: 100 }));
    expect(mock.insert).toHaveBeenCalledWith(auditEvents);
    expect(mock.insert.mock.results.at(-1)?.value.values).toHaveBeenCalledWith(expect.objectContaining({ action: "task.status.bulk_updated", metadata: { bulk: true, count: 1 } }));
  });

  it("normalizes published project progress and records progress plus audit", async () => {
    select([activeProject]);
    await expect(bulkUpdateProjects(admin, { ids: ["project"], action: "status", status: "PUBLISHED" })).resolves.toMatchObject({ updated: 1 });
    expect(mock.update.mock.results[0].value.set).toHaveBeenCalledWith(expect.objectContaining({ status: "PUBLISHED", progress: 100 }));
    expect(mock.insert).toHaveBeenCalledWith(auditEvents);
  });

  it("rejects missing IDs and lifecycle actions against wrong state", async () => {
    select([]);
    await expect(bulkUpdateTasks(admin, { ids: ["missing"], action: "archive" })).rejects.toMatchObject({ status: 404 });
    select([activeProject]);
    await expect(bulkUpdateProjects(admin, { ids: ["project"], action: "restore" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects Staff before opening a transaction", async () => {
    await expect(bulkUpdateTasks({ id: "staff", role: "STAFF" }, { ids: ["task"], action: "archive" })).rejects.toMatchObject({ status: 403 });
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});
