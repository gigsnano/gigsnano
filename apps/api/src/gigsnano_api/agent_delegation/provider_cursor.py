"""Real Cursor Cloud Agents provider.

Cursor does not expose third-party OAuth for GigsNano. Users connect with a
personal API key from Cursor Dashboard → Integrations → API Keys. Delegation
calls the Cloud Agents API with Basic auth (`api_key:`)."""

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
from gigsnano_api.models import EDelegationStatus, EDelegationUnit

_RUN_STATUS_MAP = {
    "CREATING": EDelegationStatus.QUEUED,
    "RUNNING": EDelegationStatus.RUNNING,
    "FINISHED": EDelegationStatus.COMPLETED,
    "FAILED": EDelegationStatus.FAILED,
    "ERROR": EDelegationStatus.FAILED,
    "CANCELLED": EDelegationStatus.CANCELLED,
}


def _auth(token: str | None) -> httpx.BasicAuth | None:
    if not token:
        return None
    return httpx.BasicAuth(token, "")


def _parse_external_ref(external_ref: str | None) -> tuple[str | None, str | None]:
    if not external_ref:
        return None, None
    try:
        body = json.loads(external_ref)
        return body.get("agent_id"), body.get("run_id")
    except json.JSONDecodeError:
        return external_ref, None


async def verify_cursor_api_key(api_key: str) -> dict[str, Any]:
    """Validate the key against GET /v1/me; returns the profile payload."""
    async with httpx.AsyncClient(auth=_auth(api_key.strip()), timeout=20.0) as http:
        res = await http.get(f"{settings.cursor_api_base.rstrip('/')}/v1/me")
        res.raise_for_status()
    return res.json()


class RealCursorProvider:
    def __init__(self) -> None:
        self.api_base = settings.cursor_api_base.rstrip("/")

    async def start(self, token: str | None, ctx: DelegationContext) -> StartResult:
        api_key = token or ctx.access_token
        prompt_text = ctx.custom_prompt or f"{ctx.title}\n\n{ctx.description}"
        payload: dict = {
            "prompt": {"text": prompt_text},
            "autoCreatePR": ctx.unit_type == EDelegationUnit.WORK_ITEM,
        }
        if ctx.repo_full_name:
            repo_url = ctx.repo_full_name
            if not repo_url.startswith("http"):
                repo_url = f"https://github.com/{ctx.repo_full_name}"
            payload["repos"] = [{"url": repo_url, "startingRef": "main"}]

        async with httpx.AsyncClient(auth=_auth(api_key), timeout=60.0) as http:
            res = await http.post(
                f"{self.api_base}/v1/agents",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            res.raise_for_status()
        body = res.json()
        agent = body.get("agent") or {}
        run = body.get("run") or {}
        external_ref = json.dumps(
            {"agent_id": agent.get("id"), "run_id": run.get("id")},
        )
        return StartResult(external_ref=external_ref)

    async def follow(
        self, ctx: DelegationContext, external_ref: str | None
    ) -> AsyncIterator[DelegationEvent]:
        agent_id, run_id = _parse_external_ref(external_ref)
        if not agent_id or not run_id:
            yield DelegationEvent(EDelegationStatus.FAILED, "Missing agent run reference")
            return

        async with httpx.AsyncClient(auth=_auth(ctx.access_token), timeout=30.0) as http:
            for _ in range(120):
                res = await http.get(f"{self.api_base}/v1/agents/{agent_id}/runs/{run_id}")
                res.raise_for_status()
                body = res.json()
                raw_status = body.get("status", "RUNNING")
                status = _RUN_STATUS_MAP.get(raw_status, EDelegationStatus.RUNNING)
                result = None
                if status == EDelegationStatus.COMPLETED and ctx.unit_type == EDelegationUnit.WORK_ITEM:
                    git = body.get("git") or {}
                    branches = git.get("branches") or []
                    branch_info = branches[0] if branches else {}
                    branch = branch_info.get("branch", "agent/cursor")
                    repo = branch_info.get("repoUrl", "")
                    pr_url = body.get("prUrl") or body.get("pr_url") or ""
                    if not pr_url and repo and branch:
                        pr_url = f"https://github.com/{repo}/pull/new/{branch}"
                    result = {"kind": "pr", "pr_url": pr_url, "branch": branch}
                elif status == EDelegationStatus.COMPLETED:
                    text = body.get("text") or "Draft ready for review."
                    result = {"kind": "document", "document_id": "", "summary": text}

                yield DelegationEvent(status, raw_status, result=result)
                if status in (
                    EDelegationStatus.COMPLETED,
                    EDelegationStatus.FAILED,
                    EDelegationStatus.CANCELLED,
                ):
                    return
                await asyncio.sleep(5)
