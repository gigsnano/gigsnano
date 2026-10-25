import { cn } from "@/lib/utils";

/**
 * A single chat bubble in a room transcript. Agent turns are left bubbles with a
 * small colored name label (the expert's `avatar_color`); the human's turns are
 * right bubbles. New bubbles rise in with a gentle fade (repo `animate-in`
 * convention) so a streaming round reads as it arrives rather than snapping in.
 */
export function RoomBubble({
  speakerName,
  speakerColor,
  content,
  side,
}: {
  speakerName?: string;
  speakerColor?: string;
  content: string;
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-1",
        side === "right" ? "justify-end" : "justify-start",
      )}
    >
      <div className="max-w-[85%]">
        {side === "left" && speakerName ? (
          <p
            className="mb-0.5 ml-1 text-[11px] font-semibold tracking-tight"
            style={{ color: speakerColor }}
          >
            {speakerName}
          </p>
        ) : null}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
            side === "right"
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm border border-border/60 bg-muted text-foreground",
          )}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
