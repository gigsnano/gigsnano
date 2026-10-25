"use client";

import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  GridViewIcon,
  Layers01Icon,
  Settings01Icon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";

import { useProjects } from "@/hooks/project/use-projects";
import { useProjectViews } from "@/hooks/project/use-views";
import { useCycles } from "@/hooks/project/use-cycles";
import { useModules } from "@/hooks/project/use-modules";
import { useWorkspaces } from "@/hooks/auth/use-auth";
import type { CommandPageKey, ICommandContext } from "@/lib/nav/command-registry";
import { CommandGroup, CommandItem } from "@/components/ui/command";

const PAGE_TITLES: Record<CommandPageKey, string> = {
  "open-project": "Open a project",
  "open-project-view": "Open a view",
  "open-project-cycle": "Open a cycle",
  "open-project-module": "Open a module",
  "open-project-setting": "Open a project setting",
  "open-workspace": "Open a workspace",
  "open-workspace-setting": "Open a workspace setting",
  "update-theme": "Change theme",
  // Rendered by ContextualActions instead — kept here only so this map stays
  // exhaustive over CommandPageKey.
  "update-work-item-state": "Change state",
  "update-work-item-priority": "Change priority",
};

/** `[label, slug]`; empty slug means "no sub-path" (General). */
const PROJECT_SETTINGS: [string, string][] = [
  ["General", ""],
  ["States", "states"],
  ["Labels", "labels"],
  ["Members", "members"],
  ["Estimates", "estimates"],
  ["Features", "features"],
  ["Automations", "automations"],
];

const WORKSPACE_SETTINGS: [string, string][] = [
  ["General", "settings"],
  ["Members", "settings/members"],
  ["Billing", "settings/billing"],
  ["Integrations", "settings/integrations"],
  ["Imports", "settings/imports"],
  ["Exports", "settings/exports"],
  ["Webhooks", "settings/webhooks"],
];

const THEME_OPTIONS = ["light", "dark", "system"];

interface PageProps {
  ctx: ICommandContext;
  go: (href: string) => void;
}

function ThemePage({ onBack }: { onBack: () => void }) {
  const { setTheme } = useTheme();
  return (
    <>
      {THEME_OPTIONS.map((t) => (
        <CommandItem
          key={t}
          value={t}
          onSelect={() => {
            setTheme(t);
            onBack();
          }}
        >
          <HugeiconsIcon icon={PaintBoardIcon} />
          <span className="capitalize">{t}</span>
        </CommandItem>
      ))}
    </>
  );
}

function ProjectPage({ ctx, go }: PageProps) {
  const { data } = useProjects(ctx.workspaceSlug);
  return (
    <>
      {(data ?? []).map((p) => (
        <CommandItem
          key={p.id}
          value={`project ${p.name}`}
          onSelect={() => go(`${ctx.base}/projects/${p.id}/issues`)}
        >
          <HugeiconsIcon icon={Folder01Icon} />
          <span>{p.name}</span>
        </CommandItem>
      ))}
    </>
  );
}

function WorkspacePage({ go }: PageProps) {
  const { data } = useWorkspaces();
  return (
    <>
      {(data ?? []).map((w) => (
        <CommandItem key={w.id} value={`workspace ${w.name}`} onSelect={() => go(`/${w.slug}`)}>
          <HugeiconsIcon icon={Folder01Icon} />
          <span>{w.name}</span>
        </CommandItem>
      ))}
    </>
  );
}

function ProjectViewPage({ ctx, go }: PageProps) {
  // "open-project-view" command is only reachable while ctx.projectId is set
  // (isVisible: inProject in command-actions.ts); useProjectViews also has
  // its own `enabled` gate on (workspaceSlug && projectId).
  const { data } = useProjectViews(ctx.workspaceSlug, ctx.projectId ?? "");
  return (
    <>
      {(data ?? []).map((v) => (
        <CommandItem
          key={v.id}
          value={`view ${v.name}`}
          onSelect={() => go(`${ctx.base}/projects/${ctx.projectId}/views/${v.id}`)}
        >
          <HugeiconsIcon icon={GridViewIcon} />
          <span>{v.name}</span>
        </CommandItem>
      ))}
    </>
  );
}

function ProjectCyclePage({ ctx, go }: PageProps) {
  const { data } = useCycles(ctx.workspaceSlug, ctx.projectId ?? "");
  return (
    <>
      {(data ?? []).map((c) => (
        <CommandItem
          key={c.id}
          value={`cycle ${c.name}`}
          onSelect={() => go(`${ctx.base}/projects/${ctx.projectId}/cycles/${c.id}`)}
        >
          <HugeiconsIcon icon={GridViewIcon} />
          <span>{c.name}</span>
        </CommandItem>
      ))}
    </>
  );
}

function ProjectModulePage({ ctx, go }: PageProps) {
  const { data } = useModules(ctx.workspaceSlug, ctx.projectId ?? "");
  return (
    <>
      {(data ?? []).map((m) => (
        <CommandItem
          key={m.id}
          value={`module ${m.name}`}
          onSelect={() => go(`${ctx.base}/projects/${ctx.projectId}/modules/${m.id}`)}
        >
          <HugeiconsIcon icon={Layers01Icon} />
          <span>{m.name}</span>
        </CommandItem>
      ))}
    </>
  );
}

function StaticListPage({
  items,
  toHref,
  go,
}: {
  items: [string, string][];
  toHref: (slug: string) => string;
  go: (href: string) => void;
}) {
  return (
    <>
      {items.map(([label, slug]) => (
        <CommandItem key={label} value={label} onSelect={() => go(toHref(slug))}>
          <HugeiconsIcon icon={Settings01Icon} />
          <span>{label}</span>
        </CommandItem>
      ))}
    </>
  );
}

interface SubPickerProps {
  page: CommandPageKey;
  ctx: ICommandContext;
  go: (href: string) => void;
  onBack: () => void;
}

/** One `CommandGroup` per `CommandPageKey`, sourced from the confirmed hook (or
 * a static list) for that page. Rendered instead of the Create/Navigate/Search
 * groups while the palette store has `page !== null`. */
export function SubPicker({ page, ctx, go, onBack }: SubPickerProps) {
  return (
    <CommandGroup heading={PAGE_TITLES[page]}>
      {page === "open-project" ? <ProjectPage ctx={ctx} go={go} /> : null}
      {page === "open-workspace" ? <WorkspacePage ctx={ctx} go={go} /> : null}
      {page === "open-project-view" ? <ProjectViewPage ctx={ctx} go={go} /> : null}
      {page === "open-project-cycle" ? <ProjectCyclePage ctx={ctx} go={go} /> : null}
      {page === "open-project-module" ? <ProjectModulePage ctx={ctx} go={go} /> : null}
      {page === "open-project-setting" ? (
        <StaticListPage
          items={PROJECT_SETTINGS}
          toHref={(slug) => `${ctx.base}/settings/projects/${ctx.projectId}/${slug}`.replace(/\/$/, "")}
          go={go}
        />
      ) : null}
      {page === "open-workspace-setting" ? (
        <StaticListPage items={WORKSPACE_SETTINGS} toHref={(slug) => `${ctx.base}/${slug}`} go={go} />
      ) : null}
      {page === "update-theme" ? <ThemePage onBack={onBack} /> : null}
    </CommandGroup>
  );
}
