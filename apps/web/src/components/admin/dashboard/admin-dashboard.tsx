"use client";

import Link from "next/link";

import { AdminHeader } from "@/components/admin";
import { formatTokenCount, formatUsd } from "@/components/admin/llm-usage/format-source";
import { llmUsageDefaultRange } from "@/components/admin/llm-usage/llm-usage-period-tabs";
import { useLlmUsageSummary, useStaffMe } from "@/hooks/admin/use-admin";
import { cn } from "@/lib/utils";
import { EPrivilege } from "@/types";

const PLACEHOLDER_TILES = [
  { label: "Users", hint: "Cross-tenant directory" },
  { label: "Workspaces", hint: "All tenants" },
  { label: "Staff roles", hint: "RBAC" },
  { label: "Audit events", hint: "Last 24h" },
];

function LlmUsageDashboardTiles() {
  const range = llmUsageDefaultRange();
  const { data: usage, isPending } = useLlmUsageSummary({
    from: range.from,
    to: range.to,
  });

  const tiles = [
    {
      label: "LLM tokens (30d)",
      hint: "Platform-wide token volume",
      value: isPending ? "\u2026" : formatTokenCount(usage?.total_tokens ?? 0),
    },
    {
      label: "Est. cost (30d)",
      hint: "Estimated LLM spend",
      value: isPending ? "\u2026" : formatUsd(usage?.estimated_cost_usd ?? 0),
    },
  ] as const;

  return (
    <>
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          href="/admin/llm-usage"
          className={cn(
            "rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/30",
          )}
        >
          <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{tile.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
        </Link>
      ))}
    </>
  );
}

export function AdminDashboard() {
  const { data } = useStaffMe();
  const staffHasUsage = new Set(data?.privileges ?? []).has(EPrivilege.UsageRead);
  const placeholderTiles = staffHasUsage ? PLACEHOLDER_TILES.slice(2) : PLACEHOLDER_TILES;

  return (
    <>
      <AdminHeader title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-6">
        <p className="mb-6 text-sm text-muted-foreground">
          Welcome back, {data?.display_name}. Platform metrics land here as each module ships.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {staffHasUsage ? <LlmUsageDashboardTiles /> : null}
          {placeholderTiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">—</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

