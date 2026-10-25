/**
 * Turn generation tracking — the pure decision behind "is this turn still the
 * one the user is talking to" (Task 13 fix, GIN-518).
 *
 * A superseded turn's `/speak/` POST can still be in flight when the user
 * interrupts it — the fetch abort only stops the network call, not a
 * response that has already landed and is sitting in a `.then()` about to
 * enqueue audio. The bug this closes: that stale response must never be
 * mistaken for belonging to the turn now in progress, even though nothing
 * about the number it captured earlier has changed. A generation counter
 * makes that unrepresentable — once a turn is superseded, no `gen` value can
 * ever compare equal to `active` again.
 *
 * Kept separate from `use-voice-call.ts`'s browser-bound orchestration
 * (fetch, MediaRecorder, AudioContext, refs) so this one property is
 * testable without a browser — the same reasoning `session-machine.ts` /
 * `vad.ts` / `playback.ts` already follow in this codebase.
 */

export interface ITurnGenState {
  /** The generation the NEXT turn will claim. Monotonic — never reused, even
   *  across a supersede/finish, so an old `gen` value can never come back
   *  around to matching `active` again. */
  next: number;
  /** The generation of the turn currently in flight, or null once it has
   *  finished or been superseded. */
  active: number | null;
}

export const initialTurnGenState: ITurnGenState = { next: 1, active: null };

/** Begin a new turn: claims the next generation and marks it active. The
 *  caller holds on to `gen` and passes it to `isCurrentTurn` before any side
 *  effect (enqueueing audio, updating captions) the turn produces later. */
export function startTurn(state: ITurnGenState): { state: ITurnGenState; gen: number } {
  const gen = state.next;
  return { state: { next: gen + 1, active: gen }, gen };
}

/** The active turn finished on its own (streamed to completion, failed, or
 *  its queued audio finished playing) — clears `active` so a later
 *  interruption has nothing to supersede. Identity if `gen` is not the
 *  active turn (already superseded or already finished) — finishing a stale
 *  turn must never clobber whichever turn is active now. */
export function finishTurn(state: ITurnGenState, gen: number): ITurnGenState {
  return state.active === gen ? { ...state, active: null } : state;
}

/** The user started talking again before the active turn finished. Bumps
 *  it out of `active` so `isCurrentTurn` can never again be true for it, even
 *  if its `/speak/` response is still in flight. Identity if there is no
 *  active turn to supersede (nothing to interrupt). */
export function supersedeActiveTurn(state: ITurnGenState): ITurnGenState {
  return state.active === null ? state : { ...state, active: null };
}

/** Whether `gen` is still the turn in flight — false once it has finished or
 *  been superseded by a newer one. */
export function isCurrentTurn(state: ITurnGenState, gen: number): boolean {
  return state.active === gen;
}
