"use client";

import { AccountSettingsForm } from "@/components/account/account-settings-form";
import { AccountSettingsNav } from "@/components/account/account-settings-nav";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAccountSettingsStore } from "@/store/ui/account-settings.store";

export function AccountSettingsModal() {
  const open = useAccountSettingsStore((s) => s.open);
  const tab = useAccountSettingsStore((s) => s.tab);
  const closeModal = useAccountSettingsStore((s) => s.closeModal);
  const setTab = useAccountSettingsStore((s) => s.setTab);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal();
      }}
    >
      <DialogContent className="flex h-[min(640px,85vh)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Account settings</DialogTitle>
        <div className="flex min-h-0 flex-1">
          <AccountSettingsNav activeTab={tab} onTabChange={setTab} className="rounded-l-lg" />
          <div className="min-w-0 flex-1 overflow-y-auto rounded-r-lg bg-background">
            <AccountSettingsForm tab={tab} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
