import type { IWorkItemDraftRecord } from "@/types";

/** In-memory dev fixture for work-item drafts (GIN-16). Empty by default — a
 * "no drafts yet" screen should be the common case in mock mode too. */
export const draftRecords: IWorkItemDraftRecord[] = [];
