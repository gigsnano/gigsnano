import { Suspense } from "react";
import type { Metadata } from "next";

import { Inbox } from "@/components/notifications/inbox/inbox";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <Suspense>
      <Inbox workspaceSlug={workspaceSlug} />
    </Suspense>
  );
}
