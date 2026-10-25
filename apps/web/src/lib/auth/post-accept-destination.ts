/**
 * Where an invitee lands the moment they accept (GIN-529).
 *
 * An admin can attach someone to a project while their invite is still out
 * (GIN-528), so by the time they accept there is usually exactly one project
 * visible to them — the reason they were invited. Dropping them on the
 * workspace home to go find it is a step with no decision in it.
 *
 * Returns null while the project list is still loading.
 */
export function postAcceptDestination(
  workspaceSlug: string,
  projects: { id: string }[] | undefined,
): string | null {
  if (!projects) return null;
  return projects.length === 1
    ? `/${workspaceSlug}/projects/${projects[0].id}`
    : `/${workspaceSlug}`;
}
