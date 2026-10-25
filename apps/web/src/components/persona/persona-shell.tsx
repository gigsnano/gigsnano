"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersonaAccess } from "@/hooks/persona/use-persona-access";
import { usePersonaRoleStore } from "@/store/ui/persona-role.store";
import {
  EPersonaRole,
  PERSONA_CONFIG,
  PERSONA_ORDER,
} from "@/lib/persona/persona-config";
import { cn } from "@/lib/utils";

import { PersonaDashboard } from "./persona-dashboard";

export function PersonaShell({
  workspaceSlug,
  role,
}: {
  workspaceSlug: string;
  role: EPersonaRole;
}) {
  const router = useRouter();
  const access = usePersonaAccess(workspaceSlug);
  const setStoreRole = usePersonaRoleStore((s) => s.setRole);

  const allowed = access.isAllowed(role);
  const fallback = access.allowedRoles[0] ?? EPersonaRole.Developer;

  // Route guard: a lens the member can't see (or an unknown role) bounces to
  // their first allowed lens — RBAC holds on deep-link, not just display.
  useEffect(() => {
    if (access.isLoading) return;
    // eslint-disable-next-line react-doctor/nextjs-no-client-side-redirect -- RBAC guard on client auth/role; must run after the query resolves.
    if (!allowed) router.replace(`/${workspaceSlug}/persona/${fallback}`);
  }, [access.isLoading, allowed, fallback, role, router, workspaceSlug]);

  const def = PERSONA_CONFIG[role];
  const visible = PERSONA_ORDER.filter(access.isAllowed);

  return (
    <>
      <AppHeader />
      <ContentWrapper className="p-6">
        {access.isLoading ? (
          <div className="mx-auto max-w-6xl">
            <Skeleton className="h-9 w-72 rounded-lg" />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          </div>
        ) : !allowed || !def ? null : (
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            {/* Persona switcher */}
            <div className="inline-flex flex-wrap gap-1 self-start rounded-lg border bg-muted/40 p-0.5">
              {visible.map((r) => {
                const d = PERSONA_CONFIG[r];
                const active = r === role;
                return (
                  <Link
                    key={r}
                    href={`/${workspaceSlug}/persona/${r}`}
                    onClick={() => setStoreRole(r)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                      "motion-safe:active:scale-[0.97]",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <HugeiconsIcon icon={d.icon} className="size-4" />
                    {d.label}
                  </Link>
                );
              })}
            </div>

            <div>
              <h1 className="text-2xl font-semibold">{def.label} 360</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{def.tagline}</p>
            </div>

            <PersonaDashboard workspaceSlug={workspaceSlug} def={def} />
          </div>
        )}
      </ContentWrapper>
    </>
  );
}
