"use client";

import { useState } from "react";

import { useUpdateWorkspace, useWorkspace } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";
import { HolidayCalendar } from "@/components/settings/workspace/holiday-calendar";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function GeneralSettingsForm({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: workspace } = useWorkspace(workspaceSlug);
  const update = useUpdateWorkspace(workspaceSlug);
  const [name, setName] = useState(workspace?.name ?? "");
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspace?.id);

  if (workspace && workspace.id !== prevWorkspaceId) {
    setPrevWorkspaceId(workspace.id);
    setName(workspace.name);
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await update.mutateAsync({ name: name.trim() });
  };

  return (
    <div className="max-w-2xl px-10 py-8">
      <GeneralFields
        workspaceSlug={workspaceSlug}
        name={name}
        setName={setName}
        onSubmit={onSubmit}
        isSaving={update.isPending}
      />
      <HolidayCalendar workspaceSlug={workspaceSlug} />
    </div>
  );
}

function GeneralFields({
  workspaceSlug,
  name,
  setName,
  onSubmit,
  isSaving,
}: {
  workspaceSlug: string;
  name: string;
  setName: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
}) {
  return (
    <form onSubmit={onSubmit}>
      <h1 className="text-lg font-semibold">General</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your workspace details.</p>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Workspace name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Workspace URL
          <input
            type="text"
            readOnly
            value={`gigsnano.app/${workspaceSlug}`}
            className={field + " opacity-70"}
          />
        </label>
        <div>
          <Button type="submit" size="sm" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
