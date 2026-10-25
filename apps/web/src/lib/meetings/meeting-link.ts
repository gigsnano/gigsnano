import { EMeetingPlatform } from "@/types";

/** Google Meet room codes look like `abc-defg-hij` — three groups of lowercase letters. */
const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/**
 * Tolerant of a missing scheme (e.g. "meet.google.com/abc-defg-hij") — `URL`
 * refuses those outright, so retry once with `https://` prepended.
 */
function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
}

/**
 * Client-side mirror of the backend's `parse_meeting_link` host rules — used
 * only to show a live platform chip in the send-notetaker dialog. The backend
 * stays authoritative at submit time.
 */
export function detectMeetingPlatform(url: string): EMeetingPlatform | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const parsed = parseUrl(trimmed);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host === "meet.google.com") {
    const code = path.replace(/^\//, "").split("/")[0]?.toLowerCase() ?? "";
    return MEET_CODE.test(code) ? EMeetingPlatform.GoogleMeet : null;
  }

  if (host === "teams.live.com" && /^\/meet\/\d+/.test(path)) {
    return EMeetingPlatform.Teams;
  }
  if (host === "teams.microsoft.com" && path.startsWith("/l/meetup-join/")) {
    return EMeetingPlatform.Teams;
  }

  if (host === "zoom.us" || host.endsWith(".zoom.us")) {
    if (/^\/j\/\d+/.test(path) || /^\/wc\/\d+/.test(path)) {
      return EMeetingPlatform.Zoom;
    }
  }

  return null;
}
