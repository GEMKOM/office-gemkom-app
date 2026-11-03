# Plan sheet ("Plan ve Sapmalar")

The React plan sheet, shared by the stand-alone page
(`src/pages/projects/plan-sheet/`, `/projects/plan-sheet/?share=` and
`?job_no=`) and project tracking's meeting slide. Ported from
`projects/project-tracking/{planSheet,planSheetText,sheetLang,heroChain}.js`
and the parts of `planning/project-planning/grid.js` the sheet uses. Import
from `@/features/plan-sheet` (index.ts).

## Components

| Component | What it draws | Legacy |
|---|---|---|
| `<SheetGrid>` | The sheet: frozen columns + timeline, job rows with their tasks, plan bars, projection tails, termin line and gap pill, today line, fold per job and all, zoom (Ctrl/⌘ + wheel too), grip to widen the columns, click a name to scroll to its bar. With `onEdit` + `overrides` every cell is editable (editable share links). | `renderPlanSheet()` + `SheetGrid`/`PlanningGrid` |
| `<PlanSheetHero>` | The hero card: job number, name, customer, left border by theme. Takes the chain as `chain` and an optional `progress` row (the meeting slide's bar). | `.pp-hero-ps` markup |
| `<HeroChain>` | Başlangıç → Termin → Plan bitişi → Öngörülen with the working-day pills and the termin bracket. `pending` shows "…". | `heroChainHtml()` |
| `<SheetLegend>` / `<SheetSummaryChips>` | The legend (plan, geride, öngörülen uzama, termin, bugün) and the summary chips. | `.pp-sheet-legend`, `summaryChips()` |
| `<StatusCell>` | A task status as a StatusBadge, in the sheet's language. | `statusBadge()` |

`SheetGrid` is controlled for what the slide keeps across slides: `collapsed` /
`onCollapsedChange` and `zoom` / `onZoomChange`. `columns` (field list, Görev
always) and `mainOnly` narrow it. It sizes the timeline from its own width
(ResizeObserver); `gridWidth`, `colWidth` and `hostWidth` are for the print
layout (`printLayout()`). Give it a height by putting it in a container with
`overflow: hidden` (its `.scroll` element is the only scroller; on the slide set
a max height on it through `className`).

## Helpers

- `sheetLang.ts`: `setSheetLang('en' | 'tr')`, `tr()`, `departmentName()`,
  `taskTitle()`... A module switch like the legacy one: set it before
  rendering, and put `'tr'` back when your page unmounts. The slide never
  changes it. Remount `SheetGrid` (`key`) when the language changes.
- `planSheetText.ts`: `headerSummary` (theme), `summaryChips`, `causeSentence`,
  `deviationChip`, `progressText`, ... (tests ported).
- `heroFigures.ts`: `signedWd`, `formatDateLong` (tests ported).
- `sheetRows.ts`: `buildSheetRows`, `sheetColumns`, `columnsWidth`,
  `SHEET_FIELDS`, `SHEET_COLUMN_LABELS` (for a column picker), `STATUS_META`.
- `dateEntry.ts`: `formatDMY` / `parseDMY` / `maskDMY` (day-first entry).
- `timeline.ts`: `buildTimeline`, `ZOOMS`.
- `editing.ts`, `printFit.ts`, `workdays.ts`: editable-link overrides, print
  geometry, working days.
- `types.ts`: the `PlanSheet` payload. API: `@/api/projects/planSheet`
  (`getJobOrderPlanSheet`, `getSharedPlanSheet`, `saveSharedPlanSheetOverrides`).
