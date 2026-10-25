"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Settings01Icon,
  Tag01Icon,
  WorkflowSquare01Icon,
  Calculator01Icon,
  UserGroupIcon,
  ToggleOnIcon,
} from "@hugeicons/core-free-icons";

const LINKS = [
  { label: "General", href: "", icon: Settings01Icon, description: "Name, identifier, and cover" },
  { label: "Features", href: "features", icon: ToggleOnIcon, description: "Enable cycles, modules, views, pages" },
  { label: "Members", href: "members", icon: UserGroupIcon, description: "Project team and roles" },
  { label: "Labels", href: "labels", icon: Tag01Icon, description: "Color-coded story labels" },
  { label: "States", href: "states", icon: WorkflowSquare01Icon, description: "Kanban column names" },
  { label: "Estimates", href: "estimates", icon: Calculator01Icon, description: "Point scales for stories" },
  { label: "Automations", href: "automations", icon: WorkflowSquare01Icon, description: "Workflow rules (config only)" },
] as const;

export function ProjectSettingsHub({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const base = `/${workspaceSlug}/settings/projects/${projectId}`;

  return (
    <div className="p-6">
      <p className="text-sm text-muted-foreground">
        Project configuration lives in workspace settings — quick links below.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href ? `${base}/${item.href}` : base}
              className="flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30 active:scale-[0.99]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <HugeiconsIcon icon={item.icon} className="size-4" />
              </span>
              <span>
                <span className="text-sm font-semibold">{item.label}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
