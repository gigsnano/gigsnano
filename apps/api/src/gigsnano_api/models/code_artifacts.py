"""Durable persistence for a project's derived code intelligence.

The graph/metrics/issues/er/changes a repo index produces used to live as JSON
files under `<workspace>/<project_id>/.graphify-index/`. On Azure that disk is
ephemeral (a redeploy wipes it, forcing a full re-index) and per-replica (only
the instance that ran the index can serve the files), so reads were neither
durable nor consistent under horizontal scaling — not enterprise-grade.

These rows are that data's home instead: one row per (project, kind), upserted
by the index job and read by every endpoint / agent tool. The heavy build still
writes its JSON into the index dir as scratch; `index_repo` then persists it
here. The raw git clone stays on disk — it's re-clonable from GitHub and isn't
what we serve.
"""

import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.core.db import utcnow
from gigsnano_api.models.base import TimestampedBase, _values


class ECodeArtifactKind(str, enum.Enum):
    GRAPH = "graph"
    METRICS = "metrics"
    ISSUES = "issues"
    ER = "er"
    CHANGES = "changes"


CODE_ARTIFACT_KIND_ENUM = Enum(ECodeArtifactKind, name="code_artifact_kind", values_callable=_values)

# JSONB on Postgres (queryable/indexable, the prod target); generic JSON under the
# SQLite test DB, which has no JSONB type. Same Python dict either way.
_JSON = JSON().with_variant(JSONB(), "postgresql")


class CodeArtifact(TimestampedBase):
    __tablename__ = "code_artifacts"
    __table_args__ = (UniqueConstraint("project_id", "kind", name="uq_code_artifact_project_kind"),)

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[ECodeArtifactKind] = mapped_column(CODE_ARTIFACT_KIND_ENUM)
    # The indexed commit this artifact was built from — its provenance and cache
    # key. Nullable because a shallow clone may have no resolvable HEAD.
    commit_sha: Mapped[str | None] = mapped_column(String(64), default=None)
    data: Mapped[dict] = mapped_column(_JSON, default=dict)
    built_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
