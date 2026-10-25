import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PropertyPill } from "./property-pill";

/**
 * Regression guard for G-57: every create-modal picker renders PropertyPill via
 * Radix `<…Trigger asChild>`, whose Slot injects pointer/keyboard/aria props (and
 * a ref) that open the menu. PropertyPill MUST spread those onto its <button>;
 * dropping them silently disables every picker.
 */
describe("PropertyPill", () => {
  it("spreads Radix-injected trigger props onto the button", () => {
    const html = renderToStaticMarkup(
      <PropertyPill aria-haspopup="menu" aria-expanded={false} data-state="closed">
        Todo
      </PropertyPill>,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('data-state="closed"');
    expect(html).toContain("Todo");
  });

  it("still renders a type=button element by default", () => {
    const html = renderToStaticMarkup(<PropertyPill>Priority</PropertyPill>);
    expect(html).toContain('type="button"');
  });
});
