import type {
  IAddParticipantPayload,
  ICreateRoomPayload,
  IExpert,
  IRoom,
  IRoomFilters,
  IRoomPage,
} from "@/types/ai/rooms";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

/**
 * Expert Rooms: room CRUD + participants + expert registry. Plain JSON, mirroring
 * `gigs-ai.service`. The `advance` endpoint streams a bespoke SSE frame set and is
 * consumed directly by the room-stream reader (`@/lib/rooms/room-stream`), not
 * through `APIService.request` — see `advanceUrl`.
 */
class RoomsService extends APIService {
  createRoom(slug: string, payload: ICreateRoomPayload = {}) {
    return this.post<IRoom>(`/workspaces/${slug}/rooms/`, payload);
  }

  listRooms(slug: string, filters: IRoomFilters = {}) {
    const qs = new URLSearchParams();
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IRoomPage>(`/workspaces/${slug}/rooms/${suffix}`);
  }

  getRoom(slug: string, roomId: string) {
    return this.get<IRoom>(`/workspaces/${slug}/rooms/${roomId}/`);
  }

  addParticipant(slug: string, roomId: string, payload: IAddParticipantPayload) {
    return this.post<IRoom>(`/workspaces/${slug}/rooms/${roomId}/participants/`, payload);
  }

  removeParticipant(slug: string, roomId: string, agentId: string) {
    return this.delete<IRoom>(`/workspaces/${slug}/rooms/${roomId}/participants/${agentId}/`);
  }

  listExperts(slug: string) {
    return this.get<IExpert[]>(`/workspaces/${slug}/rooms/experts/`);
  }

  /** Absolute URL for the streaming advance endpoint — used by the room-stream reader. */
  advanceUrl(slug: string, roomId: string) {
    return `${this.baseURL}/workspaces/${slug}/rooms/${roomId}/advance/`;
  }
}

export const roomsService = new RoomsService();
