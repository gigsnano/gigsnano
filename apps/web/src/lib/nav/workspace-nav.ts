import {
  Folder01Icon,
  File01Icon,
  AiBrain01Icon,
  BubbleChatIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type WorkspaceApp = "workspace" | "docs" | "agents" | "rooms";
export type ActiveApp = WorkspaceApp | "settings";

export interface IWorkspaceAppDef {
  id: WorkspaceApp;
  label: string;
  icon: IconSvgElement;
  /** Href suffix appended to `/${workspaceSlug}` — "" is the workspace root. */
  path: string;
}

/** Top-of-rail app switchers, in display order. */
export const WORKSPACE_APPS: IWorkspaceAppDef[] = [
  { id: "workspace", label: "Projects", icon: Folder01Icon, path: "" },
  { id: "docs", label: "Docs", icon: File01Icon, path: "/docs" },
  { id: "agents", label: "Agents", icon: AiBrain01Icon, path: "/agents" },
  { id: "rooms", label: "Rooms", icon: BubbleChatIcon, path: "/rooms" },
];

/** Which top-level app a pathname belongs to, for a given workspace slug. */
export function resolveActiveApp(pathname: string, workspaceSlug: string): ActiveApp {
  const base = `/${workspaceSlug}`;
  if (pathname.startsWith(`${base}/settings`)) return "settings";
  if (pathname.startsWith(`${base}/docs`)) return "docs";
  if (pathname.startsWith(`${base}/agents`)) return "agents";
  if (pathname.startsWith(`${base}/rooms`)) return "rooms";
  return "workspace";
}

export const APP_TITLE: Record<ActiveApp, string> = {
  workspace: "Projects",
  docs: "Docs",
  agents: "Agents",
  rooms: "Rooms",
  settings: "Settings",
};
