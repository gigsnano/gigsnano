import { RoomView } from "@/components/rooms/room-view";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; roomId: string }>;
}) {
  const { workspaceSlug, roomId } = await params;
  return <RoomView key={roomId} workspaceSlug={workspaceSlug} roomId={roomId} />;
}
