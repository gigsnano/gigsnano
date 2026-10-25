"""GIN-394: the ZIP expander is the untrusted-input boundary of package ingest."""

import io
import zipfile

import pytest

from gigsnano_api.lib.zip_package import (
    MAX_MEMBERS,
    ZipPackageError,
    expand_zip,
    is_package_zip,
)


def _zip(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_expands_members_and_preserves_relative_paths():
    raw = _zip({"docs/a.md": b"# A", "docs/phases/b.md": b"# B"})
    entries = expand_zip(raw)
    assert [e.path for e in entries] == ["docs/a.md", "docs/phases/b.md"]
    assert entries[0].data == b"# A"


def test_directories_and_macos_metadata_are_skipped():
    raw = _zip({"docs/": b"", "__MACOSX/._a.md": b"junk", "docs/a.md": b"# A"})
    assert [e.path for e in expand_zip(raw)] == ["docs/a.md"]


def test_traversal_member_name_is_reduced_to_a_safe_path():
    raw = _zip({"../../etc/passwd": b"root"})
    assert [e.path for e in expand_zip(raw)] == ["etc/passwd"]


def test_zip_bomb_is_rejected_by_the_total_cap():
    raw = _zip({f"big{i}.txt": b"0" * 2_000_000 for i in range(40)})  # 80 MB inflated
    with pytest.raises(ZipPackageError, match="uncompressed"):
        expand_zip(raw)


def test_member_count_cap_is_enforced():
    raw = _zip({f"f{i}.md": b"x" for i in range(MAX_MEMBERS + 1)})
    with pytest.raises(ZipPackageError, match="members"):
        expand_zip(raw)


def test_nested_zip_is_returned_as_bytes_not_recursed():
    inner = _zip({"a.md": b"# A"})
    entries = expand_zip(_zip({"inner.zip": inner}))
    assert [e.path for e in entries] == ["inner.zip"]


def test_non_zip_bytes_are_rejected():
    with pytest.raises(ZipPackageError):
        expand_zip(b"not a zip at all")


def test_ooxml_container_is_not_a_package_zip():
    docx = _zip({"[Content_Types].xml": b"<xml/>", "word/document.xml": b"<w/>"})
    assert is_package_zip(docx) is False
    assert is_package_zip(_zip({"a.md": b"# A"})) is True
