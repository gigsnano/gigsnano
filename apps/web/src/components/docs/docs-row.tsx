import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon, Notebook01Icon } from "@hugeicons/core-free-icons";

import { DOCUMENT_KIND_LABEL } from "@/constants/document-kind-meta";
import { cn } from "@/lib/utils";
import type { IDocument } from "@/types";
import type { IPageWithProject } from "@/types/docs/page";

function DocsRow({
  href,
  icon,
  iconClassName,
  title,
  badge,
  subtitle,
  updatedAt,
}: {
  href: string;
  icon: typeof File01Icon;
  iconClassName: string;
  title: string;
  badge: string;
  subtitle: string;
  updatedAt: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-ring/60 hover:bg-accent/40"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          iconClassName,
        )}
      >
        <HugeiconsIcon icon={icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {badge}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <time className="shrink-0 text-xs text-muted-foreground">
        {new Date(updatedAt).toLocaleDateString()}
      </time>
    </Link>
  );
}

export function DocumentRow({ doc, workspaceSlug }: { doc: IDocument; workspaceSlug: string }) {
  return (
    <DocsRow
      href={`/${workspaceSlug}/docs/${doc.id}`}
      icon={File01Icon}
      iconClassName="bg-primary/10 text-primary"
      title={doc.title}
      badge={DOCUMENT_KIND_LABEL[doc.kind]}
      subtitle={doc.project_name}
      updatedAt={doc.updated_at}
    />
  );
}

export function PageRow({
  page,
  workspaceSlug,
}: {
  page: IPageWithProject;
  workspaceSlug: string;
}) {
  return (
    <DocsRow
      href={`/${workspaceSlug}/projects/${page.project_id}/pages/${page.id}`}
      icon={Notebook01Icon}
      iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
      title={page.title}
      badge="Page"
      subtitle={page.project_name}
      updatedAt={page.updated_at}
    />
  );
}
