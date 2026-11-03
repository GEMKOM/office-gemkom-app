// Legacy modules Sunum Modu reuses as they are. The plan-sheet ones are only
// imported through ./sheetBridge.ts; pdfExport has no React equivalent yet.

declare module '@legacy/projects/project-tracking/planSheet.js' {
  export interface SheetColumn {
    field: string;
    label: string;
    width?: string;
    [key: string]: unknown;
  }
  /** The plan sheet's columns, in order; 'title' (Görev) is always shown. */
  export const SHEET_COLUMNS: SheetColumn[];
  /** 'day' | 'week' | 'month' */
  export const SHEET_ZOOMS: string[];
}

declare module '@legacy/projects/project-tracking/planSheetText.js' {
  export interface SheetChip {
    text: string;
    cls: string;
    title: string;
  }
  export function summaryChips(summary: unknown): SheetChip[];
  export function headerSummary(sheet: unknown): {
    planLine: string;
    terminLine: string;
    theme: 'green' | 'orange' | 'red' | 'grey';
  };
}

declare module '@legacy/planning/project-planning/grid.js' {
  export const ZOOMS: Record<string, { label: string; colWidth: number }>;
}

declare module '@legacy/utils/pdfExport.js' {
  export interface ExportElementOptions {
    fileName?: string;
    orientation?: 'portrait' | 'landscape';
    captureWidth?: number;
    marginMm?: number;
    captureClass?: string;
    stageClass?: string;
    /** ASCII only (jsPDF core fonts). */
    footerText?: string;
    prepare?: (clone: HTMLElement) => void;
  }
  /** Clones `element` off-screen, unclipped, and downloads it as a PDF. */
  export function exportElementToPdf(element: HTMLElement, options?: ExportElementOptions): Promise<void>;
}
