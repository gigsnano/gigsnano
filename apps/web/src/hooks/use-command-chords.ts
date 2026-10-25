"use client";

import { useEffect, useRef } from "react";

/** Map of `"g:h"` chord keys → handler. Built from the command-action catalog. */
export type ChordMap = Record<string, () => void>;

export type ChordResolution =
  | { kind: "fire"; handlerKey: string } // second key completed a known chord
  | { kind: "hold"; prefix: string } // first key is a prefix of some chord — wait
  | { kind: "reset" }; // nothing matched — clear any pending prefix

/**
 * Pure chord state transition (GIN-35). Given the currently-held prefix (or null)
 * and the next single-char key, decide whether a chord fired, a new prefix should
 * be held, or state resets. Kept pure so the sequence logic is unit-testable
 * without a DOM.
 */
export function resolveChord(prefix: string | null, key: string, chordKeys: Iterable<string>): ChordResolution {
  const keys = chordKeys instanceof Set ? chordKeys : new Set(chordKeys);
  if (prefix && keys.has(`${prefix}:${key}`)) return { kind: "fire", handlerKey: `${prefix}:${key}` };
  for (const chord of keys) {
    if (chord.startsWith(`${key}:`)) return { kind: "hold", prefix: key };
  }
  return { kind: "reset" };
}

/**
 * Pure matcher for modifier/single-key shortcuts (Ctrl+B, Ctrl+Shift+C, Ctrl+/,
 * plain /). Builds the canonical combo string — modifiers in fixed order
 * `ctrl`, `shift`, then the lowercased key, joined by `+` — matching how
 * `keySequence` is authored in the command catalog. `metaKey` (Cmd on Mac)
 * counts as `ctrl` so the same shortcuts work cross-platform.
 */
export function resolveModifierShortcut(
  e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; key: string },
  shortcutKeys: Iterable<string>,
): string | null {
  // ponytail: bail on Alt so AltGr (ctrl+alt on many non-US layouts) can't
  // misfire a ctrl-only shortcut; add an explicit alt token if one is needed.
  if (e.altKey) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  parts.push(e.key.toLowerCase());
  const combo = parts.join("+");
  const keys = shortcutKeys instanceof Set ? shortcutKeys : new Set(shortcutKeys);
  return keys.has(combo) ? combo : null;
}

/** Exported for unit testing the modifier-shortcut typing guard (no jsdom needed — plain objects). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

const CHORD_WINDOW_MS = 900;

/**
 * Register Plane-style two-key navigation chords (G→H, N→I, …) plus global
 * modifier/single-key shortcuts (Ctrl+B, Ctrl+Shift+C, Ctrl+/, plain /).
 * Ignores keystrokes while typing in a field — both two-key chords and
 * modifier shortcuts are skipped entirely so native editing keys (Ctrl+A,
 * Ctrl+B, plain `/`, …) keep working in inputs/textareas/contentEditable —
 * or when an unmapped modifier is held. Both maps are read through refs so
 * the listener subscribes once and never loses an in-flight prefix on
 * re-render.
 */
export function useCommandChords(
  chords: ChordMap,
  modifierShortcuts: ChordMap = {},
  enabled = true,
) {
  const chordsRef = useRef(chords);
  useEffect(() => {
    chordsRef.current = chords;
  }, [chords]);

  const modifierShortcutsRef = useRef(modifierShortcuts);
  useEffect(() => {
    modifierShortcutsRef.current = modifierShortcuts;
  }, [modifierShortcuts]);

  useEffect(() => {
    if (!enabled) return;
    let prefix: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      prefix = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      // Modifier shortcuts (Ctrl+B, plain /, …) only fire outside typing
      // targets, so native editing keys (Ctrl+A select-all, Ctrl+B bold, …)
      // still work in inputs/textareas/contentEditable.
      if (!isTypingTarget(e.target)) {
        const modKey = resolveModifierShortcut(e, Object.keys(modifierShortcutsRef.current));
        if (modKey !== null) {
          const handler = modifierShortcutsRef.current[modKey];
          clear();
          if (handler) {
            e.preventDefault();
            handler();
          }
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return clear();
      const key = e.key.toLowerCase();
      if (key.length !== 1) return clear();
      const result = resolveChord(prefix, key, Object.keys(chordsRef.current));
      if (result.kind === "fire") {
        const handler = chordsRef.current[result.handlerKey];
        clear();
        if (handler) {
          e.preventDefault();
          handler();
        }
      } else if (result.kind === "hold") {
        clear();
        prefix = result.prefix;
        timer = setTimeout(clear, CHORD_WINDOW_MS);
      } else {
        clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clear();
    };
  }, [enabled]);
}
