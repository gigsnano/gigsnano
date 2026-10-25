import type { IPlatformUser, IPlatformUserFilters } from "@/types";

export function filterPlatformUsers(
  users: IPlatformUser[],
  filters: IPlatformUserFilters,
): IPlatformUser[] {
  let result = users;
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }
  if (filters.status === "active") result = result.filter((u) => !u.is_suspended);
  if (filters.status === "suspended") result = result.filter((u) => u.is_suspended);
  return result;
}
