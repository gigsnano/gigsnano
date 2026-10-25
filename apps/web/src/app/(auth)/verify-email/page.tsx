import { Suspense } from "react";

import VerifyEmailPageClient from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>}>
      <VerifyEmailPageClient />
    </Suspense>
  );
}
