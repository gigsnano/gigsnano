import { notFound } from "next/navigation";

import { JOURNEY_ENABLED } from "@/lib/journey/journey-flag";

/** Gate the whole Project Journey subtree (page + [stepId] + discovery) behind
 *  the feature flag (GIN-427 / GIN-434). Disabled → the routes don't exist. */
export default function JourneyLayout({ children }: { children: React.ReactNode }) {
  if (!JOURNEY_ENABLED) notFound();
  return children;
}
