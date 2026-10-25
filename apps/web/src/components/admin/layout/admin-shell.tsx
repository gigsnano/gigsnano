import type { ReactNode } from "react";

import { AdminMobileHeader, AdminSidebar } from "./admin-sidebar";

/** md+: fixed sidebar beside the content. Phones: a top bar whose menu opens
 *  the same nav as a drawer, content full width below it. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background max-md:flex-col">
      <AdminSidebar />
      <AdminMobileHeader />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
