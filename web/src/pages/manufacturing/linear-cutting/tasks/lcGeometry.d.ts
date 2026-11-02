// The shared bar renderer of the linear cutting module, still used by the
// legacy cuts page; the parts this page uses.

declare module '@legacy/manufacturing/linear-cutting/lc-geometry.js' {
  export const FLIPPED_TITLE: string;
  export function formatAngleTr(angleDeg: unknown): string;
  export function formatPassAngle(pass: unknown): string;
  export function passKindLabel(kind: unknown): string;
  export function drawBarCanvas(
    canvas: HTMLCanvasElement,
    bar: {
      stock_length_mm?: number | null;
      waste_mm?: number | null;
      is_remnant?: boolean;
      cuts?: unknown[] | null;
      passes?: unknown[] | null;
    },
    opts?: { kerfMm?: number; referenceStockMm?: number | null; tooltipEl?: HTMLElement | null },
  ): void;
}
