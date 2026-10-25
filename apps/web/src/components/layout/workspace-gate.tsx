"use client";

import { useState, type ReactNode } from "react";

import { useWorkspace } from "@/hooks/auth/use-auth";
import { EmptyState } from "@/components/empty-state";

/** Client workspace gate — notFound when slug is invalid (plane-architecture-guide §5). */
export function WorkspaceGate({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: ReactNode;
}) {
  const { isPending, isError, refetch } = useWorkspace(workspaceSlug);

  if (isPending) {
    return (
      <div className="flex h-svh items-center justify-center ">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-svh items-center  justify-center p-6">
        <EmptyState
          assetKey="error-404"
          title="Workspace not found"
          description={`We couldn't find a workspace at "${workspaceSlug}". Check the URL or create a new workspace.`}
          actions={[
            { label: "Create workspace", href: "/create-workspace" },
            { label: "Retry", onClick: () => refetch() },
          ]}
        />
      </div>
    );
  }

  return children;
}
