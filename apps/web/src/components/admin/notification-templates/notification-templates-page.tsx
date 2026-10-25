"use client";

import { useState } from "react";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import { useNotificationTemplates, useStaffMe } from "@/hooks/admin/use-admin";
import { EPrivilege } from "@/types";

import { NotificationTemplateEditor } from "./notification-template-editor";
import { NotificationTemplatesList } from "./notification-templates-list";

export function NotificationTemplatesPage() {
  const { data: me } = useStaffMe();
  const { data: templates = [], isPending, error, refetch } = useNotificationTemplates();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const privileges = new Set(me?.privileges ?? []);
  const canManage = privileges.has(EPrivilege.NotificationsManage);
  const selected =
    templates.find((t) => t.trigger_key === selectedKey) ?? templates[0] ?? null;

  return (
    <>
      <AdminHeader title="Notification templates" />
      <div className="flex-1 overflow-y-auto p-6">
        {isPending ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : error ? (
          <EmptyState
            assetKey="generic"
            title="Couldn't load templates"
            description="Try again in a moment."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : templates.length === 0 ? (
          <EmptyState
            assetKey="generic"
            title="No templates"
            description="Notification templates will appear here once seeded."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <NotificationTemplatesList
              templates={templates}
              selectedKey={selected?.trigger_key ?? null}
              onSelect={setSelectedKey}
            />
            <div className="rounded-xl border border-border p-4">
              {selected ? (
                <NotificationTemplateEditor
                  key={selected.trigger_key}
                  template={selected}
                  canManage={canManage}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
