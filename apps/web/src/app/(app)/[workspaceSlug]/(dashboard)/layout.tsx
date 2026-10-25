import type { ReactNode } from "react";

/**
 * The (dashboard) group no longer owns any chrome — the rail + panel live in the
 * persistent WorkspaceShell one level up ([workspaceSlug]/layout.tsx). Pages
 * render their own AppHeader + ContentWrapper inside the shell's <main>.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
