import type { ReactNode } from "react";

import { WorkspaceShell, WorkspaceGate } from "@/components/layout";

/**
 * Workspace data gate + persistent dual-rail shell.
 * Panel width/collapse are seeded pre-paint by `gn-panel-init` in the root
 * layout (`next/script` + `beforeInteractive`) so reloads restore without flash.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <WorkspaceGate workspaceSlug={workspaceSlug}>
      <WorkspaceShell workspaceSlug={workspaceSlug}>{children}</WorkspaceShell>
    </WorkspaceGate>
  );
}
