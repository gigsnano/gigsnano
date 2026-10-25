"""External document package routes (GIN-394).

Project-scoped, so access goes through `get_project_or_404` /
`require_project_write_access` — the same guarded resolvers every other project
route uses. A caller who cannot see the project gets 404, never 403.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.db import get_db
from gigsnano_api.features.package_import.analysis import (
    analyse_package,
    analyse_single_document,
    package_findings,
)
from gigsnano_api.features.package_import.apply import (
    apply_plan,
    document_work_items,
    rollback_plan,
    work_item_sources,
)
from gigsnano_api.features.package_import.proposal import (
    AlreadyAppliedError,
    blocking_conflicts,
    build_import_plan,
    plan_changes,
)
from gigsnano_api.features.package_import.schemas import (
    AnalysisOut,
    BuildPlanPayload,
    ConflictOut,
    CreatePackagePayload,
    DecideChangesPayload,
    FindingOut,
    GeneratedWorkItemOut,
    ImportChangeOut,
    ImportPlanOut,
    PackageCounts,
    PackageDocumentOut,
    PackageOut,
    UpdateDocumentPayload,
    UpdateFindingPayload,
    WorkItemSourceOut,
)
from gigsnano_api.features.package_import.service import (
    PackageTooLargeError,
    UploadFile,
    create_package,
    package_documents,
)
from gigsnano_api.lib.document_classify import DOC_TYPES
from gigsnano_api.models.artifacts import Artifact
from gigsnano_api.models.packages import (
    FINDING_STATUSES,
    IMPORT_STRATEGIES,
    DocumentPackage,
    ImportChange,
    ImportPlan,
    PackageFinding,
    WorkItemSource,
)
from gigsnano_api.models.projects import Project
from gigsnano_api.models.stories import Story
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["package-import"])
_BASE = "/workspaces/{workspace_slug}/projects/{project_id}/packages"


def _document_out(artifact) -> PackageDocumentOut:
    return PackageDocumentOut(
        id=artifact.id,
        title=artifact.title,
        file_name=artifact.file_name,
        mime_type=artifact.mime_type,
        original_path=artifact.original_path,
        parse_state=artifact.parse_state,
        parse_error=artifact.parse_error,
        byte_size=artifact.byte_size,
        checksum=artifact.checksum,
        canonical=bool(artifact.canonical),
    )


async def _package_out(db: AsyncSession, package: DocumentPackage) -> PackageOut:
    documents = await package_documents(db, package.id)
    ready = sum(1 for d in documents if d.parse_state == "ok")
    return PackageOut(
        id=package.id,
        project_id=package.project_id,
        name=package.name,
        status=package.status,
        correlation_id=package.correlation_id,
        counts=PackageCounts(
            total=len(documents), ready=ready, needs_attention=len(documents) - ready
        ),
        documents=[_document_out(d) for d in documents],
    )


@router.post(_BASE + "/", response_model=PackageOut, status_code=status.HTTP_201_CREATED)
async def upload_package(
    payload: CreatePackagePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        package = await create_package(
            db,
            project=project,
            name=payload.name or "Imported package",
            files=[
                UploadFile(file_name=f.file_name, mime_type=f.mime_type, content=f.content)
                for f in payload.files
            ],
            user_id=ctx.user.id,
            user_name=getattr(ctx.user, "display_name", "") or "",
        )
    except PackageTooLargeError as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    await db.commit()
    return await _package_out(db, package)


@router.get(_BASE + "/{package_id}/", response_model=PackageOut)
async def get_package(
    package_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await _package_out(db, await _resolve(db, project, package_id))


async def _resolve(db: AsyncSession, project: Project, package_id: str) -> DocumentPackage:
    """The package, or 404 — never confirm one exists in another project."""
    package = await db.get(DocumentPackage, package_id)
    if package is None or package.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Package not found")
    return package


def _finding_out(finding: PackageFinding) -> FindingOut:
    return FindingOut(
        id=finding.id,
        document_id=finding.document_id,
        kind=finding.kind,
        status=finding.status,
        title=finding.title,
        detail=finding.detail,
        confidence=finding.confidence,
        anchor=finding.anchor,
        anchor_start=finding.anchor_start,
        anchor_end=finding.anchor_end,
        source_excerpt=finding.source_excerpt,
        override=finding.override,
    )


def _analysis_out(package: DocumentPackage, findings: list[PackageFinding]) -> AnalysisOut:
    by_status: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for finding in findings:
        by_status[finding.status] = by_status.get(finding.status, 0) + 1
        by_kind[finding.kind] = by_kind.get(finding.kind, 0) + 1
    return AnalysisOut(
        package_id=package.id,
        status=package.status,
        counts_by_status=by_status,
        counts_by_kind=by_kind,
        findings=[_finding_out(f) for f in findings],
    )


@router.post(_BASE + "/{package_id}/analyse/", response_model=AnalysisOut)
async def analyse(
    package_id: str,
    document_id: str | None = None,
    project: Project = Depends(require_project_write_access),
    provider: LLMProvider = Depends(get_llm_provider),
    db: AsyncSession = Depends(get_db),
):
    """Classify and extract findings, replacing previous ones so a retry cannot
    double the analysis.

    Pass `document_id` to analyse a single document. Prefer that for anything
    bigger than a couple of files: a whole package is unbounded model work behind
    one request, and a seven-document package exceeds the gateway's 230s timeout
    long before it finishes. Per document, the work is bounded and the caller
    sees real progress.
    """
    package = await _resolve(db, project, package_id)
    if document_id is not None:
        try:
            await analyse_single_document(db, provider, package, document_id)
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found") from exc
    else:
        await analyse_package(db, provider, package)
    await db.commit()
    return _analysis_out(package, await package_findings(db, package.id))


@router.get(_BASE + "/{package_id}/findings/", response_model=AnalysisOut)
async def list_findings(
    package_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    package = await _resolve(db, project, package_id)
    return _analysis_out(package, await package_findings(db, package.id))


@router.patch(_BASE + "/{package_id}/documents/{document_id}/", response_model=PackageDocumentOut)
async def update_document(
    package_id: str,
    document_id: str,
    payload: UpdateDocumentPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    """Correct a classification, or mark a document canonical. The AI's original
    verdict stays in `structured_json` — a correction shadows it, never erases it."""
    package = await _resolve(db, project, package_id)
    document = await db.get(Artifact, document_id)
    if document is None or document.package_id != package.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if payload.doc_type is not None:
        if payload.doc_type not in DOC_TYPES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown type: {payload.doc_type}"
            )
        document.structured_json = {
            **(document.structured_json or {}),
            "ai_doc_type": document.doc_type,
            "classification_source": "user",
        }
        document.doc_type = payload.doc_type
    if payload.canonical is not None:
        document.canonical = payload.canonical
    await db.commit()
    return _document_out(document)


@router.patch(_BASE + "/{package_id}/findings/{finding_id}/", response_model=FindingOut)
async def update_finding(
    package_id: str,
    finding_id: str,
    payload: UpdateFindingPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    """Record a user override. The proposal keeps its original fields; the
    override is stored beside them so the disagreement stays auditable."""
    package = await _resolve(db, project, package_id)
    finding = await db.get(PackageFinding, finding_id)
    if finding is None or finding.package_id != package.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")
    changes = payload.model_dump(exclude_none=True)
    if changes.get("status") and changes["status"] not in FINDING_STATUSES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown status: {changes['status']}"
        )
    if changes:
        finding.override = {**(finding.override or {}), **changes}
    await db.commit()
    return _finding_out(finding)


def _change_out(change: ImportChange) -> ImportChangeOut:
    return ImportChangeOut(
        id=change.id,
        op=change.op,
        target=change.target,
        status=change.status,
        temp_key=change.temp_key,
        parent_temp_key=change.parent_temp_key,
        title=change.title,
        payload=change.payload,
        finding_id=change.finding_id,
        reason=change.reason,
        confidence=change.confidence,
    )


async def _plan_out(db: AsyncSession, plan: ImportPlan) -> ImportPlanOut:
    changes = await plan_changes(db, plan.id)
    conflicts = blocking_conflicts(await package_findings(db, plan.package_id))
    by_target: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for change in changes:
        by_target[change.target] = by_target.get(change.target, 0) + 1
        by_status[change.status] = by_status.get(change.status, 0) + 1
    return ImportPlanOut(
        id=plan.id,
        package_id=plan.package_id,
        strategy=plan.strategy,
        status=plan.status,
        correlation_id=plan.correlation_id,
        counts_by_target=by_target,
        counts_by_status=by_status,
        blocking_conflicts=[
            ConflictOut(
                finding_id=f.id,
                title=f.title,
                anchor=f.anchor,
                resolution=(
                    "Two documents disagree here. Resolve it by overriding this "
                    "finding's status (PATCH the finding) before applying the plan."
                ),
            )
            for f in conflicts
        ],
        # The epic is explicit: mandatory conflicts prevent creation, and the UI
        # must say why. `can_apply` is that gate, and the conflicts carry the why.
        can_apply=not conflicts and by_status.get("approved", 0) > 0,
        changes=[_change_out(c) for c in changes],
    )


async def _plan_or_404(db: AsyncSession, package: DocumentPackage) -> ImportPlan:
    plan = (
        await db.execute(select(ImportPlan).where(ImportPlan.package_id == package.id))
    ).scalars().first()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No import plan — build one first")
    return plan


@router.post(_BASE + "/{package_id}/plan/", response_model=ImportPlanOut)
async def build_plan(
    package_id: str,
    payload: BuildPlanPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Propose structure from the package's findings. Re-running (including with a
    different strategy) rebuilds the proposal; it never touches the findings or
    the user's corrections to them."""
    if payload.strategy not in IMPORT_STRATEGIES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown strategy: {payload.strategy}"
        )
    package = await _resolve(db, project, package_id)
    try:
        plan = await build_import_plan(
            db, package=package, project_id=project.id,
            strategy=payload.strategy, user_id=ctx.user.id,
        )
    except AlreadyAppliedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await db.commit()
    return await _plan_out(db, plan)


