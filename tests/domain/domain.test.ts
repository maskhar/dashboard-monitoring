import { describe, expect, it } from "vitest";
import { achievement, canEditProject, isOverdue, validateProjectState } from "../../src/lib/server/domain";

describe("project domain", () => {
  it("enforces status and progress consistency", () => { expect(() => validateProjectState("PUBLISHED", 90)).toThrow(); expect(() => validateProjectState("BACKLOG", 100)).toThrow(); expect(() => validateProjectState("PUBLISHED", 100)).not.toThrow(); });
  it("calculates overdue only for unfinished work", () => { const now = new Date("2026-11-05T12:00:00Z"); expect(isOverdue("2026-11-04", "IN_PROGRESS", now)).toBe(true); expect(isOverdue("2026-11-04", "PUBLISHED", now)).toBe(false); expect(isOverdue("2026-11-06", "BACKLOG", now)).toBe(false); });
  it("limits staff edits to assigned projects", () => { expect(canEditProject("ADMIN", "a", "b")).toBe(true); expect(canEditProject("STAFF", "a", "a")).toBe(true); expect(canEditProject("STAFF", "a", "b")).toBe(false); });
});
describe("KPI achievement", () => { it("preserves missing actual and handles zero targets", () => { expect(achievement(null, 10)).toBeNull(); expect(achievement(5, 10)).toBe(50); expect(achievement(0, 0)).toBe(100); expect(achievement(2, 0)).toBeNull(); }); });
