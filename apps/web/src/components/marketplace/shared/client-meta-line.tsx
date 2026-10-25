import { HugeiconsIcon } from "@hugeicons/react";
import { Location01Icon } from "@hugeicons/core-free-icons";

import type { IJobClient } from "@/types";

import { RatingStars } from "./rating-stars";
import { VerifiedBadge } from "./verified-badge";

function formatSpent(usd: number): string {
  if (usd >= 1000) return `$${Math.round(usd / 1000)}K+ spent`;
  return usd > 0 ? `$${usd}+ spent` : "$0 spent";
}

/** "Payment verified · ★★★★★ 5.0 · $2K+ spent · Norway" line under a job title. */
export function ClientMetaLine({ client }: { client: IJobClient }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {client.payment_verified && <VerifiedBadge />}
      <RatingStars rating={client.rating} />
      <span>{formatSpent(client.total_spent_usd)}</span>
      <span className="inline-flex items-center gap-0.5">
        <HugeiconsIcon icon={Location01Icon} className="size-3.5" />
        {client.country}
      </span>
    </div>
  );
}
