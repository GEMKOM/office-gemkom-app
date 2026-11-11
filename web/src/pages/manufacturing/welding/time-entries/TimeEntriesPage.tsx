import { Button, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { useJobOrderOptions, type JobOrderOption } from '@/api/reference/jobOrders';
import { userLabel, useUsers, type UserOption } from '@/api/reference/users';
import {
  useDeleteWeldingTimeEntry,
  weldingTimeEntriesQueryOptions,
  type WeldingTimeEntriesParams,
  type WeldingTimeEntry,
} from '@/api/welding/timeEntries';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { BulkCreateModal } from './BulkCreateModal';
import { OVERTIME_OPTIONS } from './bulkPaste';
import { formatHours, timeEntryColumns } from './columns';
import { TimeEntryFormModal } from './TimeEntryFormModal';

// Filters, page and sort live in the URL under the backend's own param names
// (legacy kept them in the filter form only).
const URL_DEFAULTS = {
  employee: '',
  employee_username: '',
  job_no: '',
  description: '',
  date: '',
  date_after: '',
  date_before: '',
  hours_min: '',
  hours_max: '',
  overtime_type: '',
  page: '1',
  page_size: '20',
  ordering: '-date',
};

type FilterKeys =
  | 'employee'
  | 'employee_username'
  | 'job_no'
  | 'description'
  | 'date'
  | 'date_after'
  | 'date_before'
  | 'hours_min'
  | 'hours_max'
  | 'overtime_type';
type FilterState = Record<FilterKeys, string>;

const FILTER_KEYS: FilterKeys[] = [
  'employee',
  'employee_username',
  'job_no',
  'description',
  'date',
  'date_after',
  'date_before',
  'hours_min',
  'hours_max',
  'overtime_type',
];

const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])) as FilterState;
const EMPTY_ROWS: WeldingTimeEntry[] = [];
const EMPTY_USERS: UserOption[] = [];
const EMPTY_JOBS: JobOrderOption[] = [];

function filterConfig(users: readonly UserOption[]): FilterConfig<FilterKeys>[] {
  return [
    {
      type: 'text',
      key: 'job_no',
      label: 'İş No',
      placeholder: 'İş numarası',
      span: 2,
      suggestions: 'jobOrders',
    },
    {
      type: 'select',
      key: 'employee',
      label: 'Çalışan',
      placeholder: 'Çalışan seçin',
      searchable: true,
      options: users.map((u) => ({ value: String(u.id), label: userLabel(u) })),
      span: 2,
    },
    {
      type: 'text',
      key: 'employee_username',
      label: 'Kullanıcı Adı',
      placeholder: 'Kullanıcı adı',
      span: 2,
    },
    { type: 'text', key: 'description', label: 'Açıklama', placeholder: 'Açıklama', span: 2 },
    { type: 'date', key: 'date', label: 'Tarih', span: 2 },
    { type: 'date', key: 'date_after', label: 'Tarih (Başlangıç)', span: 2 },
    { type: 'date', key: 'date_before', label: 'Tarih (Bitiş)', span: 2 },
    {
      type: 'text',
      inputType: 'number',
      key: 'hours_min',
      label: 'Min. Saat',
      placeholder: '0.00',
      span: 2,
    },
    {
      type: 'text',
      inputType: 'number',
      key: 'hours_max',
      label: 'Max. Saat',
      placeholder: '0.00',
      span: 2,
    },
    {
      type: 'select',
      key: 'overtime_type',
      label: 'Mesai Tipi',
      placeholder: 'Tümü',
      searchable: false,
      options: OVERTIME_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      span: 2,
    },
  ];
}

