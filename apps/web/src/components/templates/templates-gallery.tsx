"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates } from "@/hooks/template/use-templates";
import type { ITemplate, TTemplateKind } from "@/types";

import { NewTemplateDialog } from "./new-template-dialog";
import { RecurrencePanel } from "./recurrence-panel";
import { TemplateCard } from "./template-card";

function Section({
  workspaceSlug,
  kind,
  title,
  templates,
  emptyText,
}: {
  workspaceSlug: string;
  kind: TTemplateKind;
  title: string;
  templates: ITemplate[];
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <NewTemplateDialog workspaceSlug={workspaceSlug} kind={kind}>
          <Button variant="outline" size="sm">
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New
          </Button>
        </NewTemplateDialog>
      </div>
      {templates.length ? (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <TemplateCard key={t.id} workspaceSlug={workspaceSlug} template={t} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
    </section>
  );
}

export function TemplatesGallery({ workspaceSlug }: { workspaceSlug: string }) {
  const projectQ = useTemplates(workspaceSlug, "project");
  const workQ = useTemplates(workspaceSlug, "work_item");

  const isPending = projectQ.isPending || workQ.isPending;
  const isError = projectQ.isError || workQ.isError;

  return (
    <>
      <AppHeader />
      <ContentWrapper className="p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {isPending ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-2xl" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              assetKey="error"
              align="start"
              title="Couldn't load templates"
              description="Something went wrong fetching your templates."
              actions={[{ label: "Retry", onClick: () => projectQ.refetch() }]}
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Section
                  workspaceSlug={workspaceSlug}
                  kind="project"
                  title="Project templates"
                  templates={projectQ.data ?? []}
                  emptyText="No project templates yet."
                />
                <Section
                  workspaceSlug={workspaceSlug}
                  kind="work_item"
                  title="Work-item templates"
                  templates={workQ.data ?? []}
                  emptyText="No work-item templates yet — try Draft with AI."
                />
              </div>
              <RecurrencePanel workspaceSlug={workspaceSlug} />
            </>
          )}
        </div>
      </ContentWrapper>
    </>
  );
}
