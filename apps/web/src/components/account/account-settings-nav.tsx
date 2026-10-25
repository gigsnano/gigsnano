"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  ACCOUNT_SETTINGS_TABS,
  type EAccountSettingsTab,
} from "@/constants/account-settings-tabs";
import { cn } from "@/lib/utils";

export function AccountSettingsNav({
  activeTab,
  onTabChange,
  className,
}: {
  activeTab: EAccountSettingsTab;
  onTabChange: (tab: EAccountSettingsTab) => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex w-56 shrink-0 flex-col border-r bg-muted/30",
        className,
      )}
    >
      <div className="border-b px-4 py-4">
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="text-xs text-muted-foreground">Your personal settings</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {ACCOUNT_SETTINGS_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-150 active:scale-[0.98]",
                active
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
              onClick={() => onTabChange(tab.id)}
            >
              <HugeiconsIcon icon={tab.icon} className="size-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <ThemeToggle className="w-full justify-start" />
      </div>
    </aside>
  );
}
