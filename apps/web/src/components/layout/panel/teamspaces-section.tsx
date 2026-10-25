"use client";

import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";

import { useTeamspaces } from "@/hooks/teamspace/use-teamspaces";
import { CreateTeamspaceDialog } from "@/components/teamspaces/create-teamspace-dialog";

import { PanelCollapsibleSection, PanelNavLink } from "./panel-nav";

/** Rail B — teamspaces list; each opens its overview. "+" mints a new one. */
export function TeamspacesSection({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const { data } = useTeamspaces(workspaceSlug);
  const base = `/${workspaceSlug}/teamspaces`;

  return (
    <div className="pt-1">
      <PanelCollapsibleSection
        title="Teamspaces"
        action={
          <CreateTeamspaceDialog workspaceSlug={workspaceSlug}>
            <button
              type="button"
              aria-label="New teamspace"
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            </button>
          </CreateTeamspaceDialog>
        }
      >
        {data?.length ? (
          data.map((t) => {
            const href = `${base}/${t.id}`;
            return (
              <PanelNavLink
                key={t.id}
                href={href}
                label={t.name}
                icon={UserGroupIcon}
                active={pathname === href}
              />
            );
          })
        ) : (
          <p className="px-2.5 py-1.5 text-sm text-muted-foreground">No teamspaces yet.</p>
        )}
      </PanelCollapsibleSection>
    </div>
  );
}
