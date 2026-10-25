"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useStaffMe } from "@/hooks/admin/use-admin";
import { APIError } from "@/services/api-error";
import { EmptyState } from "@/components/empty-state";

export function StaffGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isPending, error } = useStaffMe();

  const status = error instanceof APIError ? error.status : undefined;

  useEffect(() => {
    if (status === 401) router.replace("/sign-in?next=/admin");
  }, [status, router]);

  if (isPending) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (status === 401) return null; // redirecting

  if (error || !data) {
    return (
      <div className="flex h-svh items-center justify-center">
        <EmptyState
          assetKey="generic"
          title="Not authorized"
          description="Your account doesn't have access to the admin console."
          actions={[{ label: "Back to app", href: "/" }]}
        />
      </div>
    );
  }

  return <>{children}</>;
}
