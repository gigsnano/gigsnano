"""GIN-318/319: add project OWNER role + backfill leads as project owners.

Deterministic + idempotent: every project's lead becomes a project OWNER (upgrade
an existing membership, or insert one). Projects with no lead are left untouched —
they surface as "ownerless" in the dry-run for manual resolution rather than being
guessed. Workspace Owner/Admin retain governance access regardless.

Revision ID: d4b1e9c66a72
Revises: c3a8e1f42b90
Create Date: 2026-07-21
"""

from alembic import op

revision = "d4b1e9c66a72"
down_revision = "c3a8e1f42b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot be used in the same transaction that defines it, so commit
    # the enum change first via an autocommit block, then backfill in the migration
    # transaction where 'owner' is now a valid value.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE project_role ADD VALUE IF NOT EXISTS 'owner'")

    # Upgrade an existing lead membership to owner.
    op.execute(
        """
        UPDATE project_members pm
        SET role = 'owner'
        FROM projects p
        WHERE pm.project_id = p.id
          AND pm.user_id = p.lead_id
          AND pm.role <> 'owner'
        """
    )
    # Insert an owner membership for leads who aren't members yet.
    op.execute(
        """
        INSERT INTO project_members (id, project_id, user_id, role, status, created_at, updated_at)
        SELECT gen_random_uuid()::text, p.id, p.lead_id, 'owner', 'active', now(), now()
        FROM projects p
        WHERE p.lead_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = p.lead_id
          )
        """
    )


def downgrade() -> None:
    # Demote owners back to admin (pre-owner semantics). The 'owner' enum label is
    # left in place — removing a value from a PG enum requires recreating the type,
    # and an unused label is harmless.
    op.execute("UPDATE project_members SET role = 'admin' WHERE role = 'owner'")
