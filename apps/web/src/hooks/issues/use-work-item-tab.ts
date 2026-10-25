"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { parseWorkItemTab, type WorkItemTab } from "@/lib/issues/work-item-tabs";

/**
 * Active work-item tab and the way to change it (GIN-479).
 *
 * The URL is the state, so the shell and the panels inside it read the same
 * value without threading it through props — and a link, a refresh and the back
 * button all land on the same tab. Overview drops the param entirely rather
 * than writing `?tab=overview`, keeping the default URL clean.
 */
export function useWorkItemTab(): { tab: WorkItemTab; goToTab: (tab: WorkItemTab) => void } {
  const router = useRouter();
  const searchParams = useSearchParams();

  return {
    tab: parseWorkItemTab(searchParams.get("tab")),
    goToTab: (next) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
  };
}
