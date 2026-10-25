"""Shared model helpers and Base re-exports.

Every model module imports `_values`, `Base`, and `TimestampedBase` from here so
the split modules never reach back into the old God-file.
"""
import enum

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

from gigsnano_api.core.db import Base, TimestampedBase

__all__ = ["Base", "JSON_DOC", "TimestampedBase", "_values"]


def _values(e: type[enum.Enum]) -> list[str]:
    """values_callable for SQLAlchemy Enum: serialize by `.value`, not `.name`."""
    return [m.value for m in e]


#: A JSON document column: real `jsonb` on Postgres, plain `JSON` everywhere else.
#:
#: The variant matters because the test suite runs on SQLite, whose compiler has
#: no `visit_JSONB` — declaring bare JSONB makes every table using it fail to
#: create under test while working fine in production.
#:
#: `none_as_null=True` matters more. By default SQLAlchemy stores Python `None`
#: into a JSON column as the JSON value `null`, not as SQL NULL. The two are
#: indistinguishable when you read the row back, and completely different to a
#: query: `col IS NOT NULL` is *true* for a JSON null. That silently broke two
#: things at once — coverage counted un-canonicalised rows as covered, and the
#: backfill's `WHERE col IS NULL` skipped them forever.
JSON_DOC = JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")
