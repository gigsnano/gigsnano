import { useSyncExternalStore } from "react";

/** True after the client bundle has mounted — avoids SSR/client mismatches from persisted stores. */
export function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
