export interface IDueOption {
  key: "today" | "tomorrow" | "next-monday" | "none";
  label: string;
  /** Local calendar date as YYYY-MM-DD, or null to clear. */
  date: string | null;
}

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function plusDays(from: Date, days: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
}

/** Quick due-date picks for capture; "Next Monday" is always strictly after today. */
export function quickDueOptions(now: Date): IDueOption[] {
  const untilMonday = ((8 - now.getDay()) % 7) || 7;
  return [
    { key: "today", label: "Today", date: iso(now) },
    { key: "tomorrow", label: "Tomorrow", date: iso(plusDays(now, 1)) },
    { key: "next-monday", label: "Next Monday", date: iso(plusDays(now, untilMonday)) },
    { key: "none", label: "No date", date: null },
  ];
}
