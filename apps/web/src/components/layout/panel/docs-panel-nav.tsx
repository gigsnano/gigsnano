"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon, Add01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { useDocuments } from "@/hooks/docs/use-documents";
import { PanelNavLink, PanelSection } from "./panel-nav";

export function DocsPanelNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/docs`;
  const { data: docs } = useDocuments(workspaceSlug);

  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3">
      <div className="pb-1 pt-2">
        <Button size="sm" className="w-full justify-start" disabled>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          New doc
        </Button>
      </div>
      <PanelNavLink href={base} label="All documents" icon={File01Icon} active={pathname === base} />
      <PanelSection title="Generated">
        {docs?.length ? (
          docs.map((doc) => (
            <Link
              key={doc.id}
              href={`/${workspaceSlug}/docs/${doc.id}`}
              className={
                pathname === `/${workspaceSlug}/docs/${doc.id}`
                  ? "block truncate rounded-md bg-sidebar-accent px-2.5 py-1.5 text-sm font-medium text-sidebar-accent-foreground"
                  : "block truncate rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }
            >
              {doc.title}
            </Link>
          ))
        ) : (
          <p className="px-2.5 py-1.5 text-sm text-muted-foreground">
            BMAD documents appear here as you complete Sprint-0.
          </p>
        )}
      </PanelSection>
    </div>
  );
}
