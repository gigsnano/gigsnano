import type { IAuthUser } from "@/types";

/** Shared signed-in check so AuthGuard and GuestGuard cannot disagree. */
export function isSignedIn(
  data: IAuthUser | null | undefined,
  isPending: boolean,
  isError: boolean,
): data is IAuthUser {
  return !isPending && !isError && data != null;
}
