import io
import json
import zipfile

import openpyxl

from gigsnano_api.features.importers.plane_parser import parse_plane_export

CSV_TEXT = (
    "project_identifier,project_name,identifier,name,state_name,priority,"
    "assignees,subscribers,labels,cycles,modules,parent,links,relations,comments,"
    "is_draft,estimate\n"
    'WEB,Website,WEB-1,"Fix login bug",Todo,high,'
    '"Ada Lovelace, Grace Hopper",Ada Lovelace,"bug, urgent",Sprint 1,Auth,,'
    '"[{""url"": ""https://x.test"", ""title"": ""Ref""}]",'
    '"[{""type"": ""blocking"", ""issue"": ""WEB-2""}]",'
    '"[{""comment"": ""hi"", ""created_by"": ""Ada Lovelace"", ""created_at"": ""2026-01-01""}]",'
    "false,3\n"
    'WEB,Website,WEB-2,"Add signup flow",In Progress,medium,'
    '"Grace Hopper",,"","","",WEB-1,,,,'
    "false,\n"
)


def test_parse_csv_rows():
    rows = parse_plane_export(CSV_TEXT.encode("utf-8"), "csv")
    assert len(rows) == 2

    first = rows[0]
    assert first.project_identifier == "WEB"
    assert first.identifier == "WEB-1"
    assert first.name == "Fix login bug"
    assert first.priority == "high"
    assert first.assignees == ["Ada Lovelace", "Grace Hopper"]
    assert first.labels == ["bug", "urgent"]
    assert first.cycles == ["Sprint 1"]
    assert first.modules == ["Auth"]
    assert first.links == [{"url": "https://x.test", "title": "Ref"}]
    assert first.relations == [{"type": "blocking", "issue": "WEB-2"}]
    assert first.comments[0]["comment"] == "hi"
    assert first.is_draft is False
    assert first.estimate == "3"

    second = rows[1]
    assert second.parent == "WEB-1"
    assert second.labels == []
    assert second.links == []


def test_parse_json_rows_equivalent():
    payload = [
        {
            "project_identifier": "WEB",
            "project_name": "Website",
            "identifier": "WEB-1",
            "name": "Fix login bug",
            "state_name": "Todo",
            "priority": "high",
            "assignees": ["Ada Lovelace", "Grace Hopper"],
            "labels": ["bug", "urgent"],
            "cycles": ["Sprint 1"],
            "modules": ["Auth"],
            "links": [{"url": "https://x.test", "title": "Ref"}],
            "relations": [{"type": "blocking", "issue": "WEB-2"}],
            "comments": [
                {"comment": "hi", "created_by": "Ada Lovelace", "created_at": "2026-01-01"}
            ],
            "is_draft": False,
            "estimate": 3,
        },
        {
            "project_identifier": "WEB",
            "identifier": "WEB-2",
            "name": "Add signup flow",
            "state_name": "In Progress",
            "priority": "medium",
            "parent": "WEB-1",
        },
    ]
    rows = parse_plane_export(json.dumps(payload).encode("utf-8"), "json")
    assert len(rows) == 2
    assert rows[0].labels == ["bug", "urgent"]
    assert rows[0].links == [{"url": "https://x.test", "title": "Ref"}]
    assert rows[1].parent == "WEB-1"


def test_parse_zip_bundle_concatenates_member_projects():
    web_csv = (
        "project_identifier,project_name,identifier,name,state_name,priority\n"
        "WEB,Website,WEB-1,Fix login bug,Todo,high\n"
    )
    api_csv = (
        "project_identifier,project_name,identifier,name,state_name,priority\n"
        "API,Backend API,API-1,Add auth endpoint,Done,urgent\n"
        "API,Backend API,API-2,Rate limiting,Todo,low\n"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("web.csv", web_csv)
        zf.writestr("api.csv", api_csv)

    rows = parse_plane_export(buf.getvalue(), "csv")
    assert len(rows) == 3
    by_ident = {r.identifier: r for r in rows}
    assert by_ident["WEB-1"].project_identifier == "WEB"
    assert by_ident["API-1"].project_identifier == "API"
    assert by_ident["API-2"].project_identifier == "API"
    assert by_ident["API-1"].priority == "urgent"


def test_parse_tolerant_of_missing_and_unknown_columns():
    text = "identifier,name,made_up_column\nWEB-9,Something,whatever\n"
    rows = parse_plane_export(text.encode("utf-8"), "csv")
    assert len(rows) == 1
    row = rows[0]
    assert row.identifier == "WEB-9"
    assert row.project_identifier == ""
    assert row.labels == []
    assert row.assignees == []


def test_unsupported_format_returns_empty():
    assert parse_plane_export(b"whatever", "xml") == []


def test_parse_bare_xlsx_is_not_mistaken_for_a_zip_bundle():
    # xlsx is itself a zip container — must be parsed directly, not unbundled.
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["project_identifier", "identifier", "name", "priority"])
    ws.append(["WEB", "WEB-1", "Fix login bug", "high"])
    buf = io.BytesIO()
    wb.save(buf)

    rows = parse_plane_export(buf.getvalue(), "xlsx")
    assert len(rows) == 1
    assert rows[0].identifier == "WEB-1"
    assert rows[0].priority == "high"
