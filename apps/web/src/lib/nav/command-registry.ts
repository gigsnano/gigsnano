import type { IconSvgElement } from "@hugeicons/react";

export type CommandGroupKey =
  | "create" | "navigate" | "search" | "contextual" | "miscellaneous" | "preferences" | "help";
export type CommandPageKey =
  | "open-project" | "open-project-view" | "open-project-cycle" | "open-project-module"
  | "open-project-setting" | "open-workspace" | "open-workspace-setting" | "update-theme"
  | "update-work-item-state" | "update-work-item-priority";

export interface ICommandContext {
  base: string; // `/${workspaceSlug}`
  workspaceSlug: string;
  projectId?: string;
}

export interface ICommand {
  id: string;
  label: string;
  icon: IconSvgElement;
  group: CommandGroupKey;
  type: "action" | "change-page";
  keySequence?: string; // "gh", "ni", or modifier form "ctrl+b"
  page?: CommandPageKey; // required when type === "change-page"
  href?: (ctx: ICommandContext) => string; // for simple navigate actions
  isVisible?: (ctx: ICommandContext) => boolean;
}

/** Pure: keep only commands whose predicate (if any) passes for `ctx`. */
export function visibleCommands(commands: ICommand[], ctx: ICommandContext): ICommand[] {
  return commands.filter((c) => (c.isVisible ? c.isVisible(ctx) : true));
}
