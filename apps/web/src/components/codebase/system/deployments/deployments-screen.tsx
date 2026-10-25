import { EmptyState } from "@/components/empty-state";

/** Phase-3 placeholder. Manual application stacks + provider-neutral deployment
 *  profiles are out of scope for V1 (GIN-417); the tab exists per the IA. */
export function DeploymentsScreen() {
  return (
    <EmptyState
      assetKey="generic"
      title="Deployments arrive in a later phase"
      description="You'll define applications and services from a bundle's repositories — runtimes, routes, build and test commands — then map them to provider-neutral deployment profiles. Bundles work today without any of this."
    />
  );
}
