/**
 * Accept only same-origin relative paths for post-login redirects.
 * Rejects protocol-relative URLs, absolute URLs, backslashes, and control chars.
 */
export function sanitizeAuthRedirect(
  next: string | null | undefined,
  fallback: string,
): string {
  if (!next) {
    return fallback;
  }

  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (trimmed.includes("\\") || /[\u0000-\u001f]/.test(trimmed)) {
    return fallback;
  }
  // Block `/javascript:`, `/data:`, etc.
  if (/^\/[^/]*:/i.test(trimmed)) {
    return fallback;
  }

  try {
    // Only the path decides the origin; a query value may legitimately carry an
    // encoded URL (e.g. the mobile hand-off's redirect_uri).
    const decoded = decodeURIComponent(trimmed.split("?")[0]);
    if (decoded.includes("://") || decoded.startsWith("//")) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return trimmed;
}
