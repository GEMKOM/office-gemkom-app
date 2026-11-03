import { Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { SubcontractingAdjustment } from '@/api/subcontracting/adjustments';
import { formatDate, formatNumber, toDate, toNumber } from '@/lib/format';
import type { DataTableColumn, DataTableFooterContext } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** "1.234,50 EUR"; '-' when not a number (legacy formatMoney). */
export function formatMoney(value: unknown, currency?: string | null): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const formatted = formatNumber(n, 2);
  return currency ? `${formatted} ${currency}` : formatted;
}

/** "12,50 kg"; '-' for 0 or not a number (legacy formatWeight). */
export function formatWeight(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '-';
  return `${formatNumber(n, 2)} kg`;
}

/** "Mart 2026" from statement_year/month, else statement_period (legacy formatPeriod). */
export function formatPeriod(row: SubcontractingAdjustment): string {
  if (row.statement_year && row.statement_month) {
    return `${MONTH_NAMES[row.statement_month - 1]} ${row.statement_year}`;
  }
  return row.statement_period || '-';
}

// Legacy table.js type 'date': "12 Oca 2026 14:05".
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/** The name a row's subcontractor is shown under in the table and filters. */
export type SubcontractorLabel = (row: SubcontractingAdjustment) => string;

/** Without a lookup, the report's own (full) name. */
export const reportSubcontractorName: SubcontractorLabel = (row) => row.subcontractor_name || '-';

/** Both tables share the columns; only the amount colour differs (legacy buildColumns). */
function buildColumns(
  isAddition: boolean,
  subcontractorLabel: SubcontractorLabel,
): DataTableColumn<SubcontractingAdjustment>[] {
  return [
    {
      key: 'created_at',
      header: 'Tarih',
      render: (row) => (
        <Text size="sm" c="dimmed" fw={500}>
          {formatDate(row.created_at, DATE_FORMAT)}
        </Text>
      ),
      exportValue: (row) => toDate(row.created_at),
    },
    {
      key: 'statement_period',
      header: 'Hakediş Dönemi',
      render: (row) => formatPeriod(row),
      exportValue: (row) => formatPeriod(row),
    },
    {
      key: 'subcontractor_name',
      header: 'Taşeron',
      // Short name shown; the full name appears on hover.
      accessor: (row) => subcontractorLabel(row),
      render: (row) => {
        const label = subcontractorLabel(row);
        const full = row.subcontractor_name || '';
        return full && full !== label ? <span title={full}>{label}</span> : label;
      },
      exportValue: (row) => subcontractorLabel(row),
    },
    {
      key: 'job_no',
      header: 'İş No',
      render: (row) => (row.job_no ? <span className={uiClasses.code}>{row.job_no}</span> : '-'),
    },
    {
      key: 'weight_kg',
      header: 'Ağırlık (kg)',
      align: 'right',
      // Decimal strings sort numerically (legacy NUMERIC_FIELDS).
      accessor: (row) => toNumber(row.weight_kg) ?? 0,
      render: (row) => formatWeight(row.weight_kg),
      exportValue: (row) => formatWeight(row.weight_kg),
    },
    {
      key: 'amount',
      header: 'Tutar',
      align: 'right',
      accessor: (row) => toNumber(row.amount) ?? 0,
      render: (row) => (
        <Text
          size="sm"
          fw={700}
          c={isAddition ? 'green.8' : 'red.8'}
          style={{ whiteSpace: 'nowrap' }}
        >
          {formatMoney(row.amount, row.currency)}
        </Text>
      ),
      // Legacy exported what the cell shows, currency included.
      exportValue: (row) => formatMoney(row.amount, row.currency),
    },
    { key: 'reason', header: 'Sebep' },
    { key: 'description', header: 'Açıklama', sortable: false },
  ];
}

// The table is sortable by default; Açıklama opts out as in legacy.
export function adjustmentColumns(
  kind: 'addition' | 'deduction',
  subcontractorLabel: SubcontractorLabel = reportSubcontractorName,
) {
  return buildColumns(kind === 'addition', subcontractorLabel);
}

const COLUMN_COUNT = adjustmentColumns('addition').length;

/** Per-currency total of every row's amount, e.g. "Toplam: 1.000,00 EUR + 500,00 TRY". */
export function amountTotals(rows: readonly SubcontractingAdjustment[]): string {
  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || '';
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + (Number(row.amount) || 0));
  }
  return [...byCurrency.keys()]
    .sort()
    .map((currency) => formatMoney(byCurrency.get(currency), currency))
    .join(' + ');
}

/** Legacy buildFooter: one bold right-aligned row under the table. */
export function totalsFooter({
  allRows,
}: DataTableFooterContext<SubcontractingAdjustment>): ReactNode {
  if (allRows.length === 0) return null;
  return (
    <Table.Tr>
      <Table.Td colSpan={COLUMN_COUNT} ta="right" fw={700}>
        Toplam: {amountTotals(allRows)}
      </Table.Td>
    </Table.Tr>
  );
}
