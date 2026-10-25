"""story_drafts table (GIN-16 work-item drafts)"""
import sqlalchemy as sa
from alembic import op

revision = "6212f1037f52"
down_revision = "262b3805962c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_drafts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), server_default="", nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_story_drafts_workspace_id"), "story_drafts", ["workspace_id"])
    op.create_index(op.f("ix_story_drafts_project_id"), "story_drafts", ["project_id"])
    op.create_index(op.f("ix_story_drafts_created_by_id"), "story_drafts", ["created_by_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_story_drafts_created_by_id"), table_name="story_drafts")
    op.drop_index(op.f("ix_story_drafts_project_id"), table_name="story_drafts")
    op.drop_index(op.f("ix_story_drafts_workspace_id"), table_name="story_drafts")
    op.drop_table("story_drafts")
