import type { Metadata } from "next";

import { PublicDashboardView } from "@/components/dashboards/public/public-dashboard-view";

/** Published dashboards are shared by link, never discoverable (GIN-489). */
export const metadata: Metadata = {
  title: "Shared dashboard · GigsNano",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-dvh bg-background">
      <PublicDashboardView token={token} />
    </main>
  );
}
