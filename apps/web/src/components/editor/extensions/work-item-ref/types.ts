/**
 * workItemRef node attributes (GIN-362).
 *
 * Same two-vocabulary split as the mention node:
 *
 * - **JSON** (`workItemId` / `code` / `title`) is the canonical document shape
 *   from ADR 0001. The backend registry validates against exactly these names
 *   (`content/schema.py`) and drops anything undeclared.
 * - **HTML** (`data-work-item-id` / `data-code`) is what the backend renders and
 *   parses (`content/html.py`, `content/html_import.py`): a `<work-item-ref>`
 *   element carrying the id as an attribute and the code as element text. `title`
 *   has no HTML attribute — it is a non-identity display fallback, so it is not
 *   round-tripped through HTML and defaults to "".
 */

/** Canonical JSON attribute names (ADR 0001 node registry). */
export enum EWorkItemRefAttribute {
  WorkItemId = "workItemId",
  Code = "code",
  Title = "title",
}

/** Legacy/derived HTML attribute names on the `work-item-ref` element. */
export enum EWorkItemRefHtmlAttribute {
  WorkItemId = "data-work-item-id",
  Code = "data-code",
}

export interface IWorkItemRefAttrs {
  workItemId: string;
  code?: string;
  title?: string;
}

/** A work item the `#` picker can offer, and the chip can resolve against. */
export interface IWorkItemRefTarget {
  id: string;
  code: string;
  title: string;
}
