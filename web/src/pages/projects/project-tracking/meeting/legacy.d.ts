// pdfExport has no React equivalent yet; Sunum Modu's modal PDF uses it as is.

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
