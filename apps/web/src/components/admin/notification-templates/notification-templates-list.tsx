"use client";

import type { INotificationTemplate } from "@/types";
import { cn } from "@/lib/utils";

export function NotificationTemplatesList({
  templates,
  selectedKey,
  onSelect,
}: {
  templates: INotificationTemplate[];
  selectedKey: string | null;
  onSelect: (triggerKey: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Trigger</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Enabled</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Email</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Title preview</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr
              key={t.trigger_key}
              className={cn(
                "cursor-pointer border-b border-border last:border-0 hover:bg-accent/50",
                selectedKey === t.trigger_key && "bg-accent",
              )}
              onClick={() => onSelect(t.trigger_key)}
            >
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{t.label}</div>
                <div className="font-mono text-xs text-muted-foreground">{t.trigger_key}</div>
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{t.kind}</td>
              <td className="hidden px-3 py-2 sm:table-cell">
                {t.enabled ? "Yes" : "No"}
              </td>
              <td className="hidden px-3 py-2 sm:table-cell">
                {t.email_enabled ? "Yes" : "No"}
              </td>
              <td className="hidden max-w-[220px] truncate px-3 py-2 text-muted-foreground md:table-cell">
                {t.title_template}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
