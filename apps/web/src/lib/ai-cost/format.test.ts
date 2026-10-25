import { describe, expect, it } from "vitest";

import { formatAiOperation, formatCostCents, formatTokenCount } from "./format";

describe("formatCostCents", () => {
  it("renders exact zero as $0.00", () => {
    expect(formatCostCents(0)).toBe("$0.00");
  });
  it("renders sub-cent nonzero as <$0.01, never $0.00", () => {
    // A real cost must never read as free — the one thing toFixed(2) gets wrong.
    expect(formatCostCents(0.3)).toBe("<$0.01");
    expect(formatCostCents(0.99)).toBe("<$0.01");
  });
  it("renders cents under a dollar in dollars", () => {
    expect(formatCostCents(1)).toBe("$0.01");
    expect(formatCostCents(3)).toBe("$0.03");
    expect(formatCostCents(18)).toBe("$0.18");
    expect(formatCostCents(99)).toBe("$0.99");
  });
  it("renders a dollar and above as $N.NN", () => {
    expect(formatCostCents(100)).toBe("$1.00");
    expect(formatCostCents(430)).toBe("$4.30");
    expect(formatCostCents(5000)).toBe("$50.00");
  });
});

// --- GIN-153: labels shared with user-facing receipts -------------------------

describe("formatAiOperation", () => {
  it("labels the operations we know", () => {
    expect(formatAiOperation("stream_turn")).toBe("Stream turn");
    expect(formatAiOperation("finalize_description")).toBe("Finalize description");
  });

  it("passes an unknown operation through rather than calling it Unknown", () => {
    // A new backend operation should read as its raw name, not vanish.
    expect(formatAiOperation("brand_new_op")).toBe("brand_new_op");
  });

  it("only says Unknown when there is genuinely nothing", () => {
    expect(formatAiOperation(null)).toBe("Unknown");
    expect(formatAiOperation(undefined)).toBe("Unknown");
  });
});

describe("formatTokenCount", () => {
  it("groups thousands", () => {
    expect(formatTokenCount(1234567)).toBe("1,234,567");
  });

  it("never renders a negative or NaN token count", () => {
    expect(formatTokenCount(-5)).toBe("0");
    expect(formatTokenCount(Number.NaN)).toBe("0");
    expect(formatTokenCount(undefined)).toBe("0");
  });
});
