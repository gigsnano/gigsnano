export type IAssigneePreview = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

/**
 * Map user_id → display fields. Accepts any member shape carrying the preview
 * fields (project OR workspace members) — assignment is workspace-scoped, so
 * callers resolve against workspace members.
 */
export function buildAssigneeMap(members: readonly IAssigneePreview[]): Map<string, IAssigneePreview> {
  const map = new Map<string, IAssigneePreview>();
  for (const m of members) {
    map.set(m.user_id, {
      user_id: m.user_id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    });
  }
  return map;
}
