"""story detail sub-resources: links, relations, comments, activities, subscriptions

Revision ID: c7f1a2b3d4e5
Revises: d65843d55a14
Create Date: 2026-07-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7f1a2b3d4e5"
down_revision: Union[str, Sequence[str], None] = "d65843d55a14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "story_links",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("url", sa.String(length=2000), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_by_name", sa.String(length=120), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_story_links_story_id"), "story_links", ["story_id"], unique=False)

    op.create_table(
        "story_relations",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("related_story_id", sa.String(length=36), nullable=False),
        sa.Column(
            "relation_type",
            sa.Enum("relates_to", "blocking", "blocked_by", "duplicate", name="story_relation_type"),
            nullable=False,
        ),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["related_story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("story_id", "related_story_id", "relation_type"),
    )
    op.create_index(
        op.f("ix_story_relations_story_id"), "story_relations", ["story_id"], unique=False
    )
    op.create_index(
        op.f("ix_story_relations_related_story_id"),
        "story_relations",
        ["related_story_id"],
        unique=False,
    )

    op.create_table(
        "story_comments",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=True),
        sa.Column("author_name", sa.String(length=120), nullable=False),
        sa.Column("author_avatar_url", sa.String(length=500), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_story_comments_story_id"), "story_comments", ["story_id"], unique=False
    )

    op.create_table(
        "story_activities",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("property", "comment", "transition", name="story_activity_kind"),
            nullable=False,
        ),
        sa.Column(
            "field",
            sa.Enum(
                "created", "title", "description", "status", "priority", "assignee",
                "start_date", "target_date", "label", "parent", "cycle", "module",
                "link", "attachment", "relation",
                name="story_activity_field",
            ),
            nullable=True,
        ),
        sa.Column("actor_id", sa.String(length=36), nullable=True),
        sa.Column("actor_name", sa.String(length=120), nullable=False),
        sa.Column("summary", sa.String(length=300), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_story_activities_story_id"), "story_activities", ["story_id"], unique=False
    )

    op.create_table(
        "story_subscriptions",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("story_id", "user_id"),
    )
    op.create_index(
        op.f("ix_story_subscriptions_story_id"), "story_subscriptions", ["story_id"], unique=False
    )
    op.create_index(
        op.f("ix_story_subscriptions_user_id"), "story_subscriptions", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_story_subscriptions_user_id"), table_name="story_subscriptions")
    op.drop_index(op.f("ix_story_subscriptions_story_id"), table_name="story_subscriptions")
    op.drop_table("story_subscriptions")
    op.drop_index(op.f("ix_story_activities_story_id"), table_name="story_activities")
    op.drop_table("story_activities")
    op.drop_index(op.f("ix_story_comments_story_id"), table_name="story_comments")
    op.drop_table("story_comments")
    op.drop_index(op.f("ix_story_relations_related_story_id"), table_name="story_relations")
    op.drop_index(op.f("ix_story_relations_story_id"), table_name="story_relations")
    op.drop_table("story_relations")
    op.drop_index(op.f("ix_story_links_story_id"), table_name="story_links")
    op.drop_table("story_links")
    # Drop the native PG ENUM types the tables implicitly created.
    op.execute("DROP TYPE IF EXISTS story_relation_type")
    op.execute("DROP TYPE IF EXISTS story_activity_kind")
    op.execute("DROP TYPE IF EXISTS story_activity_field")
