import type { ID } from "./common";
import type { IOffsetPage, IOffsetPageFilters } from "./common";

/** A person in the org-wide directory. Both member pickers pull from this pool. */
export interface IUser {
  id: ID;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

export type IUserPage = IOffsetPage<IUser>;

export interface IUserFilters extends IOffsetPageFilters {
  q?: string;
}
