import { useSyncExternalStore } from "react";

/**
 * Live `matchMedia(query).matches`. False during SSR and hydration, so render
 * only behaviour from it (whether a phone sheet may be open), never layout —
 * layout stays in CSS so the first paint is already right.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
