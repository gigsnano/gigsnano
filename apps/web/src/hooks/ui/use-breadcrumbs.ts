"use client";

import { useParams, usePathname } from "next/navigation";

import { ROUTE_LABELS, titleCaseSegment } from "@/constants/route-labels";
import { useProject } from "@/hooks/project/use-projects";
import { useDocument } from "@/hooks/docs/use-documents";
import { usePage } from "@/hooks/docs/use-pages";
import { useAgents } from "@/hooks/agents/use-agents";
import { useStory } from "@/hooks/story/use-stories";
import { useCycle } from "@/hooks/project/use-cycles";
import { useDashboard } from "@/hooks/workspace/use-dashboards";
import { useMeeting } from "@/hooks/meetings/use-meetings";
import { storyCode } from "@/lib/issues/issue-routes";

export interface IBreadcrumbItem {
  label: string;
  href?: string;
  isCurrent: boolean;
}

/**
 * Derives the breadcrumb chain from the current route. Pure derivation from
 * `usePathname()` + `useParams()` — no per-page wiring. The workspace segment is
 * dropped (it lives in AppTopBar); the chain starts at the app section. The
 * dynamic project segment resolves to the project's name via `useProject`.
 */
export function useBreadcrumbs(): IBreadcrumbItem[] {
  const pathname = usePathname() ?? "";
  const params = useParams<{
    workspaceSlug?: string;
    projectId?: string;
    cycleId?: string;
    moduleId?: string;
    documentId?: string;
    pageId?: string;
    agentId?: string;
    storyId?: string;
    dashboardId?: string;
    meetingId?: string;
  }>();

  const workspaceSlug = params.workspaceSlug ?? "";
  const projectId = params.projectId;
  const documentId = params.documentId;
  const pageId = params.pageId;
  const agentId = params.agentId;
  const storyId = params.storyId;
  const meetingId = params.meetingId;

  const { data: project } = useProject(workspaceSlug, projectId ?? "");
  const { data: document } = useDocument(workspaceSlug, documentId ?? "");
  const { data: page } = usePage(workspaceSlug, projectId ?? "", pageId ?? "");
  const { data: agents } = useAgents(workspaceSlug);
  const { data: story } = useStory(workspaceSlug, projectId ?? "", storyId ?? "");
  const { data: cycle } = useCycle(workspaceSlug, projectId ?? "", params.cycleId ?? "");
  const { data: dashboard } = useDashboard(workspaceSlug, params.dashboardId ?? "");
  const { data: meeting } = useMeeting(workspaceSlug, projectId ?? "", meetingId ?? "");

  const segments = pathname.split("/").filter(Boolean);
  // Drop the leading workspace slug segment.
  const rest = segments[0] === workspaceSlug ? segments.slice(1) : segments;

  let href = workspaceSlug ? `/${workspaceSlug}` : "";
  const items: IBreadcrumbItem[] = [];

  rest.forEach((segment, i) => {
    href += `/${segment}`;
    const isCurrent = i === rest.length - 1;

    let label: string;
    if (segment === projectId) {
      label = project?.name ?? project?.identifier ?? "Project";
    } else if (segment === documentId) {
      label = document?.title ?? "Document";
    } else if (segment === pageId) {
      label = page?.title ?? "Page";
    } else if (segment === agentId) {
      label = agents?.find((a) => a.id === agentId)?.name ?? "Agent";
    } else if (segment === params.cycleId) {
      label = cycle?.name ?? "Cycle";
    } else if (segment === params.moduleId) {
      label = "Module";
    } else if (segment === params.dashboardId) {
      label = dashboard?.name ?? "Dashboard";
    } else if (segment === storyId && story) {
      const identifier = project?.identifier ?? "—";
      label = storyCode(identifier, story);
    } else if (segment === meetingId) {
      label = meeting?.title ?? "Meeting";
    } else {
      label = ROUTE_LABELS[segment] ?? titleCaseSegment(segment);
    }

    items.push({ label, href: isCurrent ? undefined : href, isCurrent });
  });

  // At the workspace root there are no sub-segments — show a single "Home" crumb.
  if (workspaceSlug && items.length === 0) {
    return [{ label: "Home", isCurrent: true }];
  }

  return items;
}
