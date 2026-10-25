import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Optimistic cache updates — GigsNano's equivalent of Plane's optimistic store
 * writes. Dropdown pickers (status, priority, assignee, role, …) call a mutation
 * whose PATCH + refetch round-trip takes a beat; without an optimistic write the
 * selected value only appears seconds later. These helpers patch the cached
 * entity immediately so the UI reflects the choice on click, then the mutation's
 * `onSuccess` invalidation reconciles with the server (and `onError` rolls back).
 */

export interface QuerySnapshot {
  queryKey: QueryKey;
  data: unknown;
}

type Patch = Record<string, unknown>;

// Patch the entity whose `id` matches, wherever it sits in a cached value:
// a bare array, an offset page (`{ items: [...] }`), or a single object.
// Returns the same reference when nothing changed so callers can skip a write.
function patchNode(node: unknown, id: string, patch: Patch): unknown {
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((item) => {
      if (item && typeof item === "object" && (item as { id?: unknown }).id === id) {
        changed = true;
        return { ...item, ...patch };
      }
      return item;
    });
    return changed ? next : node;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.id === id) return { ...obj, ...patch };
    if (Array.isArray(obj.items)) {
      const items = patchNode(obj.items, id, patch);
      if (items !== obj.items) return { ...obj, items };
    }
  }
  return node;
}

/**
 * Apply `patch` to entity `id` across every cached query under `rootKey`
 * (partial-key match), returning snapshots of each touched query for rollback.
 * ponytail: matches purely by `id`, so a non-target object sharing that id would
 * also be patched — with UUIDs the collision risk is nil.
 */
export function optimisticPatchById(
  queryClient: QueryClient,
  rootKey: QueryKey,
  id: string,
  patch: Patch,
): QuerySnapshot[] {
  const snapshots: QuerySnapshot[] = [];
  for (const query of queryClient.getQueryCache().findAll({ queryKey: rootKey })) {
    const data = query.state.data;
    if (data === undefined) continue;
    const next = patchNode(data, id, patch);
    if (next !== data) {
      snapshots.push({ queryKey: query.queryKey, data });
      queryClient.setQueryData(query.queryKey, next);
    }
  }
  return snapshots;
}

export function restoreSnapshots(
  queryClient: QueryClient,
  snapshots: QuerySnapshot[] | undefined,
): void {
  for (const snap of snapshots ?? []) queryClient.setQueryData(snap.queryKey, snap.data);
}

/**
 * `onMutate`/`onError` pair for an entity-by-id optimistic update, ready to spread
 * into `useMutation` alongside the existing `onSuccess` invalidation. `toPatch`
 * derives the field patch from the mutation variables; `idOf` picks the entity id.
 */
export function optimisticById<V>(
  queryClient: QueryClient,
  rootKey: QueryKey,
  idOf: (vars: V) => string,
  toPatch: (vars: V) => Patch,
) {
  return {
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: rootKey });
      return { snapshots: optimisticPatchById(queryClient, rootKey, idOf(vars), toPatch(vars)) };
    },
    onError: (_err: unknown, _vars: V, ctx: { snapshots: QuerySnapshot[] } | undefined) => {
      restoreSnapshots(queryClient, ctx?.snapshots);
    },
  };
}
