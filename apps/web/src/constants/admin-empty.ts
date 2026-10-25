export interface IAdminEmptyCopy {
  title: string;
  description: string;
  actionLabel: string;
}

export const ADMIN_EMPTY: Record<"workspaces" | "marketplace", IAdminEmptyCopy> = {
  workspaces: {
    title: "Workspace management is coming soon",
    description:
      "Browse every workspace on the platform, inspect membership, and handle deletions from this module.",
    actionLabel: "View the roadmap",
  },
  marketplace: {
    title: "Marketplace moderation is coming soon",
    description:
      "Review and moderate marketplace job and talent listings across the platform from here.",
    actionLabel: "View the roadmap",
  },
};
