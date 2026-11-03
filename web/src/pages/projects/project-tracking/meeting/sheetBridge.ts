// The one place Sunum Modu reads the legacy plan-sheet modules. Pure
// constants and functions only (no HTML strings reach the DOM). When the
// plan sheet is ported, repoint these re-exports at the React modules.

export { SHEET_COLUMNS, SHEET_ZOOMS, type SheetColumn } from '@legacy/projects/project-tracking/planSheet.js';
export {
  headerSummary,
  summaryChips,
  type SheetChip,
} from '@legacy/projects/project-tracking/planSheetText.js';
export { ZOOMS } from '@legacy/planning/project-planning/grid.js';
