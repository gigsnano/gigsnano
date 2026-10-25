import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { roomsService } from "@/services/ai/rooms.service";
import type { IAddParticipantPayload, ICreateRoomPayload, IRoomFilters } from "@/types/ai/rooms";

import { queryKeys } from "../query-keys";

export function useRooms(slug: string, filters: IRoomFilters = {}) {
  return useQuery({
    queryKey: queryKeys.rooms(slug, filters),
    queryFn: () => roomsService.listRooms(slug, filters),
    enabled: !!slug,
  });
}

export function useRoom(slug: string, roomId: string | null) {
  return useQuery({
    queryKey: queryKeys.room(slug, roomId ?? ""),
    queryFn: () => roomsService.getRoom(slug, roomId as string),
    enabled: !!slug && !!roomId,
  });
}

export function useRoomExperts(slug: string) {
  return useQuery({
    queryKey: queryKeys.roomExperts(slug),
    queryFn: () => roomsService.listExperts(slug),
    enabled: !!slug,
  });
}

export function useCreateRoom(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateRoomPayload = {}) => roomsService.createRoom(slug, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces", slug, "rooms"] }),
  });
}

export function useAddParticipant(slug: string, roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAddParticipantPayload) =>
      roomsService.addParticipant(slug, roomId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.room(slug, roomId) }),
  });
}

export function useRemoveParticipant(slug: string, roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => roomsService.removeParticipant(slug, roomId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.room(slug, roomId) }),
  });
}
