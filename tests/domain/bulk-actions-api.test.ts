import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), projects: vi.fn(), tasks: vi.fn() }));
vi.mock("@/lib/server/authz", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 400 }),
}));
vi.mock("@/lib/server/projects", () => ({ bulkUpdateProjects: mocks.projects }));
vi.mock("@/lib/server/tasks", () => ({ bulkUpdateTasks: mocks.tasks }));

const projectRoute = await import("../../src/app/api/projects/bulk/route");
const taskRoute = await import("../../src/app/api/tasks/bulk/route");
const id = "11111111-1111-4111-8111-111111111111";
const assigneeId = "22222222-2222-4222-8222-222222222222";
const actor = { id: "admin", role: "ADMIN" as const };
const request = (body: unknown) => new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) });

describe("bulk action API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue(actor); mocks.projects.mockResolvedValue({ updated: 1 }); mocks.tasks.mockResolvedValue({ updated: 1 }); });

  it("requires Admin and delegates valid project assignment", async () => {
    expect((await projectRoute.PATCH(request({ ids: [id], action: "assign", assigneeId }))).status).toBe(200);
    expect(mocks.requireUser).toHaveBeenCalledWith(["ADMIN"]);
    expect(mocks.projects).toHaveBeenCalledWith(actor, { ids: [id], action: "assign", assigneeId });
  });

  it("accepts task status and lifecycle actions", () => {
    expect(taskRoute.taskBulkSchema.safeParse({ ids: [id], action: "status", status: "COMPLETED" }).success).toBe(true);
    expect(taskRoute.taskBulkSchema.safeParse({ ids: [id], action: "archive" }).success).toBe(true);
    expect(projectRoute.projectBulkSchema.safeParse({ ids: [id], action: "restore" }).success).toBe(true);
  });

  it("rejects empty, duplicate, oversized, malformed, and mixed payloads", () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`);
    for (const input of [
      { ids: [], action: "archive" },
      { ids: [id, id], action: "restore" },
      { ids: tooMany, action: "archive" },
      { ids: ["bad"], action: "archive" },
      { ids: [id], action: "assign" },
      { ids: [id], action: "archive", status: "BACKLOG" },
      { ids: [id], action: "status", status: "INVALID" },
    ]) expect(projectRoute.projectBulkSchema.safeParse(input).success).toBe(false);
  });
});
