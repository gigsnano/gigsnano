import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

import type { IAutomationAst } from "@/types";
import { cn } from "@/lib/utils";

const TRIGGER_LABEL: Record<string, string> = {
  "story.created": "a work item is created",
  "story.updated": "a work item is updated",
  schedule: "on a schedule",
};

const ACTION_LABEL: Record<string, string> = {
  set_field: "set a field",
  assign_persona: "assign a persona",
  create_work_item: "create a work item",
  comment: "add a comment",
  create_from_template: "create from a template",
};

function condText(field: string, op: string, value: string | string[]): string {
  const v = Array.isArray(value) ? value.join(", ") : value;
  const ops: Record<string, string> = { eq: "is", neq: "is not", contains: "contains", in: "in" };
  return `${field} ${ops[op] ?? op} ${v}`;
}

/** Human-readable render of a compiled automation rule (WHEN / DO / unsupported). */
export function CompiledAst({ ast, className }: { ast: IAutomationAst; className?: string }) {
  return (
    <div className={cn("space-y-2 text-sm", className)}>
      <p>
        <span className="mr-1.5 font-mono text-xs font-semibold text-muted-foreground">WHEN</span>
        {TRIGGER_LABEL[ast.trigger] ?? ast.trigger}
        {ast.conditions.map((c) => (
          <span
            key={`${c.field}:${c.op}:${Array.isArray(c.value) ? c.value.join(",") : c.value}`}
            className="text-muted-foreground"
          >
            {" "}
            and <span className="text-foreground">{condText(c.field, c.op, c.value)}</span>
          </span>
        ))}
      </p>
      <p>
        <span className="mr-1.5 font-mono text-xs font-semibold text-muted-foreground">DO</span>
        {ast.actions.length ? (
          ast.actions.map((a, i) => (
            <span key={`${a.type}:${JSON.stringify(a.params)}`}>
              {i > 0 ? " + " : ""}
              <span className="font-medium">{ACTION_LABEL[a.type] ?? a.type}</span>
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">nothing yet</span>
        )}
      </p>
      {ast.unsupported.length ? (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-3.5 shrink-0" />
          <span>Not supported yet: {ast.unsupported.join("; ")}.</span>
        </div>
      ) : null}
    </div>
  );
}
