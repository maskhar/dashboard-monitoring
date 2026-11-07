import { describe, expect, it } from "vitest";
import { canUpdateAssigned } from "../../src/lib/server/domain";

describe("assigned item authorization", () => {
  it("allows admins regardless of assignment", () => { expect(canUpdateAssigned("ADMIN", "admin", null)).toBe(true); });
  it("allows only assigned staff", () => { expect(canUpdateAssigned("STAFF", "staff-1", "staff-1")).toBe(true); expect(canUpdateAssigned("STAFF", "staff-1", "staff-2")).toBe(false); expect(canUpdateAssigned("STAFF", "staff-1", null)).toBe(false); });
});
