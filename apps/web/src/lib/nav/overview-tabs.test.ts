import { describe, expect, it } from "vitest";

import { activeOverviewTab, overviewTabs } from "./overview-tabs";

const base = "/acme/projects/p1";

describe("overviewTabs", () => {
  it("lists Overview, Journey, Views with their URLs", () => {
    expect(overviewTabs(base, true)).toEqual([
      { id: "overview", label: "Overview", href: base },
      { id: "journey", label: "Journey", href: `${base}/journey` },
      { id: "views", label: "Views", href: `${base}/views` },
    ]);
  });

  it("hides Journey when its flag is off", () => {
    expect(overviewTabs(base, false).map((t) => t.id)).toEqual(["overview", "views"]);
  });
});

describe("activeOverviewTab", () => {
  it("matches the three tab roots", () => {
    expect(activeOverviewTab(base, base)).toBe("overview");
    expect(activeOverviewTab(`${base}/journey`, base)).toBe("journey");
    expect(activeOverviewTab(`${base}/views`, base)).toBe("views");
  });

  it("is null on deeper routes that own their own header", () => {
    expect(activeOverviewTab(`${base}/journey/step-1`, base)).toBeNull();
    expect(activeOverviewTab(`${base}/views/v1`, base)).toBeNull();
    expect(activeOverviewTab(`${base}/issues`, base)).toBeNull();
  });
});
