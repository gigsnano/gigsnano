import type { ComponentType, SVGProps } from "react";

import Board from "./illustrations/Board";
import ErrorIllustration from "./illustrations/Error";
import Error404 from "./illustrations/Error404";
import Generic from "./illustrations/Generic";
import Members from "./illustrations/Members";
import Module from "./illustrations/Module";
import Notifications from "./illustrations/Notifications";
import Project from "./illustrations/Project";
import SearchEmpty from "./illustrations/SearchEmpty";
import Sprint from "./illustrations/Sprint";

/**
 * Keys for the reusable EmptyState illustration set.
 * Each maps to a theme-adaptive (currentColor) line-art SVG extracted from the
 * "1,600 Free Illustrations" Figma community set — see ./assets/manifest.json
 * for provenance (source node ids) so any illustration can be re-exported.
 */
export type EmptyStateKey =
  | "project"
  | "sprint"
  | "board"
  | "module"
  | "members"
  | "error"
  | "error-404"
  | "search-empty"
  | "notifications"
  | "generic";

type IllustrationComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** key -> illustration component. Add a new key + illustration here to extend the set. */
export const illustrationRegistry: Record<EmptyStateKey, IllustrationComponent> = {
  project: Project,
  sprint: Sprint,
  board: Board,
  module: Module,
  members: Members,
  error: ErrorIllustration,
  "error-404": Error404,
  "search-empty": SearchEmpty,
  notifications: Notifications,
  generic: Generic,
};
