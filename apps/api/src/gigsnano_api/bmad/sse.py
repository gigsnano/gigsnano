"""AI SDK UI message stream encoding — the ONLY module that knows the wire
format consumed by @assistant-ui/react-ai-sdk's useChatRuntime. If the
frontend's `ai` package version expects different event names, change them here."""

import json

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "x-vercel-ai-ui-message-stream": "v1",
}
SSE_MEDIA_TYPE = "text/event-stream"
SSE_DONE = "data: [DONE]\n\n"


def sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
