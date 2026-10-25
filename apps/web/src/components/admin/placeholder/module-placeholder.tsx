"use client";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import { ADMIN_EMPTY } from "@/constants/admin-empty";

const TITLE: Record<keyof typeof ADMIN_EMPTY, string> = {
  workspaces: "Workspaces",
  marketplace: "Marketplace",
};

export function ModulePlaceholder({ module }: { module: keyof typeof ADMIN_EMPTY }) {
  const copy = ADMIN_EMPTY[module];
  return (
    <>
      <AdminHeader title={TITLE[module]} />
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <EmptyState
          assetKey="generic"
          title={copy.title}
          description={copy.description}
          actions={[{ label: copy.actionLabel, href: "/admin" }]}
        />
      </div>
    </>
  );
}
