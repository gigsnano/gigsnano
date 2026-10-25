"""Guarded ZIP expansion for uploaded document packages (GIN-394).

The untrusted-input boundary of package ingest: a user-supplied archive is
expanded in memory, so every limit here is load-bearing. `importers/plane_parser`
previously expanded with an unbounded `zf.read(name)`; both call sites now share
these guards.

Pure: bytes in, entries out. No DB, no filesystem — a member name can never
escape anywhere because nothing is written to disk, but names are still reduced
to a safe relative path so downstream storage and display cannot be tricked.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

#: Per-package limits. Generous for a real delivery package, fatal to a bomb.
MAX_MEMBERS = 200
MAX_MEMBER_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 50 * 1024 * 1024


class ZipPackageError(ValueError):
    """The archive is unreadable or exceeds a package limit."""


@dataclass(frozen=True)
class ZipEntry:
    path: str  # safe relative path, folder structure preserved
    data: bytes


def _safe_path(name: str) -> str:
    """`../../etc/passwd` -> `etc/passwd`; drive letters and absolute roots dropped."""
    parts = [p for p in name.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    if parts and ":" in parts[0]:  # C:foo
        parts[0] = parts[0].split(":", 1)[1]
        parts = [p for p in parts if p]
    return "/".join(parts)


def is_package_zip(raw: bytes) -> bool:
    """True for an archive bundling documents. An OOXML file (.docx/.xlsx) is
    itself a zip and must NOT be expanded — it is a document, not a package."""
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        return False
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        return "[Content_Types].xml" not in zf.namelist()


def expand_zip(raw: bytes) -> list[ZipEntry]:
    """Expand an archive into its file members, enforcing every package limit.

    Nested archives are returned as bytes, never recursed — one level is what a
    delivery package needs, and recursion is how a bomb multiplies.
    """
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        raise ZipPackageError("Not a readable ZIP archive")

    entries: list[ZipEntry] = []
    total = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_MEMBERS:
            raise ZipPackageError(f"Archive has more than {MAX_MEMBERS} members")
        for info in infos:
            path = _safe_path(info.filename)
            base = path.rsplit("/", 1)[-1]
            if not path or path.startswith("__MACOSX/") or base.startswith("._"):
                continue
            if info.file_size > MAX_MEMBER_BYTES:
                raise ZipPackageError(f"{path} exceeds the per-file limit")
            # Read one byte past the cap rather than trusting the declared size —
            # the header is attacker-controlled and can understate the payload.
            with zf.open(info) as member:
                data = member.read(MAX_MEMBER_BYTES + 1)
            if len(data) > MAX_MEMBER_BYTES:
                raise ZipPackageError(f"{path} exceeds the per-file limit")
            total += len(data)
            if total > MAX_TOTAL_BYTES:
                raise ZipPackageError("Archive exceeds the total uncompressed limit")
            entries.append(ZipEntry(path=path, data=data))
    return entries
