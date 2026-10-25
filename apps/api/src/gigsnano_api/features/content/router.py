"""Stateless canonical-content conversion for the editor's Markdown source mode
(GIN-307). Both endpoints are pure functions of their body; they reuse the single
canonical converter in gigsnano_api.content (ADR 0001) so no second serializer exists.
Frontend contract: src/types/content/source-mode.ts + src/services/content.service.ts."""

from fastapi import APIRouter, Depends

from gigsnano_api.auth.deps import get_current_user

from .schemas import FromMarkdownIn, FromMarkdownOut, ToMarkdownIn, ToMarkdownOut
from .service import from_markdown, to_markdown

router = APIRouter(prefix="/content", tags=["content"])


# Trailing slashes match the app-wide FastAPI convention: the frontend /api proxy
# (upstreamApiPath in apps/web/src/lib/api-proxy.ts) appends a slash to every
# forwarded path, so slashless routes 307-redirect and the proxy's fetch of that
# internal redirect fails with a 502. Keep the slash.
@router.post("/to-markdown/", response_model=ToMarkdownOut)
def to_markdown_endpoint(body: ToMarkdownIn, _user=Depends(get_current_user)) -> ToMarkdownOut:
    return to_markdown(body.json)


@router.post("/from-markdown/", response_model=FromMarkdownOut)
def from_markdown_endpoint(body: FromMarkdownIn, _user=Depends(get_current_user)) -> FromMarkdownOut:
    return from_markdown(body.markdown)
