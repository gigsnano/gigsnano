import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./oklch";
import { OKLCH_TOKENS, THEME, TOKEN_ROLES } from "./tokens";

const css = readFileSync(
  fileURLToPath(new URL("../../../../apps/web/src/app/globals.css", import.meta.url)),
  "utf8",
);

/** Declarations of every `selector { … }` block, later blocks winning (CSS order). */
function declarations(selector: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of css.matchAll(selector)) {
    for (const [, name, value] of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      out[name] = value.trim().replace(/\s+/g, " ");
    }
  }
  return out;
}

const web = {
  light: declarations(/(?:^|\n):root\s*\{([^}]*)\}/g),
  dark: declarations(/(?:^|\n)\.dark\s*\{([^}]*)\}/g),
};

describe("brand tokens", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const role of TOKEN_ROLES) {
      it(`${scheme} ${role} matches globals.css`, () => {
        expect(OKLCH_TOKENS[scheme][role]).toBe(web[scheme][role]);
      });
    }
  }

  it("health colours are readable as text on the background", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const role of ["success", "warning"] as const) {
        expect(contrastRatio(THEME[scheme][role], THEME[scheme].background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
