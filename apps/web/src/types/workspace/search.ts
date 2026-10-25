import type { ID } from "@/types/common";

/** Mirrors `ProjectResultOut` (gigsnano-api `features/search/schemas.py`). */
export interface ISearchProjectResult {
  id: ID;
  name: string;
  identifier: string;
}

/** Mirrors `WorkItemResultOut`. */
export interface ISearchWorkItemResult {
  id: ID;
  project_id: ID;
  title: string;
  story_number: number | null;
}

/** Mirrors `CycleResultOut`. */
export interface ISearchCycleResult {
  id: ID;
  project_id: ID;
  name: string;
}

/** Mirrors `ModuleResultOut`. */
export interface ISearchModuleResult {
  id: ID;
  project_id: ID;
  name: string;
}

/** Mirrors `ViewResultOut`. */
export interface ISearchViewResult {
  id: ID;
  project_id: ID;
  name: string;
}

/** Mirrors `PageResultOut`. */
export interface ISearchPageResult {
  id: ID;
  project_id: ID;
  title: string;
}

/** Mirrors `SearchResultsOut` — `GET /workspaces/{slug}/search/` response. */
export interface IWorkspaceSearchResults {
  projects: ISearchProjectResult[];
  work_items: ISearchWorkItemResult[];
  cycles: ISearchCycleResult[];
  modules: ISearchModuleResult[];
  views: ISearchViewResult[];
  pages: ISearchPageResult[];
}
