import { EDocumentSource, type IDocument } from "@/types";

export function documentsForStory(
  docs: IDocument[],
  storyId: string,
  workflow: string | null | undefined,
): IDocument[] {
  return docs.filter(
    (d) =>
      d.story_id === storyId ||
      (d.story_id == null && workflow != null && d.workflow === workflow),
  );
}

export function canDeleteDocument(doc: IDocument): boolean {
  return doc.source === EDocumentSource.User;
}

export function canEditDocument(doc: IDocument): boolean {
  return doc.source === EDocumentSource.User;
}

/** Agent artifact for a BMAD story, if one exists. */
export function agentDocumentForStory(
  docs: IDocument[],
  storyId: string,
  workflow: string | null | undefined,
): IDocument | undefined {
  return documentsForStory(docs, storyId, workflow).find((d) => d.source === EDocumentSource.Agent);
}

/** A deletion failure the user can act on, per status code.
 *
 * The distinctions matter: a 403 means ask someone else, a 404 means it is
 * already gone and the list is stale, and a network failure is worth retrying.
 * A single "something went wrong" would make all three look like the same
 * problem. Pure so it can be tested without a component.
 */
export function messageForDeleteFailure(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: number }).status
      : undefined;

  if (status === 403) {
    return "You do not have permission to delete this attachment.";
  }
  if (status === 404) {
    return "This attachment was already deleted. Refresh to see the current list.";
  }
  if (status === 409) {
    return "Someone else is deleting this attachment. Refresh and try again.";
  }
  if (status != null && status >= 500) {
    return "The server could not delete this attachment. Try again in a moment.";
  }
  return "Could not delete this attachment. Check your connection and try again.";
}
