"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EntitlementGate } from "@/components/billing/entitlement";
import {
  useAutomations,
  useCreateAutomation,
  usePreviewAutomation,
} from "@/hooks/automation/use-automations";
import type { IAutomationAst } from "@/types";

import { AutomationRuleCard } from "./automation-rule-card";
import { CompiledAst } from "./compiled-ast";

export function AutomationComposer({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useAutomations(workspaceSlug, projectId);
  const preview = usePreviewAutomation(workspaceSlug, projectId);
  const create = useCreateAutomation(workspaceSlug, projectId);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [ast, setAst] = useState<IAutomationAst | null>(null);

  const compile = () => {
    if (!text.trim()) return;
    preview.mutate(text.trim(), { onSuccess: (result) => setAst(result) });
  };

  const save = () => {
    if (!name.trim() || !text.trim()) return;
    create.mutate(
      { name: name.trim(), text: text.trim() },
      {
        onSuccess: () => {
          setText("");
          setName("");
          setAst(null);
        },
      },
    );
  };

  const automations = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Composer */}
      <EntitlementGate feature="automations">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">New automation</p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setAst(null);
            }}
            rows={3}
            placeholder='Describe it — e.g. "when a bug is filed, assign the Developer persona and post to Slack"'
            aria-label="Describe the automation"
            className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={compile} disabled={!text.trim() || preview.isPending}>
              <HugeiconsIcon icon={SparklesIcon} className="size-4" />
              {preview.isPending ? "Compiling…" : "Compile"}
            </Button>
          </div>

          {ast ? (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Compiled rule</p>
              <CompiledAst ast={ast} />
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name this automation"
                  aria-label="Automation name"
                  className="h-8"
                />
                <Button size="sm" onClick={save} disabled={!name.trim() || create.isPending}>
                  {create.isPending ? "Enabling…" : "Enable"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </EntitlementGate>

      {/* Existing automations */}
      <section>
        <p className="mb-2 text-sm font-medium">Automations</p>
        {isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            align="start"
            title="Couldn't load automations"
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : automations.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No automations yet. Describe one above to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {automations.map((rule) => (
              <AutomationRuleCard
                key={rule.id}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                rule={rule}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
