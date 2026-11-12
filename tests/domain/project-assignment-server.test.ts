import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: mock }));
vi.mock("@/db/schema", async () => await import("../../src/db/schema"));
vi.mock("../../src/lib/server/authz", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));

import { auditEvents, projectAssignments, projects, projectWorkspaces } from "../../src/db/schema";
import { assignProject, ProjectAssignmentVersionConflict } from "../../src/lib/server/projects";

function chain(rows: unknown[] = []) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["from", "where", "for", "limit", "set", "values", "returning"]) query[name] = vi.fn(() => query);
  query.then = vi.fn((resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)));
  return query;
}

function select(rows: unknown[]) {
  const query = chain(rows);
  mock.select.mockReturnValueOnce(query);
  return query;
}

const admin = { id: "admin", role: "ADMIN" as const };
const project = { id: "project", version: 3, archivedAt: null, deletedAt: null };
const workspace = { projectId: "project", version: 7 };
const currentPic = { id: "old-pic", projectId: "project", userId: "old-user", role: "PIC", active: true };

beforeEach(() => {
  vi.resetAllMocks();
  mock.transaction.mockImplementation((callback) => callback(mock));
  mock.update.mockImplementation(() => chain([]));
  mock.insert.mockImplementation(() => chain([]));
});

describe("legacy project PIC assignment", () => {
  it("rejects a stale workspace version with current state", async () => {
    select([project]);
    select([workspace]);

    await expect(assignProject(admin, project.id, { userId: null, version: 6 })).rejects.toEqual(expect.objectContaining({
      status: 409,
      current: workspace,
    }));
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("rejects assigning a workspace Finance Admin as PIC", async () => {
    select([project]);
    select([workspace]);
    select([{ id: "finance-user" }]);
    select([{ id: "finance-assignment" }]);

    await expect(assignProject(admin, project.id, { userId: "finance-user", version: 7 })).rejects.toMatchObject({
      status: 409,
      message: "The same user cannot hold PIC and FINANCE_ADMIN roles on one project",
    });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("keeps archived projects read-only", async () => {
    select([{ ...project, archivedAt: new Date() }]);

    await expect(assignProject(admin, project.id, { userId: null, version: 3 })).rejects.toMatchObject({ status: 409 });
    expect(mock.select).toHaveBeenCalledTimes(1);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("updates PIC and workspace version in one transaction", async () => {
    const created = { ...currentPic, id: "new-pic", userId: "new-user" };
    select([project]);
    select([workspace]);
    select([{ id: "new-user" }]);
    select([]);
    select([currentPic]);
    mock.update.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([{ ...workspace, version: 8 }]));
    mock.insert.mockReturnValueOnce(chain([created])).mockReturnValueOnce(chain([]));

    await expect(assignProject(admin, project.id, { userId: "new-user", version: 7 })).resolves.toMatchObject({
      assignment: created,
      version: 8,
    });

    expect(mock.update).toHaveBeenNthCalledWith(1, projectAssignments);
    expect(mock.update).toHaveBeenNthCalledWith(2, projectWorkspaces);
    expect(mock.insert).toHaveBeenLastCalledWith(auditEvents);
    expect(mock.insert.mock.results.at(-1)?.value.values).toHaveBeenCalledWith(expect.objectContaining({
      actorId: admin.id,
      metadata: expect.objectContaining({ versionSource: "workspace", previousVersion: 7, version: 8 }),
    }));
  });

  it("uses project version when no workspace exists", async () => {
    select([project]);
    select([]);
    select([currentPic]);
    mock.update.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([{ ...project, version: 4 }]));

    await expect(assignProject(admin, project.id, { userId: null, version: 3 })).resolves.toMatchObject({ version: 4 });
    expect(mock.update).toHaveBeenNthCalledWith(2, projects);
    expect(mock.insert.mock.results.at(-1)?.value.values).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ versionSource: "project", previousVersion: 3, version: 4 }),
    }));
  });

  it("rejects a compare-and-swap race and rolls the transaction back", async () => {
    select([project]);
    select([workspace]);
    select([currentPic]);
    mock.update.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([]));

    await expect(assignProject(admin, project.id, { userId: null, version: 7 })).rejects.toBeInstanceOf(ProjectAssignmentVersionConflict);
    expect(mock.insert).not.toHaveBeenCalled();
  });
});
