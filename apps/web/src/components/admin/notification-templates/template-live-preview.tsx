"use client";

import { renderPreview } from "@/lib/notifications/render-preview";
import type { INotificationTemplate } from "@/types";

import { sampleContextFor } from "./trigger-catalog";

export function TemplateLivePreview({
  template,
  titleTemplate,
  bodyTemplate,
  label = "Live preview",
}: {
  template: INotificationTemplate;
  titleTemplate: string;
  bodyTemplate: string;
  label?: string;
}) {
  const preview = renderPreview(
    titleTemplate,
    bodyTemplate,
    sampleContextFor(template),
  );
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">{preview.title || "—"}</p>
      <p className="mt-1 text-sm text-muted-foreground">{preview.body || "—"}</p>
    </div>
  );
}
