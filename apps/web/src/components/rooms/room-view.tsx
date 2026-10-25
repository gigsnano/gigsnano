"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { RoomBubble } from "@/components/rooms/room-bubble";
import { RoomParticipants } from "@/components/rooms/room-participants";
import { RoomPauseBar } from "@/components/rooms/room-pause-bar";
import { RoomTranscript } from "@/components/rooms/room-transcript";
import {
  useAddParticipant,
  useRemoveParticipant,
  useRoom,
  useRoomExperts,
} from "@/hooks/ai/use-rooms";
import { queryKeys } from "@/hooks/query-keys";
import { runRoomBurst } from "@/lib/rooms/room-stream";
import { roomsService } from "@/services/ai/rooms.service";

export function RoomView({ workspaceSlug, roomId }: { workspaceSlug: string; roomId: string }) {
  const qc = useQueryClient();
  const roomQ = useRoom(workspaceSlug, roomId);
  const expertsQ = useRoomExperts(workspaceSlug);
  const addP = useAddParticipant(workspaceSlug, roomId);
  const removeP = useRemoveParticipant(workspaceSlug, roomId);

  const [liveTurns, setLiveTurns] = useState<Record<string, string>>({});
  const [liveOrder, setLiveOrder] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const experts = expertsQ.data ?? [];
  // React Compiler memoizes this derivation — no hand-added useMemo (project rule).
  const expertsById = Object.fromEntries(experts.map((e) => [e.id, e]));
  const room = roomQ.data;
  const participants = (room?.participant_agent_ids ?? []).flatMap((id) =>
    expertsById[id] ? [expertsById[id]] : [],
  );

  function runBurst(content?: string) {
    if (streaming) return;
    setError(null);
    setStreaming(true);
    setPaused(false);
    setLiveTurns({});
    setLiveOrder([]);
    runRoomBurst(
      roomsService.advanceUrl(workspaceSlug, roomId),
      content ? { content } : {},
      {
        onSpeaker: (id) => {
          setLiveOrder((o) => (o.includes(id) ? o : [...o, id]));
          setLiveTurns((t) => ({ ...t, [id]: t[id] ?? "" }));
        },
        onText: (id, delta) =>
          setLiveTurns((t) => ({ ...t, [id]: (t[id] ?? "") + delta })),
        onError: (msg) => setError(msg),
      },
    )
      .catch(() => setError("The room stream failed — try again."))
      .finally(() => {
        setStreaming(false);
        setPaused(true);
        void qc.invalidateQueries({ queryKey: queryKeys.room(workspaceSlug, roomId) });
        setLiveTurns({});
        setLiveOrder([]);
      });
  }

  if (roomQ.isPending) {
    return <div className="p-4 text-sm text-muted-foreground">Loading room…</div>;
  }
  if (!room) return <div className="p-4 text-sm text-destructive">Room not found.</div>;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void runBurst(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RoomParticipants
        participants={participants}
        experts={experts}
        onAdd={(id) => addP.mutate({ agent_id: id })}
        onRemove={(id) => removeP.mutate(id)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <RoomTranscript messages={room.messages} expertsById={expertsById} />
        {liveOrder.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {liveOrder.map((sid) => (
              <RoomBubble
                key={`live-${sid}`}
                side="left"
                content={liveTurns[sid] ?? "…"}
                speakerName={expertsById[sid]?.name ?? sid}
                speakerColor={expertsById[sid]?.avatar_color}
              />
            ))}
          </div>
        ) : null}
        <RoomPauseBar
          visible={paused && !streaming && participants.length > 0}
          onContinue={() => void runBurst()}
          pending={streaming}
        />
        {error ? <p className="mt-2 text-center text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="shrink-0 border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Message the room"
            rows={1}
            value={draft}
            disabled={streaming}
            placeholder={participants.length ? "Message the room…" : "Add an expert to start"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="h-9 flex-1 resize-none rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring"
          />
          <Button
            type="button"
            disabled={streaming || !draft.trim() || !participants.length}
            onClick={send}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
