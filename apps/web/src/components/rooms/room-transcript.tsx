import { RoomBubble } from "./room-bubble";

/**
 * The persisted room transcript rendered as a bubble list. Human turns
 * (`speaker === null`) render on the right; agent turns render on the left,
 * labelled by their expert's name/color. Unknown speakers fall back to the raw
 * id so an orphaned message is never invisible.
 */
export function RoomTranscript({
  messages,
  expertsById,
}: {
  messages: Array<{ id: string; role: "user" | "assistant"; speaker: string | null; content: string }>;
  expertsById: Record<string, { name: string; avatar_color: string }>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        if (m.speaker === null) {
          return <RoomBubble key={m.id} side="right" content={m.content} />;
        }
        const expert = expertsById[m.speaker];
        return (
          <RoomBubble
            key={m.id}
            side="left"
            content={m.content}
            speakerName={expert?.name ?? m.speaker}
            speakerColor={expert?.avatar_color}
          />
        );
      })}
    </div>
  );
}
