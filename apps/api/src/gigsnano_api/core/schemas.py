from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator


def _normalize_email(value: str) -> str:
    """Validate email format, permitting RFC-6761 reserved TLDs (.test/.localhost).

    `test_environment=True` lets the app accept the reserved test-domain addresses the
    test suite and local fixtures use, while still rejecting genuinely malformed input.
    DNS deliverability checks are skipped (offline-safe).
    """
    try:
        result = validate_email(value, check_deliverability=False, test_environment=True)
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc
    return result.normalized


Email = Annotated[str, AfterValidator(_normalize_email)]
