/**
 * What the onboarding screen should actually do for this user (GIN-529).
 *
 * Onboarding used to render the create-workspace wizard unconditionally, which
 * dead-ends the person it matters most to: someone invited to an existing
 * workspace, who has no reason to create one and no way forward from that
 * screen. Creating a workspace is the last resort here, not the default.
 */

export type TOnboardingDestination =
  | { kind: "loading" }
  /** Already a member — go there; there is nothing to onboard. */
  | { kind: "workspace"; slug: string }
  /** Invited and not yet accepted — show the invite, not a wizard. */
  | { kind: "invite" }
  /** Genuinely nowhere to go: no memberships, no invites. */
  | { kind: "create" };

export function onboardingDestination({
  workspaces,
  invites,
  lastWorkspaceSlug,
}: {
  workspaces: { slug: string }[] | undefined;
  invites: { id: string; workspace_slug: string }[] | undefined;
  lastWorkspaceSlug?: string | null;
}): TOnboardingDestination {
  // Both lists must have landed. Deciding on a half-loaded picture is how you
  // flash "create a workspace" at someone who has three of them.
  if (!workspaces || !invites) return { kind: "loading" };

  if (workspaces.length) {
    const last = workspaces.find((w) => w.slug === lastWorkspaceSlug);
    return { kind: "workspace", slug: (last ?? workspaces[0]).slug };
  }
  if (invites.length) return { kind: "invite" };
  return { kind: "create" };
}
