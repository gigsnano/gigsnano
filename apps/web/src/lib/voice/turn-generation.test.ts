import { describe, expect, it } from "vitest";

import {
  finishTurn,
  initialTurnGenState,
  isCurrentTurn,
  startTurn,
  supersedeActiveTurn,
} from "./turn-generation";

describe("turn generation", () => {
  it("a freshly started turn is current", () => {
    const { state, gen } = startTurn(initialTurnGenState);
    expect(isCurrentTurn(state, gen)).toBe(true);
  });

  it("superseding drops the previous turn's currency, even though its generation number is unchanged", () => {
    // This is the exact bug the fix closes: a stale /speak/ response captured
    // `started.gen` before the supersession landed — it must never read as
    // current again, even though nothing about `started.gen` itself changed.
    const started = startTurn(initialTurnGenState);
    const superseded = supersedeActiveTurn(started.state);
    expect(isCurrentTurn(superseded, started.gen)).toBe(false);
  });

  it("a turn started after a supersession gets its own, current generation", () => {
    const first = startTurn(initialTurnGenState);
    const superseded = supersedeActiveTurn(first.state);
    const second = startTurn(superseded);

    expect(second.gen).not.toBe(first.gen);
    expect(isCurrentTurn(second.state, second.gen)).toBe(true);
    expect(isCurrentTurn(second.state, first.gen)).toBe(false);
  });

  it("superseding with no active turn is a no-op", () => {
    expect(supersedeActiveTurn(initialTurnGenState)).toBe(initialTurnGenState);
  });

  it("a turn that finishes on its own is no longer current", () => {
    const { state, gen } = startTurn(initialTurnGenState);
    const finished = finishTurn(state, gen);
    expect(isCurrentTurn(finished, gen)).toBe(false);
  });

  it("finishing an already-superseded turn does not clobber the turn that superseded it", () => {
    const first = startTurn(initialTurnGenState);
    const superseded = supersedeActiveTurn(first.state);
    const second = startTurn(superseded);

    // The first turn's own cleanup path calling finishTurn(first.gen) after
    // it was already superseded must be a no-op against the second turn.
    const result = finishTurn(second.state, first.gen);
    expect(result).toBe(second.state);
    expect(isCurrentTurn(result, second.gen)).toBe(true);
  });
});
