import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.foundation.compat import check_compatibility
from gigsnano_api.features.foundation.presets import PRESETS, suggest_preset
from gigsnano_api.models.foundation import ProjectFoundation
from gigsnano_api.workspace.paths import workspace_root


def _snapshot(row: ProjectFoundation) -> dict:
    """The lockable state of a Foundation version, for the history strip (GIN-196)."""
    return {
        "version": row.version,
        "preset_key": row.preset_key,
        "allowed_libraries": list(row.allowed_libraries),
        "enforce_design_tokens": row.enforce_design_tokens,
        "quality_gates": list(row.quality_gates),
        "database": row.database,
        "architecture": row.architecture,
    }


def detect_stack(project_id: str) -> str | None:
    """Suggested preset from the project's cloned package.json, or None if the
    repo isn't cloned / has no package.json / doesn't match a known stack."""
    try:
        pkg = workspace_root(project_id) / "package.json"
        if not pkg.is_file():
            return None
        data = json.loads(pkg.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    deps = {*(data.get("dependencies") or {}), *(data.get("devDependencies") or {})}
    return suggest_preset(deps)


async def get_foundation(db: AsyncSession, project_id: str) -> ProjectFoundation | None:
    res = await db.execute(
        select(ProjectFoundation).where(ProjectFoundation.project_id == project_id)
    )
    return res.scalar_one_or_none()


async def lock_foundation(
    db: AsyncSession,
    *,
    project_id: str,
    preset_key: str | None = None,
    allowed_libraries: list[str] | None = None,
    enforce_design_tokens: bool | None = None,
    quality_gates: list[str] | None = None,
    database: str | None = None,
    architecture: str | None = None,
) -> ProjectFoundation:
    if preset_key is not None:
        preset = PRESETS[preset_key]  # KeyError on unknown preset -> router returns 400
        key, libs = preset.key, list(preset.allowed_libraries)
        tokens, gates = preset.enforce_design_tokens, list(preset.quality_gates)
    elif allowed_libraries is not None:
        key, libs = "custom", allowed_libraries
        tokens, gates = bool(enforce_design_tokens), quality_gates or []
        # Granular composer (GIN-225): reject an incoherent stack before locking.
        conflicts = check_compatibility(libs, database, architecture)
        if conflicts:
            raise ValueError("; ".join(conflicts))
    else:
        raise ValueError("provide a preset_key or a custom stack (allowed_libraries)")

    row = await get_foundation(db, project_id)
    if row is None:
        row = ProjectFoundation(project_id=project_id, version=0)
        db.add(row)
    elif (row.version or 0) > 0:
        # Snapshot the version being superseded so the living page can show
        # v1 · v2 · … · vN history (GIN-196).
        row.history = [*(row.history or []), _snapshot(row)]
    row.preset_key = key
    row.allowed_libraries = libs
    row.enforce_design_tokens = tokens
    row.quality_gates = gates
    row.database = (database or "") if preset_key is None else ""
    row.architecture = (architecture or "") if preset_key is None else ""
    row.status = "locked"
    row.version = (row.version or 0) + 1
    await db.flush()
    return row


def _validate_change(
    preset_key: str | None,
    allowed_libraries: list[str] | None,
    database: str | None,
    architecture: str | None,
) -> None:
    """Same guards as lock_foundation, run up front so a proposal can't hold an
    unlockable stack (unknown preset / incompatible composed stack)."""
    if preset_key is not None:
        if preset_key not in PRESETS:
            raise KeyError(preset_key)
    elif allowed_libraries is not None:
        conflicts = check_compatibility(allowed_libraries, database, architecture)
        if conflicts:
            raise ValueError("; ".join(conflicts))
    else:
        raise ValueError("provide a preset_key or a custom stack (allowed_libraries)")


async def propose_change(
    db: AsyncSession,
    *,
    project_id: str,
    proposed_by: str,
    preset_key: str | None = None,
    allowed_libraries: list[str] | None = None,
    enforce_design_tokens: bool | None = None,
    quality_gates: list[str] | None = None,
    database: str | None = None,
    architecture: str | None = None,
) -> ProjectFoundation:
    """Record a proposed change without applying it — review then approve/reject (GIN-196)."""
    row = await get_foundation(db, project_id)
    if row is None:
        raise ValueError("no locked Foundation to propose a change to")
    _validate_change(preset_key, allowed_libraries, database, architecture)
    row.pending_change = {
        "proposed_by": proposed_by,
        "proposed_at": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "preset_key": preset_key,
            "allowed_libraries": allowed_libraries,
            "enforce_design_tokens": enforce_design_tokens,
            "quality_gates": quality_gates,
            "database": database,
            "architecture": architecture,
        },
    }
    await db.flush()
    return row


async def approve_change(db: AsyncSession, project_id: str) -> ProjectFoundation:
    """Apply the pending proposal as a new locked version (GIN-196)."""
    row = await get_foundation(db, project_id)
    if row is None or not row.pending_change:
        raise ValueError("no pending change to approve")
    payload = {k: v for k, v in row.pending_change["payload"].items() if v is not None}
    row.pending_change = None
    return await lock_foundation(db, project_id=project_id, **payload)


async def reject_change(db: AsyncSession, project_id: str) -> ProjectFoundation:
    """Discard the pending proposal, leaving the current lock unchanged (GIN-196)."""
    row = await get_foundation(db, project_id)
    if row is None or not row.pending_change:
        raise ValueError("no pending change to reject")
    row.pending_change = None
    await db.flush()
    return row
