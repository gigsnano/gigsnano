import { describe, expect, it } from "vitest";
import { readRoomStream, type RoomFrame } from "@/lib/rooms/room-stream";

function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `data: ${f}\n\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      // split into two chunks mid-frame to exercise buffering
      const enc = new TextEncoder().encode(body);
      const mid = Math.floor(enc.length / 2);
      c.enqueue(enc.slice(0, mid));
      c.enqueue(enc.slice(mid));
      c.close();
    },
  });
  return new Response(stream);
}

describe("readRoomStream", () => {
  it("parses a one-round stream into typed frames", async () => {
    const res = sseResponse([
      JSON.stringify({ type: "start" }),
      JSON.stringify({ type: "room_speaker", speaker_id: "a", name: "Analyst", color: "#3b6ea5" }),
      JSON.stringify({ type: "room_text", speaker_id: "a", delta: "hello" }),
      JSON.stringify({ type: "room_turn_end", speaker_id: "a" }),
      JSON.stringify({ type: "finish" }),
      "[DONE]",
    ]);
    const frames: RoomFrame[] = [];
    for await (const f of readRoomStream(res)) frames.push(f);
    expect(frames.map((f) => f.type)).toEqual([
      "start", "room_speaker", "room_text", "room_turn_end", "finish", "done",
    ]);
    const text = frames.find((f) => f.type === "room_text");
    expect(text).toMatchObject({ speaker_id: "a", delta: "hello" });
  });

  it("surfaces an error frame", async () => {
    const res = sseResponse([JSON.stringify({ type: "error", errorText: "Paused" }), "[DONE]"]);
    const frames: RoomFrame[] = [];
    for await (const f of readRoomStream(res)) frames.push(f);
    expect(frames.find((f) => f.type === "error")).toMatchObject({ errorText: "Paused" });
  });
});
