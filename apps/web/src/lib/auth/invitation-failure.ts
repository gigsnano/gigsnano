import { APIError } from "@/services/api-error";

/**
 * Why accepting an invitation failed, in the invitee's terms.
 *
 * The accept page used to render one message — "This invite link has expired or
 * is not valid" — for every status except 403. The common case behind it was
 * **401**: the invitee has no account yet, so the very first click on a
 * perfectly good link reported the invitation as expired and offered no way
 * forward. Each status the backend distinguishes gets its own answer here.
 */
export type TInvitationFailureKind =
  | "signed-out"
  | "wrong-account"
  | "expired"
  | "settled"
  | "invalid"
  | "unknown";

export interface IInvitationFailure {
  kind: TInvitationFailureKind;
  title: string;
  description: string;
}

/** The backend's own `{ detail }`, when it sent one worth showing. */
function detailOf(error: unknown): string | null {
  if (!(error instanceof APIError)) return null;
  const detail = (error.data as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

export function invitationFailure(error: unknown): IInvitationFailure {
  const detail = detailOf(error);
  const status = error instanceof APIError ? error.status : 0;

  const of = (
    kind: TInvitationFailureKind,
    title: string,
    fallback: string,
  ): IInvitationFailure => ({ kind, title, description: detail ?? fallback });

  switch (status) {
    case 401:
      // Not a broken link — they simply have no session yet. Most invitees
      // reaching this page have never had a GigsNano account at all.
      return {
        kind: "signed-out",
        title: "Almost there",
        description:
          "Create your account (or sign in) to accept this invitation. Your invite stays valid.",
      };
    case 403:
      return of(
        "wrong-account",
        "Wrong account",
        "This invitation was sent to a different email. Sign in with that account to accept it.",
      );
    case 410:
      return of("expired", "Invitation expired", "This invitation has expired. Ask for a new one.");
    case 409:
      return of(
        "settled",
        "Invitation no longer open",
        "This invitation has already been used or was withdrawn.",
      );
    case 404:
      return of(
        "invalid",
        "Invalid invitation",
        "We don't recognise this invite link. It may have been replaced by a newer one.",
      );
    default:
      return {
        kind: "unknown",
        title: "Couldn't accept the invitation",
        description: "Something went wrong. Please try again.",
      };
  }
}
