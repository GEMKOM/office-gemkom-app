import { Stack, Text } from '@mantine/core';
import type { Statement } from '@/api/subcontracting/statements';
import { toNumber } from '@/lib/format';
import { FaIcon, type CellValue, type DataTableColumn } from '@/ui';
import { money, StatementStatusBadge } from './statementShared';

/** A statement row with the `period` the list groups by. */
export type StatementRow = Statement & { period: string };

/** Legacy validate of the Çalışan Sayısı editor. */
export function validateEmployeeCount(value: CellValue): string | true {
  const raw = `${value ?? ''}`.trim();
  if (raw === '') return 'Çalışan sayısı boş olamaz';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Çalışan sayısı sayı olmalıdır';
  if (!Number.isInteger(n)) return 'Çalışan sayısı tam sayı olmalıdır';
  if (n < 0) return 'Çalışan sayısı 0 veya daha büyük olmalıdır';
  return true;
}

/** Totals show '-' when empty or zero (legacy `if (!value)`). */
function total(value: unknown, currency: string | null | undefined) {
  return value ? money(value, currency) : '-';
}

function Approvers({ row }: { row: Statement }) {
  const names = (Array.isArray(row.current_approvers) ? row.current_approvers : [])
    .map((a) => (a?.full_name || a?.username || '').trim())
    .filter(Boolean)
    .join(', ');
  return (
    <Stack gap={4} align="center">
      <StatementStatusBadge status={String(row.status)} />
      {names ? (
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          <FaIcon icon="fas fa-user-check" /> {names}
        </Text>
      ) : null}
    </Stack>
  );
}

export const statementColumns: DataTableColumn<StatementRow>[] = [
  {
    key: 'subcontractor_name',
    header: 'Taşeron',
    sortable: true,
    render: (row) => <strong>{row.subcontractor_name || '-'}</strong>,
  },
  {
    key: 'employee_count',
    header: 'Çalışan Sayısı',
    sortable: true,
    width: 140,
    // No min here: the legacy messages come from validate.
    editable: { type: 'number', step: 1, validate: validateEmployeeCount },
    render: (row) => {
      const value = row.employee_count;
      if (value === null || value === undefined || (value as unknown) === '') return '-';
      const n = Number.parseInt(String(value), 10);
      return Number.isFinite(n) ? n.toLocaleString('tr-TR') : '-';
    },
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    align: 'center',
    render: (row) => <Approvers row={row} />,
  },
  {
    key: 'work_total',
    header: 'İş Toplamı',
    sortable: true,
    align: 'right',
    render: (row) => total(row.work_total, row.currency),
  },
  {
    // Backend field is `adjustment_total`; older payloads sent adjustments_total.
    key: 'adjustment_total',
    header: 'Düzeltme',
    sortable: true,
    align: 'right',
    render: (row) => {
      const resolved = toNumber(
        (row.adjustment_total ?? row.adjustments_total ?? 0) as string | number | null,
      );
      if (resolved === null) return `0 ${row.currency || 'TRY'}`;
      return `${resolved >= 0 ? '+' : ''}${money(resolved, row.currency)}`;
    },
  },
  {
    key: 'grand_total',
    header: 'Genel Toplam (KDV Hariç)',
    sortable: true,
    align: 'right',
    render: (row) => total(row.grand_total, row.currency),
  },
];
