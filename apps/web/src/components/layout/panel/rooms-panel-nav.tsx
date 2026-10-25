"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BubbleChatIcon } from "@hugeicons/core-free-icons";

import { useRooms } from "@/hooks/ai/use-rooms";
import { PanelNavLink, PanelSection } from "./panel-nav";

export function RoomsPanelNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/rooms`;
  const { data } = useRooms(workspaceSlug, { limit: 50, offset: 0 });
  const rooms = data?.items ?? [];

  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3">
      <div className="pt-2">
        <PanelNavLink
          href={base}
          label="All rooms"
          icon={BubbleChatIcon}
          active={pathname === base}
        />
      </div>
      {rooms.length > 0 ? (
        <PanelSection title="Rooms">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`${base}/${room.id}`}
              className={
                pathname === `${base}/${room.id}`
                  ? "block truncate rounded-md bg-sidebar-accent px-2.5 py-1.5 text-sm font-medium text-sidebar-accent-foreground"
                  : "block truncate rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }
            >
              {room.title}
            </Link>
          ))}
        </PanelSection>
      ) : null}
    </div>
  );
}
