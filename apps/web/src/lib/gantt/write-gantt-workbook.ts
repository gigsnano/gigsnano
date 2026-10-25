import { triggerDownload } from "@/lib/download/trigger-download";
import type { IGanttExportModel, IGanttExportRow } from "./gantt-export-model";

/**
 * Renders a Gantt export-model into a styled .xlsx that mirrors the on-screen
 * chart: a left block of task metadata (frozen) beside a timeline grid whose
 * cells are filled across each task's date span (status-colored bars, single
 * cells for milestones), with merged month bands over the day/week axis (GIN-84).
 *
 * exceljs is ~1MB, so it is imported dynamically — the cost is paid only when a
 * user actually exports, never in the initial bundle.
 */

interface IMetaCol {
  header: string;
  width: number;
  value: (row: IGanttExportRow) => string | number;
}

const META_COLS: IMetaCol[] = [
  { header: "Code", width: 12, value: (r) => r.code },
  { header: "Work item", width: 40, value: (r) => r.title },
  { header: "Status", width: 14, value: (r) => r.status },
  { header: "Priority", width: 10, value: (r) => r.priority },
  { header: "Assignee", width: 18, value: (r) => r.assignee },
  { header: "Start", width: 12, value: (r) => r.startDate },
  { header: "Target", width: 12, value: (r) => r.targetDate },
  { header: "Duration", width: 10, value: (r) => (r.durationDays != null ? `${r.durationDays}d` : "") },
  { header: "Progress", width: 10, value: (r) => (r.barStartIndex != null ? `${r.progressPct}%` : "") },
];

const HEADER_FILL = "FFF1F5F9"; // slate-100
const MONTH_FILL = "FFE2E8F0"; // slate-200
const WEEKEND_FILL = "FFF8FAFC"; // slate-50
const TODAY_FILL = "FF6366F1"; // indigo-500
const MILESTONE_TEXT = "FF0F172A"; // slate-900

function solid(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

/** Build the workbook buffer for the given model. Exposed for tests/reuse. */
export async function buildGanttWorkbook(
  model: IGanttExportModel,
  title: string,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const metaCount = META_COLS.length;
  const ws = wb.addWorksheet("Gantt", {
    views: [{ state: "frozen", xSplit: metaCount, ySplit: 2 }],
  });

  ws.columns = [
    ...META_COLS.map((c) => ({ width: c.width })),
    ...model.columns.map(() => ({ width: model.granularity === "day" ? 3.5 : 5 })),
  ];

  // Row 1 — title over the meta block, month bands over the timeline.
  ws.mergeCells(1, 1, 1, metaCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true };
  titleCell.alignment = { vertical: "middle" };

  let cursor = metaCount + 1;
  for (const g of model.monthGroups) {
    const from = cursor;
    const to = cursor + g.span - 1;
    if (g.span > 1) ws.mergeCells(1, from, 1, to);
    const cell = ws.getCell(1, from);
    cell.value = g.label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = solid(MONTH_FILL);
    cursor = to + 1;
  }

  // Row 2 — meta headers + per-column day/week labels.
  META_COLS.forEach((c, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 11 };
    cell.fill = solid(HEADER_FILL);
    cell.alignment = { vertical: "middle" };
  });
  model.columns.forEach((col, i) => {
    const cell = ws.getCell(2, metaCount + 1 + i);
    cell.value = col.label;
    cell.font = { size: 9, color: { argb: col.isToday ? "FFFFFFFF" : "FF64748B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = solid(col.isToday ? TODAY_FILL : col.isWeekend ? WEEKEND_FILL : HEADER_FILL);
  });

  // Data rows.
  model.rows.forEach((row, i) => {
    const r = 3 + i;
    META_COLS.forEach((c, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = c.value(row);
      cell.alignment = { vertical: "middle", wrapText: false };
    });

    // Faint weekend shading across the whole row (day granularity only).
    if (model.granularity === "day") {
      model.columns.forEach((col, ci) => {
        if (col.isWeekend) ws.getCell(r, metaCount + 1 + ci).fill = solid(WEEKEND_FILL);
      });
    }

    // The bar: fill each column the task spans with its status color.
    if (row.barStartIndex != null && row.barEndIndex != null) {
      for (let ci = row.barStartIndex; ci <= row.barEndIndex; ci++) {
        ws.getCell(r, metaCount + 1 + ci).fill = solid(row.statusArgb);
      }
      if (row.isMilestone) {
        const cell = ws.getCell(r, metaCount + 1 + row.barStartIndex);
        cell.value = "◆";
        cell.font = { bold: true, size: 9, color: { argb: MILESTONE_TEXT } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
  });

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 18;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: metaCount } };

  return wb.xlsx.writeBuffer();
}

/** Build the Gantt workbook and trigger a browser download. */
export async function downloadGanttWorkbook(
  model: IGanttExportModel,
  opts: { title: string; date: string },
): Promise<void> {
  const buffer = await buildGanttWorkbook(model, opts.title);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `gantt-view-${opts.date}.xlsx`);
  // Give the anchor click a tick to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
