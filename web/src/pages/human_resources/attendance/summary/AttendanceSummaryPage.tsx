import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  attendanceSummaryQueryOptions,
  type AttendanceSummaryRow,
} from '@/api/human_resources/attendanceAdmin';
import { usePositions } from '@/api/human_resources/organization';
import {
  DataTable,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';

function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const raw = String(value);
  // A bare date is a local day, not UTC midnight.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('tr-TR');
}

function fmtMinutes(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0 dk';
  return `${n.toLocaleString('tr-TR')} dk`;
}

function fmtCount(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('tr-TR') : '0';
}

const count = (
  key: Extract<keyof AttendanceSummaryRow, string>,
  header: string,
): DataTableColumn<AttendanceSummaryRow> => ({
  key,
  header,
  align: 'right',
  render: (row) => fmtCount(row[key]),
  exportValue: (row) => Number(row[key] ?? 0),
});

const minutes = (
  key: Extract<keyof AttendanceSummaryRow, string>,
  header: string,
): DataTableColumn<AttendanceSummaryRow> => ({
  key,
  header,
  align: 'right',
  render: (row) => fmtMinutes(row[key]),
  exportValue: (row) => Number(row[key] ?? 0),
});

const columns: DataTableColumn<AttendanceSummaryRow>[] = [
  {
    key: 'user_display',
    header: 'Kullanıcı',
    render: (row) => <strong>{row.user_display || '-'}</strong>,
  },
  { key: 'date_from', header: 'Başlangıç', render: (row) => fmtDate(row.date_from) },
  { key: 'date_to', header: 'Bitiş', render: (row) => fmtDate(row.date_to) },
  count('total_working_days', 'İş Günü'),
  count('days_present', 'Geldiği Gün'),
  count('days_leave', 'İzin Gün'),
  count('days_absent', 'Devamsız'),
  count('session_count', 'Oturum'),
  minutes('total_present_minutes', 'Ofiste'),
  minutes('total_expected_minutes', 'Beklenen'),
  minutes('total_overtime_minutes', 'Mesai'),
  minutes('total_late_minutes', 'Geç Kalma'),
  minutes('total_early_leave_minutes', 'Erken Çıkış'),
];

type FilterKeys =
  'name' | 'date_from' | 'date_to' | 'user_id' | 'username' | 'group_id' | 'group_name' | 'absent';
type FilterState = Record<FilterKeys, string>;

const EMPTY_ROWS: AttendanceSummaryRow[] = [];

/** Port of human_resources/attendance/summary (summary.js). */
export function AttendanceSummaryPage() {
  // Both dates default to today, as legacy did (and Temizle goes back to it).
  const [today] = useState(todayIso);
  const url = useUrlFilters<FilterState>({
    name: '',
    date_from: today,
    date_to: today,
    user_id: '',
    username: '',
    group_id: '',
    group_name: '',
    // '1': only people with an absent working day (the HR hub's data check).
    absent: '',
  });
  const { values, apply, reset } = url;
  const { absent, ...params } = values;
  // Temizle while already on the defaults changes no value, so the bar would
  // keep its emptied draft; a new key remounts it on the applied values.
  const [clears, setClears] = useState(0);
  const clear = () => {
    reset();
    setClears((n) => n + 1);
  };

  const positions = usePositions();
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'name', label: 'Ad/Soyad', placeholder: 'Ad/Soyad (örn: Ahmet)' },
      { type: 'date', key: 'date_from', label: 'Başlangıç' },
      { type: 'date', key: 'date_to', label: 'Bitiş' },
      {
        type: 'text',
        key: 'user_id',
        label: 'Kullanıcı ID',
        placeholder: 'Örn: 5',
        inputType: 'number',
      },
      { type: 'text', key: 'username', label: 'Kullanıcı adı', placeholder: 'Örn: ahmet' },
      {
        type: 'select',
        key: 'group_id',
        label: 'Grup',
        placeholder: 'Tümü',
        searchable: true,
        // Legacy fills the Grup filter with the active positions.
        options: (positions.data ?? [])
          .filter((p) => p.is_active !== false)
          .map((p) => ({ value: String(p.id), label: p.title || String(p.id) })),
      },
      { type: 'text', key: 'group_name', label: 'Grup adı', placeholder: 'Örn: Satış' },
      {
        type: 'select',
        key: 'absent',
        label: 'Devamsızlık',
        placeholder: 'Tümü',
        searchable: false,
        options: [{ value: '1', label: 'Devamsız günü olanlar' }],
      },
    ],
    [positions.data],
  );

  const list = useQuery({
    ...attendanceSummaryQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  // The absence filter is not a backend param: the rows are all loaded.
  const allRows = list.data ?? EMPTY_ROWS;
  const rows = useMemo(
    () => (absent === '1' ? allRows.filter((row) => (row.days_absent ?? 0) > 0) : allRows),
    [allRows, absent],
  );

  useEffect(() => {
    if (list.isError)
      notify.error(`Özet veriler yüklenemedi: ${list.error?.message || list.error}`);
  }, [list.isError, list.error, list.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="PDKS Özet"
        subtitle="Kullanıcı bazlı devam, geç kalma ve mesai özetlerini görüntüleyin"
        backTo="/human_resources/attendance"
        stats={[
          {
            id: 'summary-user-count',
            label: 'Kullanıcı',
            value: list.isPending ? '–' : rows.length,
          },
        ]}
      />

      <DataTable
        title="Kullanıcı Bazlı Özet"
        filters={
          <FilterBar
            key={clears}
            inline
            filters={filterConfig}
            values={values}
            onApply={apply}
            onClear={clear}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row, index) => String(row.user_id ?? index)}
        loading={list.isFetching}
        emptyMessage="Özet veri bulunamadı"
        onRefresh={() => void list.refetch()}
      />
    </>
  );
}
