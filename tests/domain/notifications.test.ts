import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), list: vi.fn(), create: vi.fn(), read: vi.fn(), readAll: vi.fn() }));
vi.mock("@/lib/server/authz", () => ({ requireUser: mocks.requireUser, apiError: (error: { message: string; status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 400 }) }));
vi.mock("@/lib/server/notifications", () => ({ listNotifications: mocks.list, createInAppNotification: mocks.create, markNotificationRead: mocks.read, markAllNotificationsRead: mocks.readAll }));

const route = await import("../../src/app/api/notifications/route");
const readRoute = await import("../../src/app/api/notifications/[id]/read/route");
const readAllRoute = await import("../../src/app/api/notifications/read-all/route");
const actor = { id: "8e081fd4-44d8-45a8-ada9-267c8843f818", role: "STAFF" };
const notificationId = "71ffc5a8-e873-4fd0-933a-3e9686a74998";

describe("notification API authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue(actor); });

  it("lists only through recipient-scoped service for authenticated staff", async () => {
    mocks.list.mockResolvedValue({ data: [], unreadCount: 0 });
    expect((await route.GET()).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(actor);
  });

  it("requires admin for notification creation and accepts only user recipients", async () => {
    mocks.create.mockResolvedValue({ row: { id: notificationId }, created: true });
    const response = await route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ eventType: "TASK_ASSIGNED", recipient: actor.id, payload: {}, idempotencyKey: "task:assigned:1" }) }));
    expect(response.status).toBe(201);
    expect(mocks.requireUser).toHaveBeenCalledWith(["ADMIN"]);
    expect(route.createNotificationSchema.safeParse({ eventType: "X", recipient: "ADMIN", payload: {}, idempotencyKey: "12345678" }).success).toBe(false);
  });

  it("passes authenticated actor into single and bulk read mutations", async () => {
    mocks.read.mockResolvedValue({ notificationId, userId: actor.id }); mocks.readAll.mockResolvedValue({ updated: 1 });
    expect((await readRoute.POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: notificationId }) })).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(actor, notificationId);
    expect((await readAllRoute.POST()).status).toBe(200);
    expect(mocks.readAll).toHaveBeenCalledWith(actor);
  });
});
