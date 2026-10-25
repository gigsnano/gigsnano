import { parseDelegationEvent, isTerminalDelegationStatus } from "@/lib/ai/delegation-status";
import type { EDelegationStatus } from "@/types/ai/agent-delegation";

export type DelegationStreamHandlers = {
  onStatus?: (status: EDelegationStatus, message: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
};

/** Consume the backend delegation SSE stream (credentials included). */
export async function consumeDelegationStream(
  streamUrl: string,
  handlers: DelegationStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(streamUrl, { credentials: "include", signal });
  if (!res.ok || !res.body) {
    throw new Error(`Delegation stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const payload = dataLine.slice(6).trim();
        if (payload === "[DONE]") {
          handlers.onDone?.();
          return;
        }
        const ev = parseDelegationEvent(payload);
        if (ev) handlers.onStatus?.(ev.status, ev.message);
        if (ev && isTerminalDelegationStatus(ev.status)) {
          handlers.onDone?.();
          return;
        }
      }
    }
    handlers.onDone?.();
  } catch (err) {
    if (signal?.aborted) return;
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
  } finally {
    reader.releaseLock();
  }
}
