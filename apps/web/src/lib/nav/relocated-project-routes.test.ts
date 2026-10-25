import { describe, expect, it } from "vitest";

import {
  RELOCATED_PROJECT_SEGMENTS,
  projectSetupPath,
  relocatedProjectRedirects,
} from "./relocated-project-routes";

describe("relocated project routes", () => {
  it("covers exactly the three setup pages", () => {
    expect([...RELOCATED_PROJECT_SEGMENTS]).toEqual(["document-import", "repository", "foundation"]);
  });

  it("builds the settings path for a setup page", () => {
    expect(projectSetupPath("acme", "p1", "repository")).toBe(
      "/acme/settings/projects/p1/repository",
    );
  });

  it("redirects each old project URL to the same workspace + project in settings", () => {
    expect(relocatedProjectRedirects()).toEqual(
      RELOCATED_PROJECT_SEGMENTS.map((segment) => ({
        source: `/:workspaceSlug/projects/:projectId/${segment}`,
        destination: `/:workspaceSlug/settings/projects/:projectId/${segment}`,
        permanent: false,
      })),
    );
  });

  it("never relocates Codebase", () => {
    expect(relocatedProjectRedirects().some((r) => r.source.includes("codebase"))).toBe(false);
  });
});
