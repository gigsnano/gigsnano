import { Button } from "@/components/ui/button";
import { toolActionLabel } from "@/lib/ai/tool-labels";
import type { IToolEventState } from "@/hooks/ai/use-tool-events";

/** Confirm-before-write card for a paused (`tool_confirmation`) mutating tool. */
export function ToolConfirmCard({
  event,
  onApprove,
  onCancel,
}: {
  event: IToolEventState;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const pending = event.status === "resuming";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <p className="text-foreground">GigsAI wants to {toolActionLabel(event.name)}. Continue?</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          aria-label={`Approve: ${toolActionLabel(event.name)}`}
          disabled={pending}
          onClick={onApprove}
        >
          {pending ? "Working…" : "Do it"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Cancel: ${toolActionLabel(event.name)}`}
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
