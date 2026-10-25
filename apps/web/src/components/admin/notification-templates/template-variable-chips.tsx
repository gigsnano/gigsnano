"use client";

import { Button } from "@/components/ui/button";

export function TemplateVariableChips({
  variables,
  onInsert,
}: {
  variables: string[];
  onInsert: (token: string) => void;
}) {
  if (variables.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {variables.map((v) => (
        <Button
          key={v}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 font-mono text-xs"
          onClick={() => onInsert(`{${v}}`)}
        >
          {`{${v}}`}
        </Button>
      ))}
    </div>
  );
}
