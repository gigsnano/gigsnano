"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { IWorkHistoryItem } from "@/types";

import { RatingStars } from "../shared/rating-stars";

const INITIAL_VISIBLE = 5;

/** Completed-jobs list with a "View more" expander. */
export function WorkHistoryList({ items }: { items: IWorkHistoryItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);
  const hidden = items.length - INITIAL_VISIBLE;

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No completed jobs yet.</p>;
  }

  return (
    <div className="flex flex-col divide-y">
      {visible.map((item, i) => (
        <div key={`${item.title}-${i}`} className="flex flex-col gap-1.5 py-4 first:pt-0">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-medium text-primary">{item.title}</h3>
            <span className="shrink-0 text-xs text-muted-foreground">{item.period_label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <RatingStars rating={item.rating} />
            <span>{item.amount_label}</span>
          </div>
          <blockquote className="text-sm italic text-muted-foreground">
            &ldquo;{item.feedback}&rdquo;
          </blockquote>
        </div>
      ))}

      {!expanded && hidden > 0 && (
        <div className="pt-4">
          <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
            View more ({hidden})
          </Button>
        </div>
      )}
    </div>
  );
}
