"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectStories } from "@/hooks/story/use-stories";
import { storyCode } from "@/lib/issues/issue-routes";
import { useProject } from "@/hooks/project/use-projects";
import { EStoryType, type IStory } from "@/types";

export function EpicPickerDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
  onSelect: (epic: IStory) => void;
}) {
  const { data: project } = useProject(workspaceSlug, projectId);
  const { data: stories } = useProjectStories(workspaceSlug, projectId);
  const epics = (stories ?? []).filter(
    (s) => s.type === EStoryType.Epic && (s.sub_issue_count ?? 0) === 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Pick an epic</DialogTitle>
        <DialogDescription>
          Choose an epic without sub-work items to break down with AI.
        </DialogDescription>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {epics.length ? (
            epics.map((epic) => (
              <li key={epic.id}>
                <button
                  type="button"
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-accent active:scale-[0.99]"
                  onClick={() => {
                    onSelect(epic);
                    onOpenChange(false);
                  }}
                >
                  <span className="text-sm font-medium text-foreground">
                    {project ? `${storyCode(project.identifier, epic)} — ` : ""}
                    {epic.title}
                  </span>
                  {epic.description ? (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {epic.description.replace(/<[^>]+>/g, " ")}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No empty epics in this project. Create an epic first, or pick one that has no
              sub-work items yet.
            </p>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
