import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// Port of apis/subcontracting/statements.js, paintInputs.js and the
// markSubcontractingStatementAsPaid helper of subcontractors.js: taşeron
// hakedişleri (monthly statements), their adjustments and the monthly paint input.
// (The accounting export of the same statements is api/accounting/subcontractingStatements.ts.)

export type StatementStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'cancelled';

type Decimal = number | string | null;

export interface StatementApprover {
  id?: number;
  full_name?: string;
  username?: string;
}

export interface StatementLineItem {
  id?: number;
  job_no?: string | null;
  job_title?: string | null;
  price_tier_name?: string | null;
  allocated_weight_kg?: Decimal;
  previous_progress?: Decimal;
  current_progress?: Decimal;
  delta_progress?: Decimal;
  effective_weight_kg?: Decimal;
  price_per_kg?: Decimal;
  cost_amount?: Decimal;
  [key: string]: unknown;
}

export interface PaintInput {
  id: number;
  year: number;
  month: number;
  total_kg?: Decimal;
  total_cost?: Decimal;
  [key: string]: unknown;
}

export interface StatementWorkflowStage {
  order?: number;
  approver_user_ids?: number[];
  [key: string]: unknown;
}

export interface Statement {
  id: number;
  subcontractor?: number;
  subcontractor_name?: string | null;
  year?: number | null;
  month?: number | null;
  status: StatementStatus | string;
  employee_count?: number | null;
  currency?: string | null;
  work_total?: Decimal;
  /** Backend name; older payloads sent adjustments_total. */
  adjustment_total?: Decimal;
  adjustments_total?: Decimal;
  grand_total?: Decimal;
  current_approvers?: StatementApprover[];
  line_items?: StatementLineItem[];
  paint_input?: PaintInput | null;
  approval_workflow?: {
    current_stage_order?: number;
    stage_instances?: StatementWorkflowStage[];
  } | null;
  [key: string]: unknown;
}

export interface StatementAdjustment {
  id: number;
  adjustment_type: 'addition' | 'deduction' | string;
  amount?: Decimal;
  reason?: string | null;
  job_order?: string | null;
  weight_kg?: Decimal;
  [key: string]: unknown;
}

export interface StatementAdjustmentInput {
  adjustment_type: 'addition' | 'deduction';
  /** Positive; the backend applies the sign. */
  amount: number;
  reason: string;
  job_order: string;
  weight_kg: number;
}

export type StatementsParams = {
  subcontractor?: string | number;
  year?: string | number;
  /** 1-12. */
  month?: string | number;
  status?: string;
  /** Default '-year,-month'. */
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const statementKeys = {
  all: ['subcontractingStatements'] as const,
  lists: () => ['subcontractingStatements', 'list'] as const,
  list: (params: StatementsParams) => ['subcontractingStatements', 'list', params] as const,
  details: () => ['subcontractingStatements', 'detail'] as const,
  detail: (id: number) => ['subcontractingStatements', 'detail', id] as const,
  adjustments: (id: number) => ['subcontractingStatements', 'detail', id, 'adjustments'] as const,
  paintInput: (year: number, month: number) =>
    ['subcontractingStatements', 'paintInput', year, month] as const,
};

const BASE = '/subcontracting/statements/';
const detailPath = (id: number) => `${BASE}${id}/`;

/** Legacy fetchStatements: GET /subcontracting/statements/ (unset filters left out). */
export function statementsQueryOptions(params: StatementsParams) {
  return queryOptions({
    queryKey: statementKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<Statement>(await apiFetch<unknown>(BASE, { params, signal })),
  });
}

export function statementQueryOptions(id: number) {
  return queryOptions({
    queryKey: statementKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<Statement>(detailPath(id), { signal }),
  });
}

/** Legacy fetchStatementAdjustments: an array or a page. */
export function statementAdjustmentsQueryOptions(id: number) {
  return queryOptions({
    queryKey: statementKeys.adjustments(id),
    queryFn: async ({ signal }) =>
      extractResults<StatementAdjustment>(
        await apiFetch<unknown>(`${detailPath(id)}adjustments/`, { signal }),
      ),
  });
}

/** Legacy patchStatement (partial update, e.g. employee_count). */
export function patchStatement(id: number, data: Partial<Statement>): Promise<Statement> {
  return apiFetch<Statement>(detailPath(id), { method: 'PATCH', body: data });
}

/** Legacy generateBulkStatements: every subcontractor for the period. */
export function generateBulkStatements(data: { year: number; month: number }): Promise<unknown> {
  return apiFetch(`${BASE}generate-bulk/`, { method: 'POST', body: data });
}

/** Regenerate the line items (adjustments are kept). */
export function refreshStatement(id: number): Promise<Statement> {
  return apiFetch<Statement>(`${detailPath(id)}refresh/`, { method: 'POST' });
}

export function submitStatement(id: number): Promise<Statement> {
  return apiFetch<Statement>(`${detailPath(id)}submit/`, { method: 'POST' });
}

export function decideStatement(
  id: number,
  data: { approve: boolean; comment: string },
): Promise<Statement> {
  return apiFetch<Statement>(`${detailPath(id)}decide/`, { method: 'POST', body: data });
}

/** markSubcontractingStatementAsPaid: approved -> paid (the backend stamps paid_at). */
export function markStatementPaid(id: number): Promise<Statement> {
  return apiFetch<Statement>(`${detailPath(id)}mark-paid/`, { method: 'POST' });
}

export function createStatementAdjustment(
  id: number,
  data: StatementAdjustmentInput,
): Promise<StatementAdjustment> {
  return apiFetch<StatementAdjustment>(`${detailPath(id)}adjustments/`, {
    method: 'POST',
    body: data,
  });
}

export function deleteStatementAdjustment(id: number, adjustmentId: number): Promise<void> {
  return apiFetch<void>(`${detailPath(id)}adjustments/${adjustmentId}/`, { method: 'DELETE' });
}

// ---- monthly paint input (apis/subcontracting/paintInputs.js) ----------------

const PAINT = '/subcontracting/paint-inputs/';

/** The period's paint input, or null (legacy took the first result). */
export function paintInputQueryOptions(year: number, month: number) {
  return queryOptions({
    queryKey: statementKeys.paintInput(year, month),
    queryFn: async ({ signal }) =>
      extractResults<PaintInput>(
        await apiFetch<unknown>(PAINT, { params: { year, month }, signal }),
      )[0] ?? null,
  });
}

export interface PaintInputBody {
  year: number;
  month: number;
  total_kg: number;
  total_cost: number;
}

export function createPaintInput(data: PaintInputBody): Promise<PaintInput> {
  return apiFetch<PaintInput>(PAINT, { method: 'POST', body: data });
}

export function patchPaintInput(id: number, data: PaintInputBody): Promise<PaintInput> {
  return apiFetch<PaintInput>(`${PAINT}${id}/`, { method: 'PATCH', body: data });
}
