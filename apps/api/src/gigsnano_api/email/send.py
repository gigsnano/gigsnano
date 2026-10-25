"""Best-effort background email send. NEVER raises — logs failures."""

import logging

from gigsnano_api.email.provider import EmailProvider

logger = logging.getLogger("gigsnano.email")


async def send_email_in_background(
    provider: EmailProvider, to: str, subject: str, html: str
) -> None:
    try:
        await provider.send(to, subject, html)
    except Exception as err:  # noqa: BLE001 — email failure must not break the request
        logger.error(
            "email send failed to=%s subject=%r err=%s", to, subject, err, exc_info=True
        )
