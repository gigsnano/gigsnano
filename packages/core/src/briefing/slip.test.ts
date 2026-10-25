import { describe, expect, it } from "vitest";

import { formatSlip } from "./slip";

describe("formatSlip", () => {
  it("shows a late forecast as +Nd in warning", () => {
    expect(formatSlip({ slip_days: 6, forecast_date: "2026-11-07T00:00:00Z" })).toEqual({
      text: "+6d",
      tone: "warning",
    });
  });

  it("shows an on-time forecast as its date", () => {
    expect(formatSlip({ slip_days: 0, forecast_date: "2026-11-14T00:00:00Z" })).toEqual({
      text: "14 Nov",
      tone: "default",
    });
    expect(formatSlip({ slip_days: -3, forecast_date: "2026-10-28T23:30:00Z" })).toEqual({
      text: "28 Oct",
      tone: "default",
    });
  });

  it("shows a dash when there is no forecast", () => {
    expect(formatSlip({ slip_days: null, forecast_date: null })).toEqual({ text: "—", tone: "muted" });
  });
});
