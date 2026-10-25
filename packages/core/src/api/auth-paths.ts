/**
 * Paths where a 401 means "bad or absent credentials", not "expired session" —
 * refreshing and retrying these is pointless or would loop.
 */
export function isAuthEntryPath(path: string): boolean {
  return (
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/sign-in") ||
    path.startsWith("/auth/sign-up") ||
    path.startsWith("/auth/google") ||
    path.startsWith("/auth/sign-out") ||
    path.startsWith("/auth/mobile")
  );
}
