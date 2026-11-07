import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/server/authz", () => ({ requireUser: mocks.requireUser, apiError: (error: { message: string; status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 400 }) }));
vi.mock("@/lib/server/attachments", () => ({ listAttachmentLinks: mocks.list, createAttachmentLink: mocks.create }));

const route = await import("../../src/app/api/attachments/route");
const actor = { id: "8e081fd4-44d8-45a8-ada9-267c8843f818", role: "STAFF" };
const entityId = "71ffc5a8-e873-4fd0-933a-3e9686a74998";

describe("attachment links route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue(actor); });

  it("lists links using authenticated entity access", async () => {
    mocks.list.mockResolvedValue([{ id: "link-1", label: "Design" }]);
    const response = await route.GET(new Request(`http://localhost/api/attachments?entityType=TASK&entityId=${entityId}`));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(actor, "TASK", entityId);
  });

  it("creates an audited link through server service", async () => {
    const input = { entityType: "PROJECT", entityId, label: "Google Drive", url: "https://drive.google.com/file/d/example" };
    mocks.create.mockResolvedValue({ id: "link-1", ...input });
    const response = await route.POST(new Request("http://localhost/api/attachments", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(actor, input);
  });

  it("accepts only project/task entities and http/https URLs", () => {
    expect(route.createAttachmentLinkSchema.safeParse({ entityType: "TASK", entityId, label: "Proof", url: "https://example.com/proof" }).success).toBe(true);
    expect(route.createAttachmentLinkSchema.safeParse({ entityType: "PROJECT", entityId, label: "Drive", url: "http://drive.example.test" }).success).toBe(true);
    expect(route.createAttachmentLinkSchema.safeParse({ entityType: "TASK", entityId, label: "Bad", url: "javascript:alert(1)" }).success).toBe(false);
    expect(route.createAttachmentLinkSchema.safeParse({ entityType: "GATE", entityId, label: "Bad", url: "https://example.com" }).success).toBe(false);
  });
});
