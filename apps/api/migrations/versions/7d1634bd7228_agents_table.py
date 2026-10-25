"""agents table

Revision ID: 7d1634bd7228
Revises: e4d7c9a15b2f
Create Date: 2026-07-30 19:04:11.649103

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7d1634bd7228'
down_revision: Union[str, Sequence[str], None] = 'e4d7c9a15b2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('agents',
    sa.Column('workspace_id', sa.String(length=36), nullable=False),
    sa.Column('project_id', sa.String(length=36), nullable=True),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('persona', sa.String(length=80), nullable=False),
    sa.Column('domain', sa.String(length=40), nullable=False),
    sa.Column('avatar_color', sa.String(length=7), nullable=False),
    sa.Column('voice_id', sa.String(length=64), nullable=False),
    sa.Column('instructions', sa.Text(), nullable=False),
    sa.Column('bundles', sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('is_builtin', sa.Boolean(), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('workspace_id', 'name', name='uq_agent_ws_name')
    )
    op.create_index(op.f('ix_agents_project_id'), 'agents', ['project_id'], unique=False)
    op.create_index(op.f('ix_agents_workspace_id'), 'agents', ['workspace_id'], unique=False)

    from gigsnano_api.features.agents.router import BMAD_AGENTS

    # Colours previously hardcoded in features/experts/registry.py — moved here so
    # the table is the single roster. Any id without an entry falls back to grey.
    colors = {
        "agent_analyst": "#3b6ea5", "agent_pm": "#7c5cbf", "agent_architect": "#c2792e",
        "agent_ux": "#c2559b", "agent_sm": "#3f9a6a", "agent_dev": "#2f8a8a",
        "agent_qa": "#a24b4b",
    }
    agents = sa.table(
        "agents",
        sa.column("id", sa.String), sa.column("workspace_id", sa.String),
        sa.column("name", sa.String), sa.column("persona", sa.String),
        sa.column("domain", sa.String), sa.column("avatar_color", sa.String),
        sa.column("voice_id", sa.String),
        sa.column("instructions", sa.Text), sa.column("bundles", sa.JSON),
        sa.column("is_builtin", sa.Boolean), sa.column("enabled", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    conn = op.get_bind()
    now = datetime.now(UTC)
    for ws_id, in conn.execute(sa.text("SELECT id FROM workspaces")):
        op.bulk_insert(agents, [
            {
                # ponytail: f"{ws_id}-{a['id']}" (~50 chars) overflows the
                # String(36) PK inherited from TimestampedBase. uuid5 keeps the
                # same property the plain concat was going for — deterministic
                # per (workspace, builtin id), so a re-run against an
                # already-seeded DB hits a PK conflict instead of duplicating.
                "id": str(uuid.uuid5(uuid.NAMESPACE_OID, f"{ws_id}:{a['id']}")),
                "workspace_id": ws_id, "name": a["name"],
                "persona": a["persona"], "domain": "software",
                "avatar_color": colors.get(a["id"], "#6b7280"), "voice_id": "",
                "instructions": (
                    f"You are {a['name']} ({a['persona']}), a {a['phase']} specialist. "
                    f"{a['description']} Speak in the first person, concisely, and add "
                    "genuinely new perspective rather than repeating others."
                ),
                "bundles": ["work_items", "project_health", "docs_repo"],
                "is_builtin": True, "enabled": True,
                "created_at": now, "updated_at": now,
            }
            for a in BMAD_AGENTS
        ])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('agents')
