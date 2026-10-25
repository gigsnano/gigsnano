import io

from openpyxl import Workbook

from gigsnano_api.features.work_item_io.columns import COLUMNS, SHEET_NAME, Column

# Column-key -> example value. Blank Code so the example imports as *new* items;
# the child's Parent references the epic by its Title (within-file match).
_EPIC = {"title": "Checkout revamp", "type": "Epic", "status": "Todo", "priority": "High"}
_STORY = {
    "title": "Add payment method",
    "type": "Story",
    "parent": "Checkout revamp",
    "status": "Todo",
    "priority": "Medium",
    "estimate": "3",
}


def _row(values: dict, columns: list[Column]) -> list[str]:
    return [values.get(c.key, "") for c in columns]


def build_template(columns: list[Column] | None = None) -> bytes:
    cols = columns or COLUMNS
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_NAME
    ws.append([c.header for c in cols])
    ws.append(_row(_EPIC, cols))
    ws.append(_row(_STORY, cols))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
