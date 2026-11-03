// The shared geometry and bar renderer of the linear cutting module (still a
// legacy file, so the bar drawing stays in one place); the parts the tasks and
// cuts pages use.

declare module '@legacy/manufacturing/linear-cutting/lc-geometry.js' {
  export const ANGLE_TOL_DEG: number;
  export const MAX_ANGLE_DEG: number;
  export const FLIPPED_TITLE: string;
  export function angleFromSetback(setbackMm: unknown, heightMm: unknown): number | null;
  export function setbackFromAngle(angleDeg: unknown, heightMm: unknown): number;
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
