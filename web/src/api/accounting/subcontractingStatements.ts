import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// The accounting export of subcontracting statements
// (accounting/subcontracting-statements/subcontracting-statements.js).

export type AccountingExportRow = Record<string, unknown>;

/** Legacy normalizeRows: an array, or results / rows / data, or one object as a single row. */
export function normalizeAccountingRows(payload: unknown): AccountingExportRow[] {
  if (Array.isArray(payload)) return payload as AccountingExportRow[];
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    for (const key of ['results', 'rows', 'data']) {
      if (Array.isArray(body[key])) return body[key] as AccountingExportRow[];
    }
    return [body];
  }
  return [];
}

/** GET /subcontracting/statements/accounting-export/?year=&month= */
export function accountingExportQueryOptions(year: number, month: number) {
  return queryOptions({
    queryKey: ['subcontractingStatements', 'accountingExport', year, month] as const,
    queryFn: async ({ signal }) =>
      normalizeAccountingRows(
        await apiFetch<unknown>('/subcontracting/statements/accounting-export/', {
          params: { year, month },
          signal,
        }),
      ),
    staleTime: 30_000,
  });
}
