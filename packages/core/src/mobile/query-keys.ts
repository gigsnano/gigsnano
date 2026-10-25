export const MQK = {
  me: ["me"],
  workspaces: ["workspaces"],
  briefing: (ws: string) => ["briefing", ws],
  inbox: (ws: string) => ["inbox", ws],
  projects: (ws: string) => ["projects", ws],
  project: (ws: string, pid: string) => ["project", ws, pid],
  stories: (ws: string, pid: string, filter: string) => ["stories", ws, pid, filter],
  story: (ws: string, pid: string, sid: string) => ["story", ws, pid, sid],
  reports: (ws: string, range: string) => ["reports", ws, range],
  pushPrefs: ["push-prefs"],
} as const;
