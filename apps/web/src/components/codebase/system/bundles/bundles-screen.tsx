"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArchiveBundle, useBundles, useSetDefaultBundle } from "@/hooks/codebase/use-bundles";
import { useRepositories } from "@/hooks/codebase/use-repositories";
import { EBundleStatus, type ISystemBundle } from "@/types";

import { BundleCard } from "./bundle-card";
import { CreateBundleWizard } from "./create-bundle-wizard";

type TWizardIntent =
  | { mode: "create" }
  | { mode: "edit"; bundle: ISystemBundle }
  | { mode: "duplicate"; bundle: ISystemBundle };

export function BundlesScreen({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: bundles, isLoading, isError, refetch } = useBundles(workspaceSlug, projectId);
  const { data: repos = [] } = useRepositories(workspaceSlug, projectId);
  const setDefault = useSetDefaultBundle(workspaceSlug, projectId);
  const archive = useArchiveBundle(workspaceSlug, projectId);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EBundleStatus>("all");
  const [intent, setIntent] = useState<TWizardIntent | null>(null);

  const all = bundles ?? [];
  const filtered = all.filter(
    (b) =>
      b.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (statusFilter === "all" || b.status === statusFilter),
  );

  function duplicateTemplate(b: ISystemBundle): ISystemBundle {
    return { ...structuredClone(b), name: `${b.name} (copy)` };
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading bundles…</p>;
  }
  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load bundles"
        description="Something went wrong loading this project's System Bundles."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (all.length === 0) {
    return (
      <>
        <EmptyState
          assetKey="generic"
          title="Create your first System Bundle"
          description="A bundle groups repositories that run or ship together — for example a web application, its API, and a shared library — so work items, agents, and delivery span them as one. It is not another Git repository."
          actions={[{ label: "Create bundle", onClick: () => setIntent({ mode: "create" }) }]}
        />
        {intent ? (
          <WizardHost
            intent={intent}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            repos={repos}
            duplicateTemplate={duplicateTemplate}
            onClose={() => setIntent(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bundles…"
            aria-label="Search bundles"
            className="pl-8"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | EBundleStatus)}
          className="h-9 rounded-md border bg-input/30 px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="all">All statuses</option>
          <option value={EBundleStatus.Valid}>Valid</option>
          <option value={EBundleStatus.Draft}>Draft</option>
          <option value={EBundleStatus.Invalid}>Invalid</option>
        </select>
        <Button onClick={() => setIntent({ mode: "create" })}>
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          Create bundle
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">No bundles match your filters.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((bundle, i) => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              index={i}
              actions={{
                onEdit: (b) => setIntent({ mode: "edit", bundle: b }),
                onDuplicate: (b) => setIntent({ mode: "duplicate", bundle: b }),
                onSetDefault: (b) => setDefault.mutate(b.id),
                onArchive: (b) => archive.mutate(b.id),
              }}
            />
          ))}
        </div>
      )}

      {intent ? (
        <WizardHost
          intent={intent}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          repos={repos}
          duplicateTemplate={duplicateTemplate}
          onClose={() => setIntent(null)}
        />
      ) : null}
    </div>
  );
}

/** Mounts the wizard fresh per intent so its internal step/state initialises correctly. */
function WizardHost({
  intent,
  workspaceSlug,
  projectId,
  repos,
  duplicateTemplate,
  onClose,
}: {
  intent: TWizardIntent;
  workspaceSlug: string;
  projectId: string;
  repos: Parameters<typeof CreateBundleWizard>[0]["repos"];
  duplicateTemplate: (b: ISystemBundle) => ISystemBundle;
  onClose: () => void;
}) {
  const editing = intent.mode === "edit" ? intent.bundle : null;
  const template = intent.mode === "duplicate" ? duplicateTemplate(intent.bundle) : null;
  return (
    <CreateBundleWizard
      key={intent.mode === "create" ? "new" : intent.bundle.id + intent.mode}
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      repos={repos}
      editing={editing}
      template={template}
    />
  );
}
