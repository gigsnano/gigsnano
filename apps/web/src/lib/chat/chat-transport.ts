import { DefaultChatTransport, type UIMessage } from "ai";

import type { IGigsChatSendExtras, IGigsToolConfirmDecision } from "@/types/ai/gigs-ai";
import { refreshSession } from "@/services/auth/refresh";
import { APIError } from "@/services/api-error";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export type PaymentRequiredHandler = () => void;

/**
 * `fetch` wrapper that recovers from an expired 15-min access cookie: on a 401
 * it mints a fresh cookie via the shared single-flight refresh, then replays the
 * request once. On 402 (insufficient wallet balance) invokes `onPaymentRequired`.
 */
export function createBillingAwareFetch(onPaymentRequired?: PaymentRequiredHandler): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, init);
    if (res.status === 402) {
      onPaymentRequired?.();
      throw new APIError(402, "Insufficient wallet balance — top up to continue.");
    }
    if (res.status !== 401) return res;
    const refreshed = await refreshSession(API_BASE_URL);
    const retry = refreshed ? await fetch(input, init) : res;
    if (retry.status === 402) {
      onPaymentRequired?.();
      throw new APIError(402, "Insufficient wallet balance — top up to continue.");
    }
    return retry;
  };
}

const refreshingFetch: typeof fetch = createBillingAwareFetch();

/** Raw event `type`s the GigsAI agent runner emits inline in the text stream
 * (`gigsnano-api` `_stream_agent_turn`) that are NOT part of the AI SDK's UI
 * message stream protocol. */
const RAW_TOOL_EVENT_TYPES = new Set(["tool_call", "tool_result", "tool_confirmation"]);

/**
 * Rewrites one SSE frame. The AI SDK's stream parser validates every chunk's
 * `type` against a strict schema and THROWS (aborting the whole stream) on an
 * unrecognized one — so the backend's raw `tool_call`/`tool_result`/
 * `tool_confirmation` frames can't reach it as-is. Repack them as a
 * `data-tool-event` chunk instead: `data-*` is the protocol's own escape
 * hatch, and `transient: true` routes it straight to `onData` without ever
 * touching message parts or schema validation. Everything else (text-delta,
 * finish, [DONE], …) passes through untouched.
 */
function rewriteToolEventFrame(frame: string): string {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return frame;
  const data = dataLine.slice(5).trim();
  if (data === "[DONE]") return frame;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return frame;
  }
  const type = parsed && typeof parsed === "object" ? (parsed as { type?: unknown }).type : undefined;
  if (typeof type !== "string" || !RAW_TOOL_EVENT_TYPES.has(type)) return frame;
  const event = parsed as { tool_use_id?: string };
  const chunk = { type: "data-tool-event", id: event.tool_use_id, data: parsed, transient: true };
  return `data: ${JSON.stringify(chunk)}`;
}

/** Transforms an SSE byte stream frame-by-frame through `rewriteToolEventFrame`. */
function rewriteToolEventStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          controller.enqueue(encoder.encode(`${rewriteToolEventFrame(frame)}\n\n`));
        }
      },
      flush(controller) {
        if (buffer.trim()) controller.enqueue(encoder.encode(`${rewriteToolEventFrame(buffer)}\n\n`));
      },
    }),
  );
}

/** A friendly, user-facing message for a failed send POST, by status (+ the
 * backend's `detail` when there's nothing better). Pure so it unit-tests. */
export function messageForSendError(status: number, detail?: string | null): string {
  if (status === 409) return "This step is already finalized — its chat is closed.";
  if (status === 404) return "This chat thread no longer exists — reopen the card.";
  if (status >= 500) return "The assistant is temporarily unavailable. Please try again in a moment.";
  return detail?.trim() || "Couldn't send your message. Please try again.";
}

/**
 * A one-shot AI-SDK UI-message-stream that renders `message` as a normal
 * assistant turn. A non-ok POST otherwise reaches the SDK as an unparseable JSON
 * body, leaving the message pending forever; this surfaces the failure as
 * visible text AND ends the turn. It reuses the exact frame lifecycle of a
 * successful turn (`start` → `text-start`/`text-delta`/`text-end` → `finish` →
 * `[DONE]`) — a bare `error` part doesn't close the message, so the spinner
 * wouldn't clear. The `x-vercel-ai-ui-message-stream` header makes the SDK parse it.
 */
export function errorStreamResponse(message: string): Response {
  const id = "gn-send-error";
  const body =
    `data: ${JSON.stringify({ type: "start" })}\n\n` +
    `data: ${JSON.stringify({ type: "text-start", id })}\n\n` +
    `data: ${JSON.stringify({ type: "text-delta", id, delta: message })}\n\n` +
    `data: ${JSON.stringify({ type: "text-end", id })}\n\n` +
    `data: ${JSON.stringify({ type: "finish" })}\n\n` +
    "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
  });
}

