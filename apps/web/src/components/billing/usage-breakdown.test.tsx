// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EAiOperation, type IAiUsageLine } from "@/types";

import { UsageBreakdown } from "./usage-breakdown";

const line = (over: Partial<IAiUsageLine> = {}): IAiUsageLine =>
  ({
    id: "u1",
    source: "bmad_story",
    operation: "stream_turn" as EAiOperation,
    model: "claude-opus-4-8",
    input_tokens: 1234,
    output_tokens: 567,
    cost_cents: 2.5,
    project_id: null,
    story_id: null,
    thread_id: null,
    ...over,
  }) as IAiUsageLine;

afterEach(cleanup);

describe("UsageBreakdown", () => {
  it("renders its trigger, and keeps the breakdown out of the way until hover", () => {
    render(
      <UsageBreakdown line={line()}>
        <span>$0.03</span>
      </UsageBreakdown>,
    );
    // The pill is always visible; the detail is not shouted at the user.
    expect(screen.getByText("$0.03")).toBeInTheDocument();
    expect(screen.queryByText("claude-opus-4-8")).not.toBeInTheDocument();
  });

  it("marks the trigger as inspectable", () => {
    const { container } = render(
      <UsageBreakdown line={line()}>
        <span>$0.03</span>
      </UsageBreakdown>,
    );
    // cursor-help is the affordance that says "there's more here" — without it
    // the detail is undiscoverable.
    expect(container.querySelector(".cursor-help")).toBeInTheDocument();
  });
});
