// Types for the legacy Tahmin modules the React estimate report imports through
// `@legacy`. report-view.js stays the single source of the report's markup
// while the offers and project tracking pages (legacy) mount the same card;
// see EstimateHtml.tsx. Only the parts used here are declared.

declare module '@legacy/components/estimate-report/report-model.js' {
  export function fmt(value: unknown, digits?: number): string;
  export interface ReportModel {
    routes: string[];
    basis: { key: string | null; label: string } | null;
    [key: string]: unknown;
  }
  export function reportModel(report: unknown): ReportModel;
  export interface ProgressStep {
    key: string;
    label: string;
    state: 'done' | 'current' | 'pending';
    detail: string;
  }
  export interface ProgressModel {
    fraction: number;
    remainingS: number;
    overdue: boolean;
    steps: ProgressStep[];
  }
  export function progressModel(progress: unknown, now?: number): ProgressModel | null;
  export function remainingLabel(model: ProgressModel | null): string;
  export function isPlanBottomUp(bottomUp: unknown): boolean;
  /** Why a reference was left out of the in-house calibration, in Turkish. */
  export function exclusionLabel(reason: string | null | undefined, row?: unknown): string;
}

declare module '@legacy/components/estimate-report/report-view.js' {
  import type { ReportModel } from '@legacy/components/estimate-report/report-model.js';

  /** The view state the builders read (a subset of the legacy card's `view`). */
  export interface EstimateViewState {
    uid: string;
    collapsed: Set<string>;
    costRoute: string | null;
    similarAll: boolean;
    confOpen: boolean;
    weldOpen: boolean;
    methodHtml: string | null;
  }

  export const DEFAULT_COLLAPSED: string[];
  export const JOINT_TYPE_LABELS: Record<string, string>;
  export const MATERIAL_LABELS: Record<string, string>;
  export const ROUTE_LABELS: Record<string, string>;
  export const PROCESS_LABELS: Record<string, string>;
  export function processLabel(code: unknown): string;
  export function doneReportHtml(r: unknown, m: ReportModel, v: EstimateViewState, weld: string): string;
  export function gotoResolver(m: ReportModel): (num: string) => string | null;
  export function costTableHtml(costTable: unknown, route: string | null, goto: (num: string) => string | null): string;
  export function weldSectionHtml(v: EstimateViewState, ws: unknown): string;
  export function methodSectionHtml(v: EstimateViewState): string;
  export function sourceBadge(source: unknown, options?: { small?: boolean }): string;
  export function schemaBadge(version: unknown): string;
  export function planPartsHtml(schedule: unknown): string;
  export function planTableHtml(bottomUp: unknown): string;
  export function runMinutes(report: unknown): number | null;
  export function formatDateTime(value: unknown): string;
  export function printReport(report: unknown, weldSchedule: unknown, options?: { onBlocked?: () => void }): void;
}

declare module '@legacy/components/estimator-method/estimator-method.js' {
  /** "Nasıl çalışır?" as HTML (markdownLite, escape-first); cached per page load. */
  export function loadMethodHtml(options?: { fresh?: boolean }): Promise<string>;
}

declare module '@legacy/apis/estimator.js' {
  export const ESTIMATE_STATUS: Record<string, { label: string; badge: string; icon: string }>;
  export const REVIEW_LABELS: Record<string, { label: string; badge: string }>;
  export const SOURCE_LABELS: Record<string, { label: string; badge: string; title: string }>;
  export const SCHEMA_LABELS: Record<number, { label: string; badge: string; title: string }>;
  export const REFERENCE_REVIEW: Record<string, { label: string; badge: string }>;
  export const REFERENCE_ROUTE: Record<string, { label: string; badge: string }>;
  export const REFERENCE_RELIABILITY: Record<string, { label: string; badge: string }>;
  export const REFERENCE_FAMILY: Record<string, string>;
  export const STRUCTURE_CLASS_LABELS: Record<string, string>;
  export const WORK_CENTRE_LABELS: Record<string, string>;
  export function machiningExclusionLabel(reason: string | null | undefined): string;
}
