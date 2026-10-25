"""Convert uploaded attachment payloads into LLM-readable text."""

from __future__ import annotations

import base64
import binascii
import re
from io import BytesIO

from fastapi import HTTPException, status
from markitdown import MarkItDown

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
# `(.*)` not `(.+)`: an empty payload is still a data URL. With `(.+)` a bare
# `data:application/pdf;base64,` failed to match and fell through to the "plain
# text" branch, so an empty upload was stored with the base64 header *as its body*.
# The media type is matched as "anything up to the comma", which also tolerates a
# parameterised type (`text/plain;charset=utf-8;base64,...`).
_DATA_URL_RE = re.compile(r"^data:[^,]+;base64,(.*)$", re.DOTALL)

# Extensions routed through MarkItDown (must match optional deps in pyproject.toml).
_BINARY_EXTENSIONS: dict[str, frozenset[str]] = {
    ".pdf": frozenset({"application/pdf"}),
    ".docx": frozenset(
        {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        }
    ),
}

_converter: MarkItDown | None = None


class AttachmentTooLargeError(ValueError):
    pass


class AttachmentDecodeError(ValueError):
    pass


class DocumentExtractionError(ValueError):
    pass


class UnsupportedImageTypeError(ValueError):
    pass


class ImageSignatureError(ValueError):
    pass


# Raster image attachments (GIN-310). SVG is deliberately excluded — served
# same-origin it is an XSS vector (see features/images/router.py). We validate
# magic bytes, not the declared MIME/extension, so a renamed executable is caught.
# ponytail: 10 MB shared with MAX_ATTACHMENT_BYTES; make it env-configurable if a
# tenant needs a different ceiling.
ALLOWED_IMAGE_MIME = frozenset({"image/png", "image/jpeg", "image/webp", "image/gif"})
_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})


def is_image_attachment(*, file_name: str, mime_type: str) -> bool:
    if mime_type.lower().strip().startswith("image/"):
        return True
    return any(file_name.lower().endswith(ext) for ext in _IMAGE_EXTENSIONS)


def _decode_image_base64(content: str) -> bytes:
    """Base64 (raw or `data:` URL) → bytes, size-capped. Unlike
    decode_attachment_bytes, raw base64 is decoded rather than kept as text."""
    s = content.strip()
    match = _DATA_URL_RE.match(s)
    if match:
        s = match.group(1)
    # base64 is ~1.33x the bytes; reject obvious oversize before decoding.
    if len(s) > MAX_ATTACHMENT_BYTES * 2:
        raise AttachmentTooLargeError("Image exceeds 10 MB limit")
    try:
        data = base64.b64decode(s, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise AttachmentDecodeError("Invalid base64 image content") from exc
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise AttachmentTooLargeError("Image exceeds 10 MB limit")
    return data


def _sniff_image_mime(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_image_attachment(*, file_name: str, mime_type: str, content: str) -> None:
    """Reject anything that is not a genuine PNG/JPEG/WebP/GIF whose signature
    matches the declared type. Raises typed errors mapped by attachment_http_error."""
    declared = mime_type.lower().strip()
    if declared == "image/jpg":
        declared = "image/jpeg"
    if declared == "image/svg+xml" or file_name.lower().endswith(".svg"):
        raise UnsupportedImageTypeError("SVG images are not supported.")
    if declared not in ALLOWED_IMAGE_MIME:
        raise UnsupportedImageTypeError(f"Unsupported image type: {mime_type}")
    data = _decode_image_base64(content)
    if not data:
        raise AttachmentDecodeError("Empty image content")
    sniffed = _sniff_image_mime(data)
    if sniffed is None:
        raise ImageSignatureError("File is not a valid PNG, JPEG, WebP, or GIF image.")
    if sniffed != declared:
        raise ImageSignatureError(
            f"Declared type {mime_type} does not match the actual image content ({sniffed})."
        )


def is_pdf(*, file_name: str, mime_type: str) -> bool:
    return binary_file_extension(file_name=file_name, mime_type=mime_type) == ".pdf"


def binary_file_extension(*, file_name: str, mime_type: str) -> str | None:
    lower_name = file_name.lower()
    for ext in _BINARY_EXTENSIONS:
        if lower_name.endswith(ext):
            return ext
    for ext, mime_types in _BINARY_EXTENSIONS.items():
        if mime_type in mime_types:
            return ext
    return None


def decode_attachment_bytes(content: str) -> bytes:
    if len(content.encode("utf-8")) > MAX_ATTACHMENT_BYTES:
        raise AttachmentTooLargeError("Attachment exceeds 10 MB limit")
    match = _DATA_URL_RE.match(content.strip())
    if match:
        try:
            data = base64.b64decode(match.group(1), validate=True)
        except (ValueError, binascii.Error) as exc:
            raise AttachmentDecodeError("Invalid attachment encoding") from exc
        if len(data) > MAX_ATTACHMENT_BYTES:
            raise AttachmentTooLargeError("Attachment exceeds 10 MB limit")
        return data
    return content.encode("utf-8")


def _get_converter() -> MarkItDown:
    global _converter
    if _converter is None:
        _converter = MarkItDown()
    return _converter


def extract_binary_markdown(data: bytes, *, file_extension: str) -> str:
    if not data:
        raise DocumentExtractionError(f"Could not extract text from this {file_extension} file")
    try:
        result = _get_converter().convert_stream(BytesIO(data), file_extension=file_extension)
    except Exception as exc:
        raise DocumentExtractionError("Document conversion failed") from exc
    text = (result.text_content or "").strip()
    if not text:
        raise DocumentExtractionError(f"Could not extract text from this {file_extension} file")
    return text


def extract_pdf_markdown(data: bytes) -> str:
    return extract_binary_markdown(data, file_extension=".pdf")


def attachment_to_llm_text(*, file_name: str, mime_type: str, content: str) -> str:
    ext = binary_file_extension(file_name=file_name, mime_type=mime_type)
    if ext is not None:
        return extract_binary_markdown(decode_attachment_bytes(content), file_extension=ext)
    return content


def attachment_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, AttachmentTooLargeError):
        return HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc))
    if isinstance(exc, UnsupportedImageTypeError):
        return HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc))
    if isinstance(exc, (AttachmentDecodeError, ImageSignatureError, DocumentExtractionError)):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Document conversion failed")
