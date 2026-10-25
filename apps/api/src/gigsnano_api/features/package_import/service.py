"""Ingest an external document package (GIN-394).

One upload becomes one `DocumentPackage` plus an `Artifact` per document. A file
that cannot be read is a row-level outcome, never a failed upload — the wizard
shows "7 ready · 1 needs attention", which is only possible if the package still
lands. Package-level caps are the exception: a half-accepted package is not
something a caller can act on, so those reject the request whole.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.lib.document_text import (
    MAX_ATTACHMENT_BYTES,
    attachment_to_llm_text,
    decode_attachment_bytes,
)
from gigsnano_api.lib.zip_package import ZipPackageError, expand_zip, is_package_zip
from gigsnano_api.models.artifacts import Artifact, EArtifactStatus
from gigsnano_api.models.packages import DocumentPackage

MAX_PACKAGE_FILES = 200
MAX_PACKAGE_BYTES = 50 * 1024 * 1024


class PackageTooLargeError(ValueError):
    """The package as a whole exceeds a limit — nothing is stored."""


@dataclass(frozen=True)
class UploadFile:
    file_name: str
    mime_type: str
    content: str  # text, or a base64 `data:` URL for binary


@dataclass
class _Candidate:
    """One document to store: already expanded out of any archive."""

    path: str
    file_name: str
    mime_type: str
    content: str
    raw: bytes


def _basename(name: str) -> str:
    return name.replace("\\", "/").rsplit("/", 1)[-1] or name


def _expand(files: list[UploadFile]) -> list[_Candidate]:
    """Flatten uploads, expanding any package ZIP into its members."""
    out: list[_Candidate] = []
    for upload in files:
        try:
            raw = decode_attachment_bytes(upload.content)
        except ValueError:
            raw = upload.content.encode("utf-8", "replace")
        if is_package_zip(raw):
            for entry in expand_zip(raw):
                out.append(
                    _Candidate(
                        path=entry.path,
                        file_name=_basename(entry.path),
                        mime_type="",  # inferred from the extension downstream
                        content=entry.data.decode("utf-8", "replace"),
                        raw=entry.data,
                    )
                )
            continue
        out.append(
            _Candidate(
                path=upload.file_name,
                file_name=_basename(upload.file_name),
                mime_type=upload.mime_type,
                content=upload.content,
                raw=raw,
            )
        )
    return out


def _extract(candidate: _Candidate) -> tuple[str, str, str]:
    """-> (content_md, parse_state, parse_error). Never raises."""
    if len(candidate.raw) > MAX_ATTACHMENT_BYTES:
        return "", "too_large", "File exceeds the 10 MB limit"
    if not candidate.raw.strip():
        return "", "empty", "The file was empty"
    try:
        text = attachment_to_llm_text(
            file_name=candidate.file_name,
            mime_type=candidate.mime_type,
            content=candidate.content,
        )
    except Exception as exc:  # noqa: BLE001 — every extraction failure is a row outcome
        message = str(exc) or "Could not extract text from this file"
        state = "encrypted" if "password" in message.lower() else "unsupported"
        return "", state, message[:300]
    if not text.strip():
        return "", "empty", "The file contained no readable text"
    return text.strip(), "ok", ""


async def create_package(
    db: AsyncSession,
    *,
    project,
    name: str,
    files: list[UploadFile],
    user_id: str | None = None,
    user_name: str = "",
) -> DocumentPackage:
    try:
        candidates = _expand(files)
    except ZipPackageError as exc:
        raise PackageTooLargeError(str(exc)) from exc
    if len(candidates) > MAX_PACKAGE_FILES:
        raise PackageTooLargeError(f"A package may contain at most {MAX_PACKAGE_FILES} files")
    if sum(len(c.raw) for c in candidates) > MAX_PACKAGE_BYTES:
        raise PackageTooLargeError("The package exceeds the total size limit")

    package = DocumentPackage(
        project_id=project.id, name=name, created_by_id=user_id, created_by_name=user_name
    )
    db.add(package)
    await db.flush()

    seen: set[str] = set()
    for candidate in candidates:
        checksum = hashlib.sha256(candidate.raw).hexdigest()
        content_md, state, error = _extract(candidate)
        if checksum in seen:
            state = "duplicate"
            error = "Same content as another file in this package"
        seen.add(checksum)
        db.add(
            Artifact(
                project_id=project.id,
                doc_type="other",
                title=candidate.file_name[:200],
                content_md=content_md,
                status=EArtifactStatus.FINAL,
                file_name=candidate.file_name[:300],
                mime_type=candidate.mime_type[:120] or None,
                package_id=package.id,
                uploaded_by_id=user_id,
                parse_state=state,
                parse_error=error[:300] or None,
                byte_size=len(candidate.raw),
                checksum=checksum,
                original_path=candidate.path[:500],
            )
        )
    await db.flush()
    return package


async def package_documents(db: AsyncSession, package_id: str) -> list[Artifact]:
    return list(
        (
            await db.execute(
                select(Artifact).where(Artifact.package_id == package_id).order_by(Artifact.title)
            )
        ).scalars()
    )
