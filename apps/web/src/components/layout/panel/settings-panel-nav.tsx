"use client";

import { usePathname } from "next/navigation";
import { Settings01Icon, UserGroupIcon, CreditCardIcon, Folder01Icon, Link01Icon, WebhookIcon, Download01Icon, Upload01Icon, Mail01Icon, Briefcase01Icon, Notification01Icon, Mic01Icon } from "@hugeicons/core-free-icons";

import { PanelNavLink, PanelSection } from "./panel-nav";

export function SettingsPanelNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/settings`;

  const items = [
    { label: "General", href: base, icon: Settings01Icon, exact: true },
    { label: "Members", href: `${base}/members`, icon: UserGroupIcon, exact: false },
    { label: "Notifications", href: `${base}/notifications`, icon: Notification01Icon, exact: false },
    { label: "Projects", href: `${base}/projects`, icon: Folder01Icon, exact: false },
    { label: "Integrations", href: `${base}/integrations`, icon: Link01Icon, exact: false },
    { label: "Webhooks", href: `${base}/webhooks`, icon: WebhookIcon, exact: false },
    { label: "Voice", href: `${base}/voice`, icon: Mic01Icon, exact: false },
    { label: "Exports", href: `${base}/exports`, icon: Download01Icon, exact: false },
    { label: "Imports", href: `${base}/imports`, icon: Upload01Icon, exact: false },
    { label: "Invitations", href: `${base}/invitations`, icon: Mail01Icon, exact: false },
    { label: "Billing", href: `${base}/billing`, icon: CreditCardIcon, exact: false },
    { label: "Hired work", href: `${base}/hired-work`, icon: Briefcase01Icon, exact: false },
  ];

  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2">
      <PanelSection title="Workspace">
        {items.map((item) => (
          <PanelNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
          />
        ))}
      </PanelSection>
    </div>
  );
}
