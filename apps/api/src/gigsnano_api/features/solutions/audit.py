"""Read-only per-workspace solution metadata audit (GIN-445).

Emits aggregate counts by workspace ID only — never tenant payloads.
``ok`` is false when null/invalid solution metadata exists, or when a
baseline snapshot is supplied and invariant counts differ.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.solutions.backfill import _classify_invalid
from gigsnano_api.features.solutions.definitions import SOFTWARE_DELIVERY_KEY
from gigsnano_api.models import Cycle, Project, ProjectMember, Story
from gigsnano_api.models.workspace import EMemberStatus

#: Invariant fields compared across before/after snapshots (backfill must not
#: change these). Null/invalid metadata counts are expected to shrink.
_INVARIANT_FIELDS = (
    "projects",
    "active_members",
    "stories",
    "repositories",
    "sprint_zero_cycles",
)


@dataclass(frozen=True)
class WorkspaceAggregate:
    """Per-workspace counts — IDs and integers only."""

    workspace_id: str
    projects: int = 0
    active_members: int = 0
    role_distribution: dict[str, int] = field(default_factory=dict)
    stories: int = 0
    repositories: int = 0
    sprint_zero_cycles: int = 0
    null_metadata: int = 0
    invalid_metadata: int = 0

    @property
    def has_metadata_problems(self) -> bool:
        return self.null_metadata > 0 or self.invalid_metadata > 0


@dataclass
class AuditReport:
    """Aggregate audit outcome (no tenant payload / PII)."""

    workspaces: dict[str, WorkspaceAggregate] = field(default_factory=dict)
    invariant_mismatches: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        if any(ws.has_metadata_problems for ws in self.workspaces.values()):
            return False
        if self.invariant_mismatches:
            return False
        return True

    def render(self) -> str:
        lines = [
            f"ok={self.ok} workspaces={len(self.workspaces)} "
            f"invariant_mismatches={len(self.invariant_mismatches)}"
        ]
        for workspace_id in sorted(self.workspaces):
            ws = self.workspaces[workspace_id]
            roles = (
                ",".join(
                    f"{role}:{count}"
                    for role, count in sorted(ws.role_distribution.items())
                )
                or "-"
            )
            lines.append(
                f"  workspace {workspace_id}: projects={ws.projects} "
                f"active_members={ws.active_members} roles=[{roles}] "
                f"stories={ws.stories} repositories={ws.repositories} "
                f"sprint_zero={ws.sprint_zero_cycles} "
                f"null_metadata={ws.null_metadata} "
                f"invalid_metadata={ws.invalid_metadata}"
            )
        for workspace_id in self.invariant_mismatches:
            lines.append(f"  invariant_mismatch workspace={workspace_id}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "workspaces": {
                wid: asdict(agg) for wid, agg in sorted(self.workspaces.items())
            },
            "invariant_mismatches": list(self.invariant_mismatches),
        }

    @classmethod
    def from_dict(cls, data: dict) -> AuditReport:
        workspaces = {
            wid: WorkspaceAggregate(**agg)
            for wid, agg in data.get("workspaces", {}).items()
        }
        return cls(
            workspaces=workspaces,
            invariant_mismatches=list(data.get("invariant_mismatches", [])),
        )


def _is_null_metadata(project: Project) -> bool:
    if project.solution_key is None:
        return True
    if (
        project.solution_key == SOFTWARE_DELIVERY_KEY
        and project.solution_version is None
    ):
        return True
    return False


def _compare_invariants(
    current: dict[str, WorkspaceAggregate],
    baseline: dict[str, WorkspaceAggregate],
) -> list[str]:
    """Return workspace IDs whose invariant counts differ (or appear/disappear)."""
    mismatched: list[str] = []
    all_ids = set(current) | set(baseline)
    for workspace_id in sorted(all_ids):
        left = current.get(workspace_id)
        right = baseline.get(workspace_id)
        if left is None or right is None:
            mismatched.append(workspace_id)
            continue
        if any(
            getattr(left, field_name) != getattr(right, field_name)
            for field_name in _INVARIANT_FIELDS
        ):
            mismatched.append(workspace_id)
            continue
        # Role distribution is also an invariant (active membership shape).
        if left.role_distribution != right.role_distribution:
            mismatched.append(workspace_id)
    return mismatched


async def audit_solution_metadata(
    session: AsyncSession,
    *,
    baseline: AuditReport | None = None,
) -> AuditReport:
    """Collect per-workspace aggregates; optionally compare against a baseline.

    Session is injected — tests pass ``db_session``; the CLI opens one via
    ``core.db.async_session_scope``.
    """
    projects = list((await session.execute(select(Project))).scalars().all())
    by_ws: dict[str, dict] = {}

    def _bucket(workspace_id: str) -> dict:
        if workspace_id not in by_ws:
            by_ws[workspace_id] = {
                "projects": 0,
                "repositories": 0,
                "null_metadata": 0,
                "invalid_metadata": 0,
            }
        return by_ws[workspace_id]

    for project in projects:
        bucket = _bucket(project.workspace_id)
        bucket["projects"] += 1
        if project.repo_full_name:
            bucket["repositories"] += 1
        if _is_null_metadata(project):
            bucket["null_metadata"] += 1
        elif _classify_invalid(project) is not None:
            bucket["invalid_metadata"] += 1

    # Active project members + role distribution (join through projects).
    member_rows = (
        await session.execute(
            select(Project.workspace_id, ProjectMember.role, func.count())
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.status == EMemberStatus.ACTIVE)
            .group_by(Project.workspace_id, ProjectMember.role)
        )
    ).all()
    active_members: dict[str, int] = {}
    role_distribution: dict[str, dict[str, int]] = {}
    for workspace_id, role, count in member_rows:
        _bucket(workspace_id)
        active_members[workspace_id] = active_members.get(workspace_id, 0) + count
        roles = role_distribution.setdefault(workspace_id, {})
        role_key = role.value if hasattr(role, "value") else str(role)
        roles[role_key] = roles.get(role_key, 0) + count

    # Work items (stories) — soft-delete filter applies via ORM.
    story_rows = (
        await session.execute(
            select(Project.workspace_id, func.count())
            .join(Story, Story.project_id == Project.id)
            .group_by(Project.workspace_id)
        )
    ).all()
    stories: dict[str, int] = {wid: count for wid, count in story_rows}

    # Sprint-0 / journey cycles.
    sprint_rows = (
        await session.execute(
            select(Project.workspace_id, func.count())
            .join(Cycle, Cycle.project_id == Project.id)
            .where(Cycle.is_sprint_zero.is_(True))
            .group_by(Project.workspace_id)
        )
    ).all()
    sprint_zero: dict[str, int] = {wid: count for wid, count in sprint_rows}

    workspaces: dict[str, WorkspaceAggregate] = {}
    for workspace_id, bucket in by_ws.items():
        workspaces[workspace_id] = WorkspaceAggregate(
            workspace_id=workspace_id,
            projects=bucket["projects"],
            active_members=active_members.get(workspace_id, 0),
            role_distribution=dict(role_distribution.get(workspace_id, {})),
            stories=stories.get(workspace_id, 0),
            repositories=bucket["repositories"],
            sprint_zero_cycles=sprint_zero.get(workspace_id, 0),
            null_metadata=bucket["null_metadata"],
            invalid_metadata=bucket["invalid_metadata"],
        )

    mismatches: list[str] = []
    if baseline is not None:
        mismatches = _compare_invariants(workspaces, baseline.workspaces)

    return AuditReport(workspaces=workspaces, invariant_mismatches=mismatches)
