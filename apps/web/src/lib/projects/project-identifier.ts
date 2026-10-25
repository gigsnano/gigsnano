/** Suggested project code from its name: initials, up to 4, uppercased. */
export function deriveIdentifier(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}
