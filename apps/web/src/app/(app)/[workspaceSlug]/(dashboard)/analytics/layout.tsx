import type { ReactNode } from "react";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { AnalyticsTabNav } from "@/components/analytics/analytics-tab-nav";

export default async function AnalyticsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <div className="flex min-h-0 flex-1 flex-col">
          <AnalyticsTabNav workspaceSlug={workspaceSlug} />
          {children}
        </div>
      </ContentWrapper>
    </>
  );
}
