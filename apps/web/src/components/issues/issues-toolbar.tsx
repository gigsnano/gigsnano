"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreHorizontalIcon,
  Analytics01Icon,
  Settings01Icon,
  Download01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportDialog, ImportDialog } from "./io";
import { IssuesToolbarControls } from "./toolbar/issues-toolbar-controls";

/** The Work Items secondary-nav toolbar (rendered into AppHeader's actions). */
export function IssuesToolbar({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <IssuesToolbarControls workspaceSlug={workspaceSlug} projectId={projectId} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More options">
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setExportOpen(true)}>
            <HugeiconsIcon icon={Download01Icon} className="size-4" />
            Export to Excel…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <HugeiconsIcon icon={Upload01Icon} className="size-4" />
            Import from Excel…
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <HugeiconsIcon icon={Analytics01Icon} className="size-4" />
            Analytics
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/${workspaceSlug}/projects/${projectId}/settings`}>
              <HugeiconsIcon icon={Settings01Icon} className="size-4" />
              Project settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExportDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <ImportDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}
