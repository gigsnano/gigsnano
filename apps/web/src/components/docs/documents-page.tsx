"use client";

import { useState } from "react";

import { CreateDocumentDialog } from "@/components/docs/create-document-dialog";
import { DocumentRow, PageRow } from "@/components/docs/docs-row";
import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { useDocuments } from "@/hooks/docs/use-documents";
import { useWorkspacePages } from "@/hooks/docs/use-pages";
import { buildDocsFeed, type TDocsFilter } from "@/lib/docs/docs-feed";
import { cn } from "@/lib/utils";

const FILTERS: { value: TDocsFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "documents", label: "Documents" },
  { value: "pages", label: "Pages" },
];

function DocsFilterTabs({
  value,
  onChange,
}: {
  value: TDocsFilter;
  onChange: (next: TDocsFilter) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-out",
            value === f.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function DocumentsPage({ workspaceSlug }: { workspaceSlug: string }) {
  const [filter, setFilter] = useState<TDocsFilter>("all");
  const documents = useDocuments(workspaceSlug);
  const pages = useWorkspacePages(workspaceSlug);

  const isPending = documents.isPending || pages.isPending;
  const isError = documents.isError || pages.isError;
  const feed = buildDocsFeed(documents.data ?? [], pages.data, filter);

  return (
    <>
      <AppHeader
        actions={
          !isError ? (
            <div className="flex items-center gap-2">
              <DocsFilterTabs value={filter} onChange={setFilter} />
              <CreateDocumentDialog workspaceSlug={workspaceSlug} />
            </div>
          ) : undefined
        }
      />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load docs"
            description="Something went wrong fetching documents and pages."
            actions={[
              {
                label: "Retry",
                onClick: () => {
                  documents.refetch();
                  pages.refetch();
                },
              },
            ]}
          />
        ) : feed.length === 0 ? (
          <EmptyState
            assetKey="generic"
            title={filter === "pages" ? "No pages yet" : "Nothing here yet"}
            description={
              filter === "pages"
                ? "Create wiki pages from a project's Pages tab — runbooks, conventions, notes — and they'll show up here."
                : "As you complete Sprint-0, generated documents appear here alongside any pages you create in your projects."
            }
            actions={[{ label: "View projects", href: `/${workspaceSlug}/projects` }]}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {feed.map((item) =>
              item.kind === "document" ? (
                <DocumentRow key={`d-${item.id}`} doc={item.doc} workspaceSlug={workspaceSlug} />
              ) : (
                <PageRow key={`p-${item.id}`} page={item.page} workspaceSlug={workspaceSlug} />
              ),
            )}
          </div>
        )}
      </ContentWrapper>
    </>
  );
}
