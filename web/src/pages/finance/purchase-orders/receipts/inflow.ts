import type { InflowRow } from '@/api/finance/operations';
import { parseMoney } from '../shared';

// Client-side shaping of the inflow tracker (legacy applyClientInflowFilters,
// assignInflowGroupKeys, formatInflowGroupHeader, validateDraftInstallments).

export type InflowGrouping = 'none' | 'due_month' | 'customer' | 'job';

export const INFLOW_SOURCE_OPTIONS = [
  { value: 'sales_offer', label: 'Satış Teklifi' },
  { value: 'expected_receipt', label: 'Beklenen Tahsilat' },
];

export const INFLOW_GROUPING_OPTIONS: { value: InflowGrouping; label: string }[] = [
  { value: 'none', label: 'Gruplama yok' },
  { value: 'due_month', label: 'Vade ayına göre' },
  { value: 'customer', label: 'Müşteriye göre' },
  { value: 'job', label: 'İş emrine göre' },
];

/** Rows without a due date form the last group. */
export const UNDATED_GROUP = '9__NO_DUE_DATE';

export type InflowTableRow = InflowRow & { _rowKey: string; _groupKey: string };

export function inflowRowKey(row: InflowRow): string {
  return row.source === 'sales_offer'
    ? `offer-${row.offer_id}-${row.sequence}`
    : `er-${row.receipt_id}-${row.installment_id}`;
}

export function readGrouping(value: string): InflowGrouping {
  return INFLOW_GROUPING_OPTIONS.some((o) => o.value === value)
    ? (value as InflowGrouping)
    : 'due_month';
}

function groupKey(row: InflowRow, grouping: InflowGrouping): string {
  if (!row.due_date) return UNDATED_GROUP;
  if (grouping === 'due_month') return `0_${String(row.due_date).slice(0, 7)}`;
  if (grouping === 'customer') return `0_${row.customer_name || '—'}`;
  if (grouping === 'job') return `0_${row.job_no || '—'}`;
  return '0_flat';
}

/** Filters by received state ('' all, 'true', 'false') and source, keys and groups the rows, undated last. */
export function prepareInflowRows(
  rows: readonly InflowRow[],
  {
    isReceived,
    source,
    grouping,
  }: { isReceived: string; source: string; grouping: InflowGrouping },
): InflowTableRow[] {
  const filtered = rows.filter(
    (r) =>
      (isReceived === 'true' ? r.is_received : isReceived === 'false' ? !r.is_received : true) &&
      (!source || r.source === source),
  );
  const dated: InflowTableRow[] = [];
  const undated: InflowTableRow[] = [];
  for (const row of filtered) {
    const copy = { ...row, _rowKey: inflowRowKey(row), _groupKey: groupKey(row, grouping) };
    (row.due_date ? dated : undated).push(copy);
  }
  return [...dated, ...undated];
}

/** "Mayıs 2026" for a due-month group, 'Vade tarihi yok' for the undated one, else the value. */
export function groupLabel(key: string, grouping: InflowGrouping): string {
  if (key === UNDATED_GROUP) return 'Vade tarihi yok';
  const value = key.startsWith('0_') ? key.slice(2) : key;
  if (grouping === 'due_month') {
    const [y, m] = value.split('-');
    if (y && m) {
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', {
        month: 'long',
        year: 'numeric',
      });
    }
  }
  return value || '—';
}

export function sumEur(rows: readonly InflowRow[]): number {
  return rows.reduce((sum, r) => sum + (parseMoney(r.amount_eur) || 0), 0);
}

// ---- draft instalments of a new expected receipt ----

export interface DraftInstallment {
  sequence: number | string;
  label: string;
  amount: number | string;
  due_date: string;
  notes: string;
}

export interface InstallmentPayload {
  sequence: number;
  label: string;
  amount: string;
  due_date: string;
  notes: string;
}

export type DraftCheck =
  { ok: true; payloads: InstallmentPayload[] } | { ok: false; message: string };

/** Legacy validateDraftInstallments: messages name the 1-based row. Payloads come out by sequence. */
export function validateDrafts(drafts: readonly DraftInstallment[]): DraftCheck {
  if (drafts.length === 0) return { ok: false, message: 'En az bir taksit ekleyin.' };
  const sequences = new Set<number>();
  for (const [i, row] of drafts.entries()) {
    if (!String(row.label ?? '').trim())
      return { ok: false, message: `${i + 1}. satırda etiket zorunludur.` };
    const amount = parseMoney(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: `${i + 1}. satırda geçerli bir tutar girin.` };
    }
    if (!row.due_date) return { ok: false, message: `${i + 1}. satırda vade tarihi zorunludur.` };
    const seq = Number(row.sequence);
    if (!Number.isFinite(seq) || seq < 1) {
      return { ok: false, message: `${i + 1}. satırda geçerli bir sıra numarası girin.` };
    }
    if (sequences.has(seq))
      return { ok: false, message: 'Taksit sıra numaraları benzersiz olmalıdır.' };
    sequences.add(seq);
  }
  return {
    ok: true,
    payloads: drafts
      .slice()
      .sort((a, b) => Number(a.sequence) - Number(b.sequence))
      .map((row) => ({
        sequence: Number(row.sequence),
        label: String(row.label).trim(),
        amount: parseMoney(row.amount).toFixed(2),
        due_date: row.due_date,
        notes: String(row.notes ?? '').trim(),
      })),
  };
}
