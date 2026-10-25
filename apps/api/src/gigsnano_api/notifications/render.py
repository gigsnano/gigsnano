"""Template rendering for notification copy."""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import NotificationTemplate

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")


def render_template(title_tpl: str, body_tpl: str, context: dict[str, str]) -> tuple[str, str]:
    """Replace `{key}` with context[key] or '' if missing. No HTML/eval."""

    def replace(text: str) -> str:
        return _PLACEHOLDER_RE.sub(lambda m: context.get(m.group(1), ""), text)

    return replace(title_tpl), replace(body_tpl)


def unknown_placeholders(text: str, allowed: list[str]) -> list[str]:
    """Return sorted unique placeholder names in text that are not in allowed."""
    allowed_set = set(allowed)
    return sorted({m for m in _PLACEHOLDER_RE.findall(text) if m not in allowed_set})


async def get_template_by_key(db: AsyncSession, trigger_key: str) -> NotificationTemplate | None:
    return (
        await db.execute(
            select(NotificationTemplate).where(NotificationTemplate.trigger_key == trigger_key)
        )
    ).scalar_one_or_none()
