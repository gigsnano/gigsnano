# Gantt view → Excel export (GIN-84)

Export a project's Work Items **Gantt** view to a `.xlsx` that preserves the
Gantt layout — a task table beside a timeline grid whose cells are filled across
each task's date span.

## Using it

1. Open a project → **Work Items** → switch the layout to **Gantt**.
2. Pick a zoom (Week / Month / Quarter) — the export axis matches it (days in
   Week, weeks in Month/Quarter).
3. Click **Export** (top-right of the Gantt, next to _Today_).
4. The browser downloads `gantt-view-YYYY-MM-DD.xlsx`.

The export mirrors exactly what's on screen:

- **Filter / sort** — the current Work Items filters and manual order are already
  applied to the rows the Gantt renders; the export uses that same set, in the
  same order. (The Gantt is a flat list, so there is no grouping to preserve.)
- **Zoom** — Week → per-day columns; Month/Quarter → per-week columns, with
  merged month bands across the top.

## What's in the file

| Left block (frozen) | Timeline grid |
|---|---|
| Code, Work item, Status, Priority, Assignee, Start, Target, Duration, Progress | One column per day/week, month bands on top, today highlighted, weekends shaded |

- **Bars** — each task's cells are filled from its start to its target date in its
  **status color** (To do / In progress / In review / Done).
- **Milestones** — a task with only one date renders as a single ◆ cell.
- **Progress** — derived from status (To do 0% · In progress 50% · In review 80%
  · Done 100%); there is no dedicated progress field on a work item.
- **Unscheduled** tasks (no dates) still appear as rows, with an empty timeline.

## Implementation

Client-side, no backend — the Gantt already computes the full layout in the
browser, so the export reads that exact data for maximum fidelity.

- `src/lib/gantt/gantt-export-model.ts` — pure builder: stories + zoom → column
  axis (reusing the Gantt's own date math) + per-task bar column indices.
  Unit-tested in `gantt-export-model.test.ts`.
- `src/lib/gantt/write-gantt-workbook.ts` — renders the model into a styled
  workbook via `exceljs` (dynamically imported, so it stays out of the initial
  bundle) and triggers the download.
- Wired into the Gantt header in
  `src/components/issues/views/issues-gantt-view.tsx`.

### Notes / limits

- The Gantt path is server-**paginated**, so the export covers the loaded page of
  the current filter — i.e. what the Gantt is showing. Exporting an entire large
  backlog in one file would be a follow-up (raise the page size or add an
  all-items server export).
- Bars are cell fills (not native Excel conditional formatting), so they render
  identically in Excel, LibreOffice, and Google Sheets.
