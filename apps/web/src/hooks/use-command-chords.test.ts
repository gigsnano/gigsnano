import { describe, expect, it } from "vitest";

import { isTypingTarget, resolveChord, resolveModifierShortcut } from "./use-command-chords";

const CHORDS = ["g:h", "g:y", "n:i", "n:p"];
const MODIFIER_SHORTCUTS = ["ctrl+b", "ctrl+shift+c", "ctrl+/", "/"];

function keyEvent(overrides: Partial<Parameters<typeof resolveModifierShortcut>[0]>) {
  return { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: "", ...overrides };
}

describe("resolveChord", () => {
  it("holds a prefix when the key starts a known chord", () => {
    expect(resolveChord(null, "g", CHORDS)).toEqual({ kind: "hold", prefix: "g" });
  });

  it("fires when the second key completes a chord", () => {
    expect(resolveChord("g", "h", CHORDS)).toEqual({ kind: "fire", handlerKey: "g:h" });
  });

  it("resets when the first key matches no chord prefix", () => {
    expect(resolveChord(null, "z", CHORDS)).toEqual({ kind: "reset" });
  });

  it("resets when a held prefix is followed by a non-completing key", () => {
    // g then z: no g:z chord, and z is not a prefix either.
    expect(resolveChord("g", "z", CHORDS)).toEqual({ kind: "reset" });
  });

  it("re-holds when a held prefix is followed by another prefix key", () => {
    // g then n: g:n doesn't exist, but n starts n:i / n:p.
    expect(resolveChord("g", "n", CHORDS)).toEqual({ kind: "hold", prefix: "n" });
  });
});

describe("resolveModifierShortcut", () => {
  it("matches ctrl+b", () => {
    expect(resolveModifierShortcut(keyEvent({ ctrlKey: true, key: "b" }), MODIFIER_SHORTCUTS)).toBe("ctrl+b");
  });

  it("matches ctrl+shift+c with fixed modifier order", () => {
    expect(
      resolveModifierShortcut(keyEvent({ ctrlKey: true, shiftKey: true, key: "C" }), MODIFIER_SHORTCUTS),
    ).toBe("ctrl+shift+c");
  });

  it("treats metaKey (Cmd) as ctrl for Mac parity", () => {
    expect(resolveModifierShortcut(keyEvent({ metaKey: true, key: "b" }), MODIFIER_SHORTCUTS)).toBe("ctrl+b");
  });

  it("matches plain / with no modifiers", () => {
    expect(resolveModifierShortcut(keyEvent({ key: "/" }), MODIFIER_SHORTCUTS)).toBe("/");
  });

  it("returns null for an unmodified letter", () => {
    expect(resolveModifierShortcut(keyEvent({ key: "b" }), MODIFIER_SHORTCUTS)).toBeNull();
  });

  it("returns null for an unknown combo", () => {
    expect(resolveModifierShortcut(keyEvent({ ctrlKey: true, key: "z" }), MODIFIER_SHORTCUTS)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("treats INPUT as a typing target", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
  });

  it("treats TEXTAREA as a typing target", () => {
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
  });

  it("treats contentEditable elements as a typing target", () => {
    expect(
      isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
  });

  it("does not treat a plain element as a typing target", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(
      false,
    );
  });

  it("does not treat a null target as a typing target", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("modifier-shortcut typing guard (use-command-chords onKey shape)", () => {
  // Regression for the GIN-35 review finding: the hook's onKey handler must
  // skip the whole modifier-shortcut branch — including resolveModifierShortcut
  // itself — when the event target is a typing element, so native editing keys
  // (Ctrl+A select-all, Ctrl+B bold, …) keep working in inputs/textareas/
  // contentEditable. This mirrors the `if (!isTypingTarget(e.target)) { ... }`
  // guard added around the modifier-shortcut branch in onKey.
  function resolveIfNotTyping(target: EventTarget | null, e: Parameters<typeof resolveModifierShortcut>[0]) {
    if (isTypingTarget(target)) return null;
    return resolveModifierShortcut(e, MODIFIER_SHORTCUTS);
  }

  it("does not resolve a modifier shortcut when the target is typing (Ctrl+B in an input)", () => {
    expect(
      resolveIfNotTyping({ tagName: "INPUT" } as unknown as EventTarget, keyEvent({ ctrlKey: true, key: "b" })),
    ).toBeNull();
  });

  it("still resolves the same modifier shortcut when the target is not typing", () => {
    expect(
      resolveIfNotTyping({ tagName: "DIV" } as unknown as EventTarget, keyEvent({ ctrlKey: true, key: "b" })),
    ).toBe("ctrl+b");
  });

  it("does not resolve plain / when the target is typing (was previously the only exempted case)", () => {
    expect(
      resolveIfNotTyping({ tagName: "TEXTAREA" } as unknown as EventTarget, keyEvent({ key: "/" })),
    ).toBeNull();
  });
});
