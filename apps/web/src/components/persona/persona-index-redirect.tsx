"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { usePersonaRoleStore } from "@/store/ui/persona-role.store";

/** `/persona` → the member's last-used lens (the shell there enforces RBAC). */
export function PersonaIndexRedirect({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const role = usePersonaRoleStore((s) => s.role);

  useEffect(() => {
    // eslint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- reads the persisted client role; can't be a server redirect.
    router.replace(`/${workspaceSlug}/persona/${role}`);
  }, [router, role, workspaceSlug]);

  return null;
}
