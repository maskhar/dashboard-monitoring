import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/server/authz", () => ({ requireUser: mocks.requireUser, apiError: (error: { message: string; status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 400 }) }));
vi.mock("@/lib/server/project-comments", () => ({ listProjectComments: mocks.list, createProjectComment: mocks.create }));

const route = await import("../../src/app/api/projects/[id]/comments/route");
const actor = { id: "8e081fd4-44d8-45a8-ada9-267c8843f818", role: "STAFF" };
const projectId = "71ffc5a8-e873-4fd0-933a-3e9686a74998";

describe("project comments route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue(actor); });

  it("lists comments for authenticated project access", async () => {
    mocks.list.mockResolvedValue([{ id: "comment-1", body: "Ready" }]);
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "comment-1", body: "Ready" }] });
    expect(mocks.list).toHaveBeenCalledWith(actor, projectId);
  });

  it("trims and creates non-empty comments", async () => {
    mocks.create.mockResolvedValue({ id: "comment-1", body: "Ready" });
    const response = await route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ body: "  Ready  " }) }), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(actor, projectId, "Ready");
  });

  it("rejects blank or oversized comments", () => {
    expect(route.createProjectCommentSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(route.createProjectCommentSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});
