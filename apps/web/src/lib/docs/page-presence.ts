import type { IPagePresenceViewer } from "@/types";

/** Viewers other than yourself — drives the AvatarGroup + advisory banner. */
export function otherViewers(
  viewers: IPagePresenceViewer[],
  selfUserId: string | undefined,
): IPagePresenceViewer[] {
  return viewers.filter((v) => v.user_id !== selfUserId);
}

/** Soft "X is editing" advisory copy, or null when nobody else is editing right now. */
export function editingAdvisory(
  viewers: IPagePresenceViewer[],
  selfUserId: string | undefined,
): string | null {
  const editors = otherViewers(viewers, selfUserId).filter((v) => v.editing);
  if (editors.length === 0) return null;
  if (editors.length === 1) return `${editors[0].display_name} is editing this page.`;
  if (editors.length === 2) {
    return `${editors[0].display_name} and ${editors[1].display_name} are editing this page.`;
  }
  return `${editors[0].display_name} and ${editors.length - 1} others are editing this page.`;
}
