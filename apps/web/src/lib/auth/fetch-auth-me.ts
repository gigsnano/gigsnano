import { APIError } from "@/services/api-error";
import type { IAuthUser } from "@/types";

/**
 * Load the current session user.
 *
 * A 401 means "signed out", not a failed query: returning `null` (instead of
 * throwing) keeps React Query in a success state with no data. That matters
 * because TanStack Query preserves the previous successful `data` when a
 * refetch throws — AuthGuard treated that `isError` as signed-out while
 * GuestGuard still trusted the stale `data` and bounced back via `?next=`,
 * looping between the app and /sign-in.
 */
export async function fetchAuthMe(getMe: () => Promise<IAuthUser>): Promise<IAuthUser | null> {
  try {
    return await getMe();
  } catch (err) {
    if (err instanceof APIError && err.status === 401) return null;
    throw err;
  }
}
