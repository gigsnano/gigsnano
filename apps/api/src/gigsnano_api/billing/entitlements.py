"""Feature entitlements + plan matrix (GIN-234). One entitlement key per capability
mapped to a minimum plan tier (+ per-plan monthly quota for metered ones), consumed
by a single `require_entitlement` gate that reads the workspace's subscription. No
bespoke per-feature gating — re-tiering a capability is editing this dict.

ponytail: the matrix is a constant, not admin-configurable. Promote to a DB table
only when an admin needs to tune per-workspace limits."""

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.core.db import get_db
from gigsnano_api.models.billing import EPlanTier
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

_RANK = {EPlanTier.FREE: 0, EPlanTier.PRO: 1, EPlanTier.BUSINESS: 2}

# key -> (min_tier, {tier: monthly_quota})   quota None = unlimited; empty dict = not metered.
ENTITLEMENTS: dict[str, tuple[EPlanTier, dict[EPlanTier, int | None]]] = {
    "agent_runs":       (EPlanTier.FREE, {EPlanTier.FREE: 20, EPlanTier.PRO: 500, EPlanTier.BUSINESS: None}),
    "task_router":      (EPlanTier.BUSINESS, {}),   # auto-route/coordinate is Business
    "marketplace":      (EPlanTier.PRO, {}),
    "ai_roadmap":       (EPlanTier.PRO, {}),
    "smart_intake":     (EPlanTier.FREE, {}),
    "workflows":        (EPlanTier.PRO, {}),
    "automations":      (EPlanTier.PRO, {EPlanTier.PRO: 100, EPlanTier.BUSINESS: None}),
    "templates":        (EPlanTier.FREE, {}),
    "artifact_publish": (EPlanTier.PRO, {}),
    "teamspaces":       (EPlanTier.PRO, {}),
}

# Per-action overage price (USD cents) once a metered quota is exceeded.
OVERAGE_CENTS = {"agent_runs": 10, "automations": 1}


def check_entitlement(tier: EPlanTier, key: str) -> bool:
    """Pure min-plan gate. Unknown key = allowed (a capability not yet catalogued)."""
    entry = ENTITLEMENTS.get(key)
    if entry is None:
        return True
    return _RANK[tier] >= _RANK[entry[0]]


def quota_for(tier: EPlanTier, key: str) -> int | None:
    """Monthly quota for a metered key at a tier; None = unlimited; -1 = not metered."""
    entry = ENTITLEMENTS.get(key)
    if entry is None or not entry[1]:
        return -1
    return entry[1].get(tier)


def require_entitlement(key: str):
    """Dependency: 402 unless the workspace's plan includes `key`. Composes with
    get_workspace_context (FastAPI dedups the sub-dependency)."""
    async def dep(
        ctx: WorkspaceContext = Depends(get_workspace_context),
        db: AsyncSession = Depends(get_db),
    ) -> WorkspaceContext:
        sub = await get_or_create_subscription(db, ctx.workspace.id)
        if not check_entitlement(sub.tier, key):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                f"'{key}' isn't included in your plan — upgrade to unlock.",
            )
        return ctx
    return dep
