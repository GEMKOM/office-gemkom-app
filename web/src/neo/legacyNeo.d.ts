// Legacy modules the Neo panel reuses as they are: the daily-summary renderer
// the legacy modal and widget pane share.

declare module '@legacy/components/daily-summary/render.js' {
  export interface RenderOptions {
    layer?: 'full' | 'brief';
    areaOrder?: string[] | null;
    compact?: boolean;
  }
  /** The summary body as an HTML string; every payload string is escaped. */
  export function renderDailySummary(summary: unknown, options?: RenderOptions): string;
  /** Wires the folds, the "Tümünü gör" reveal and the area accordion (idempotent). */
  export function bindDailySummaryInteractions(
    container: HTMLElement,
    options?: { onReveal?: (() => void) | null },
  ): void;
  /** Adds components/daily-summary/daily-summary.css to the page once. */
  export function ensureDailySummaryStyles(): void;
  export function areaOrderFor(departmentCode: string | null | undefined): string[];
  export function currentDepartmentCode(): string | null;
  /** 'Bugün' / 'Dün' / '22 Eyl Sal'. */
  export function relativeDayLabel(dateStr: string): string;
  /** '22 Eylül 2026 Salı'. */
  export function formatSummaryDate(dateStr: string): string;
  export function formatWindowLabel(summary: unknown): string;
  export function seenValue(summary: unknown): string;
  export function setSeen(uid: number | string, value: string): void;
  export function getSeen(uid: number | string): string;
  /** Istanbul calendar date as YYYY-MM-DD. */
  export function istanbulDate(date?: Date): string;
  /** Whole days between an Istanbul date string and today (positive = past). */
  export function daysSince(dateStr: string | null | undefined, now?: Date): number;
}
