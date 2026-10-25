"""Analyse an ingested package into typed, source-anchored findings (GIN-395).

Two-tier by design. Classification is decided by the free deterministic
classifier and only escalated to the model when its confidence is genuinely low —
a delivery package names its files for humans, and paying for a model to read
"design-system.md" is waste. Finding extraction is model work: no heuristic
reads prose for approved-vs-assumed decisions.

Read-only: analysis writes findings, never project objects. Turning findings into
work items is GIN-396, behind a human approval.
"""

from __future__ import annotations

import asyncio

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider
from gigsnano_api.features.package_import.service import package_documents
from gigsnano_api.lib.document_classify import DOC_TYPES, classify_document
from gigsnano_api.lib.markdown_sections import split_sections
from gigsnano_api.llm.usage import UsageTally
from gigsnano_api.models.artifacts import Artifact
from gigsnano_api.models.packages import (
    FINDING_KINDS,
    FINDING_STATUSES,
    DocumentPackage,
    PackageFinding,
)

#: Below this the deterministic classifier is not trusted and the model decides.
CLASSIFY_ESCALATION_THRESHOLD = 0.7
#: Bounded work per document — a 200-section spec must not become 200 LLM calls.
MAX_SECTIONS_PER_DOCUMENT = 12
MAX_FINDINGS_PER_SECTION = 10
_MAX_EXTRACT_ATTEMPTS = 2

_ANALYST_SYSTEM = [
    {
        "type": "text",
        "text": (
            "You are reading one section of an external delivery document that an "
            "outside team already produced. Extract only what the text actually "
            "says. Never invent scope, never reconcile a contradiction — report it "
            "as a conflict and let a human decide. Preserve the document's own "
            "terminology. Mark a decision 'approved' only when the text says it is "
            "settled; 'proposed' when it is offered; 'assumption' when the document "
            "assumes it without stating a source."
        ),
    }
]


class _Finding(BaseModel):
    kind: str
    status: str = "proposed"
    title: str = Field(max_length=300)
    detail: str = ""
    confidence: float = 0.5


class _Findings(BaseModel):
    findings: list[_Finding] = Field(default_factory=list)


class _DocType(BaseModel):
    doc_type: str
    confidence: float = 0.5


def _clean(finding: _Finding) -> _Finding | None:
    """Drop anything outside the vocabulary rather than storing a junk row."""
    if finding.kind not in FINDING_KINDS or not finding.title.strip():
        return None
    status = finding.status if finding.status in FINDING_STATUSES else "proposed"
    return finding.model_copy(update={"status": status})


async def _extract(provider: LLMProvider, prompt: str, schema_model, tool: str,
                   tally: UsageTally | None = None):
    """One bounded extract with a validation retry; None when it never validates."""
    messages = [{"role": "user", "content": prompt}]
    for _ in range(_MAX_EXTRACT_ATTEMPTS):
        result = await provider.extract(
            system=_ANALYST_SYSTEM,
            messages=messages,
            tool_name=tool,
            schema=schema_model.model_json_schema(),
        )
        if tally is not None:
            tally.add(result)
        try:
            return schema_model.model_validate(result.data)
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": f"{tool} was invalid."},
                {"role": "user", "content": f"Failed validation:\n{err}\nEmit again, fixed."},
            ]
    return None


async def classify(provider: LLMProvider, document: Artifact,
                   tally: UsageTally | None = None) -> tuple[str, float]:
    """Deterministic first; the model only decides what the heuristic could not."""
    verdict = classify_document(file_name=document.file_name or document.title,
                                text=document.content_md or "")
    if verdict.confidence >= CLASSIFY_ESCALATION_THRESHOLD:
        return verdict.doc_type, verdict.confidence

    prompt = (
        "Classify this document's purpose. Answer with one of: "
        f"{', '.join(DOC_TYPES)}.\n\nFile: {document.file_name or document.title}\n\n"
        f"{(document.content_md or '')[:4000]}"
    )
    guess = await _extract(provider, prompt, _DocType, "emit_doc_type", tally)
    if guess is None or guess.doc_type not in DOC_TYPES:
        return verdict.doc_type, verdict.confidence
    return guess.doc_type, min(0.9, max(guess.confidence, verdict.confidence))


