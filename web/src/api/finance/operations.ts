import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, isApiError, type QueryParams } from '../client';
import { extractResults } from '../types';

// Port of apis/finance/{expenses,loans,taxes,adhoc-job-costs,expected-receipts,
// offer-installments,reports}.js: the finance records kept on the Finans
// İşlemleri page (finance/purchase-orders). None of the lists is paginated.

type Decimal = string | number | null | undefined;

export type FinanceRecordStatus = 'active' | 'cancelled' | string;

export interface MonthlyExpense {
  id: number;
  category?: string;
  description?: string;
  amount?: Decimal;
  currency?: string;
  recurrence?: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: FinanceRecordStatus;
  notes?: string;
  created_by_username?: string | null;
}

export interface ExpenseInput {
  category: string;
  description: string;
  amount: string;
  currency: string;
  recurrence: string;
  start_date: string;
  end_date: string | null;
  status: 'active';
  notes: string;
}

export interface LoanInstallment {
  id: number;
  sequence?: number;
  due_date?: string | null;
  principal_component?: Decimal;
  interest_component?: Decimal;
  total_payment?: Decimal;
  is_paid?: boolean;
  paid_at?: string | null;
  paid_by_username?: string | null;
}

export interface Loan {
  id: number;
  name?: string;
  principal?: Decimal;
  interest_rate?: Decimal;
  term_months?: number | null;
  currency?: string;
  first_payment_date?: string | null;
  status?: FinanceRecordStatus;
  notes?: string;
  created_by_username?: string | null;
  installments?: LoanInstallment[];
}

export interface LoanInput {
  name: string;
  principal: string;
  interest_rate: string;
  term_months: number;
  currency: string;
  first_payment_date: string;
  status: 'active';
  notes: string;
}

export interface TaxEntry {
  id: number;
  tax_type?: string;
  period_label?: string;
  description?: string;
  amount?: Decimal;
  currency?: string;
  due_date?: string | null;
  is_paid?: boolean;
  paid_by_username?: string | null;
  created_by_username?: string | null;
  notes?: string;
}

export interface TaxInput {
  tax_type: string;
  period_label: string;
  description: string;
  amount: string;
  currency: string;
  due_date: string;
  notes: string;
}

export interface AdhocJobCost {
  id: number;
  job_order?: string | null;
  description?: string;
  category?: string;
  amount?: Decimal;
  currency?: string;
  cost_date?: string | null;
  notes?: string | null;
}

export interface AdhocJobCostInput {
  description: string;
  amount: string;
  currency: string;
  cost_date: string;
  category: string;
  notes: string;
  job_order?: string;
}

/** A row of GET /finance/reports/inflow-tracker/: an offer or expected-receipt instalment. */
export interface InflowRow {
  source: 'sales_offer' | 'expected_receipt' | string;
  offer_id?: number | null;
  offer_no?: string | null;
  installment_id?: number | null;
  receipt_id?: number | null;
  sequence?: number | null;
  title?: string | null;
  reference_no?: string | null;
  customer_name?: string | null;
  job_no?: string | null;
  job_title?: string | null;
  label?: string | null;
  amount?: Decimal;
  currency?: string | null;
  amount_eur?: Decimal;
  due_date?: string | null;
  is_received?: boolean;
  received_at?: string | null;
  received_by?: string | null;
  notes?: string | null;
  /** false for offer instalments, which are managed on the offer. */
  editable?: boolean;
}

export interface ExpectedReceipt {
  id: number;
  title?: string;
  customer_name?: string;
  reference_no?: string | null;
  job_order?: string | null;
  job_no?: string | null;
  notes?: string | null;
}

export interface ExpectedReceiptInput {
  title: string;
  description: string;
  reference_no: string;
  customer_name: string;
  job_order: string | null;
  total_amount: string;
  currency: string;
  status: 'expected';
  notes: string;
}

