"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  Building06Icon,
  InformationCircleIcon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { AdminHeader } from "@/components/admin";
import { EmptyState } from "@/components/empty-state";
import { usePlatformUser } from "@/hooks/admin/use-admin";
import { cn } from "@/lib/utils";

import { UserDetailActivityTab } from "./user-detail-activity-tab";
import { UserDetailBackLink, UserDetailHero } from "./user-detail-hero";
import { UserDetailOverviewTab } from "./user-detail-overview-tab";
import { UserDetailStaffTab } from "./user-detail-staff-tab";
import { UserDetailStats } from "./user-detail-stats";
import { UserDetailWorkspacesTab } from "./user-detail-workspaces-tab";

type UserDetailTab = "overview" | "workspaces" | "activity" | "staff";

const TABS: { id: UserDetailTab; label: string; icon: IconSvgElement }[] = [
  { id: "overview", label: "Overview", icon: InformationCircleIcon },
  { id: "workspaces", label: "Workspaces", icon: Building06Icon },
  { id: "activity", label: "Activity", icon: Activity01Icon },
  { id: "staff", label: "Staff", icon: ShieldKeyIcon },
];

export function UserDetailPage({ userId }: { userId: string }) {
  const [tab, setTab] = useState<UserDetailTab>("overview");
  const { data: user, isPending, error, refetch } = usePlatformUser(userId);

  if (isPending) {
    return (
      <>
        <AdminHeader title="User" actions={<UserDetailBackLink />} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </div>
      </>
    );
  }

  if (error || !user) {
    return (
      <>
        <AdminHeader title="User" actions={<UserDetailBackLink />} />
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
          <EmptyState
            assetKey="generic"
            title="Couldn't load user"
            description="This user may not exist or you may not have access."
            actions={[
              { label: "Back to users", href: "/admin/users" },
              { label: "Retry", onClick: () => refetch(), variant: "outline" },
            ]}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title={user.display_name} actions={<UserDetailBackLink />} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <UserDetailHero user={user} />
          <div className="space-y-5 px-6 py-5">
            <UserDetailStats user={user} />
            {tab === "overview" ? <UserDetailOverviewTab user={user} /> : null}
            {tab === "workspaces" ? <UserDetailWorkspacesTab userId={userId} /> : null}
            {tab === "activity" ? <UserDetailActivityTab userId={userId} /> : null}
            {tab === "staff" ? <UserDetailStaffTab user={user} /> : null}
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-border lg:w-56 lg:border-l lg:border-t-0">
          <nav className="flex gap-0.5 overflow-x-auto p-2 lg:flex-col">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                  tab === t.id
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <HugeiconsIcon icon={t.icon} className="size-4 shrink-0" />
                {t.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
}