async function extractDetail(res: Response): Promise<string | null> {
  try {
    const parsed = JSON.parse(await res.clone().text());
    return parsed && typeof parsed.detail === "string" ? parsed.detail : null;
  } catch {
    return null;
  }
}

/** Wraps a `fetch` so its response is normalised for the AI SDK transport: a
 * successful streamed body is rewritten via `rewriteToolEventStream`; a failed
 * POST (409/5xx/…, after billing-aware 401/402 handling) is converted into an
 * `error` stream so the turn ends visibly instead of hanging on a spinner. */
function toolEventAwareFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const res = await base(input, init);
    if (!res.ok) return errorStreamResponse(messageForSendError(res.status, await extractDetail(res)));
    if (!res.body) return res;
    return new Response(rewriteToolEventStream(res.body), res);
  };
}

/** Reads `{decisions}` smuggled through `MessageRuntime.reload({ runConfig: {
 * custom: { confirmDecisions } } })` — the AI SDK's own extension point for
 * passing per-request metadata into a regenerate call (see `useMessageRuntime`
 * docs: `reload(config)` → `chat.regenerate({ metadata: config.runConfig })`
 * → `prepareSendMessagesRequest`'s `requestMetadata`). */
function extractConfirmDecisions(requestMetadata: unknown): IGigsToolConfirmDecision[] | undefined {
  if (!requestMetadata || typeof requestMetadata !== "object") return undefined;
  const custom = (requestMetadata as { custom?: unknown }).custom;
  if (!custom || typeof custom !== "object") return undefined;
  const decisions = (custom as { confirmDecisions?: unknown }).confirmDecisions;
  return Array.isArray(decisions) ? (decisions as IGigsToolConfirmDecision[]) : undefined;
}

function extractLastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return lastUser
    ? lastUser.parts
        .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("")
    : "";
}

/** Body shape for GigsAI message POST requests. */
export function buildGigsMessageBody(messages: UIMessage[], extras: IGigsChatSendExtras = {}) {
  return {
    content: extractLastUserText(messages),
    agent_id: extras.agent_id ?? null,
    document_ids: extras.document_ids ?? [],
    attachments: extras.attachments ?? [],
  };
}

/**
 * SSE transport for the BMAD story chat. The backend's message endpoint is NOT
 * the AI-SDK-default `{ messages }` contract — it wants only the latest user
 * turn as `{ content }` (it reconstructs full context server-side via
 * `gather_context`). It responds with an AI SDK UI-message-stream v1
 * (`text-delta` chunks, optional `data-session` chunks, `[DONE]`), which
 * `DefaultChatTransport`'s response parser consumes as-is.
 */
export function createStoryChatTransport(
  messagesUrl: string,
  onPaymentRequired?: PaymentRequiredHandler,
  confirmToolsUrl?: string,
) {
  const baseFetch = onPaymentRequired ? createBillingAwareFetch(onPaymentRequired) : refreshingFetch;
  return new DefaultChatTransport<UIMessage>({
    api: messagesUrl,
    credentials: "include",
    fetch: toolEventAwareFetch(baseFetch),
    prepareSendMessagesRequest: ({ messages, trigger, requestMetadata }) => {
      const decisions = confirmToolsUrl ? extractConfirmDecisions(requestMetadata) : undefined;
      if (trigger === "regenerate-message" && decisions && confirmToolsUrl) {
        return { api: confirmToolsUrl, body: { decisions } };
      }
      return { body: { content: extractLastUserText(messages) } };
    },
  });
}

/** GigsAI transport — sends agent selection, referenced docs, and inline attachments.
 * `confirmToolsUrl`, when provided, lets a paused `tool_confirmation` turn be
 * resumed via `MessageRuntime.reload()` (see `extractConfirmDecisions`). */
export function createGigsChatTransport(
  messagesUrl: string,
  getExtras: () => IGigsChatSendExtras,
  onPaymentRequired?: PaymentRequiredHandler,
  confirmToolsUrl?: string,
) {
  const baseFetch = onPaymentRequired ? createBillingAwareFetch(onPaymentRequired) : refreshingFetch;
  return new DefaultChatTransport<UIMessage>({
    api: messagesUrl,
    credentials: "include",
    fetch: toolEventAwareFetch(baseFetch),
    prepareSendMessagesRequest: ({ messages, trigger, requestMetadata }) => {
      const decisions = confirmToolsUrl ? extractConfirmDecisions(requestMetadata) : undefined;
      if (trigger === "regenerate-message" && decisions && confirmToolsUrl) {
        return { api: confirmToolsUrl, body: { decisions } };
      }
      return { body: buildGigsMessageBody(messages, getExtras()) };
    },
  });
}