/** Legacy loadTimeEntries: only the filled filters, numbers parsed. */
function filterParams(values: FilterState): WeldingTimeEntriesParams {
  const params: WeldingTimeEntriesParams = {};
  const employee = Number.parseInt(values.employee, 10);
  if (values.employee && !Number.isNaN(employee)) params.employee = employee;
  if (values.employee_username) params.employee_username = values.employee_username;
  if (values.job_no) params.job_no = values.job_no;
  if (values.description) params.description = values.description;
  if (values.date) params.date = values.date;
  if (values.date_after) params.date_after = values.date_after;
  if (values.date_before) params.date_before = values.date_before;
  const min = Number.parseFloat(values.hours_min);
  if (values.hours_min && !Number.isNaN(min)) params.hours_min = min;
  const max = Number.parseFloat(values.hours_max);
  if (values.hours_max && !Number.isNaN(max)) params.hours_max = max;
  if (values.overtime_type) params.overtime_type = values.overtime_type;
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function employeeNameForDelete(row: WeldingTimeEntry): string {
  if (row.employee_full_name) return row.employee_full_name;
  const emp = row.employee;
  if (emp && typeof emp === 'object') {
    return emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
  }
  return row.employee_username || '-';
}

/** Port of manufacturing/welding/time-entries (time-entries.js). */
export function TimeEntriesPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo(
    () => Object.fromEntries(FILTER_KEYS.map((k) => [k, values[k]])) as FilterState,
    [values],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-date');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: WeldingTimeEntriesParams = {
    ...filterParams(filters),
    page,
    page_size: pageSize,
    ordering,
  };
  const list = useQuery({
    ...weldingTimeEntriesQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Zaman kayıtları yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy loadUsers: pickers offer active staff; pasted names may still
  // match someone who has since left, so matching also gets every account.
  const usersQuery = useUsers();
  const users = usersQuery.data ?? EMPTY_USERS;
  const allUsersQuery = useUsers({ is_active: 'all' });
  const allUsers = allUsersQuery.data ?? EMPTY_USERS;

  // Legacy getJobOrderDropdown(true): every job order, closed ones included.
  const jobsQuery = useJobOrderOptions({ includeAll: true });
  const jobOrders = jobsQuery.data ?? EMPTY_JOBS;
  useEffect(() => {
    if (jobsQuery.isError) notify.error('İş emirleri yüklenirken hata oluştu');
  }, [jobsQuery.isError]);

  const filterList = useMemo(() => filterConfig(users), [users]);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<WeldingTimeEntry | null>(null);

  const remove = useDeleteWeldingTimeEntry();
  const deleteEntry = async (row: WeldingTimeEntry) => {
    if (!row?.id) {
      notify.error('Geçersiz zaman kaydı');
      return;
    }
    const ok = await confirm({
      title: 'Zaman Kaydını Sil',
      icon: 'fas fa-trash-alt',
      message: 'Bu zaman kaydını silmek istediğinizden emin misiniz?',
      details: (
        <div>
          <div>
            <strong>Çalışan:</strong> {employeeNameForDelete(row)}
          </div>
          <div>
            <strong>İş No:</strong> {row.job_no || '-'}
          </div>
          <div>
            <strong>Tarih:</strong> {row.date ? formatDate(row.date) : '-'}
          </div>
          <div>
            <strong>Saat:</strong> {row.hours ? formatHours(row.hours) : '-'}
          </div>
        </div>
      ),
      description: 'Bu işlem geri alınamaz ve zaman kaydı kalıcı olarak silinecektir.',
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Zaman kaydı başarıyla silindi');
    } catch (error) {
      console.error('Error deleting time entry:', error);
      notify.error('Zaman kaydı silinirken hata oluştu');
    }
  };

  const rowActions = (): RowAction<WeldingTimeEntry>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => {
        if (!r?.id) notify.error('Geçersiz zaman kaydı');
        else setEditing(r);
      },
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteEntry(r),
    },
  ];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Kaynak Zaman Kayıtları"
        subtitle="Kaynak zaman kayıtlarını görüntüleyin ve yönetin"
        icon="clock"
        backTo="/manufacturing/welding/"
        stats={[
          {
            id: 'time-entries-count',
            label: 'Kayıt',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
        actions={
          <Button
            leftSection={<FaIcon icon="fas fa-layer-group" />}
            onClick={() => setBulkOpen(true)}
          >
            Toplu Oluştur
          </Button>
        }
      />

      <DataTable
        title="Zaman Kayıtları"
        icon="fas fa-clock"
        filters={
          <FilterBar
            inline
            filters={filterList}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              apply({ ...EMPTY_FILTERS, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={timeEntryColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-date', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage={
          <Text c="dimmed" size="sm">
            <FaIcon icon="fas fa-clock" /> Zaman kaydı bulunamadı
          </Text>
        }
        onRefresh={() => void list.refetch()}
        exportable={{ fileName: `time-entries-table-container_${today}` }}
      />

      {bulkOpen ? (
        <BulkCreateModal
          users={users}
          allUsers={allUsers}
          jobOrders={jobOrders}
          onClose={() => setBulkOpen(false)}
        />
      ) : null}

      {editing ? (
        <TimeEntryFormModal
          key={editing.id}
          entry={editing}
          users={users}
          jobOrders={jobOrders}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
