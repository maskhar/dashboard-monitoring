import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", async () => await import("../../src/db/schema"));
vi.mock("../../src/lib/server/authz", () => ({
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));

import { assertTaskUpdateAllowed, validateTaskState } from "../../src/lib/server/tasks";

const admin = { id: "admin", role: "ADMIN" as const };
const staff = { id: "staff", role: "STAFF" as const };

describe("task management rules", () => {
  it("accepts sensible status and progress pairs", () => {
    expect(() => validateTaskState("NOT_STARTED", 0)).not.toThrow();
    expect(() => validateTaskState("IN_PROGRESS", 50)).not.toThrow();
    expect(() => validateTaskState("COMPLETED", 100)).not.toThrow();
  });

  it("rejects invalid progress and inconsistent status pairs", () => {
    for (const [status, progress] of [["IN_PROGRESS", -1], ["IN_REVIEW", 101], ["COMPLETED", 99], ["NOT_STARTED", 1], ["BLOCKED", 100]] as const) {
      expect(() => validateTaskState(status, progress)).toThrowError();
    }
  });

  it("lets Admin edit any task", () => {
    expect(() => assertTaskUpdateAllowed(admin, null, false, { title: "Revised", version: 1 })).not.toThrow();
  });

  it("limits Staff to progress and status on their active assigned task", () => {
    expect(() => assertTaskUpdateAllowed(staff, "staff", true, { progress: 20, status: "IN_PROGRESS", version: 1 })).not.toThrow();
    expect(() => assertTaskUpdateAllowed(staff, "other", true, { progress: 20, version: 1 })).toThrowError();
    expect(() => assertTaskUpdateAllowed(staff, "staff", false, { progress: 20, version: 1 })).toThrowError();
    expect(() => assertTaskUpdateAllowed(staff, "staff", true, { title: "No", version: 1 })).toThrowError();
  });
});
