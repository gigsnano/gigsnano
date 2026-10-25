"use client";

import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, BookmarkAdd01Icon } from "@hugeicons/core-free-icons";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useMembers } from "@/hooks/workspace/use-members";
import { useProjectLabels, useCustomFields } from "@/hooks/project/use-project-settings";
import { useProjectViews } from "@/hooks/project/use-views";
import { useCycles } from "@/hooks/project/use-cycles";
import { useModules } from "@/hooks/project/use-modules";
import { ECustomFieldType } from "@/types";
import { ISSUE_FILTER_PRESETS } from "@/constants/issue-filter-presets";
import {
  useIssuesViewStore,
  countActiveFilters,
} from "@/store/ui/issues-view.store";

import { CreateViewDialog } from "@/components/views/create-view-dialog";

import { GigsqlEditor } from "./gigsql-editor";
import { VisualFilterPanel } from "./visual-filter-panel";

type TFilterMode = "visual" | "gigsql";

/**
 * "Filter" popover — a Jira-style two-column Visual panel and the GigsQL editor,
 * switchable via the tabs, plus a "Saved filters" menu (system presets + this
 * project's saved Views, and a "Save current filter…" action). Both modes
 * read/write the single canonical gigsql query (the Visual panel through the
 * store facets, which auto-sync the query), so switching modes round-trips.
 */
export function IssuesFilterPopover({
  workspaceSlug,
  projectId,
  trigger,
}: {
  workspaceSlug: string;
  projectId: string;
  trigger: ReactNode;
}) {
  const [mode, setMode] = useState<TFilterMode>("visual");
  const [saveOpen, setSaveOpen] = useState(false);
  const filters = useIssuesViewStore((s) => s.filters);
  const gigsqlQuery = useIssuesViewStore((s) => s.gigsqlQuery);
  const setGigsqlQuery = useIssuesViewStore((s) => s.setGigsqlQuery);
  const clear = useIssuesViewStore((s) => s.clearFilters);
  const { data: members } = useMembers(workspaceSlug);
  const { data: labels } = useProjectLabels(workspaceSlug, projectId);
  const { data: views } = useProjectViews(workspaceSlug, projectId);
  const { data: cycles } = useCycles(workspaceSlug, projectId);
  const { data: modules } = useModules(workspaceSlug, projectId);
  const customFields = useCustomFields(workspaceSlug, projectId);
  const selectFields = (customFields.data ?? []).flatMap((f) =>
    f.field_type === ECustomFieldType.Select
      ? [{ id: f.id, name: f.name, options: f.options ?? [] }]
      : [],
  );
  const active = countActiveFilters(filters) || (gigsqlQuery.trim() ? 1 : 0);

  const assigneeOptions = (members ?? []).map((m) => ({
    value: m.user_id ?? m.id,
    label: m.display_name,
  }));
  const labelOptions = (labels ?? []).map((l) => ({ value: l.id, label: l.name }));
  const cycleOptions = (cycles ?? []).map((c) => ({ value: c.id, label: c.name }));
  const moduleOptions = (modules ?? []).map((m) => ({ value: m.id, label: m.name }));
  const savedViews = views ?? [];

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" className="w-[min(100vw-2rem,26rem)] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-1">
              <ModeTab active={mode === "visual"} onClick={() => setMode("visual")}>
                Visual
              </ModeTab>
              <ModeTab active={mode === "gigsql"} onClick={() => setMode("gigsql")}>
                GigsQL
              </ModeTab>
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs transition-transform duration-150 ease-out active:scale-[0.97]"
                  >
                    Saved filters
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <MenuLabel>Presets</MenuLabel>
                  {ISSUE_FILTER_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.id}
                      onSelect={() => setGigsqlQuery(preset.query)}
                    >
                      {preset.label}
                    </DropdownMenuItem>
                  ))}

                  {savedViews.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <MenuLabel>Your views</MenuLabel>
                      {savedViews.map((view) => (
                        <DropdownMenuItem
                          key={view.id}
                          onSelect={() => setGigsqlQuery(view.filter_query)}
                          className="truncate"
                        >
                          {view.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
                    <HugeiconsIcon icon={BookmarkAdd01Icon} className="size-3.5 text-muted-foreground" />
                    Save current filter…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {active > 0 ? (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clear}>
                  Clear all
                </Button>
              ) : null}
            </div>
          </div>

          {mode === "visual" ? (
            <VisualFilterPanel
              assigneeOptions={assigneeOptions}
              labelOptions={labelOptions}
              cycleOptions={cycleOptions}
              moduleOptions={moduleOptions}
              selectFields={selectFields}
            />
          ) : (
            <GigsqlEditor value={gigsqlQuery} onChange={setGigsqlQuery} />
          )}
        </PopoverContent>
      </Popover>

      {/* Sibling (not inside PopoverContent) so it stays mounted after the popover closes. */}
      <CreateViewDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={saveOpen}
        onOpenChange={setSaveOpen}
      />
    </>
  );
}

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors active:scale-[0.97]",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
