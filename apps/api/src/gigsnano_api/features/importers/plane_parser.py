"""Pure parser for Plane's Settings→Exports issue format (CSV/JSON/XLSX, or a
zip bundling one-per-project member files). No DB, no I/O beyond bytes-in,
rows-out — kept separate from `service.py` so it's trivially unit-testable."""

import csv
import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from typing import Any

import openpyxl

from gigsnano_api.lib.zip_package import ZipPackageError, expand_zip, is_package_zip

# Plane's CSV/XLSX export delimits list-typed cells with a comma or semicolon.
_LIST_SPLIT_RE = re.compile(r"[;,]")


@dataclass
class PlaneIssueRow:
    project_identifier: str = ""
    project_name: str = ""
    identifier: str = ""
    name: str = ""
    state_name: str = ""
    priority: str = "none"
    assignees: list[str] = field(default_factory=list)
    created_by_name: str = ""
    subscribers: list[str] = field(default_factory=list)
    start_date: str = ""
    target_date: str = ""
    estimate: Any = None
    labels: list[str] = field(default_factory=list)
    cycles: list[str] = field(default_factory=list)
    modules: list[str] = field(default_factory=list)
    links: list[dict] = field(default_factory=list)
    relations: list[dict] = field(default_factory=list)
    comments: list[dict] = field(default_factory=list)
    parent: str = ""
    type: str = ""
    is_draft: bool = False
    sub_issues_count: int = 0


def _str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _split_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [_str(v) for v in value if _str(v)]
    text = _str(value)
    return [p.strip() for p in _LIST_SPLIT_RE.split(text) if p.strip()]


def _parse_json_ish(value: Any) -> list[dict]:
    """`links`/`relations`/`comments`: native list/dict (JSON files) or a
    JSON-encoded string inside a CSV/XLSX cell. Tolerant of garbage -> []."""
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return []
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
        return []
    return []


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return _str(value).lower() in ("1", "true", "yes", "y")


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _row_from_dict(d: dict) -> PlaneIssueRow:
    priority = _str(d.get("priority")).lower() or "none"
    return PlaneIssueRow(
        project_identifier=_str(d.get("project_identifier")),
        project_name=_str(d.get("project_name")),
        identifier=_str(d.get("identifier")),
        name=_str(d.get("name")),
        state_name=_str(d.get("state_name")),
        priority=priority,
        assignees=_split_list(d.get("assignees")),
        created_by_name=_str(d.get("created_by_name")),
        subscribers=_split_list(d.get("subscribers")),
        start_date=_str(d.get("start_date")),
        target_date=_str(d.get("target_date")),
        estimate=d.get("estimate"),
        labels=_split_list(d.get("labels")),
        cycles=_split_list(d.get("cycles")),
        modules=_split_list(d.get("modules")),
        links=_parse_json_ish(d.get("links")),
        relations=_parse_json_ish(d.get("relations")),
        comments=_parse_json_ish(d.get("comments")),
        parent=_str(d.get("parent")),
        type=_str(d.get("type")),
        is_draft=_bool(d.get("is_draft", False)),
        sub_issues_count=_int(d.get("sub_issues_count", 0)),
    )


def _parse_csv_bytes(raw: bytes) -> list[dict]:
    text = raw.decode("utf-8-sig", errors="replace")
    return [dict(row) for row in csv.DictReader(io.StringIO(text))]


def _parse_json_bytes(raw: bytes) -> list[dict]:
    data = json.loads(raw.decode("utf-8", errors="replace"))
    if isinstance(data, list):
        return data
    return [data] if isinstance(data, dict) else []


def _parse_xlsx_bytes(raw: bytes) -> list[dict]:
    workbook = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    header = next(rows_iter, None)
    if not header:
        return []
    columns = [_str(h) for h in header]
    out: list[dict] = []
    for values in rows_iter:
        out.append({columns[i]: values[i] for i in range(len(columns)) if i < len(values)})
    return out


_FORMAT_PARSERS = {
    "csv": _parse_csv_bytes,
    "json": _parse_json_bytes,
    "xlsx": _parse_xlsx_bytes,
}


def _ext_format(name: str) -> str | None:
    lower = name.lower()
    for fmt in ("csv", "json", "xlsx"):
        if lower.endswith(f".{fmt}"):
            return fmt
    return None


def parse_plane_export(raw: bytes, fmt: str) -> list[PlaneIssueRow]:
    """Parse a bare CSV/JSON/XLSX file, or a zip bundling multiple such files
    (Plane's own multi-project export). Unknown/unsupported input -> []."""
    if is_package_zip(raw):
        dict_rows: list[dict] = []
        try:
            entries = expand_zip(raw)
        except ZipPackageError:
            # An oversized or unreadable bundle is "nothing to import", not a crash.
            return []
        for entry in entries:
            member_fmt = _ext_format(entry.path)
            if member_fmt is None:
                continue
            dict_rows.extend(_FORMAT_PARSERS[member_fmt](entry.data))
        return [_row_from_dict(d) for d in dict_rows]

    parser = _FORMAT_PARSERS.get(fmt)
    if parser is None:
        return []
    try:
        dict_rows = parser(raw)
    except (json.JSONDecodeError, csv.Error, zipfile.BadZipFile, KeyError, ValueError):
        return []
    return [_row_from_dict(d) for d in dict_rows]