export interface ExpectedReceiptPatch {
  title: string;
  customer_name: string;
  reference_no: string;
  job_order: string | null;
  notes: string;
}

export interface ReceiptInstallmentInput {
  sequence: number;
  label: string;
  amount: string;
  due_date: string | null;
  notes: string;
}

export type ExpensesParams = { status?: string; category?: string };
export type LoansParams = { status?: string };
export type TaxesParams = { is_paid?: string; tax_type?: string };
export type AdhocCostsParams = { job_order?: string; category?: string };

export const financeKeys = {
  expenses: (params: ExpensesParams) =>
    ['finance', 'expenses', cleanParams(params as QueryParams)] as const,
  expensesAll: ['finance', 'expenses'] as const,
  loans: (params: LoansParams) => ['finance', 'loans', cleanParams(params as QueryParams)] as const,
  loansAll: ['finance', 'loans'] as const,
  loanInstallments: (loanId: number) => ['finance', 'loanInstallments', loanId] as const,
  taxes: (params: TaxesParams) => ['finance', 'taxes', cleanParams(params as QueryParams)] as const,
  taxesAll: ['finance', 'taxes'] as const,
  adhocCosts: (params: AdhocCostsParams) =>
    ['finance', 'adhocCosts', cleanParams(params as QueryParams)] as const,
  adhocCostsAll: ['finance', 'adhocCosts'] as const,
  inflow: ['finance', 'inflowTracker'] as const,
};

/**
 * Legacy parseErrorResponse: a string body, `detail`, or the `errors` map as
 * "field: a, b; field2: c"; anything else gives the fallback.
 */
