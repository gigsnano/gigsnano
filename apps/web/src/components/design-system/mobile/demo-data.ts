import type { TIosTint } from "@gigsnano/core";

/** Showcase-only fixtures. Fictional names — never real clients. */

export type TDemoStatus = "backlog" | "todo" | "in_progress" | "review" | "done";

export interface IDemoProject {
  id: string;
  name: string;
  tint: TIosTint;
  open: number;
  atRisk?: boolean;
}

export interface IDemoItem {
  id: string;
  title: string;
  note?: string;
  due?: string;
  overdue?: boolean;
  /** 0 none · 1 ! · 2 !! · 3 !!! — Reminders-style marks. */
  priority: 0 | 1 | 2 | 3;
  status: TDemoStatus;
  needsYou?: boolean;
  assignee?: string;
  projectId: string;
}

export const DEMO_PROJECTS: IDemoProject[] = [
  { id: "atlas", name: "Atlas Mobile", tint: "blue", open: 14 },
  { id: "ledger", name: "Ledger Revamp", tint: "orange", open: 9, atRisk: true },
  { id: "harbor", name: "Harbor Docs", tint: "green", open: 6 },
  { id: "nova", name: "Nova Onboarding", tint: "purple", open: 11 },
];

export const DEMO_ITEMS: IDemoItem[] = [
  {
    id: "1", title: "Wire push permission prompt", note: "Ask after first completed item, not on launch",
    due: "Today, 3:00 PM", priority: 2, status: "in_progress", assignee: "MK", projectId: "atlas",
  },
  {
    id: "2", title: "Approve PRD v2", due: "Yesterday", overdue: true, priority: 3,
    status: "review", needsYou: true, assignee: "AL", projectId: "atlas",
  },
  { id: "3", title: "Offline banner copy", due: "Fri", priority: 0, status: "todo", projectId: "atlas" },
  {
    id: "4", title: "Sync tokens with web theme", note: "Parity test guards drift", priority: 1,
    status: "todo", assignee: "RS", projectId: "atlas",
  },
  { id: "5", title: "Spike: widget for Today", priority: 0, status: "backlog", projectId: "atlas" },
  { id: "6", title: "Sign-in with Google", priority: 0, status: "done", projectId: "atlas" },
];

export const STATUS_LABEL: Record<TDemoStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};
