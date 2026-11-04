/**
 * DOM → PDF, as a screenshot. Ported from the legacy utils/pdfExport.js.
 *
 * The point is fidelity, not re-layout: whatever is on screen — colours,
 * badges, progress bars, wording — is what lands on the page.
 *
 * Two ways in, depending on who paginates:
 *
 *   exportElementToPdf  — hand it ONE element. It is cloned off-screen so the
 *                         capture covers its full height, not just the part
 *                         inside its scrollbox, and the single tall canvas is
 *                         sliced into pages at row boundaries.
 *   exportPagesToPdf    — hand it pages you have already built to fit. Needed
 *                         when every page must repeat something (a table
 *                         header), which no slicing of one image can produce.
 *
 * html2canvas + jsPDF load from the CDN on first use only — pages that never
 * export never pay for them.
 */

const HTML2CANVAS_SRC =
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// The parts of the two CDN libraries used here.
type Html2Canvas = (
  element: HTMLElement,
  options: {
    backgroundColor: string;
    scale: number;
    useCORS: boolean;
    logging: boolean;
    windowWidth: number;
    windowHeight: number;
  },
) => Promise<HTMLCanvasElement>;

interface JsPdfDocument {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  addPage(): void;
  addImage(
    data: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
    alias?: string,
    compression?: string,
  ): void;
  setFontSize(size: number): void;
  setTextColor(gray: number): void;
  text(text: string, x: number, y: number, options?: { align?: 'right' | 'left' | 'center' }): void;
  save(fileName: string): void;
}

type JsPdfConstructor = new (options: {
  orientation: 'portrait' | 'landscape';
  unit: 'mm';
  format: string;
  compress: boolean;
}) => JsPdfDocument;

type PdfWindow = Window & { html2canvas?: Html2Canvas; jspdf?: { jsPDF: JsPdfConstructor } };

// Canvas limits, not aesthetics: browsers silently hand back a BLANK canvas
// past ~2^28 pixels (Safari much earlier) or 16384px on a side. A long plan
// table at scale 2 sails past both, so the scale is what gives way.
const MAX_CANVAS_PIXELS = 24e6;
const MAX_CANVAS_SIDE = 12000;
const TARGET_SCALE = 2;

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const pending = scriptPromises.get(src);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromises.delete(src);
      reject(new Error(`Betik yüklenemedi: ${src}`));
    };
    document.head.appendChild(el);
  });
  scriptPromises.set(src, promise);
  return promise;
}

async function loadPdfLibs(): Promise<{ html2canvas: Html2Canvas; jsPDF: JsPdfConstructor }> {
  const w = window as PdfWindow;
  await Promise.all([
    w.html2canvas ? Promise.resolve() : loadScript(HTML2CANVAS_SRC),
    w.jspdf ? Promise.resolve() : loadScript(JSPDF_SRC),
  ]);
  if (!w.html2canvas || !w.jspdf) {
    throw new Error('PDF kitaplıkları yüklenemedi.');
  }
  return { html2canvas: w.html2canvas, jsPDF: w.jspdf.jsPDF };
}

// Elements whose top edge is a safe place to end a page. Rows first — a task
// line split down the middle is the one thing that makes an export look broken.
const BREAK_SELECTOR =
  'tr, table, .pp-plan-verdict, .pp-plan-figures, .pp-phase-cards,' +
  ' .pp-plan-driver, .pp-plan-counts, .pp-plan-warn, .pp-modal-note,' +
  ' .pp-modal-section, .pp-modal-stats';

function collectBreakOffsets(root: HTMLElement): number[] {
  const rootTop = root.getBoundingClientRect().top;
  const offsets = new Set<number>();
  root.querySelectorAll(BREAK_SELECTOR).forEach((el) => {
    const top = Math.round(el.getBoundingClientRect().top - rootTop);
    if (top > 0) offsets.add(top);
  });
  return [...offsets].sort((a, b) => a - b);
}

// A page that stops before it is 45% full wastes more paper than a snapped cut
// saves, so short of that the cut stays where the page ends.
function planSlices(totalPx: number, pagePx: number, breaks: number[]): [number, number][] {
  const slices: [number, number][] = [];
  const minFill = pagePx * 0.45;
  let y = 0;
  let guard = 0;
  while (y < totalPx && guard++ < 1000) {
    if (y + pagePx >= totalPx) {
      slices.push([y, totalPx - y]);
      break;
    }
    let end = y + pagePx;
    let snapped = 0;
    for (const b of breaks) {
      if (b > end) break;
      if (b > y + minFill) snapped = b;
    }
    if (snapped) end = snapped;
    slices.push([y, end - y]);
    y = end;
  }
  return slices;
}

