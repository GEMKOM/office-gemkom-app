/**
 * DOM → PDF, as a screenshot.
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

const HTML2CANVAS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// Canvas limits, not aesthetics: browsers silently hand back a BLANK canvas
// past ~2^28 pixels (Safari much earlier) or 16384px on a side. A long plan
// table at scale 2 sails past both, so the scale is what gives way.
const MAX_CANVAS_PIXELS = 24e6;
const MAX_CANVAS_SIDE = 12000;
const TARGET_SCALE = 2;

const scriptPromises = new Map();

function loadScript(src) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve, reject) => {
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

async function loadPdfLibs() {
    await Promise.all([
        window.html2canvas ? Promise.resolve() : loadScript(HTML2CANVAS_SRC),
        window.jspdf ? Promise.resolve() : loadScript(JSPDF_SRC)
    ]);
    if (!window.html2canvas || !window.jspdf) {
        throw new Error('PDF kitaplıkları yüklenemedi.');
    }
    return { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
}

// Elements whose top edge is a safe place to end a page. Rows first — a task
// line split down the middle is the one thing that makes an export look broken.
const BREAK_SELECTOR = 'tr, table, .pp-plan-verdict, .pp-plan-figures, .pp-phase-cards,'
    + ' .pp-plan-driver, .pp-plan-counts, .pp-plan-warn, .pp-modal-note,'
    + ' .pp-modal-section, .pp-modal-stats';

function collectBreakOffsets(root) {
    const rootTop = root.getBoundingClientRect().top;
    const offsets = new Set();
    root.querySelectorAll(BREAK_SELECTOR).forEach((el) => {
        const top = Math.round(el.getBoundingClientRect().top - rootTop);
        if (top > 0) offsets.add(top);
    });
    return [...offsets].sort((a, b) => a - b);
}

// A page that stops before it is 45% full wastes more paper than a snapped cut
// saves, so short of that the cut stays where the page ends.
function planSlices(totalPx, pagePx, breaks) {
    const slices = [];
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

export function sanitizeFileName(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Render `element` into a downloaded PDF.
 *
 * @param {HTMLElement} element        the node to capture (cloned, never touched)
 * @param {Object}      options
 * @param {string}      options.fileName      download name, ".pdf" appended if absent
 * @param {string}      options.orientation   'landscape' | 'portrait'
 * @param {number}      options.captureWidth  CSS width the clone is laid out at
 * @param {number}      options.marginMm      page margin
 * @param {string}      options.captureClass  class added to the clone (unclipping CSS)
 * @param {string}      options.stageClass    class for the off-screen host
 * @param {string}      options.footerText    ASCII-only page footer (jsPDF core fonts
 *                                            cannot encode ı/ş/ğ — Turkish belongs in
 *                                            the captured image, not here)
 * @param {Function}    options.prepare       (clone) => void, run before measuring
 */
export async function exportElementToPdf(element, options = {}) {
    const {
        fileName = 'export.pdf',
        orientation = 'portrait',
        captureWidth = 1000,
        marginMm = 8,
        captureClass = '',
        stageClass = '',
        footerText = '',
        prepare = null
    } = options;

    const { html2canvas, jsPDF } = await loadPdfLibs();

    const stage = document.createElement('div');
    if (stageClass) stage.className = stageClass;
    stage.style.cssText = `position:fixed;top:0;left:-10000px;width:${captureWidth}px;background:#ffffff;`;
    const clone = element.cloneNode(true);
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

        const scale = Math.max(1, Math.min(
            TARGET_SCALE,
            MAX_CANVAS_SIDE / Math.max(width, height),
            Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
        ));

        const canvas = await html2canvas(clone, {
            backgroundColor: '#ffffff',
            scale,
            useCORS: true,
            logging: false,
            windowWidth: width,
            windowHeight: height
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
            canvas.height, pagePx, breaks.map(b => Math.round(b * cssToCanvas)));

        const pageCanvas = document.createElement('canvas');
        const ctx = pageCanvas.getContext('2d');
        slices.forEach(([y, sliceH], index) => {
            pageCanvas.width = canvas.width;
            pageCanvas.height = sliceH;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, sliceH);
            ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            if (index > 0) pdf.addPage();
            pdf.addImage(
                pageCanvas.toDataURL('image/png'), 'PNG',
                marginMm, marginMm, contentW, sliceH / pxPerMm, undefined, 'FAST');
            if (footerText) {
                pdf.setFontSize(8);
                pdf.setTextColor(150);
                pdf.text(`${footerText}   ${index + 1} / ${slices.length}`,
                    pageW - marginMm, pageH - marginMm + 2, { align: 'right' });
            }
        });

        const name = sanitizeFileName(fileName);
        pdf.save(name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`);
        return slices.length;
    } finally {
        stage.remove();
    }
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
 * would silently magnify a short last page.
 *
 * @param {HTMLElement[]} pages
 * @param {Object}   options
 * @param {string}   options.fileName
 * @param {string}   options.orientation  'landscape' | 'portrait'
 * @param {string}   options.format       jsPDF page format, e.g. 'a4'
 * @param {number}   options.marginMm
 * @param {string}   options.footerText   ASCII only — jsPDF core fonts cannot
 *                                        encode ı/ş/ğ, so Turkish belongs in
 *                                        the captured image, not here
 * @param {Function} options.onProgress   (done, total) => void
 */
export async function exportPagesToPdf(pages, options = {}) {
    const {
        fileName = 'export.pdf',
        orientation = 'landscape',
        format = 'a4',
        marginMm = 8,
        footerText = '',
        onProgress = null
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
    const box = el => el.getBoundingClientRect();
    const widest = Math.max(...pages.map(el => Math.ceil(box(el).width) || 1));
    const mmPerPx = contentW / widest;

    for (let i = 0; i < pages.length; i++) {
        const el = pages[i];
        const rect = box(el);
        const width = Math.ceil(rect.width) || widest;
        const height = Math.ceil(rect.height) || 1;
        const scale = Math.max(1, Math.min(
            TARGET_SCALE,
            MAX_CANVAS_SIDE / Math.max(width, height),
            Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
        ));

        const canvas = await html2canvas(el, {
            backgroundColor: '#ffffff',
            scale,
            useCORS: true,
            logging: false,
            windowWidth: width,
            windowHeight: height
        });

        if (i > 0) pdf.addPage();
        // A page built taller than the content box (a stray long row) is let
        // down proportionally rather than spilling off the paper.
        const drawScale = Math.min(mmPerPx, contentH / height);
        pdf.addImage(
            canvas.toDataURL('image/png'), 'PNG',
            marginMm, marginMm, width * drawScale, height * drawScale,
            undefined, 'FAST');
        if (footerText) {
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text(`${footerText}   ${i + 1} / ${pages.length}`,
                pageW - marginMm, pageH - marginMm + 2, { align: 'right' });
        }
        if (typeof onProgress === 'function') onProgress(i + 1, pages.length);
    }

    const name = sanitizeFileName(fileName);
    pdf.save(name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`);
    return pages.length;
}
