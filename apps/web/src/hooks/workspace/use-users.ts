import { useQuery } from "@tanstack/react-query";

import { userService } from "@/services/workspace/user.service";
import type { IUserFilters } from "@/types";

import { queryKeys } from "../query-keys";

export function useUsers(filters: IUserFilters = {}) {
  return useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () => userService.getUsers(filters),
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: () => userService.getUser(userId),
    enabled: Boolean(userId),
  });
}
