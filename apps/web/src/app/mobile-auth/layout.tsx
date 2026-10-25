import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand";

/** Outside the (auth) group: its GuestGuard would bounce the signed-in user this page is for. */
export default function MobileAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-4">
      <div className="mb-6">
        <BrandLogo priority className="h-8" />
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}
