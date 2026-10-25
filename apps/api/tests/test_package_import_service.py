"""GIN-394: one upload, many documents, per-file outcomes."""

import base64
import io
import zipfile

import pytest

from gigsnano_api.features.package_import.service import (
    MAX_PACKAGE_FILES,
    PackageTooLargeError,
    UploadFile,
    create_package,
    package_documents,
)


def _md(name: str, body: str) -> UploadFile:
    return UploadFile(file_name=name, mime_type="text/markdown", content=body)


def _zip_upload(members: dict[str, bytes], name: str = "package.zip") -> UploadFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for member, data in members.items():
            zf.writestr(member, data)
    encoded = base64.b64encode(buf.getvalue()).decode()
    return UploadFile(
        file_name=name,
        mime_type="application/zip",
        content=f"data:application/zip;base64,{encoded}",
    )


async def test_plain_files_become_documents_with_provenance(db_session, make_project):
    project = await make_project()
    package = await create_package(
        db_session,
        project=project,
        name="OnServe",
        files=[_md("brief.md", "# Brief"), _md("arch.md", "# Architecture")],
        user_id=None,
        user_name="Ada",
    )
    docs = await package_documents(db_session, package.id)
    assert {d.title for d in docs} == {"brief.md", "arch.md"}
    assert all(d.parse_state == "ok" for d in docs)
    assert all(d.checksum and d.byte_size for d in docs)
    assert package.created_by_name == "Ada"


async def test_zip_is_expanded_and_paths_preserved(db_session, make_project):
    project = await make_project()
    package = await create_package(
        db_session,
        project=project,
        name="Zipped",
        files=[_zip_upload({"docs/a.md": b"# A", "docs/phases/b.md": b"# B"})],
    )
    docs = await package_documents(db_session, package.id)
    assert sorted(d.original_path for d in docs) == ["docs/a.md", "docs/phases/b.md"]


async def test_duplicate_content_is_flagged_not_stored_twice_as_ok(db_session, make_project):
    project = await make_project()
    package = await create_package(
        db_session,
        project=project,
        name="Dupes",
        files=[_md("a.md", "# Same"), _md("copy-of-a.md", "# Same")],
    )
    states = sorted(d.parse_state for d in await package_documents(db_session, package.id))
    assert states == ["duplicate", "ok"]


async def test_unextractable_file_is_a_row_level_failure_not_an_upload_failure(
    db_session, make_project
):
    project = await make_project()
    # Real PDF magic with a corrupt body — MarkItDown reads loose text happily, so
    # this is what an extraction failure actually looks like in practice.
    corrupt_pdf = base64.b64encode(b"%PDF-1.4\n" + b"\x00\xff" * 200).decode()
    package = await create_package(
        db_session,
        project=project,
        name="Mixed",
        files=[
            _md("good.md", "# Good"),
            UploadFile(
                file_name="broken.pdf",
                mime_type="application/pdf",
                content=f"data:application/pdf;base64,{corrupt_pdf}",
            ),
            UploadFile(file_name="blank.pdf", mime_type="application/pdf", content=""),
        ],
    )
    docs = {d.title: d for d in await package_documents(db_session, package.id)}
    assert docs["good.md"].parse_state == "ok"
    assert docs["broken.pdf"].parse_state == "unsupported"
    assert docs["broken.pdf"].parse_error
    assert docs["blank.pdf"].parse_state == "empty"


async def test_too_many_files_is_rejected_whole(db_session, make_project):
    project = await make_project()
    with pytest.raises(PackageTooLargeError):
        await create_package(
            db_session,
            project=project,
            name="Too many",
            files=[_md(f"f{i}.md", "# x") for i in range(MAX_PACKAGE_FILES + 1)],
        )
