// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml", () => {
  it("strips the GIN-354 img/onerror payload but keeps the surrounding prose", () => {
    const out = sanitizeHtml('<p>hi</p><img src=x onerror="alert(document.cookie)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
    expect(out).toContain("hi");
  });

  it("drops <script> tags", () => {
    expect(sanitizeHtml('<script>alert(1)</script><p>ok</p>')).not.toContain("script");
  });

  it("keeps ordinary rich-text formatting intact", () => {
    const out = sanitizeHtml("<p><strong>bold</strong> and <em>italic</em></p>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
  });
});
