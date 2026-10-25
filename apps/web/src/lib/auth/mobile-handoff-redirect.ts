/** Where the browser goes after consent: the app's redirect URI plus the single-use code and echoed state. */
export function handoffRedirectUrl(redirectUri: string, code: string, state: string): string {
  const sep = redirectUri.includes("?") ? "&" : "?";
  return `${redirectUri}${sep}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
}

/** True when the backend refused the request itself (bad redirect or challenge), not a transient failure. */
export function isHandoffRejection(error: unknown): boolean {
  const e = error as { status?: number; code?: string; data?: { detail?: unknown; code?: unknown } } | null;
  if (!e || e.status !== 400) return false;
  const detail = e.data?.detail as { code?: unknown } | string | undefined;
  const code = e.code ?? (typeof detail === "object" ? detail?.code : undefined) ?? e.data?.code;
  return code === "invalid_redirect" || code === "invalid_challenge";
}

/** host:port of an Expo development server redirect (`exp://`), or null for any other redirect. */
export function expoDevHost(redirectUri: string): string | null {
  if (!redirectUri.startsWith("exp://")) return null;
  try {
    const { host } = new URL(redirectUri);
    if (host) return host;
  } catch {
    // fall through to the regex
  }
  return /^exp:\/\/([^/?#]+)/.exec(redirectUri)?.[1] ?? null;
}
