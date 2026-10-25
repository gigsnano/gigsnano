import csv
import io

from openpyxl import Workbook

from gigsnano_api.features.work_item_io.columns import COLUMNS, SHEET_NAME, Column, RenderCtx
from gigsnano_api.models import Story


def _cols(keys: list[str], columns: list[Column]) -> list[Column]:
    wanted = set(keys)
    return [c for c in columns if c.key in wanted]


def render_xlsx(
    stories: list[Story], keys: list[str], ctx: RenderCtx, columns: list[Column] | None = None,
) -> bytes:
    cols = _cols(keys, columns or COLUMNS)
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_NAME
    ws.append([c.header for c in cols])
    for s in stories:
        ws.append([c.export(s, ctx) for c in cols])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_csv(
    stories: list[Story], keys: list[str], ctx: RenderCtx, columns: list[Column] | None = None,
) -> str:
    cols = _cols(keys, columns or COLUMNS)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c.header for c in cols])
    for s in stories:
        w.writerow([c.export(s, ctx) for c in cols])
    return buf.getvalue()
