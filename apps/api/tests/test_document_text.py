import base64

import pytest

from gigsnano_api.lib.document_text import (
    AttachmentDecodeError,
    AttachmentTooLargeError,
    ImageSignatureError,
    UnsupportedImageTypeError,
    attachment_to_llm_text,
    binary_file_extension,
    decode_attachment_bytes,
    extract_pdf_markdown,
    is_image_attachment,
    is_pdf,
    validate_image_attachment,
)
from tests.fixtures.pdf_samples import SAMPLE_PDF

# 1x1 raster fixtures (valid signatures).
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
_GIF_1x1 = base64.b64decode("R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=")


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def test_is_pdf_by_mime_and_extension():
    assert is_pdf(file_name="spec.pdf", mime_type="application/pdf")
    assert not is_pdf(file_name="notes.md", mime_type="text/markdown")


def test_binary_file_extension_docx():
    assert (
        binary_file_extension(
            file_name="Smart-ticketing-v3_1.docx",
            mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        == ".docx"
    )


def _minimal_docx(paragraph: str) -> bytes:
    """A real (tiny) .docx: the three parts Word needs, built in memory."""
    import io
    import zipfile

    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body><w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p></w:body></w:document>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
    return buf.getvalue()


def test_attachment_to_llm_text_docx_not_data_url():
    raw = _minimal_docx(
        "Smart ticketing requirements: riders buy, store and validate tickets on their phone, "
        "conductors scan them offline, and operators see sales in near real time."
    )
    encoded = base64.b64encode(raw).decode("ascii")
    text = attachment_to_llm_text(
        file_name="Smart-ticketing-v3_1.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content=f"data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,{encoded}",
    )
    assert "data:application/" not in text
    assert len(text) > 100
    assert "ticketing" in text.lower()


def test_decode_plain_text_passthrough():
    assert decode_attachment_bytes("hello") == b"hello"


def test_decode_data_url():
    raw = b"pdf-bytes"
    encoded = base64.b64encode(raw).decode("ascii")
    content = f"data:application/pdf;base64,{encoded}"
    assert decode_attachment_bytes(content) == raw


def test_decode_rejects_oversize():
    big = "a" * (10 * 1024 * 1024 + 1)
    with pytest.raises(AttachmentTooLargeError):
        decode_attachment_bytes(big)


def test_extract_pdf_markdown_from_bytes():
    text = extract_pdf_markdown(SAMPLE_PDF)
    assert "requirements" in text.lower() or "hello" in text.lower()


def test_attachment_to_llm_text_pdf_data_url():
    encoded = base64.b64encode(SAMPLE_PDF).decode("ascii")
    text = attachment_to_llm_text(
        file_name="requirements.pdf",
        mime_type="application/pdf",
        content=f"data:application/pdf;base64,{encoded}",
    )
    assert "requirements" in text.lower() or "hello" in text.lower()


def test_is_image_attachment_by_mime_and_extension():
    assert is_image_attachment(file_name="s.png", mime_type="image/png")
    assert is_image_attachment(file_name="s.PNG", mime_type="application/octet-stream")
    assert not is_image_attachment(file_name="spec.pdf", mime_type="application/pdf")


def test_validate_image_accepts_png_raw_and_data_url():
    validate_image_attachment(file_name="s.png", mime_type="image/png", content=_b64(_PNG_1x1))
    validate_image_attachment(
        file_name="s.png",
        mime_type="image/png",
        content=f"data:image/png;base64,{_b64(_PNG_1x1)}",
    )


def test_validate_image_accepts_gif():
    validate_image_attachment(file_name="s.gif", mime_type="image/gif", content=_b64(_GIF_1x1))


def test_validate_image_rejects_svg():
    with pytest.raises(UnsupportedImageTypeError):
        validate_image_attachment(
            file_name="x.svg", mime_type="image/svg+xml", content=_b64(b"<svg/>")
        )


def test_validate_image_rejects_unsupported_type():
    with pytest.raises(UnsupportedImageTypeError):
        validate_image_attachment(
            file_name="x.bmp", mime_type="image/bmp", content=_b64(b"BM....")
        )


def test_validate_image_rejects_renamed_executable():
    # A Windows PE ("MZ...") renamed to .png must be caught by magic bytes.
    with pytest.raises(ImageSignatureError):
        validate_image_attachment(
            file_name="evil.png", mime_type="image/png", content=_b64(b"MZ\x90\x00" + b"\x00" * 32)
        )


def test_validate_image_rejects_mime_signature_mismatch():
    # Real PNG bytes declared as JPEG.
    with pytest.raises(ImageSignatureError):
        validate_image_attachment(
            file_name="s.jpg", mime_type="image/jpeg", content=_b64(_PNG_1x1)
        )


def test_validate_image_rejects_bad_base64():
    with pytest.raises(AttachmentDecodeError):
        validate_image_attachment(file_name="s.png", mime_type="image/png", content="not@base64!")


def test_validate_image_rejects_oversize():
    huge = "A" * (10 * 1024 * 1024 * 2 + 4)
    with pytest.raises(AttachmentTooLargeError):
        validate_image_attachment(file_name="s.png", mime_type="image/png", content=huge)


def test_attachment_to_llm_text_plain_markdown_unchanged():
    md = "# Title\n\nBody"
    assert (
        attachment_to_llm_text(
            file_name="brief.md",
            mime_type="text/markdown",
            content=md,
        )
        == md
    )
