/** Role → avatar accent classes (low-opacity tint + text), stable per BMAD role. */
const ROLE_ACCENTS: Record<string, string> = {
  Analyst: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "Product Manager": "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  Architect: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "UI/UX Architect": "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "Scrum Master": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  Developer: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
  "Test Engineer": "bg-teal-500/15 text-teal-600 dark:text-teal-300",
};

const FALLBACK = [
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
  "bg-lime-500/15 text-lime-600 dark:text-lime-300",
];

/** Accent classes for a role; deterministic hash fallback for unknown roles. */
export function agentAccent(role: string): string {
  if (ROLE_ACCENTS[role]) return ROLE_ACCENTS[role];
  let h = 0;
  for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}
