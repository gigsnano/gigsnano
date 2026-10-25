"""Existing-project discovery projection (GIN-432).

Brownfield discovery: establish current truth from real evidence. Evidence +
detected components are projected from the project's actual repositories,
documents and backlog — no fabricated CampusFlow seed. Once the user curates and
approves the baseline it persists via the shared contract store
(doc_type discovery_baseline); GET returns the saved baseline if present, else a
fresh projection to confirm.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Artifact, EStoryType, Project, Story
from gigsnano_api.models.system import ProjectRepository

from .schemas import DetectedComponentOut, DiscoveryOut, EvidenceItemOut

# Repo type → detected component type (naive; refine when codebase intel lands).
_COMPONENT_BY_REPO_TYPE = {
    "application": "frontend",
    "service": "service",
    "library": "service",
    "infrastructure": "integration",
    "configuration": "integration",
    "other": "service",
}

# Contract doc_types are the journey's own structured blobs, not project documents.
_CONTRACT_DOC_TYPES = ("experience_contract", "solution_topology", "discovery_baseline")


async def project_fresh_discovery(db: AsyncSession, project: Project) -> DiscoveryOut:
    repos = list(
        (
            await db.execute(
                select(ProjectRepository)
                .where(
                    ProjectRepository.project_id == project.id,
                    ProjectRepository.archived_at.is_(None),
                )
                .order_by(ProjectRepository.is_primary.desc())
            )
        ).scalars().all()
    )
    docs = list(
        (
            await db.execute(
                select(Artifact)
                .where(
                    Artifact.project_id == project.id,
                    Artifact.doc_type.not_in(_CONTRACT_DOC_TYPES),
                )
                .order_by(Artifact.version.desc())
                .limit(6)
            )
        ).scalars().all()
    )
    has_backlog = (
        await db.execute(
            select(Story.id).where(
                Story.project_id == project.id,
                Story.bmad_workflow.is_(None),
                Story.type.in_((EStoryType.EPIC, EStoryType.STORY)),
            ).limit(1)
        )
    ).scalar_one_or_none() is not None

    evidence: list[EvidenceItemOut] = []
    components: list[DetectedComponentOut] = []
    for repo in repos:
        rtype = repo.repository_type.value if hasattr(repo.repository_type, "value") else str(repo.repository_type)
        cloned = getattr(repo.clone_status, "value", str(repo.clone_status)) == "ready"
        evidence.append(
            EvidenceItemOut(
                id=f"repo-{repo.id}",
                kind="repository",
                name=repo.display_name or repo.full_name,
                status="confirmed" if cloned else "attention",
                confidence=0.95 if cloned else 0.6,
                note=None if cloned else "Not cloned/indexed yet",
            )
        )
        if rtype != "documentation":
            components.append(
                DetectedComponentOut(
                    id=f"comp-{repo.id}",
                    name=repo.display_name or repo.full_name,
                    type=_COMPONENT_BY_REPO_TYPE.get(rtype, "service"),
                    confidence=0.9 if cloned else 0.55,
                    evidence=repo.full_name,
                    confirmed=bool(repo.is_primary),
                )
            )
    for doc in docs:
        evidence.append(
            EvidenceItemOut(
                id=f"doc-{doc.id}",
                kind="document",
                name=doc.title or doc.doc_type,
                status="confirmed",
                confidence=0.8,
            )
        )
    if has_backlog:
        evidence.append(
            EvidenceItemOut(
                id="backlog",
                kind="backlog",
                name="existing backlog",
                status="confirmed",
                confidence=0.85,
            )
        )

    return DiscoveryOut(evidence=evidence, components=components)


__all__ = ["project_fresh_discovery"]
