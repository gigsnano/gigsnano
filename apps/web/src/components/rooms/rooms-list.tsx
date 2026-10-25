"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { BubbleChatIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useCreateRoom, useRooms } from "@/hooks/ai/use-rooms";
import type { IRoom } from "@/types/ai/rooms";

function RoomCard({ room, workspaceSlug }: { room: IRoom; workspaceSlug: string }) {
  const count = room.participant_agent_ids.length;
  return (
    <Link
      href={`/${workspaceSlug}/rooms/${room.id}`}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-ring/60 hover:bg-accent/40"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeiconsIcon icon={BubbleChatIcon} className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{room.title}</h3>
          <p className="text-xs text-muted-foreground">
            {count === 0 ? "No experts yet" : `${count} expert${count === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {room.messages.length} message{room.messages.length === 1 ? "" : "s"}
      </p>
    </Link>
  );
}

export function RoomsList({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useRooms(workspaceSlug, { limit: 50, offset: 0 });
  const createRoom = useCreateRoom(workspaceSlug);

  const onCreate = () =>
    createRoom.mutate(
      {},
      { onSuccess: (room) => router.push(`/${workspaceSlug}/rooms/${room.id}`) },
    );

  if (isPending) {
    return (
      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load rooms"
          description="Something went wrong fetching your expert rooms."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const rooms = data?.items ?? [];

  if (rooms.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="generic"
          title="No rooms yet"
          description="Start a room, add a few expert agents, and watch them talk through your problem together."
          actions={[
            {
              label: createRoom.isPending ? "Creating…" : "New room",
              onClick: onCreate,
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Group chats where specialized experts advise you together, one round at a time.
        </p>
        <Button type="button" onClick={onCreate} disabled={createRoom.isPending}>
          {createRoom.isPending ? "Creating…" : "New room"}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} workspaceSlug={workspaceSlug} />
        ))}
      </div>
    </div>
  );
}
