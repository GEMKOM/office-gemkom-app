import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  staffReportQueryOptions,
  type ReportNumber,
  type StaffReportRow,
} from '@/api/procurement/reports';
import { useUsers, userLabel } from '@/api/reference/users';
import { formatDateTime } from '@/lib/format';
import {
  DataTable,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { amount, chips, euro, exportDate, exportNumber, today } from '../reportFormat';

const DEFAULT_ORDERING = '-total_spent_eur';
const URL_DEFAULTS = { user: '', ordering: DEFAULT_ORDERING };

const EMPTY_ROWS: StaffReportRow[] = [];

function quantities(value: Record<string, ReportNumber> | null | undefined): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([unit, qty]) => `${amount(qty)} ${unit}`);
}

const count = (value: number | undefined) => value || 0;

// Legacy table type 'date': toLocaleDateString with the time.
const ACTIVITY_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export const staffReportColumns: DataTableColumn<StaffReportRow>[] = [
  {
    key: 'username',
    header: 'Kullanıcı Adı',
    render: (row) => <strong>{row.username || '-'}</strong>,
  },
  { key: 'full_name', header: 'Ad Soyad' },
  {
    key: 'pr_count',
    header: 'PR Sayısı',
    align: 'right',
    render: (row) => count(row.pr_count),
    exportValue: (row) => count(row.pr_count),
  },
  {
    key: 'po_count',
    header: 'PO Sayısı',
    align: 'right',
    render: (row) => count(row.po_count),
    exportValue: (row) => count(row.po_count),
  },
  {
    key: 'total_spent_eur',
    header: 'Toplam Harcama',
    align: 'right',
    render: (row) => <strong>{euro(row.total_spent_eur)}</strong>,
    exportHeader: 'Toplam Harcama (€)',
    exportValue: (row) => exportNumber(row.total_spent_eur),
  },
  {
    key: 'distinct_items_in_prs',
    header: 'Farklı Ürün Sayısı',
    align: 'right',
    render: (row) => count(row.distinct_items_in_prs),
    exportValue: (row) => count(row.distinct_items_in_prs),
  },
  {
    key: 'requested_qty_by_unit',
    header: 'Talep Edilen Miktar',
    sortable: false,
    render: (row) => chips(quantities(row.requested_qty_by_unit)),
    exportValue: (row) => quantities(row.requested_qty_by_unit).join(', '),
  },
  {
    key: 'ordered_qty_by_unit',
    header: 'Sipariş Edilen Miktar',
    sortable: false,
    render: (row) => chips(quantities(row.ordered_qty_by_unit)),
    exportValue: (row) => quantities(row.ordered_qty_by_unit).join(', '),
  },
  {
    key: 'last_activity_at',
    header: 'Son Aktivite',
    render: (row) =>
      row.last_activity_at ? formatDateTime(row.last_activity_at, ACTIVITY_FORMAT) : '-',
    exportValue: (row) => exportDate(row.last_activity_at),
  },
];

/** Port of procurement/reports/staff (staff.js). */
export function StaffReportPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const sort = fromOrdering(values.ordering || DEFAULT_ORDERING);
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? DEFAULT_ORDERING;

  const users = useUsers();
  const filterConfig = useMemo<FilterConfig<'user'>[]>(
    () => [
      {
        type: 'select',
        key: 'user',
        label: 'Personel',
        placeholder: 'Tüm personel',
        options: (users.data ?? []).map((user) => ({
          value: String(user.id),
          label: userLabel(user),
        })),
      },
    ],
    [users.data],
  );

  const report = useQuery({
    ...staffReportQueryOptions({ ordering }),
    placeholderData: keepPreviousData,
  });

  // The legacy Personel filter was never sent (getStaffReport has no user
  // param), so it did nothing; it now narrows the rows to that user.
  const selectedUser = users.data?.find((user) => String(user.id) === values.user);
  const rows = useMemo(() => {
    const all = report.data ?? EMPTY_ROWS;
    if (!values.user) return all;
    if (!selectedUser) return EMPTY_ROWS;
    return all.filter((row) => row.username === selectedUser.username);
  }, [report.data, values.user, selectedUser]);

  useEffect(() => {
    if (report.isError)
      notify.error(report.error, { fallback: 'Personel raporu yüklenirken hata oluştu' });
  }, [report.isError, report.error, report.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Personel Raporu"
        subtitle="Satın alma personeli performans analizleri ve metrikleri"
        icon="fas fa-chart-bar"
        backTo="/procurement/reports"
      />

      <DataTable
        title="Personel Raporu"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ user: values.user }}
            onApply={(next) => apply(next)}
            onClear={() => apply({ user: '' })}
          />
        }
        data={rows}
        columns={staffReportColumns}
        getRowId={(row, index) => row.username ?? String(index)}
        loading={report.isFetching}
        sortable
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING }),
        }}
        pagination={{ pageSize: 20 }}
        exportable={{ fileName: `personel_raporu_${today()}` }}
        onRefresh={() => void report.refetch()}
        emptyMessage="Veri bulunamadı"
      />
    </>
  );
}
