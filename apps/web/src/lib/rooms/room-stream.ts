import { refreshSession } from "@/services/auth/refresh";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export type RoomFrame =
  | { type: "start" }
  | { type: "room_speaker"; speaker_id: string; name: string; color: string }
  | { type: "room_text"; speaker_id: string; delta: string }
  | { type: "room_turn_end"; speaker_id: string }
  | { type: "finish" }
  | { type: "error"; errorText: string }
  | { type: "done" };

const KNOWN = new Set([
  "start", "room_speaker", "room_text", "room_turn_end", "finish", "error",
]);

/** POST the advance endpoint (credentials included), recovering once from a 401
 * via the shared single-flight session refresh — mirrors `chat-transport`. */
export async function advanceRoom(url: string, body: { content?: string }): Promise<Response> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  };
  const res = await fetch(url, init);
  if (res.status !== 401) return res;
  const refreshed = await refreshSession(API_BASE_URL);
  return refreshed ? fetch(url, init) : res;
}

/** Callbacks a burst consumer wires to its local UI state. */
export interface RoomBurstHandlers {
  onSpeaker: (speakerId: string) => void;
  onText: (speakerId: string, delta: string) => void;
  onError: (message: string) => void;
}

/** POST `advance` and drive one burst's frames into `handlers`. Kept at module
 * scope (like `chat-transport`) so the `for await` + control flow stays out of a
 * React-Compiler-compiled component; the caller owns state resets in a
 * `.finally()`. Returns when the stream ends (`done` / body end). */
export async function runRoomBurst(
  url: string,
  body: { content?: string },
  handlers: RoomBurstHandlers,
): Promise<void> {
  const res = await advanceRoom(url, body);
  for await (const f of readRoomStream(res)) {
    if (f.type === "room_speaker") handlers.onSpeaker(f.speaker_id);
    else if (f.type === "room_text") handlers.onText(f.speaker_id, f.delta);
    else if (f.type === "error") handlers.onError(f.errorText);
    else if (f.type === "done") break;
  }
}

/** Parse the bespoke room-advance SSE (`data: {json}\n\n` frames) into typed
 * frames. Unknown frames are ignored; `[DONE]` or end-of-body yields `done`. */
export async function* readRoomStream(res: Response): AsyncGenerator<RoomFrame> {
  if (!res.body) {
    yield { type: "done" };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        yield { type: "done" };
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const t = (parsed as { type?: unknown }).type;
      if (typeof t === "string" && KNOWN.has(t)) yield parsed as RoomFrame;
    }
  }
  yield { type: "done" };
}
