import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("@/lib/server/authz", () => ({
  HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } },
  requireUser: mocks.requireUser,
  apiError: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/server/legacy-workspace-import", () => ({
  LEGACY_WORKSPACE_IMPORT_MAX_BYTES: 5 * 1024 * 1024,
  commitLegacyWorkspaceImport: vi.fn(),
  legacyCommitProjectMappingSchema: { parse: vi.fn() },
  legacyProjectMappingSchema: { parse: vi.fn() },
  legacyUserMappingSchema: { parse: vi.fn() },
  previewLegacyWorkspaceImport: vi.fn(),
}));

const { POST } = await import("../../src/app/api/projects/workspace-imports/route");

describe("legacy workspace import route", () => {
  beforeEach(() => mocks.requireUser.mockResolvedValue({ id: "actor-1" }));

  it("rejects oversized Content-Length before parsing multipart data", async () => {
    const formData = vi.fn();
    const response = await POST({ headers: new Headers({ "content-length": String(5 * 1024 * 1024 + 1) }), formData } as unknown as Request);
    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it.each([undefined, "invalid", "90071992547409926789"])("handles missing or invalid Content-Length safely: %s", async (contentLength) => {
    const formData = vi.fn().mockResolvedValue(new FormData());
    const headers = new Headers();
    if (contentLength !== undefined) headers.set("content-length", contentLength);
    const response = await POST({ headers, formData } as unknown as Request);
    expect(formData).toHaveBeenCalledOnce();
    expect(response.status).toBe(400);
  });
});
