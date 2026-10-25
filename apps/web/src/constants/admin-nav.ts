import {
  ChartLineData01Icon,
  DashboardSquare01Icon,
  UserMultipleIcon,
  Building06Icon,
  Store01Icon,
  ShieldKeyIcon,
  ClipboardIcon,
  Notification01Icon,
  CreditCardIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { EPrivilege } from "@/types";

export interface IAdminNavItem {
  href: string;
  label: string;
  icon: IconSvgElement;
  privilege: EPrivilege;
}

export const ADMIN_NAV: IAdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: DashboardSquare01Icon, privilege: EPrivilege.DashboardRead },
  { href: "/admin/llm-usage", label: "LLM Usage", icon: ChartLineData01Icon, privilege: EPrivilege.UsageRead },
  { href: "/admin/users", label: "Users", icon: UserMultipleIcon, privilege: EPrivilege.UsersRead },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building06Icon, privilege: EPrivilege.WorkspacesRead },
  { href: "/admin/marketplace", label: "Marketplace", icon: Store01Icon, privilege: EPrivilege.MarketplaceModerate },
  { href: "/admin/roles", label: "Roles & Privileges", icon: ShieldKeyIcon, privilege: EPrivilege.RolesRead },
  {
    href: "/admin/notification-templates",
    label: "Notifications",
    icon: Notification01Icon,
    privilege: EPrivilege.NotificationsRead,
  },
  { href: "/admin/billing", label: "Plans & Billing", icon: CreditCardIcon, privilege: EPrivilege.BillingManage },
  { href: "/admin/audit", label: "Audit Log", icon: ClipboardIcon, privilege: EPrivilege.AuditRead },
];
