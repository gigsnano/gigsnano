import type { ReactNode } from "react";

/**
 * Settings chrome (rail + the settings panel nav) now lives in the persistent
 * WorkspaceShell. This group only needs to make its self-contained settings
 * pages scroll inside the shell's overflow-hidden <main>.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>;
}
