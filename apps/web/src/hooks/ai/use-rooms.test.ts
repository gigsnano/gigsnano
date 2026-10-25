import { describe, expect, it } from "vitest";
import { queryKeys } from "@/hooks/query-keys";
import { roomsService } from "@/services/ai/rooms.service";

describe("rooms query keys + service urls", () => {
  it("room list/detail/experts keys are stable and scoped", () => {
    expect(queryKeys.rooms("acme", { limit: 25, offset: 0 })).toEqual([
      "workspaces", "acme", "rooms", 25, 0,
    ]);
    expect(queryKeys.room("acme", "r1")).toEqual(["workspaces", "acme", "rooms", "r1"]);
    expect(queryKeys.roomExperts("acme")).toEqual(["workspaces", "acme", "rooms", "experts"]);
  });

  it("advanceUrl targets the advance endpoint", () => {
    expect(roomsService.advanceUrl("acme", "r1")).toMatch(
      /\/workspaces\/acme\/rooms\/r1\/advance\/$/,
    );
  });
});
