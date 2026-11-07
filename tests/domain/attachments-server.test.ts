import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), insert: vi.fn() }));
vi.mock("../../src/lib/server/access", () => ({ canAccessEntity: mocks.access }));
vi.mock("@/db", () => ({ db: { transaction: async (callback: (tx: { insert: typeof mocks.insert }) => unknown) => callback({ insert: mocks.insert }) } }));
vi.mock("@/db/schema", async () => await import("../../src/db/schema"));
vi.mock("../../src/lib/server/authz", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));

const { attachmentLinks, auditEvents } = await import("../../src/db/schema");
const { createAttachmentLink } = await import("../../src/lib/server/attachments");
const actor = { id: "8e081fd4-44d8-45a8-ada9-267c8843f818", role: "STAFF" as const };
const entityId = "71ffc5a8-e873-4fd0-933a-3e9686a74998";

describe("attachment links server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockImplementation((table) => table === attachmentLinks
      ? { values: () => ({ returning: async () => [{ id: "link-1" }] }) }
      : { values: async () => undefined });
  });

  it("rejects users without entity access", async () => {
    mocks.access.mockResolvedValue(false);
    await expect(createAttachmentLink(actor, { entityType: "TASK", entityId, label: "Proof", url: "https://example.com" })).rejects.toThrow("Forbidden");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stores link and audit event after access check", async () => {
    mocks.access.mockResolvedValue(true);
    await createAttachmentLink(actor, { entityType: "TASK", entityId, label: "Proof", url: "https://example.com" });
    expect(mocks.access).toHaveBeenCalledWith(actor, "TASK", entityId);
    expect(mocks.insert).toHaveBeenCalledWith(attachmentLinks);
    expect(mocks.insert).toHaveBeenCalledWith(auditEvents);
  });
});
