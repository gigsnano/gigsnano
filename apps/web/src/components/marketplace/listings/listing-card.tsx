import Link from "next/link";

import { htmlToPlainText } from "@/lib/format/html-to-text";
import type { IListing } from "@/types";

import { timeAgo } from "../shared/time-ago";

/** Real GigsNano marketplace listing row in the jobs feed. */
export function ListingCard({ listing }: { listing: IListing }) {
  return (
    <article className="group relative -mx-3 rounded-lg px-3 py-5 transition-colors duration-150 hover:bg-muted/40">
      <p className="text-xs text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">GigsNano work</span>
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        Posted {timeAgo(listing.created_at)}
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        {listing.bid_count} proposal{listing.bid_count === 1 ? "" : "s"}
      </p>

      <h3 className="mt-1 text-lg font-semibold leading-snug">
        <Link
          href={`/marketplace/listings/${listing.id}`}
          className="transition-colors duration-150 after:absolute after:inset-0 group-hover:text-primary"
        >
          {listing.title}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        {htmlToPlainText(listing.description)}
      </p>
    </article>
  );
}
