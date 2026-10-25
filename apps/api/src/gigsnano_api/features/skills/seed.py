"""Seed the built-in cross-agent skill catalogue into the registry (GIN-291).

Publishes each `src/gigsnano_api/builtin_skills/<name>/SKILL.md` as a public,
immutable skill. Idempotent: re-seeding identical content returns the existing
bundle. To ship an update, bump the SKILL.md frontmatter `version` (versions are
immutable — re-seeding changed content under the same version is skipped)."""

from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.skills import service

BUILTIN_SKILLS_DIR = Path(__file__).resolve().parents[2] / "builtin_skills"


def _frontmatter(text: str) -> dict:
    """Parse the leading `---` frontmatter block into a flat dict."""
    meta: dict = {}
    if not text.startswith("---"):
        return meta
    end = text.find("\n---", 3)
    block = text[3:end] if end != -1 else ""
    for line in block.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta


async def seed_skills(db: AsyncSession) -> None:
    for skill_dir in sorted(BUILTIN_SKILLS_DIR.iterdir()):
        md = skill_dir / "SKILL.md"
        if not md.is_file():
            continue
        text = md.read_text(encoding="utf-8")
        fm = _frontmatter(text)
        name = fm.get("name")
        if not name:
            continue
        if name != skill_dir.name:
            # Fail fast (like the BMAD-asset check) — a dir/frontmatter mismatch
            # would silently seed the wrong package and orphan a routed skill.
            raise ValueError(
                f"skill dir {skill_dir.name!r} has mismatched frontmatter name {name!r}"
            )
        try:
            await service.publish(
                db,
                workspace_id="system",  # ignored for public (owner_workspace_id=None)
                name=name,
                version=fm.get("version", "1.0.0"),
                visibility="public",
                files={"SKILL.md": text},
                manifest={"description": fm.get("description", "")},
            )
        except service.VersionConflict:
            # Content changed without a version bump — keep the immutable existing
            # version. Bump the SKILL.md `version` to publish an update.
            pass
    await db.commit()
