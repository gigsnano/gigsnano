/**
 * Compact relative label in either direction — "5m ago", "in 3h", "just now".
 * Falls back to a locale date past five weeks. Pure; `now` is injectable.
 *
 * The forward direction exists because it was silently missing: the difference
 * was computed as `now - then`, which is NEGATIVE for a future timestamp, and
 * the first branch (`sec < 45`) swallowed every negative value. So a workspace
 * invitation expiring in seven days rendered "expires just now" and read as
 * already expired — the field was correct, the sentence was not.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const signed = Math.round((now.getTime() - then) / 1000);
  const ahead = signed < 0;
  const sec = Math.abs(signed);

  // Past tense only for the past. Something about to happen is not "just now",
  // and that ambiguity is exactly what made an unexpired invitation look dead.
  if (sec < 45) return ahead ? "in a moment" : "just now";

  const band = (n: number, unit: string) => (ahead ? `in ${n}${unit}` : `${n}${unit} ago`);

  const min = Math.round(sec / 60);
  if (min < 60) return band(min, "m");
  const hr = Math.round(min / 60);
  if (hr < 24) return band(hr, "h");
  const day = Math.round(hr / 24);
  if (day < 7) return band(day, "d");
  const wk = Math.round(day / 7);
  if (wk < 5) return band(wk, "w");

  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
