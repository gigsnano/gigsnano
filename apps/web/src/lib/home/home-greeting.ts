/** Time-aware greeting copy for the workspace home. Pure — `date` is injectable. */
export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 22) return "Good evening";
  return "Working late";
}

/** A small ambient glyph paired with the greeting (dawn/day/dusk/night). */
export function greetingEmoji(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "☀️";
  if (h >= 12 && h < 17) return "⛅";
  if (h >= 17 && h < 22) return "🌆";
  return "🌙";
}

/** "Thursday, July 2" — long, human date line under the greeting. */
export function formatHomeDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
