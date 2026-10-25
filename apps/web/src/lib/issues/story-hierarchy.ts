import { EStoryType } from "@/types";

/**
 * Work-item parent → allowed child types (GIN-317).
 *
 * The explicit hierarchy config the "Add child item" flow reads, rather than
 * hard-coding Epic → Story inline at every call site. Plane-style: Epic is the
 * broadest container, Task/Bug are leaves that can't parent anything.
 *
 * ponytail: a typed constant is the config seam. When the backend ships a
 * per-project configurable hierarchy, replace `CHILD_TYPES` with a lookup
 * against it — `childTypesOf`/`canHaveChildren` keep their signatures, so callers
 * don't change.
 */
const CHILD_TYPES: Record<EStoryType, EStoryType[]> = {
  [EStoryType.Epic]: [EStoryType.Feature, EStoryType.Story, EStoryType.Task, EStoryType.Bug],
  [EStoryType.Feature]: [EStoryType.Story, EStoryType.Task, EStoryType.Bug],
  [EStoryType.Story]: [EStoryType.Task, EStoryType.Bug],
  [EStoryType.Task]: [],
  [EStoryType.Bug]: [],
};

/** Child types allowed directly under a parent of `type`, in preference order. */
export function childTypesOf(type: EStoryType): EStoryType[] {
  return CHILD_TYPES[type] ?? [];
}

/** Whether a work item of `type` may have children at all (gates the add-child action). */
export function canHaveChildren(type: EStoryType): boolean {
  return childTypesOf(type).length > 0;
}

/** The default type to seed a new child with, or null when the parent is a leaf. */
export function defaultChildType(type: EStoryType): EStoryType | null {
  return childTypesOf(type)[0] ?? null;
}