export function sanitizeFileName(name: string): string {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function captureScale(width: number, height: number): number {
  return Math.max(
    1,
    Math.min(
      TARGET_SCALE,
      MAX_CANVAS_SIDE / Math.max(width, height),
      Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
    ),
  );
}

function pdfName(fileName: string): string {
  const name = sanitizeFileName(fileName);
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

export interface ExportElementOptions {
  /** Download name; ".pdf" is appended if absent. */
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
  /** CSS width the clone is laid out at. */
  captureWidth?: number;
  marginMm?: number;
  /** Class added to the clone (unclipping CSS). */
  captureClass?: string;
  /** Class for the off-screen host. */
  stageClass?: string;
  /** ASCII only: jsPDF's core fonts cannot encode ı/ş/ğ; Turkish belongs in the image. */
  footerText?: string;
  /** Runs on the clone before it is measured. */
  prepare?: ((clone: HTMLElement) => void) | null;
}

/**
 * Clones `element` off-screen, unclipped, and downloads it as a PDF sliced at
 * row boundaries. Resolves to the page count.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  options: ExportElementOptions = {},
): Promise<number> {
  const {
    fileName = 'export.pdf',
    orientation = 'portrait',
    captureWidth = 1000,
    marginMm = 8,
    captureClass = '',
    stageClass = '',
    footerText = '',
    prepare = null,
  } = options;

  const { html2canvas, jsPDF } = await loadPdfLibs();

  const stage = document.createElement('div');
  if (stageClass) stage.className = stageClass;
  stage.style.cssText = `position:fixed;top:0;left:-10000px;width:${captureWidth}px;background:#ffffff;`;
  const clone = element.cloneNode(true) as HTMLElement;
  if (captureClass) clone.classList.add(captureClass);
  stage.appendChild(clone);
  document.body.appendChild(stage);

  try {
    if (typeof prepare === 'function') prepare(clone);
    // Icons are pseudo-element glyphs; capturing before the webfont is
    // ready leaves empty boxes where the flags and warnings should be.
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const width = Math.ceil(clone.scrollWidth) || captureWidth;
    const height = Math.ceil(clone.scrollHeight);
    const breaks = collectBreakOffsets(clone);

    const canvas = await html2canvas(clone, {
      backgroundColor: '#ffffff',
      scale: captureScale(width, height),
      useCORS: true,
      logging: false,
      windowWidth: width,
      windowHeight: height,
    });

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const footerH = footerText ? 5 : 0;
    const contentW = pageW - marginMm * 2;
    const contentH = pageH - marginMm * 2 - footerH;

    // The image is scaled to the content width, so one mm of paper is a
    // fixed number of canvas pixels in both directions.
    const pxPerMm = canvas.width / contentW;
    const pagePx = Math.floor(contentH * pxPerMm);
    const cssToCanvas = canvas.height / height;
    const slices = planSlices(
      canvas.height,
      pagePx,
      breaks.map((b) => Math.round(b * cssToCanvas)),
    );

    const pageCanvas = document.createElement('canvas');
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas desteklenmiyor.');
    slices.forEach(([y, sliceH], index) => {
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, sliceH);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (index > 0) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        marginMm,
        marginMm,
        contentW,
        sliceH / pxPerMm,
        undefined,
        'FAST',
      );
      if (footerText) {
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(
          `${footerText}   ${index + 1} / ${slices.length}`,
          pageW - marginMm,
          pageH - marginMm + 2,
          {
            align: 'right',
          },
        );
      }
    });

    pdf.save(pdfName(fileName));
    return slices.length;
  } finally {
    stage.remove();
  }
}

export interface ExportPagesOptions {
  fileName?: string;
  orientation?: 'landscape' | 'portrait';
  /** jsPDF page format, e.g. 'a4'. */
  format?: string;
  marginMm?: number;
  /** ASCII only: jsPDF's core fonts cannot encode ı/ş/ğ. */
  footerText?: string;
  onProgress?: ((done: number, total: number) => void) | null;
}

/**
 * A pre-paginated document → PDF, one captured element per page.
 *
 * The sibling above slices ONE tall capture; this one takes pages that were
 * already built to fit — which is what a sheet with a repeating header needs,
 * since a repeated header cannot be cut out of a single image. It also keeps
 * every canvas small enough to capture at full scale, so a 300-row plan stays
 * as crisp as a 10-row one.
 *
 * Pages must already be in the document (an off-screen stage) so they have
 * layout; the caller owns that stage and removes it afterwards.
 *
 * ONE scale for the whole document: the widest page defines it, and every
 * other page is drawn at the same mm-per-pixel. Fitting each page on its own
 * would silently magnify a short last page. Resolves to the page count.
 */
export async function exportPagesToPdf(
  pages: HTMLElement[],
  options: ExportPagesOptions = {},
): Promise<number> {
  const {
    fileName = 'export.pdf',
    orientation = 'landscape',
    format = 'a4',
    marginMm = 8,
    footerText = '',
    onProgress = null,
  } = options;

  if (!pages.length) throw new Error('Dışa aktarılacak sayfa yok.');

  const { html2canvas, jsPDF } = await loadPdfLibs();
  // Icons are pseudo-element glyphs; capturing before the webfont is ready
  // leaves empty boxes where the flags and status marks should be.
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const footerH = footerText ? 5 : 0;
  const contentW = pageW - marginMm * 2;
  const contentH = pageH - marginMm * 2 - footerH;

  // The RENDERED box, not the scroll extent: a page that clips something is
  // captured at the size it is drawn, and pages stay the same width as each
  // other — differing widths would print at differing scales.
  const widest = Math.max(...pages.map((el) => Math.ceil(el.getBoundingClientRect().width) || 1));
  const mmPerPx = contentW / widest;

  for (const [i, el] of pages.entries()) {
    const rect = el.getBoundingClientRect();
    const width = Math.ceil(rect.width) || widest;
    const height = Math.ceil(rect.height) || 1;

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: captureScale(width, height),
      useCORS: true,
      logging: false,
      windowWidth: width,
      windowHeight: height,
    });

    if (i > 0) pdf.addPage();
    // A page built taller than the content box (a stray long row) is let
    // down proportionally rather than spilling off the paper.
    const drawScale = Math.min(mmPerPx, contentH / height);
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      marginMm,
      marginMm,
      width * drawScale,
      height * drawScale,
      undefined,
      'FAST',
    );
    if (footerText) {
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(
        `${footerText}   ${i + 1} / ${pages.length}`,
        pageW - marginMm,
        pageH - marginMm + 2,
        {
          align: 'right',
        },
      );
    }
    if (typeof onProgress === 'function') onProgress(i + 1, pages.length);
  }

  pdf.save(pdfName(fileName));
  return pages.length;
}
