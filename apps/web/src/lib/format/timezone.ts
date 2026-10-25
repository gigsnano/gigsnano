/** Timezone helpers for the digest delivery-timing UI (GIN-126/127). */

export const UTC = "UTC";

/**
 * The browser's IANA zone (GIN-127), or UTC if it can't be determined.
 *
 * Call from an event handler or a useState initializer, never during a server
 * render — on the server this resolves to the *host's* zone, which would both
 * be wrong and mismatch on hydration.
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UTC;
  } catch {
    return UTC;
  }
}

/**
 * Every IANA zone the runtime knows, plus UTC, plus whatever is currently saved.
 *
 * Both additions are load-bearing, not defensive padding:
 * - `supportedValuesOf` lists no `Etc/*` and no UTC (418 zones in Node, not one
 *   of them UTC). UTC is our stored default, so without adding it a user who
 *   moved off UTC could never move back.
 * - Runtimes disagree on canonical names — Node reports the legacy aliases
 *   (Asia/Calcutta, Europe/Kiev), newer V8 the modern ones (Asia/Kolkata,
 *   Europe/Kyiv). A zone saved by one client must stay selectable in another, or
 *   the select silently reads as a different zone than the one stored. Both
 *   spellings resolve to the same zone server-side, so keeping both is safe.
 */
export function timezoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return [...new Set([UTC, ...zones, current])].sort();
}

/** 0-23 → "08:00". The stored hour is always on the hour. */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// Constructing an Intl.DateTimeFormat is expensive and hourInViewerTime runs on
// every render of the settings form. The zone varies, so a single hoisted
// formatter won't do — cache one per zone instead (react-doctor/js-hoist-intl).
// Bounded in practice: two zones are in play, the viewer's and the selected one.
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = offsetFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
    });
    offsetFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** Minutes-of-month for `probe` as read in `tz` — day included so the delta
 * survives two zones landing on different calendar days. */
function zoneMinutes(tz: string, probe: Date): number {
  const parts = offsetFormatter(tz).formatToParts(probe);
  const part = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return part("day") * 1440 + part("hour") * 60 + part("minute");
}

/**
 * What `hour` local-to-`timezone` reads as on the viewer's own clock, e.g.
 * "04:30 your time" for a 09:00 Kolkata digest viewed from Berlin — the one
 * thing a timezone picker can't leave the user to work out in their head.
 * Null when the zones agree (nothing to explain) or the zone is unknown.
 */
export function hourInViewerTime(hour: number, timezone: string): string | null {
  const viewer = detectTimezone();
  if (viewer === timezone) return null;
  try {
    // Anchor on a fixed date: we want the offset delta, not today's DST state.
    const probe = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const deltaMinutes = zoneMinutes(viewer, probe) - zoneMinutes(timezone, probe);
    const total = (((hour * 60 + deltaMinutes) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return null;
  }
}
