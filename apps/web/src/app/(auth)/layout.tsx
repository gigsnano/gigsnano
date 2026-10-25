import type { ReactNode } from "react";
import { Suspense } from "react";

import { BrandLogo } from "@/components/brand";
import { AuthLayoutShell } from "@/components/auth/auth-layout-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayoutShell>
      <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-4">
        <div className="mb-6">
          <BrandLogo priority className="h-8" />
        </div>
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <Suspense>{children}</Suspense>
        </div>
      </div>
    </AuthLayoutShell>
  );
}