export function financeErrorMessage(error: unknown, fallback: string): string {
  if (!isApiError(error)) return error instanceof Error && error.message ? error.message : fallback;
  const data = error.data;
  if (typeof data === 'string') return data || fallback;
  if (data && typeof data === 'object') {
    const body = data as { detail?: unknown; errors?: unknown };
    if (body.detail)
      return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    if (body.errors && typeof body.errors === 'object') {
      const parts = Object.entries(body.errors as Record<string, unknown>).map(
        ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`,
      );
      return parts.join('; ') || fallback;
    }
  }
  return fallback;
}

const list = async <T>(path: string, params: QueryParams, signal?: AbortSignal) =>
  extractResults<T>(await apiFetch<unknown>(path, { params, signal }));

const post = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body });
const patch = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PATCH', body });
const del = (path: string) => apiFetch<void>(path, { method: 'DELETE' });

// ---- monthly expenses ----------------------------------------------------------------

const EXPENSES = '/finance/expenses/';

export function expensesQueryOptions(params: ExpensesParams) {
  return queryOptions({
    queryKey: financeKeys.expenses(params),
    queryFn: ({ signal }) => list<MonthlyExpense>(EXPENSES, params, signal),
  });
}

export const createExpense = (payload: ExpenseInput) => post<MonthlyExpense>(EXPENSES, payload);
export const cancelExpense = (id: number) => post<MonthlyExpense>(`${EXPENSES}${id}/cancel/`);

// ---- loans -----------------------------------------------------------------------------

const LOANS = '/finance/loans/';

export function loansQueryOptions(params: LoansParams) {
  return queryOptions({
    queryKey: financeKeys.loans(params),
    queryFn: ({ signal }) => list<Loan>(LOANS, params, signal),
  });
}

export function loanInstallmentsQueryOptions(loanId: number) {
  return queryOptions({
    queryKey: financeKeys.loanInstallments(loanId),
    queryFn: ({ signal }) => list<LoanInstallment>(`${LOANS}${loanId}/installments/`, {}, signal),
    staleTime: 0,
  });
}

export const createLoan = (payload: LoanInput) => post<Loan>(LOANS, payload);
export const cancelLoan = (id: number) => post<Loan>(`${LOANS}${id}/cancel/`);
export const markLoanInstallmentPaid = (loanId: number, installmentId: number) =>
  post<LoanInstallment>(`${LOANS}${loanId}/installments/${installmentId}/mark-paid/`);

// ---- taxes -------------------------------------------------------------------------------

const TAXES = '/finance/taxes/';

export function taxesQueryOptions(params: TaxesParams) {
  return queryOptions({
    queryKey: financeKeys.taxes(params),
    queryFn: ({ signal }) => list<TaxEntry>(TAXES, params, signal),
  });
}

export const createTax = (payload: TaxInput) => post<TaxEntry>(TAXES, payload);
export const markTaxPaid = (id: number) => post<TaxEntry>(`${TAXES}${id}/mark-paid/`);

// ---- ad-hoc job costs ----------------------------------------------------------------------

const ADHOC = '/finance/adhoc-costs/';

export function adhocCostsQueryOptions(params: AdhocCostsParams) {
  return queryOptions({
    queryKey: financeKeys.adhocCosts(params),
    queryFn: ({ signal }) => list<AdhocJobCost>(ADHOC, params, signal),
  });
}

export const createAdhocCost = (payload: AdhocJobCostInput) => post<AdhocJobCost>(ADHOC, payload);
export const updateAdhocCost = (id: number, payload: AdhocJobCostInput) =>
  patch<AdhocJobCost>(`${ADHOC}${id}/`, payload);
export const deleteAdhocCost = (id: number) => del(`${ADHOC}${id}/`);

// ---- expected receipts + the inflow tracker ----------------------------------------------

const RECEIPTS = '/finance/expected-receipts/';
const OFFER_INSTALLMENTS = '/finance/offer-installments/';

/** The backend builds the whole list; legacy filtered it on the client. */
export function inflowTrackerQueryOptions() {
  return queryOptions({
    queryKey: financeKeys.inflow,
    queryFn: ({ signal }) => list<InflowRow>('/finance/reports/inflow-tracker/', {}, signal),
  });
}

/** The receipt itself, for its own notes (the tracker rows carry the instalment's). */
export function expectedReceiptQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['finance', 'expectedReceipt', id] as const,
    queryFn: ({ signal }) => apiFetch<ExpectedReceipt>(`${RECEIPTS}${id}/`, { signal }),
    staleTime: 0,
  });
}

export const createExpectedReceipt = (payload: ExpectedReceiptInput) =>
  post<{ id?: number }>(RECEIPTS, payload);
export const updateExpectedReceipt = (id: number, payload: ExpectedReceiptPatch) =>
  patch<unknown>(`${RECEIPTS}${id}/`, payload);
export const cancelExpectedReceipt = (id: number) => post<unknown>(`${RECEIPTS}${id}/cancel/`);
export const createReceiptInstallment = (receiptId: number, payload: ReceiptInstallmentInput) =>
  post<unknown>(`${RECEIPTS}${receiptId}/installments/`, payload);
export const updateReceiptInstallment = (
  receiptId: number,
  installmentId: number,
  payload: ReceiptInstallmentInput,
) => patch<unknown>(`${RECEIPTS}${receiptId}/installments/${installmentId}/`, payload);
export const deleteReceiptInstallment = (receiptId: number, installmentId: number) =>
  del(`${RECEIPTS}${receiptId}/installments/${installmentId}/`);
export const markReceiptInstallmentReceived = (receiptId: number, installmentId: number) =>
  post<unknown>(`${RECEIPTS}${receiptId}/installments/${installmentId}/mark-received/`);

export const markOfferInstallmentReceived = (offerId: number, sequence: number, notes: string) =>
  post<unknown>(`${OFFER_INSTALLMENTS}${offerId}/${sequence}/mark-received/`, { notes });
export const unmarkOfferInstallmentReceived = (offerId: number, sequence: number) =>
  post<unknown>(`${OFFER_INSTALLMENTS}${offerId}/${sequence}/unmark-received/`);
