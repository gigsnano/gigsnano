/**
 * Silent session refresh.
 *
 * The backend access cookie (`gn_access`) lives only 15 min; the refresh cookie
 * (`gn_refresh`, path `/api/auth`, 30 days) mints a new one via
 * `POST /auth/refresh/`. Without this, the first request after 15 min 401s and
 * the auth guards bounce the user to /sign-in mid-session.
 *
 * Shared by `APIService` (REST) and the SSE chat transport so both recover
 * transparently. Single-flight: a burst of concurrent 401s (the issue peek
 * fires ~15 requests at once) triggers exactly one refresh call.
 */

let inFlight: Promise<boolean> | null = null;
// After a failed refresh the session is gone (no/expired refresh cookie) or the
// backend is rate-limiting `/auth/refresh/` (20/min). Backing off stops a burst
// of 401s from hammering refresh into a 429 lockout — the guards just bounce to
// /sign-in instead. Reset on any successful refresh or explicit sign-in.
const REFRESH_BACKOFF_MS = 10_000;
let backoffUntil = 0;

/** Attempt to rotate the session cookies. Resolves true on success. */
export function refreshSession(baseURL: string): Promise<boolean> {
  if (Date.now() < backoffUntil) return Promise.resolve(false);
  inFlight ??= fetch(`${baseURL}/auth/refresh/`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => {
      backoffUntil = res.ok ? 0 : Date.now() + REFRESH_BACKOFF_MS;
      return res.ok;
    })
    .catch(() => {
      backoffUntil = Date.now() + REFRESH_BACKOFF_MS;
      return false;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Clear the refresh back-off (call after a fresh sign-in seeds new cookies). */
export function resetRefreshBackoff(): void {
  backoffUntil = 0;
}

export { isAuthEntryPath } from "@gigsnano/core";
