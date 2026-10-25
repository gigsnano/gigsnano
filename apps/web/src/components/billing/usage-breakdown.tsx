"use client";

import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAiOperation, formatCostCents, formatTokenCount } from "@/lib/ai-cost/format";
import type { IAiUsageLine } from "@/types";

/**
 * What one AI turn actually cost, on hover (GIN-153).
 *
 * The receipt shows money because money is what people check. Operation, model
 * and tokens are the answer to "why that much?" — worth having, not worth
 * spending a line of the chat on. So they live behind the pill.
 */
export function UsageBreakdown({
  line,
  children,
}: {
  line: IAiUsageLine;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        {/* asChild onto a span: the trigger must be a real element to hover, and
            the pill it wraps is itself a span. */}
        <TooltipTrigger asChild>
          <span className="cursor-help">{children}</span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <span className="font-medium">{formatAiOperation(line.operation)}</span>
            <span className="text-muted-foreground">{line.model}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatTokenCount(line.input_tokens)} in · {formatTokenCount(line.output_tokens)} out
            </span>
            <span className="tabular-nums">{formatCostCents(line.cost_cents)}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
