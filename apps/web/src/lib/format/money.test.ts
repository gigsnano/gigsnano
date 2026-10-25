import { describe, it, expect } from "vitest";
import { formatCents } from "./money";

describe("formatCents", () => {
  it("formats whole dollars", () => expect(formatCents(1200)).toBe("$12.00"));
  it("formats cents", () => expect(formatCents(999)).toBe("$9.99"));
  it("formats zero", () => expect(formatCents(0)).toBe("$0.00"));
});
