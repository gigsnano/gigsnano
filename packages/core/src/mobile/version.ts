function parts(v: string): number[] {
  return v.split(".").map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** Numeric semver compare; prerelease and non-numeric segments count as 0. */
export function isBelowMinVersion(current: string, min: string): boolean {
  const a = parts(current);
  const b = parts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
