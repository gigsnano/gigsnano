"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  ACCOUNT_SETTINGS_TABS,
  type EAccountSettingsTab,
} from "@/constants/account-settings-tabs";
import { useAccountSettingsStore } from "@/store/ui/account-settings.store";

function resolveTab(tab: string): EAccountSettingsTab {
  return ACCOUNT_SETTINGS_TABS.some((t) => t.id === tab)
    ? (tab as EAccountSettingsTab)
    : "profile";
}

/** Deep-link handler: opens the account settings modal, then returns to the app shell. */
export function AccountSettingsOpener({ tab }: { tab: string }) {
  const router = useRouter();
  const openModal = useAccountSettingsStore((s) => s.openModal);

  useEffect(() => {
    openModal(resolveTab(tab));
    const id = window.setTimeout(() => {
      if (window.history.length > 2) {
        router.back();
      } else {
        router.replace("/");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab, openModal, router]);

  return null;
}
