from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent_delegation.schemas import (
    ConnectionOut,
    CreateDelegationPayload,
    DelegationOut,
)
from gigsnano_api.models import (
    AgentConnection,
    Delegation,
    EAgentProvider,
    EDelegationStatus,
)


async def get_user_connection(
    db: AsyncSession, user_id: str, provider: EAgentProvider
) -> AgentConnection | None:
    return (
        await db.execute(
            select(AgentConnection).where(
                AgentConnection.user_id == user_id,
                AgentConnection.provider == provider,
            )
        )
    ).scalar_one_or_none()


async def list_user_connections(db: AsyncSession, user_id: str) -> list[AgentConnection]:
    rows = (
        await db.execute(
            select(AgentConnection)
            .where(AgentConnection.user_id == user_id)
            .order_by(AgentConnection.created_at.asc())
        )
    ).scalars()
    return list(rows.all())


def serialize_connection(conn: AgentConnection) -> ConnectionOut:
    return ConnectionOut(
        id=conn.id,
        user_id=conn.user_id,
        provider=conn.provider,
        account_label=conn.account_label,
        status=conn.status,
        connected_at=conn.created_at,
    )


async def create_delegation(
    db: AsyncSession,
    *,
    story_id: str,
    project_id: str,
    workspace_id: str,
    delegated_by: str,
    conn: AgentConnection,
    payload: CreateDelegationPayload,
) -> Delegation:
    row = Delegation(
        unit_type=payload.unit_type,
        unit_id=story_id,
        project_id=project_id,
        workspace_id=workspace_id,
        provider=conn.provider,
        connection_id=conn.id,
        delegated_by=delegated_by,
        status=EDelegationStatus.QUEUED,
        custom_prompt=(payload.custom_prompt or "").strip() or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def load_delegation(db: AsyncSession, delegation_id: str) -> Delegation | None:
    return await db.get(Delegation, delegation_id)


def serialize_delegation(row: Delegation, workspace_slug: str) -> DelegationOut:
    return DelegationOut(
        id=row.id,
        unit_type=row.unit_type,
        unit_id=row.unit_id,
        workspace_slug=workspace_slug,
        project_id=row.project_id,
        provider=row.provider,
        connection_id=row.connection_id,
        delegated_by=row.delegated_by,
        status=row.status,
        custom_prompt=row.custom_prompt,
        result=row.result,
        error=row.error,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