@router.get(_BASE + "/{package_id}/plan/", response_model=ImportPlanOut)
async def get_plan(
    package_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    package = await _resolve(db, project, package_id)
    return await _plan_out(db, await _plan_or_404(db, package))


@router.post(_BASE + "/{package_id}/plan/decide/", response_model=ImportPlanOut)
async def decide_changes(
    package_id: str,
    payload: DecideChangesPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    """Approve or exclude changes — all of them, or the ones named. Applying is a
    separate step (GIN-397); this only records the decision."""
    if payload.decision not in ("approved", "excluded", "proposed"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown decision: {payload.decision}"
        )
    package = await _resolve(db, project, package_id)
    plan = await _plan_or_404(db, package)

    wanted = set(payload.change_ids or [])
    for change in await plan_changes(db, plan.id):
        if wanted and change.id not in wanted:
            continue
        if change.status in ("applied", "rolled_back"):
            continue  # a decision cannot rewrite what already happened
        change.status = payload.decision
    plan.status = "approved" if payload.decision == "approved" else "draft"
    await db.commit()
    return await _plan_out(db, plan)


@router.post(_BASE + "/{package_id}/plan/apply/")
async def apply_import(
    package_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create the approved changes. Refuses while a mandatory conflict is
    unresolved, and says which one — the epic's gate."""
    package = await _resolve(db, project, package_id)
    plan = await _plan_or_404(db, package)
    conflicts = blocking_conflicts(await package_findings(db, package.id))
    if conflicts:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Resolve these conflicting findings before applying: "
            + ", ".join(f"{c.title} ({c.anchor})" for c in conflicts[:5]),
        )
    if plan.status in ("applied", "rolled_back"):
        # Re-applying an applied plan is safe (each change is skipped), but a
        # rolled-back one must be re-approved deliberately rather than resurrected.
        if plan.status == "rolled_back":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This plan was rolled back. Rebuild it before applying again.",
            )
    result = await apply_plan(db, project=project, plan=plan)
    await db.commit()
    return result


@router.post(_BASE + "/{package_id}/plan/rollback/")
async def rollback_import(
    package_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    package = await _resolve(db, project, package_id)
    plan = await _plan_or_404(db, package)
    if plan.status not in ("applied", "partially_applied"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Nothing to roll back — this plan was never applied."
        )
    result = await rollback_plan(db, plan=plan)
    await db.commit()
    return result


def _source_out(source: WorkItemSource) -> WorkItemSourceOut:
    return WorkItemSourceOut(
        document_id=source.document_id,
        package_id=source.package_id,
        document_name=source.document_name,
        document_version=source.document_version,
        anchor=source.anchor,
        anchor_start=source.anchor_start,
        anchor_end=source.anchor_end,
        finding_id=source.finding_id,
    )


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/sources/",
    response_model=list[WorkItemSourceOut],
)
async def get_work_item_sources(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Work item -> where it came from. Empty for an item nobody imported."""
    story = await db.get(Story, story_id)
    if story is None or story.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work item not found")
    return [_source_out(s) for s in await work_item_sources(db, story.id)]


@router.get(
    _BASE + "/{package_id}/documents/{document_id}/work-items/",
    response_model=list[GeneratedWorkItemOut],
)
async def get_document_work_items(
    package_id: str,
    document_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Document -> everything it generated, the reverse direction."""
    package = await _resolve(db, project, package_id)
    document = await db.get(Artifact, document_id)
    if document is None or document.package_id != package.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return [
        GeneratedWorkItemOut(
            story_id=story.id,
            story_number=story.story_number,
            title=story.title,
            anchor=source.anchor,
        )
        for source, story in await document_work_items(db, document.id)
    ]
