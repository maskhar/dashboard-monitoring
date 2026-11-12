import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ProjectAssignmentVersionConflict extends Error {
    status = 409;
    constructor(public current: unknown) {
      super("Project assignment changed; reload before saving");
    }
  }
  return { requireUser: vi.fn(), assignProject: vi.fn(), ProjectAssignmentVersionConflict };
});

vi.mock("@/lib/server/authz", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 400 }),
}));
vi.mock("@/lib/server/projects", () => ({
  assignProject: mocks.assignProject,
  ProjectAssignmentVersionConflict: mocks.ProjectAssignmentVersionConflict,
}));

const route = await import("../../src/app/api/projects/[id]/assignment/route");
const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const actor = { id: "admin", role: "ADMIN" as const };
const request = (body: unknown) => new Request("http://localhost/api/projects/assignment", { method: "PATCH", body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: projectId }) };

describe("legacy project assignment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(actor);
    mocks.assignProject.mockResolvedValue({ projectId, userId, version: 4 });
  });

  it("requires Admin and forwards the optimistic version", async () => {
    const response = await route.PATCH(request({ userId, version: 3 }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireUser).toHaveBeenCalledWith(["ADMIN"]);
    expect(mocks.assignProject).toHaveBeenCalledWith(actor, projectId, { userId, version: 3 });
  });

  it("rejects missing, invalid, and mixed version payloads", async () => {
    for (const payload of [
      { userId },
      { userId, version: 0 },
      { userId, version: 1.5 },
      { userId, version: 1, role: "PIC" },
    ]) {
      expect((await route.PATCH(request(payload), context)).status).toBe(400);
    }
    expect(mocks.assignProject).not.toHaveBeenCalled();
  });

  it("returns the current versioned state on conflict", async () => {
    const current = { projectId, version: 7 };
    mocks.assignProject.mockRejectedValue(new mocks.ProjectAssignmentVersionConflict(current));

    const response = await route.PATCH(request({ userId: null, version: 6 }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Project assignment changed; reload before saving", current });
  });
});
