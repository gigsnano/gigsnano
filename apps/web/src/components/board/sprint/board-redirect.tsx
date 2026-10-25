"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useCycles } from "@/hooks/project/use-cycles";

/**
 * The standalone BMAD board is retired — Sprint-0 now lives on the standard
 * cycle route (a normal work-items view scoped to the Sprint-0 cycle). Any old
 * `/board` link is bounced to that cycle so bookmarks keep working.
 */
export function BoardRedirect({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  const { data: cycles, isPending } = useCycles(workspaceSlug, projectId);

  useEffect(() => {
    if (isPending) return;
    const sprintZero = cycles?.find((c) => c.is_sprint_zero) ?? cycles?.[0];
    router.replace(
      sprintZero
        ? `/${workspaceSlug}/projects/${projectId}/cycles/${sprintZero.id}`
        : `/${workspaceSlug}/projects/${projectId}/cycles`,
    );
  }, [cycles, isPending, projectId, router, workspaceSlug]);

  return <div className="m-6 h-32 animate-pulse rounded-lg border bg-muted" />;
}
