"use client";

import { useParams } from "next/navigation";

import { useParseDbml } from "@/hooks/code/use-erd";

import { ErdCanvas } from "./erd-canvas";

/**
 * Renders a chat `gigs:erd` block that carried only raw `dbml` (no pre-parsed
 * schema): POSTs the dbml to the backend parser and renders the resulting
 * ErdCanvas once resolved. Needs a project in the route (Architect card /
 * project GigsAI) — the parse endpoint is project-scoped though schema-agnostic.
 */
export function DbmlErdCanvas({ dbml, id }: { dbml: string; id: string }) {
  const params = useParams<{ workspaceSlug?: string; projectId?: string }>();
  const workspaceSlug = params?.workspaceSlug ?? "";
  const projectId = params?.projectId ?? "";
  const { data: schema, isLoading, isError } = useParseDbml(workspaceSlug, projectId, dbml, id);

  if (!workspaceSlug || !projectId) return null;
  if (isLoading) {
    return (
      <div className="mt-2 flex h-24 items-center justify-center rounded-lg border bg-muted/30 text-xs text-muted-foreground">
        Rendering schema…
      </div>
    );
  }
  if (isError || !schema || schema.tables.length === 0) return null;
  return <ErdCanvas schema={schema} />;
}
