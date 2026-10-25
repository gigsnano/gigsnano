"""view ownership, share_scope, and per-user favourites (GIN-139)

Revision ID: c8e1f2a3b4d5
Revises: a4c6e8b0d2f1
Create Date: 2026-07-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c8e1f2a3b4d5"
down_revision = "a4c6e8b0d2f1"
branch_labels = None
depends_on = None

# create_type=False (postgresql.ENUM only — generic sa.Enum ignores it) so the
# explicit .create(checkfirst=True) calls below own the type lifecycle;
# otherwise create_table/add_column re-emit CREATE TYPE → "type already exists".
_share_scope = postgresql.ENUM(
    "private", "project", name="view_share_scope", create_type=False
)
_view_kind = postgresql.ENUM(
    "project", "workspace", name="view_kind", create_type=False
)


def upgrade() -> None:
    _share_scope.create(op.get_bind(), checkfirst=True)
    _view_kind.create(op.get_bind(), checkfirst=True)

    for table in ("project_views", "workspace_views"):
        op.add_column(
            table,
            sa.Column("owner_id", sa.String(length=36), nullable=True),
        )
        op.add_column(
            table,
            sa.Column(
                "share_scope",
                _share_scope,
                nullable=False,
                server_default="private",
            ),
        )

    # Backfill owner_id from project lead → admin member → any member → workspace owner/admin.
    op.execute(
        """
        UPDATE project_views AS pv
           SET owner_id = COALESCE(
                 (SELECT p.lead_id
                    FROM projects AS p
                   WHERE p.id = pv.project_id
                     AND p.lead_id IS NOT NULL),
                 (SELECT pm.user_id
                    FROM project_members AS pm
                   WHERE pm.project_id = pv.project_id
                     AND pm.status = 'active'
                     AND pm.role = 'admin'
                   ORDER BY pm.created_at
                   LIMIT 1),
                 (SELECT pm.user_id
                    FROM project_members AS pm
                   WHERE pm.project_id = pv.project_id
                     AND pm.status = 'active'
                   ORDER BY pm.created_at
                   LIMIT 1),
                 (SELECT wm.user_id
                    FROM workspace_members AS wm
                    JOIN projects AS p ON p.workspace_id = wm.workspace_id
                   WHERE p.id = pv.project_id
                     AND wm.status = 'active'
                     AND wm.role IN ('owner', 'admin')
                   ORDER BY CASE wm.role WHEN 'owner' THEN 0 ELSE 1 END, wm.created_at
                   LIMIT 1),
                 (SELECT wm.user_id
                    FROM workspace_members AS wm
                    JOIN projects AS p ON p.workspace_id = wm.workspace_id
                   WHERE p.id = pv.project_id
                     AND wm.status = 'active'
                   ORDER BY wm.created_at
                   LIMIT 1)
               )
         WHERE pv.owner_id IS NULL
        """
    )

    # Backfill owner_id from workspace owner → admin → any active member.
    op.execute(
        """
        UPDATE workspace_views AS wv
           SET owner_id = COALESCE(
                 (SELECT wm.user_id
                    FROM workspace_members AS wm
                   WHERE wm.workspace_id = wv.workspace_id
                     AND wm.status = 'active'
                     AND wm.role = 'owner'
                   ORDER BY wm.created_at
                   LIMIT 1),
                 (SELECT wm.user_id
                    FROM workspace_members AS wm
                   WHERE wm.workspace_id = wv.workspace_id
                     AND wm.status = 'active'
                     AND wm.role = 'admin'
                   ORDER BY wm.created_at
                   LIMIT 1),
                 (SELECT wm.user_id
                    FROM workspace_members AS wm
                   WHERE wm.workspace_id = wv.workspace_id
                     AND wm.status = 'active'
                   ORDER BY wm.created_at
                   LIMIT 1)
               )
         WHERE wv.owner_id IS NULL
        """
    )

    for table in ("project_views", "workspace_views"):
        op.alter_column(table, "owner_id", nullable=False)
        op.create_index(f"ix_{table}_owner_id", table, ["owner_id"], unique=False)
        op.create_foreign_key(
            f"fk_{table}_owner_id_users",
            table,
            "users",
            ["owner_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.create_table(
        "view_favorites",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("view_id", sa.String(length=36), nullable=False),
        sa.Column("view_kind", _view_kind, nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "view_id", "view_kind", name="uq_view_favorite"
        ),
    )
    op.create_index(
        "ix_view_favorites_user_id", "view_favorites", ["user_id"], unique=False
    )
    op.create_index(
        "ix_view_favorites_view_id", "view_favorites", ["view_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_view_favorites_view_id", table_name="view_favorites")
    op.drop_index("ix_view_favorites_user_id", table_name="view_favorites")
    op.drop_table("view_favorites")

    for table in ("workspace_views", "project_views"):
        op.drop_constraint(f"fk_{table}_owner_id_users", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_owner_id", table_name=table)
        op.drop_column(table, "share_scope")
        op.drop_column(table, "owner_id")

    _view_kind.drop(op.get_bind(), checkfirst=True)
    _share_scope.drop(op.get_bind(), checkfirst=True)
