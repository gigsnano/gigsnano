import { EViewShareScope, type IProjectView } from "@/types";

export function isViewOwner(view: IProjectView, userId: string | undefined): boolean {
  return Boolean(userId && view.owner_id === userId);
}

export function shareScopeLabel(scope: EViewShareScope): string {
  return scope === EViewShareScope.Project ? "Project" : "Private";
}
