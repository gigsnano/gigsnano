"use client";

import { useState } from "react";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { cn } from "@/lib/utils";

import { RoadmapTimeline } from "./roadmap-timeline";
import { ReleasesView } from "./releases-view";

type Tab = "timeline" | "releases";

const TABS: { key: Tab; label: string }[] = [
  { key: "timeline", label: "Timeline" },
  { key: "releases", label: "Releases" },
];

export function RoadmapPage({ workspaceSlug }: { workspaceSlug: string }) {
  const [tab, setTab] = useState<Tab>("timeline");

  return (
    <>
      <AppHeader />
      <ContentWrapper className="p-6">
        <div className="mx-auto mb-4 w-full max-w-4xl">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tab === "timeline" ? (
          <RoadmapTimeline workspaceSlug={workspaceSlug} />
        ) : (
          <ReleasesView workspaceSlug={workspaceSlug} />
        )}
      </ContentWrapper>
    </>
  );
}
