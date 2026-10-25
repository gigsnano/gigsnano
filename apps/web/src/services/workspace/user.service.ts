import type { IUser, IUserFilters, IUserPage } from "@/types";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

class UserService extends APIService {
  getUsers(filters: IUserFilters = {}) {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IUserPage>(`/users/${suffix}`);
  }

  getUser(userId: string) {
    return this.get<IUser>(`/users/${userId}/`);
  }
}

export const userService = new UserService();
