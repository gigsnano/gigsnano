import { Analytics01Icon, Folder01Icon, Home01Icon, InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ios } from "./ios-css";

export type TTab = "today" | "projects" | "inbox" | "reports";

const TABS = [
  { id: "today", label: "Today", icon: Home01Icon },
  { id: "projects", label: "Projects", icon: Folder01Icon },
  { id: "inbox", label: "Inbox", icon: InboxIcon, badge: 3 },
  { id: "reports", label: "Reports", icon: Analytics01Icon },
] as const;

/** Four tabs, tint for the active one; creation moves to each screen's toolbar. */
export function TabBar({ active }: { active: TTab }) {
  return (
    <nav aria-label="Tabs" className="flex h-[83px] items-start justify-around px-2 pt-1.5">
      {TABS.map((t) => {
        const on = t.id === active;
        const color = on ? ios("tint") : ios("label-secondary");
        return (
          <span key={t.id} className="relative flex w-16 flex-col items-center gap-0.5" style={{ color }}>
            <HugeiconsIcon icon={t.icon} size={25} color="currentColor" strokeWidth={on ? 2.2 : 1.7} />
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>{t.label}</span>
            {"badge" in t ? (
              <span
                className="absolute -top-0.5 left-[38px] grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-white tabular-nums"
                style={{ background: ios("destructive"), fontSize: 12, fontWeight: 600 }}
              >
                {t.badge}
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
