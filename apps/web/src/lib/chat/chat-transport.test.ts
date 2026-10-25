import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { buildGigsMessageBody, errorStreamResponse, messageForSendError } from "./chat-transport";

describe("buildGigsMessageBody", () => {
  const messages: UIMessage[] = [
    {
      id: "1",
      role: "user",
      parts: [{ type: "text", text: "Review the requirements" }],
    },
  ];

  it("includes agent, document ids, and inline attachments", () => {
    expect(
      buildGigsMessageBody(messages, {
        agent_id: "agent_analyst",
        document_ids: ["doc_1"],
        attachments: [
          {
            title: "Requirements",
            file_name: "requirements.md",
            mime_type: "text/markdown",
            content: "# Must support uploads",
          },
        ],
      }),
    ).toEqual({
      content: "Review the requirements",
      agent_id: "agent_analyst",
      document_ids: ["doc_1"],
      attachments: [
        {
          title: "Requirements",
          file_name: "requirements.md",
          mime_type: "text/markdown",
          content: "# Must support uploads",
        },
      ],
    });
  });
});

describe("messageForSendError", () => {
  it("maps known statuses to friendly copy and falls back to the backend detail", () => {
    expect(messageForSendError(409, "Session is completed")).toMatch(/finalized/i);
    expect(messageForSendError(404)).toMatch(/no longer exists/i);
    expect(messageForSendError(503)).toMatch(/temporarily unavailable/i);
    expect(messageForSendError(500)).toMatch(/temporarily unavailable/i);
    expect(messageForSendError(422, "Bad field")).toBe("Bad field");
    expect(messageForSendError(422, "  ")).toMatch(/couldn't send/i);
    expect(messageForSendError(422, null)).toMatch(/couldn't send/i);
  });
});

describe("errorStreamResponse", () => {
  it("emits a full text-message lifecycle + [DONE] with the stream header", async () => {
    const res = errorStreamResponse("boom");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const body = await res.text();
    // start + text-start/delta/end + finish so the SDK opens AND closes the turn.
    expect(body).toContain(`data: ${JSON.stringify({ type: "start" })}`);
    expect(body).toContain(
      `data: ${JSON.stringify({ type: "text-delta", id: "gn-send-error", delta: "boom" })}`,
    );
    expect(body).toContain(`data: ${JSON.stringify({ type: "finish" })}`);
    expect(body.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });
});