async def analyse_document(
    db: AsyncSession, provider: LLMProvider, package: DocumentPackage, document: Artifact,
    tally: UsageTally | None = None,
) -> list[PackageFinding]:
    """Classify one document and extract its findings. Never raises: a document
    the model cannot read leaves the rest of the package analysed."""
    doc_type, confidence = await classify(provider, document, tally)
    document.doc_type = doc_type
    document.structured_json = {
        **(document.structured_json or {}),
        "classification_confidence": confidence,
    }

    sections = split_sections(document.content_md or "")[:MAX_SECTIONS_PER_DOCUMENT]

    async def read(section):
        prompt = (
            f"Document: {document.file_name or document.title} (type: {doc_type})\n"
            f"Section: {section.anchor}\n\n{section.text}"
        )
        return section, await _extract(provider, prompt, _Findings, "emit_findings", tally)

    # Sections do not depend on each other, so read them concurrently. Chained
    # sequentially, a seven-document package was up to 84 model calls behind one
    # HTTP request — minutes of work against a 230s gateway timeout.
    results = await asyncio.gather(*(read(s) for s in sections), return_exceptions=True)

    findings: list[PackageFinding] = []
    for result in results:
        if isinstance(result, BaseException):
            continue  # one unreadable section must not lose the others
        section, extracted = result
        if extracted is None:
            continue
        for raw in extracted.findings[:MAX_FINDINGS_PER_SECTION]:
            finding = _clean(raw)
            if finding is None:
                continue
            row = PackageFinding(
                package_id=package.id,
                document_id=document.id,
                kind=finding.kind,
                status=finding.status,
                title=finding.title.strip()[:300],
                detail=finding.detail,
                confidence=finding.confidence,
                anchor=section.anchor[:300],
                anchor_start=section.start,
                anchor_end=section.end,
                source_excerpt=section.text[:1000],
            )
            db.add(row)
            findings.append(row)
    return findings


async def analyse_package(
    db: AsyncSession, provider: LLMProvider, package: DocumentPackage,
    tally: UsageTally | None = None,
) -> list[PackageFinding]:
    """Analyse every readable document. Re-analysing replaces the previous
    findings for this package so a retry cannot double them (the epic's
    idempotency requirement applies to analysis too)."""
    existing = (
        await db.execute(select(PackageFinding).where(PackageFinding.package_id == package.id))
    ).scalars()
    for row in existing:
        await db.delete(row)

    package.status = "analysing"
    await db.flush()

    findings: list[PackageFinding] = []
    for document in await package_documents(db, package.id):
        if document.parse_state != "ok":
            continue  # nothing readable to analyse; the row already says why
        findings.extend(await analyse_document(db, provider, package, document, tally))

    package.status = "analysed"
    await db.flush()
    return findings


async def analyse_single_document(
    db: AsyncSession, provider: LLMProvider, package: DocumentPackage, document_id: str,
    tally: UsageTally | None = None,
) -> list[PackageFinding]:
    """Analyse one document, replacing only *its* findings.

    A whole package can be far more model work than one HTTP request survives —
    seven documents was up to 84 chained calls against a 230s gateway timeout, so
    it simply never returned. Driving a package a document at a time keeps every
    request bounded, gives real per-document progress, and lets one slow or
    unreadable document be retried on its own.
    """
    document = await db.get(Artifact, document_id)
    if document is None or document.package_id != package.id:
        raise LookupError("document not in this package")

    for row in (
        await db.execute(
            select(PackageFinding).where(
                PackageFinding.package_id == package.id,
                PackageFinding.document_id == document.id,
            )
        )
    ).scalars():
        await db.delete(row)
    await db.flush()

    if document.parse_state != "ok":
        return []  # nothing readable; the document row already says why

    package.status = "analysing"
    findings = await analyse_document(db, provider, package, document, tally)
    await db.flush()
    return findings


async def package_findings(db: AsyncSession, package_id: str) -> list[PackageFinding]:
    return list(
        (
            await db.execute(
                select(PackageFinding)
                .where(PackageFinding.package_id == package_id)
                .order_by(PackageFinding.kind, PackageFinding.title)
            )
        ).scalars()
    )
