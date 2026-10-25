"""External document packages (GIN-394).

One row per upload of an external delivery package. The documents themselves stay
`Artifact` rows so they appear in the project's existing document library; this
model is only the grouping every later slice needs (analyse a package, propose
from it, apply it, resume it).
"""

from uuid import uuid4

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase

#: Lifecycle values. A plain String (like `Artifact.doc_type`) rather than a DB
#: enum — later slices add states, and an enum alteration is a migration hazard.
PACKAGE_STATUSES = ("uploaded", "analysing", "analysed", "applied", "failed")


class DocumentPackage(TimestampedBase):
    __tablename__ = "document_packages"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    created_by_name: Mapped[str] = mapped_column(String(120), default="")
    #: Ties every later operation on this package to one trace (analyse, propose,
    #: apply, roll back) without threading an id through each call.
    correlation_id: Mapped[str] = mapped_column(String(64), default=lambda: uuid4().hex)


#: What a finding is about. Kinds map to what the proposal step (GIN-396) can
#: build from them; `open_question` and `risk` never become work items directly.
FINDING_KINDS = (
    "decision", "requirement", "module", "phase", "task", "dependency",
    "constraint", "risk", "open_question", "prerequisite", "testing", "definition_of_done",
)

#: How much the package actually commits to this finding. The epic is explicit
#: that a conflict is surfaced, never silently reconciled.
FINDING_STATUSES = ("approved", "proposed", "assumption", "blocked", "missing", "conflict")


class PackageFinding(TimestampedBase):
    """One typed, source-anchored thing the analysis found in a document.

    Read-only evidence: a finding never changes the project. GIN-396 turns
    approved findings into proposed work items, and only after a human approves.
    """

    __tablename__ = "package_findings"

    package_id: Mapped[str] = mapped_column(
        ForeignKey("document_packages.id", ondelete="CASCADE"), index=True
    )
    #: The document it came from. Nullable so a package-level finding (e.g. a
    #: conflict *between* two documents) has somewhere to live.
    document_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), default=None, index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    title: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    #: Where in the document this came from — heading path, plus the character
    #: range so a UI can highlight the exact text (GIN-398 cites these).
    anchor: Mapped[str] = mapped_column(String(300), default="")
    anchor_start: Mapped[int | None] = mapped_column(Integer, default=None)
    anchor_end: Mapped[int | None] = mapped_column(Integer, default=None)
    source_excerpt: Mapped[str] = mapped_column(Text, default="")
    #: A user correction never deletes the AI's proposal — it shadows it, so the
    #: original stays auditable (an explicit epic requirement).
    override: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)


#: What an import change does. Deliberately not reusing the recovery-plan model:
#: that one is keyed on an existing work item's code+field and rolls back by
#: restoring a value, neither of which is true when the object does not exist yet.
IMPORT_OPS = ("create", "link", "blocked")

#: What a change creates. `relation` and `blocker` are edges, the rest are nodes.
IMPORT_TARGETS = (
    "module", "milestone", "cycle", "epic", "story", "task", "relation", "blocker",
)

IMPORT_CHANGE_STATUSES = (
    "proposed", "approved", "excluded", "needs_review", "applied", "failed", "rolled_back",
)

IMPORT_PLAN_STATUSES = ("draft", "approved", "applied", "partially_applied", "rolled_back")

#: How the supplied plan maps onto GigsNano structure.
IMPORT_STRATEGIES = ("preserve", "convert", "hybrid")


class ImportPlan(TimestampedBase):
    """A dry-run change set proposed from a package's findings.

    Nothing here has touched the project. GIN-397 applies an approved plan; this
    model exists so a human can read, edit and approve it first.
    """

    __tablename__ = "import_plans"

    package_id: Mapped[str] = mapped_column(
        ForeignKey("document_packages.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    strategy: Mapped[str] = mapped_column(String(20), default="convert")
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    #: Shared with every change it applies, so one import is one trace.
    correlation_id: Mapped[str] = mapped_column(String(64), default=lambda: uuid4().hex)


class ImportChange(TimestampedBase):
    """One proposed object, with the finding that justifies it."""

    __tablename__ = "import_changes"

    plan_id: Mapped[str] = mapped_column(
        ForeignKey("import_plans.id", ondelete="CASCADE"), index=True
    )
    op: Mapped[str] = mapped_column(String(20), default="create")
    target: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="proposed", index=True)

    #: Stable handle for this proposed object *within the plan*, so a child can
    #: name its parent before either exists. GIN-397 resolves these in two passes.
    temp_key: Mapped[str] = mapped_column(String(120), index=True)
    parent_temp_key: Mapped[str | None] = mapped_column(String(120), default=None)

    title: Mapped[str] = mapped_column(String(300), default="")
    #: Everything else the object needs (description, dates, relation type, …).
    #: JSON because a proposed story is not one String(300) value.
    payload: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)

    #: Why this exists — the finding, and through it the document + section.
    finding_id: Mapped[str | None] = mapped_column(
        ForeignKey("package_findings.id", ondelete="SET NULL"), default=None
    )
    reason: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)

    #: Filled at apply time (GIN-397): what got created, so rollback deletes
    #: exactly this and nothing else.
    created_object_id: Mapped[str | None] = mapped_column(String(36), default=None)
    error: Mapped[str] = mapped_column(Text, default="")


class WorkItemSource(TimestampedBase):
    """Where a work item came from: document, version, section.

    A durable link, written when the item is created and deliberately independent
    of the plan that proposed it. The plan is a draft that gets rebuilt whenever
    someone re-proposes; provenance is history and must outlive it.
    """

    __tablename__ = "work_item_sources"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifacts.id", ondelete="SET NULL"), default=None, index=True
    )
    package_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_packages.id", ondelete="SET NULL"), default=None, index=True
    )
    #: Kept as text, not only as a FK: the finding can be re-analysed away, but
    #: "Derived from: mobile-phases-0-3.md, Phase 0" must still render.
    document_name: Mapped[str] = mapped_column(String(300), default="")
    anchor: Mapped[str] = mapped_column(String(300), default="")
    anchor_start: Mapped[int | None] = mapped_column(Integer, default=None)
    anchor_end: Mapped[int | None] = mapped_column(Integer, default=None)
    #: The document version this was derived from, so a later revision is visibly
    #: a different source rather than silently reinterpreting the old one.
    document_version: Mapped[int | None] = mapped_column(Integer, default=None)
    finding_id: Mapped[str | None] = mapped_column(
        ForeignKey("package_findings.id", ondelete="SET NULL"), default=None
    )
