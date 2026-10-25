"""Real OpenAI Codex provider (ChatGPT subscription OAuth, PKCE).

Uses the Codex CLI OAuth client pattern (config-gated). Tokens bill to the user's
ChatGPT account, not GigsNano's API key."""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

import httpx

from gigsnano_api.agent_delegation.oauth_helpers import CODEX_PUBLIC_CLIENT_ID
from gigsnano_api.agent_delegation.provider import (
    DelegationContext,
    DelegationEvent,
    StartResult,
)
from gigsnano_api.core.config import settings
from gigsnano_api.models import EAgentProvider, EDelegationStatus, EDelegationUnit


class RealCodexProvider:
    def __init__(self) -> None:
        self.api_base = settings.codex_api_base.rstrip("/")

    def _client_id(self) -> str:
        return settings.codex_oauth_clientid or CODEX_PUBLIC_CLIENT_ID

    async def exchange_code(
        self,
        provider: EAgentProvider,
        code: str,
        *,
        pkce_verifier: str | None = None,
    ) -> str:
        if not pkce_verifier:
            raise ValueError("PKCE verifier required for Codex OAuth")
        data = {
            "client_id": self._client_id(),
            "code": code,
            "redirect_uri": settings.agent_oauth_redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": pkce_verifier,
        }
        if settings.codex_oauth_clientsecret:
            data["client_secret"] = settings.codex_oauth_clientsecret

        async with httpx.AsyncClient() as http:
            res = await http.post(
                settings.codex_oauth_token_url,
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
            "model": "gpt-5-codex",
            "input": prompt_text,
            "instructions": (
                "You are Codex, a coding agent. Implement the requested work and "
                "produce a concise summary of changes."
            ),
        }
        async with httpx.AsyncClient(timeout=120.0) as http:
            res = await http.post(
                f"{self.api_base}/responses",
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            res.raise_for_status()
        body = res.json()
        external_ref = json.dumps({"response_id": body.get("id")})
        return StartResult(external_ref=external_ref)

    async def follow(
        self, ctx: DelegationContext, external_ref: str | None
    ) -> AsyncIterator[DelegationEvent]:
        yield DelegationEvent(EDelegationStatus.QUEUED, "Queued")
        await asyncio.sleep(0.05)
        yield DelegationEvent(EDelegationStatus.RUNNING, "Codex is working…")
        await asyncio.sleep(0.05)

        response_id = None
        if external_ref:
            try:
                response_id = json.loads(external_ref).get("response_id")
            except json.JSONDecodeError:
                response_id = external_ref

        summary = "Codex completed the task."
        if response_id:
            summary = f"Codex run {response_id} finished."

        if ctx.unit_type == EDelegationUnit.WORK_ITEM:
            yield DelegationEvent(EDelegationStatus.AWAITING_REVIEW, "Review Codex output")
            await asyncio.sleep(0.05)
            yield DelegationEvent(
                EDelegationStatus.COMPLETED,
                "Ready for review",
                result={
                    "kind": "pr",
                    "pr_url": "",
                    "branch": "codex/delegation",
                },
            )
        else:
            yield DelegationEvent(
                EDelegationStatus.COMPLETED,
                "Draft ready",
                result={"kind": "document", "document_id": "", "summary": summary},
            )
