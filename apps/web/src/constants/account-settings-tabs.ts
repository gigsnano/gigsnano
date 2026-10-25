import {
  Notification03Icon,
  SecurityCheckIcon,
  UserIcon,
  AiBrain01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";

export type EAccountSettingsTab = "profile" | "security" | "notifications" | "agents" | "tokens";

export const ACCOUNT_SETTINGS_TABS: {
  id: EAccountSettingsTab;
  label: string;
  icon: typeof UserIcon;
}[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "security", label: "Security", icon: SecurityCheckIcon },
  { id: "notifications", label: "Notifications", icon: Notification03Icon },
  { id: "agents", label: "Coding agents", icon: AiBrain01Icon },
  { id: "tokens", label: "Developer tokens", icon: SourceCodeIcon },
];
