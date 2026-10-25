"use client";

import { type IWidgetSettings } from "@/types";

import { WidgetMessage } from "./widget-body-shared";

/**
 * Jira parity — "Introduction". A static note on the dashboard.
 *
 * Plain text, rendered with preserved line breaks. The rich editor exists, but a
 * dashboard note doesn't need a ProseMirror instance per widget; swap it in if
 * anyone actually asks for formatting.
 */
export function IntroductionBody({ settings }: { settings?: IWidgetSettings }) {
  const text = settings?.text?.trim();
  if (!text) {
    return <WidgetMessage>Add a message in this widget&apos;s settings.</WidgetMessage>;
  }
  return (
    <div className="h-full overflow-auto p-4">
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
