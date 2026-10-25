import { describe, expect, it } from "vitest";

import { onboardingDestination } from "./onboarding-destination";

const ws = (slug: string) => ({ slug });
const invite = (id: string, workspace_slug: string) => ({ id, workspace_slug });

describe("onboardingDestination", () => {
  it("waits while either list is still loading", () => {
    expect(onboardingDestination({ workspaces: undefined, invites: [] })).toEqual({
      kind: "loading",
    });
    expect(onboardingDestination({ workspaces: [], invites: undefined })).toEqual({
      kind: "loading",
    });
  });

  it("sends an existing member straight into their workspace (GIN-529)", () => {
    expect(onboardingDestination({ workspaces: [ws("acme")], invites: [] })).toEqual({
      kind: "workspace",
      slug: "acme",
    });
  });

  it("prefers the last workspace the user was in", () => {
    expect(
      onboardingDestination({
        workspaces: [ws("acme"), ws("globex")],
        invites: [],
        lastWorkspaceSlug: "globex",
      }),
    ).toEqual({ kind: "workspace", slug: "globex" });
  });

  it("ignores a last workspace the user no longer belongs to", () => {
    expect(
      onboardingDestination({
        workspaces: [ws("acme")],
        invites: [],
        lastWorkspaceSlug: "gone",
      }),
    ).toEqual({ kind: "workspace", slug: "acme" });
  });

  it("offers the invite instead of asking an invitee to create a workspace", () => {
    expect(
      onboardingDestination({ workspaces: [], invites: [invite("i1", "acme")] }),
    ).toEqual({ kind: "invite" });
  });

  it("routes a member who also has an invite into the workspace they already joined", () => {
    // Accepting is their choice to make later; nothing here should block the
    // workspace they can already open.
    expect(
      onboardingDestination({ workspaces: [ws("acme")], invites: [invite("i1", "other")] }),
    ).toEqual({ kind: "workspace", slug: "acme" });
  });

  it("only asks to create a workspace when the user truly has nothing", () => {
    expect(onboardingDestination({ workspaces: [], invites: [] })).toEqual({ kind: "create" });
  });
});
