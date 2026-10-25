"use client";

import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Settings01Icon,
  Tag01Icon,
  WorkflowSquare01Icon,
  ToggleOnIcon,
  UserGroupIcon,
  Calculator01Icon,
  CustomFieldIcon,
  ZapIcon,
  Flowchart01Icon,
  File01Icon,
  FolderGitIcon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { PanelNavLink, PanelSection } from "@/components/layout/panel/panel-nav";
import { useProject } from "@/hooks/project/use-projects";
import { ProjectLogo } from "@/components/projects/project-logo";
import { projectSetupPath } from "@/lib/nav/relocated-project-routes";
import { resolveProjectSolutionKey } from "@/lib/solutions/container-adapter";
import { SOLUTIONS_ENABLED } from "@/lib/solutions/solutions-flag";
import { ESolutionKey } from "@/types";

interface INavItem {
  label: string;
  href: string;
  icon: IconSvgElement;
  exact?: boolean;
}

export function ProjectSettingsNav({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: project } = useProject(workspaceSlug, projectId);
  const base = `/${workspaceSlug}/settings/projects/${projectId}`;

  // Setup pages are Software Delivery tools; other solutions never see them.
  const showSetup =
    !SOLUTIONS_ENABLED ||
    !project ||
    resolveProjectSolutionKey(project) === ESolutionKey.SoftwareDelivery;

  const groups: { title: string; items: INavItem[] }[] = [
    {
      title: "General",
      items: [
        { label: "General", href: base, icon: Settings01Icon, exact: true },
        { label: "Members", href: `${base}/members`, icon: UserGroupIcon },
      ],
    },
    {
      title: "Features",
      items: [{ label: "Features", href: `${base}/features`, icon: ToggleOnIcon }],
    },
    {
      title: "Work-Structure",
      items: [
        { label: "States", href: `${base}/states`, icon: WorkflowSquare01Icon },
        { label: "Workflow", href: `${base}/workflow`, icon: Flowchart01Icon },
        { label: "Labels", href: `${base}/labels`, icon: Tag01Icon },
        { label: "Estimates", href: `${base}/estimates`, icon: Calculator01Icon },
        { label: "Custom fields", href: `${base}/custom-fields`, icon: CustomFieldIcon },
      ],
    },
    {
      title: "Execution",
      items: [{ label: "Automations", href: `${base}/automation-rules`, icon: ZapIcon }],
    },
    ...(showSetup
      ? [
          {
            title: "Setup",
            items: [
              {
                label: "Document import",
                href: projectSetupPath(workspaceSlug, projectId, "document-import"),
                icon: File01Icon,
              },
              {
                label: "Repository",
                href: projectSetupPath(workspaceSlug, projectId, "repository"),
                icon: FolderGitIcon,
              },
              {
                label: "Foundation",
                href: projectSetupPath(workspaceSlug, projectId, "foundation"),
                icon: ShieldKeyIcon,
              },
            ],
          },
        ]
      : []),
  ];

  const isActive = (item: INavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  // Back returns to the project overview (leaves the settings shell).
  const backHref = `/${workspaceSlug}/projects/${projectId}`;

  return (
    <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push(backHref)}
        className="group/back flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground outline-none transition-colors duration-150 ease-out hover:bg-sidebar-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          className="size-4 transition-transform duration-150 ease-out group-hover/back:-translate-x-0.5"
        />
        Project settings
      </button>

      {/* Project identity header */}
      <div className="mb-1 flex items-center gap-2.5 px-2 py-2">
        {project ? (
          <ProjectLogo project={project} size="sm" className="bg-muted" />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-base">
            📁
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{project?.name ?? "Project"}</p>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
      </div>

      {/* Grouped settings links */}
      {groups.map((group) => (
        <PanelSection key={group.title} title={group.title}>
          {group.items.map((item) => (
            <PanelNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item)}
            />
          ))}
        </PanelSection>
      ))}
    </div>
  );
}
