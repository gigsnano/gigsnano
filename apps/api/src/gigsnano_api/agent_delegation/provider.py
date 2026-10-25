"""Coding-agent delegation provider seam. FakeAgentProvider (keyless dev/tests)
↔ real per-provider implementations when the user has a real stored token."""

import asyncio
from dataclasses import dataclass
from typing import AsyncIterator, Protocol

from fastapi import Request

from gigsnano_api.core.config import settings
from gigsnano_api.models import EAgentProvider, EDelegationStatus, EDelegationUnit

FAKE_AGENT_TOKEN = "fake-agent-token"  # nosec B105 - keyless-dev placeholder, never a real credential


@dataclass
class DelegationContext:
    unit_type: EDelegationUnit
    title: str
    description: str
    repo_full_name: str | None
    custom_prompt: str | None
    access_token: str | None = None


@dataclass
class DelegationEvent:
    status: EDelegationStatus
    message: str
    result: dict | None = None


@dataclass
class StartResult:
    external_ref: str | None


class AgentProvider(Protocol):
    async def start(self, token: str | None, ctx: DelegationContext) -> StartResult: ...

    def follow(
        self, ctx: DelegationContext, external_ref: str | None
    ) -> AsyncIterator[DelegationEvent]: ...


class FakeAgentProvider:
    """Keyless dev/tests: no network. Simulates queued→running→review→completed."""

    async def start(self, token: str | None, ctx: DelegationContext) -> StartResult:
        return StartResult(external_ref=None)

    async def follow(
        self, ctx: DelegationContext, external_ref: str | None
    ) -> AsyncIterator[DelegationEvent]:
        yield DelegationEvent(EDelegationStatus.QUEUED, "Queued")
        await asyncio.sleep(0.05)
        yield DelegationEvent(EDelegationStatus.RUNNING, "Created a branch")
        await asyncio.sleep(0.05)
        if ctx.unit_type == EDelegationUnit.WORK_ITEM:
            yield DelegationEvent(EDelegationStatus.AWAITING_REVIEW, "Opened a pull request")
            await asyncio.sleep(0.05)
            yield DelegationEvent(
                EDelegationStatus.COMPLETED,
                "Ready for review",
                result={
                    "kind": "pr",
                    "pr_url": "https://github.com/example/repo/pull/1",
                    "branch": "agent/fake",
                },
            )
        else:
            yield DelegationEvent(
                EDelegationStatus.COMPLETED,
                "Draft ready",
                result={"kind": "document", "document_id": "", "summary": "Draft ready for review."},
            )


def _has_real_token(access_token: str | None) -> bool:
    return bool(access_token and access_token != FAKE_AGENT_TOKEN)


def resolve_agent_provider(
    provider: EAgentProvider,
    *,
    access_token: str | None = None,
    for_oauth_exchange: bool = False,
) -> AgentProvider:
    """Pick real vs fake. OAuth exchange uses server config; dispatch uses stored token."""
    if for_oauth_exchange:
        if provider == EAgentProvider.CODEX and (
            settings.codex_oauth_clientid or settings.codex_use_public_client
        ):
            from gigsnano_api.agent_delegation.provider_codex import RealCodexProvider

            return RealCodexProvider()
        if provider == EAgentProvider.CLAUDE_CODE and (
            settings.claude_code_oauth_clientid and settings.claude_code_oauth_clientsecret
        ):
            from gigsnano_api.agent_delegation.provider_claude_code import RealClaudeCodeProvider

            return RealClaudeCodeProvider()
        return FakeAgentProvider()

    if not _has_real_token(access_token):
        return FakeAgentProvider()

    if provider == EAgentProvider.CURSOR:
        from gigsnano_api.agent_delegation.provider_cursor import RealCursorProvider

        return RealCursorProvider()
    if provider == EAgentProvider.CODEX:
        from gigsnano_api.agent_delegation.provider_codex import RealCodexProvider

        return RealCodexProvider()
    if provider == EAgentProvider.CLAUDE_CODE:
        from gigsnano_api.agent_delegation.provider_claude_code import RealClaudeCodeProvider

        return RealClaudeCodeProvider()
    return FakeAgentProvider()


def build_default_agent_provider() -> AgentProvider:
    return FakeAgentProvider()


def get_agent_provider(request: Request) -> AgentProvider:
    return request.app.state.agent_provider
