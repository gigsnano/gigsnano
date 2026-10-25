import type { IJobClient } from "@/types";

import { RatingStars } from "../shared/rating-stars";
import { VerifiedBadge } from "../shared/verified-badge";

/** "About the client" rail card on the job detail page. */
export function ClientCard({ client }: { client: IJobClient }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5" aria-label="About the client">
      <h2 className="text-base font-semibold">About the client</h2>

      <div className="flex flex-col gap-1.5">
        {client.payment_verified && <VerifiedBadge label="Payment method verified" />}
        <span className="flex items-center gap-2">
          <RatingStars rating={client.rating} />
          <span className="text-xs text-muted-foreground">
            {client.rating > 0 ? `${client.rating.toFixed(1)} of ${client.reviews_count} reviews` : "No reviews yet"}
          </span>
        </span>
      </div>

      <dl className="flex flex-col gap-2.5 border-t pt-3 text-sm">
        <div>
          <dt className="font-medium">{client.country}</dt>
        </div>
        <div>
          <dt className="font-medium">
            {client.jobs_posted} {client.jobs_posted === 1 ? "job" : "jobs"} posted
          </dt>
          <dd className="text-xs text-muted-foreground">
            {client.hire_rate_pct}% hire rate, {client.hires}{" "}
            {client.hires === 1 ? "hire" : "hires"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">
            ${client.total_spent_usd >= 1000 ? `${(client.total_spent_usd / 1000).toFixed(1)}K` : client.total_spent_usd}{" "}
            total spent
          </dt>
          {client.avg_hourly_paid != null && (
            <dd className="text-xs text-muted-foreground">
              ${client.avg_hourly_paid.toFixed(2)} /hr avg hourly rate paid
            </dd>
          )}
        </div>
        <div>
          <dt className="font-medium">{client.industry}</dt>
          <dd className="text-xs text-muted-foreground">{client.company_size}</dd>
        </div>
        <div>
          <dd className="text-xs text-muted-foreground">Member since {client.member_since}</dd>
        </div>
      </dl>
    </section>
  );
}
