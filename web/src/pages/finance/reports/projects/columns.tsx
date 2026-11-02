import { Group, Stack, Text } from '@mantine/core';
import type { ProjectReportRow } from '@/api/finance/projectsReport';
import { formatDate, toDate, toNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const EUR_FORMAT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Legacy formatCurrency: "1.234,50 EUR"; empty or not a number is "0,00 EUR". */
export function formatEur(value: string | number | null | undefined): string {
  return `${EUR_FORMAT.format(toNumber(value) ?? 0)} EUR`;
}

function quantities(value: ProjectReportRow['ordered_qty_by_unit']): string {
  if (!value || typeof value !== 'object') return '-';
  const parts = Object.entries(value).map(
    ([unit, qty]) => `${(Number.parseFloat(String(qty)) || 0).toLocaleString('tr-TR')} ${unit}`,
  );
  return parts.length ? parts.join(', ') : '-';
}

type EurKey = 'committed_net_eur' | 'unpaid_eur' | 'pending_pr_estimate_eur' | 'forecast_eur';

function eurColumn(
  key: EurKey,
  header: string,
  redWhenPositive = false,
): DataTableColumn<ProjectReportRow> {
  return {
    key,
    header,
    sortable: true,
    align: 'right',
    render: (row) => {
      const n = toNumber(row[key]);
      return (
        <Text
          span
          size="sm"
          fw={600}
          ff="monospace"
          c={redWhenPositive && n !== null && n > 0 ? 'red.7' : undefined}
          style={{ whiteSpace: 'nowrap' }}
        >
          {formatEur(row[key])}
        </Text>
      );
    },
    exportValue: (row) => toNumber(row[key]) ?? 0,
  };
}

function Suppliers({ suppliers }: { suppliers: ProjectReportRow['top_suppliers_by_spend'] }) {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return <>-</>;
  return (
    <Stack gap={2} miw={200}>
      {suppliers.slice(0, 2).map((supplier, index) => {
        const name = supplier.name ?? '';
        return (
          <Group key={`${name}-${index}`} justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" title={name} truncate style={{ maxWidth: '60%', cursor: 'help' }}>
              {name.length > 15 ? `${name.substring(0, 15)}...` : name}
            </Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {formatEur(supplier.total_eur)}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}

// Module scope so DataTable rows stay memoized. Sortable set = legacy table.
export const projectReportColumns: DataTableColumn<ProjectReportRow>[] = [
  {
    key: 'job_no',
    header: 'İş No',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.job_no || '-'}</span>,
  },
  {
    key: 'distinct_items',
    header: 'Ürün Sayısı',
    sortable: true,
    align: 'right',
    render: (row) => row.distinct_items || 0,
    exportValue: (row) => row.distinct_items || 0,
  },
  {
    key: 'ordered_qty_by_unit',
    header: 'Sipariş Miktarı',
    sortable: false,
    render: (row) => (
      <Text span size="xs" c="dimmed">
        {quantities(row.ordered_qty_by_unit)}
      </Text>
    ),
    exportValue: (row) => quantities(row.ordered_qty_by_unit),
  },
  {
    key: 'total_pos',
    header: 'Toplam PO',
    sortable: true,
    align: 'right',
    render: (row) => row.total_pos || 0,
    exportValue: (row) => row.total_pos || 0,
  },
  {
    key: 'active_pos',
    header: 'Aktif PO',
    sortable: true,
    align: 'right',
    render: (row) => <StatusBadge color="green">{row.active_pos || 0}</StatusBadge>,
    exportValue: (row) => row.active_pos || 0,
  },
  eurColumn('committed_net_eur', 'Taahhüt Edilen (EUR)'),
  eurColumn('unpaid_eur', 'Ödenmemiş (EUR)', true),
  eurColumn('pending_pr_estimate_eur', 'Bekleyen PR (EUR)'),
  eurColumn('forecast_eur', 'Tahmin (EUR)'),
  {
    key: 'top_suppliers_by_spend',
    header: 'Ana Tedarikçiler',
    sortable: false,
    render: (row) => <Suppliers suppliers={row.top_suppliers_by_spend} />,
    exportValue: (row) =>
      (row.top_suppliers_by_spend ?? [])
        .slice(0, 2)
        .map((s) => `${s.name} (${formatEur(s.total_eur)})`)
        .join(', '),
  },
  {
    key: 'last_activity_at',
    header: 'Son Aktivite',
    sortable: true,
    render: (row) => formatDate(row.last_activity_at),
    exportValue: (row) => toDate(row.last_activity_at),
  },
];
