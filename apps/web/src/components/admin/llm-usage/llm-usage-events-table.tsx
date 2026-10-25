"use client";

import { Fragment, useState } from "react";

import { OffsetPagination } from "@/components/ui/offset-pagination";
import type { ILlmUsageEventPage } from "@/types";

import { formatLlmUsageOperation, formatLlmUsageSource, formatTokenCount, formatUsd } from "./format-source";

interface ILlmUsageEventsTableProps {
  page: ILlmUsageEventPage | null | undefined;
  onPageChange: (offset: number) => void;
  onSelectWorkspace: (workspaceId: string, workspaceName: string) => void;
  onSelectUser: (userId: string, userName: string) => void;
  onSelectSource: (source: string) => void;
}

export function LlmUsageEventsTable({
  page,
  onPageChange,
  onSelectWorkspace,
  onSelectUser,
  onSelectSource,
}: ILlmUsageEventsTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const offset = page?.offset ?? 0;
  const limit = page?.limit ?? 20;
  const total = page?.total ?? 0;

  const pagination = (
    <OffsetPagination
      offset={offset}
      limit={limit}
      total={total}
      onOffsetChange={onPageChange}
    />
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Activity log</h2>
        {pagination}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Workspace</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Op</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Tokens</th>
              <th className="px-3 py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(page?.items ?? []).map((event) => (
              <Fragment key={event.id}>
                <tr
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                  onClick={() => setOpenId(openId === event.id ? null : event.id)}
                >
                  <td className="px-3 py-2 text-muted-foreground">{new Date(event.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-foreground underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectWorkspace(event.workspace_id, event.workspace_name);
                      }}
                    >
                      {event.workspace_name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-foreground underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectUser(event.user_id, event.user_display_name);
                      }}
                    >
                      {event.user_display_name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-foreground underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSource(event.source);
                      }}
                    >
                      {formatLlmUsageSource(event.source)}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatLlmUsageOperation(event.operation)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{event.model}</td>
                  <td className="px-3 py-2 text-foreground">{formatTokenCount(event.total_tokens)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatUsd(event.estimated_cost_usd)}</td>
                </tr>
                {openId === event.id ? (
                  <tr className="border-b border-border bg-muted/20">
                    <td colSpan={8} className="px-3 py-2">
                      <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs text-muted-foreground">
                        {JSON.stringify(
                          {
                            project_id: event.project_id,
                            story_id: event.story_id,
                            thread_id: event.thread_id,
                            input_tokens: event.input_tokens,
                            output_tokens: event.output_tokens,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
