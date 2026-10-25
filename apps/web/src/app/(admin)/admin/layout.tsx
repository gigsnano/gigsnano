import type { ReactNode } from "react";

import { AdminShell, StaffGuard } from "@/components/admin";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <StaffGuard>
      <AdminShell>{children}</AdminShell>
    </StaffGuard>
  );
}
