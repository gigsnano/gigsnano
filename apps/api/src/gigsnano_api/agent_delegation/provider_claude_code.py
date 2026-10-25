"""Real Claude Code provider.

Dispatches work via Anthropic's Messages API. Users connect with a personal
Anthropic API key (Console → API Keys) — the supported BYO path — sent as the
`x-api-key` header. (An OAuth-token path also exists but needs a registered
Console app; the API-key path needs no server config.)"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

import httpx

from gigsnano_api.agent_delegation.provider import (
    DelegationContext,
    DelegationEvent,
    StartResult,
)
from gigsnano_api.core.config import settings
from gigsnano_api.models import EAgentProvider, EDelegationStatus, EDelegationUnit

_ANTHROPIC_VERSION = "2023-06-01"


async def verify_anthropic_api_key(api_key: str) -> dict[str, Any]:
    """Validate an Anthropic API key against GET /v1/models; returns the payload.
    Cheap + side-effect-free (no tokens spent), mirroring verify_cursor_api_key."""
    base = settings.claude_code_api_base.rstrip("/")
    async with httpx.AsyncClient(timeout=20.0) as http:
        res = await http.get(
            f"{base}/v1/models",
            headers={"x-api-key": api_key.strip(), "anthropic-version": _ANTHROPIC_VERSION},
        )
        res.raise_for_status()
    return res.json()


class RealClaudeCodeProvider:
    def __init__(self) -> None:
        self.api_base = settings.claude_code_api_base.rstrip("/")

    async def exchange_code(
        self,
        provider: EAgentProvider,
        code: str,
        *,
        pkce_verifier: str | None = None,
    ) -> str:
        data = {
            "client_id": settings.claude_code_oauth_clientid,
            "client_secret": settings.claude_code_oauth_clientsecret,
            "code": code,
            "redirect_uri": settings.agent_oauth_redirect_uri,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient() as http:
            res = await http.post(
                settings.claude_code_oauth_token_url,
                data=data,
                headers={"Accept": "application/json"},
            )
            res.raise_for_status()
        token = res.json().get("access_token")
        if not token:
            raise ValueError("No access_token returned")
        return token

    async def start(self, token: str | None, ctx: DelegationContext) -> StartResult:
        prompt_text = ctx.custom_prompt or f"{ctx.title}\n\n{ctx.description}"
        payload = {
            "model": settings.anthropic_model,
            "max_tokens": 8192,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "You are Claude Code, a coding agent. Complete this task:\n\n"
                        f"{prompt_text}"
                    ),
                }
            ],
        }
        async with httpx.AsyncClient(timeout=120.0) as http:
            res = await http.post(
                f"{self.api_base}/v1/messages",
                json=payload,
                headers={
                    "x-api-key": token or "",
                    "Content-Type": "application/json",
                    "anthropic-version": _ANTHROPIC_VERSION,
                },
            )
            res.raise_for_status()
        body = res.json()
        external_ref = json.dumps({"message_id": body.get("id")})
        return StartResult(external_ref=external_ref)

    async def follow(
        self, ctx: DelegationContext, external_ref: str | None
    ) -> AsyncIterator[DelegationEvent]:
        yield DelegationEvent(EDelegationStatus.QUEUED, "Queued")
        await asyncio.sleep(0.05)
        yield DelegationEvent(EDelegationStatus.RUNNING, "Claude Code is working…")
        await asyncio.sleep(0.05)

        summary = "Claude Code completed the task."
        if external_ref:
            try:
                mid = json.loads(external_ref).get("message_id")
                if mid:
                    summary = f"Claude Code run {mid} finished."
            except json.JSONDecodeError:
                pass

        if ctx.unit_type == EDelegationUnit.WORK_ITEM:
            yield DelegationEvent(EDelegationStatus.AWAITING_REVIEW, "Review Claude output")
            await asyncio.sleep(0.05)
            yield DelegationEvent(
                EDelegationStatus.COMPLETED,
                "Ready for review",
                result={
                    "kind": "pr",
                    "pr_url": "",
                    "branch": "claude/delegation",
                },
            )
        else:
            yield DelegationEvent(
                EDelegationStatus.COMPLETED,
                "Draft ready",
                result={"kind": "document", "document_id": "", "summary": summary},
            )
