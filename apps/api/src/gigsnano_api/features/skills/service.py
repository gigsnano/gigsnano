"""Skill registry DB ops (GIN-284). Immutable versions; lifecycle transitions
only. Bundle bytes in Postgres (mirrors ImageAsset); swap to object storage
later by changing what publish writes / the route reads, not the schema."""

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.skills import bundle
from gigsnano_api.models import StaffMember
from gigsnano_api.models.skills import SkillPackage, SkillVersion

_TRANSITIONS = {
    "draft": {"reviewed"},
    "reviewed": {"approved"},
    "approved": {"deprecated", "revoked"},
    "deprecated": {"revoked"},
    "revoked": set(),
}


class SkillRevoked(Exception):
    """A revoked version cannot start new runs."""


class VersionConflict(Exception):
    """Re-publishing an existing version with different content."""


async def _get_or_create_package(
    db: AsyncSession, workspace_id: str, name: str, visibility: str
) -> SkillPackage:
    owner = None if visibility == "public" else workspace_id
    stmt = select(SkillPackage).where(
        SkillPackage.name == name, SkillPackage.owner_workspace_id == owner
    )
    pkg = (await db.execute(stmt)).scalar_one_or_none()
    if pkg is None:
        pkg = SkillPackage(name=name, visibility=visibility, owner_workspace_id=owner)
        db.add(pkg)
        await db.flush()
    return pkg


async def publish(
    db: AsyncSession, *, workspace_id: str, name: str, version: str,
    visibility: str, files: dict[str, str], manifest: dict,
) -> SkillVersion:
    bundle.validate(files, name, version)  # raises ValueError
    digest = bundle.content_digest(files)
    pkg = await _get_or_create_package(db, workspace_id, name, visibility)

    existing = (
        await db.execute(
            select(SkillVersion).where(SkillVersion.package_id == pkg.id, SkillVersion.version == version)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.digest == digest:
            return existing  # idempotent re-publish
        raise VersionConflict(f"version {version} already exists with different content")

    data = bundle.build_tgz(files)
    meta = {**manifest, "description": manifest.get("description") or bundle.parse_skill_md(files["SKILL.md"])["description"]}
    ver = SkillVersion(
        package_id=pkg.id, version=version, digest=digest,
        data=data, byte_size=len(data), manifest=meta, lifecycle="draft",
    )
    db.add(ver)
    try:
        await db.flush()
    except IntegrityError:
        # concurrent publish of the same (package_id, version) raced us
        await db.rollback()
        raise VersionConflict(f"version {version} already exists with different content")
    return ver


async def user_is_staff(db: AsyncSession, user_id: str) -> bool:
    row = (
        await db.execute(
            select(StaffMember).where(StaffMember.user_id == user_id, StaffMember.is_active.is_(True))
        )
    ).scalar_one_or_none()
    return row is not None


def _visible_clause(workspace_id: str):
    return or_(
        SkillPackage.visibility == "public",
        SkillPackage.owner_workspace_id == workspace_id,
    )


async def list_visible(db: AsyncSession, workspace_id: str) -> list[SkillPackage]:
    stmt = select(SkillPackage).where(_visible_clause(workspace_id))
    return list((await db.execute(stmt)).scalars().all())


async def get_package(db: AsyncSession, workspace_id: str, package_id: str) -> SkillPackage:
    pkg = await db.get(SkillPackage, package_id)
    if pkg is None or (pkg.visibility != "public" and pkg.owner_workspace_id != workspace_id):
        raise LookupError("skill not found")
    return pkg


async def versions_for(db: AsyncSession, package_id: str) -> list[SkillVersion]:
    stmt = select(SkillVersion).where(SkillVersion.package_id == package_id)
    return list((await db.execute(stmt)).scalars().all())


async def get_version(db: AsyncSession, workspace_id: str, version_id: str) -> SkillVersion:
    ver = await db.get(SkillVersion, version_id)
    if ver is None:
        raise LookupError("skill version not found")
    await get_package(db, workspace_id, ver.package_id)  # tenant check (raises LookupError)
    return ver


async def transition(db: AsyncSession, version_id: str, to: str) -> SkillVersion:
    ver = await db.get(SkillVersion, version_id)
    if ver is None:
        raise LookupError("skill version not found")
    if to not in _TRANSITIONS.get(ver.lifecycle, set()):
        raise ValueError(f"illegal transition {ver.lifecycle} -> {to}")
    ver.lifecycle = to
    await db.flush()
    return ver


async def resolve_runnable(db: AsyncSession, version_id: str) -> SkillVersion:
    ver = await db.get(SkillVersion, version_id)
    if ver is None:
        raise LookupError("skill version not found")
    if ver.lifecycle == "revoked":
        raise SkillRevoked(version_id)
    return ver
