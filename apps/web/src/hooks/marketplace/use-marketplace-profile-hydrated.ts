import { useSyncExternalStore } from "react";

import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

/** True once the persisted marketplace profile store has rehydrated from localStorage. */
export function useMarketplaceProfileHydrated() {
  return useSyncExternalStore(
    useMarketplaceProfileStore.persist.onFinishHydration,
    () => useMarketplaceProfileStore.persist.hasHydrated(),
    () => false,
  );
}
