import { Button, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelOvertimeRequest,
  canCancelOvertime,
  canResubmitOvertime,
  formatOvertimeDuration,
  overtimeRequestQueryOptions,
  overtimeRequestsQueryOptions,
  type OvertimeRequest,
  type OvertimeRequestsParams,
} from '@/api/general/overtime';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
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
import { OvertimeDetailModal } from '../shared/OvertimeDetailModal';
import {
  actionError,
  isOvertimeApprover,
  requestColumns,
  useInvalidateOvertime,
} from '../shared/shared';
import { OvertimeFormModal } from './OvertimeFormModal';

// `request` is the legacy deep link that opens the details modal.
const URL_DEFAULTS = {
  search: '',
  status: '',
  team: '',
  start_date: '',
  end_date: '',
  page: '1',
  page_size: '20',
  ordering: '',
  request: '',
};

type FilterKeys = 'search' | 'status' | 'team' | 'start_date' | 'end_date';
type FilterState = Record<FilterKeys, string>;

export const TEAM_OPTIONS = [
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'design', label: 'Dizayn' },
  { value: 'logistics', label: 'Lojistik' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'welding', label: 'Kaynaklı İmalat' },
  { value: 'planning', label: 'Planlama' },
  { value: 'manufacturing', label: 'İmalat' },
  { value: 'maintenance', label: 'Bakım' },
  { value: 'qualitycontrol', label: 'Kalite Kontrol' },
  { value: 'cutting', label: 'CNC Kesim' },
  { value: 'warehouse', label: 'Ambar' },
  { value: 'finance', label: 'Finans' },
  { value: 'management', label: 'Yönetim' },
  { value: 'sales', label: 'Proje Taahhüt' },
];

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Neden, iş no, açıklama...' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'submitted', label: 'Bekliyor' },
      { value: 'approved', label: 'Onaylandı' },
      { value: 'rejected', label: 'Reddedildi' },
      { value: 'cancelled', label: 'İptal Edildi' },
    ],
  },
  { type: 'select', key: 'team', label: 'Takım', placeholder: 'Tümü', options: TEAM_OPTIONS },
  { type: 'date', key: 'start_date', label: 'Başlangıç Tarihi' },
  { type: 'date', key: 'end_date', label: 'Bitiş Tarihi' },
];

const EMPTY_FILTERS: FilterState = {
  search: '',
  status: '',
  team: '',
  start_date: '',
  end_date: '',
};
const EMPTY_ROWS: OvertimeRequest[] = [];
// The registry sorts on the server, and OvertimeRequestViewSet orders by these only.
const SERVER_SORTABLE = new Set(['start_at', 'end_at', 'status', 'created_at']);
const columns = requestColumns({ withCreatedAt: true }).map((column) =>
  SERVER_SORTABLE.has(column.key) ? column : { ...column, sortable: false },
);

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Port of general/overtime/registry (overtimeList.js). */
export function OvertimeRegistryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOvertime();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      status: values.status,
      team: values.team,
      start_date: values.start_date,
      end_date: values.end_date,
    }),
    [values.search, values.status, values.team, values.start_date, values.end_date],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering);

  const params: OvertimeRequestsParams = {
    ...filters,
    ordering: values.ordering || undefined,
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...overtimeRequestsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Mesai talepleri yüklenirken hata oluştu.');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy counts these on the loaded page; only the total is server-wide.
  const stats = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === 'submitted').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      hours: rows.reduce(
        (sum, r) => sum + (Number.parseFloat(String(r.duration_hours ?? 0)) || 0),
        0,
      ),
    }),
    [rows],
  );
  const figure = (value: string) => (list.isPending ? '–' : value);

  // ---- details (deep link) ----
  const closeDetails = useCallback(() => apply({ request: '' }), [apply]);
  // The registry shows Onayla / Reddet only to the request's approvers.
  const canDecide = useCallback(
    (request: OvertimeRequest, userId: number) => isOvertimeApprover(request, userId),
    [],
  );

  // ---- create / re-submit ----
  const [creating, setCreating] = useState(false);
  const [resubmitting, setResubmitting] = useState<OvertimeRequest | null>(null);
  const openResubmit = async (id: number) => {
    try {
      // Fresh copy: the form starts from the request's current entries.
      setResubmitting(
        await queryClient.fetchQuery({ ...overtimeRequestQueryOptions(id), staleTime: 0 }),
      );
    } catch {
      notify.error('Talep yüklenirken hata oluştu.');
    }
  };

  // ---- cancel ----
  const cancelRequest = async (row: OvertimeRequest) => {
    const ok = await confirm({
      title: 'Mesai Talebini İptal Et',
      subtitle: 'İptal Onayı',
      icon: 'fas fa-ban',
      message: 'Bu mesai talebini iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      details: (
        <Text size="sm" component="div">
          <div>
            <b>Talep No:</b> #{row.id}
          </div>
          <div>
            <b>Başlangıç:</b> {formatDateTime(row.start_at)}
          </div>
          <div>
            <b>Bitiş:</b> {formatDateTime(row.end_at)}
          </div>
          <div>
            <b>Süre:</b> {formatOvertimeDuration(row.duration_hours)}
          </div>
        </Text>
      ),
      confirmLabel: 'İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelOvertimeRequest(row.id);
      notify.success('Mesai talebi başarıyla iptal edildi.');
      await invalidate();
    } catch (error) {
      notify.error(actionError(error, 'Mesai talebi iptal edilirken hata oluştu.'));
    }
  };

  const rowActions = (row: OvertimeRequest): RowAction<OvertimeRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => apply({ request: String(row.id) }),
    },
    {
      key: 'resubmit',
      label: 'Düzenle & Gönder',
      icon: 'fas fa-redo',
      color: 'warning',
      hidden: !canResubmitOvertime(row, user.id),
      onClick: () => void openResubmit(row.id),
    },
    {
      key: 'cancel',
      label: 'İptal Et',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: !canCancelOvertime(row, user.id),
      onClick: (r) => void cancelRequest(r),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1.
    if (page === 1) void list.refetch();
    else apply({ page: '1' });
  };

  return (
    <>
      <PageHeader
        title="Mesai Talepleri"
        subtitle="Mesai talepleri takibi ve yönetimi"
        icon="clock"
        backTo="/general/overtime"
        stats={[
          {
            id: 'total-requests',
            label: 'Toplam Talep',
            value: figure(total.toLocaleString('tr-TR')),
          },
          {
            id: 'pending-requests',
            label: 'Bekleyen Talepler',
            value: figure(String(stats.pending)),
          },
          { id: 'approved-requests', label: 'Onaylanan', value: figure(String(stats.approved)) },
          {
            id: 'total-hours',
            label: 'Toplam Mesai Saati',
            value: figure(formatOvertimeDuration(stats.hours)),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Mesai Talebi
          </Button>
        }
      />

      <DataTable
        title="Mesai Talepleri"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={user.id}
        emptyMessage="Henüz mesai talebi bulunmamaktadır"
        onRefresh={refresh}
        exportable={{ fileName: `mesai-talepleri_${todayIso()}` }}
      />

      {values.request ? (
        <OvertimeDetailModal
          key={values.request}
          requestId={values.request}
          onClose={closeDetails}
          canDecide={canDecide}
        />
      ) : null}

      {creating ? (
        <OvertimeFormModal onClose={() => setCreating(false)} onSaved={() => void invalidate()} />
      ) : null}

      {resubmitting ? (
        <OvertimeFormModal
          key={resubmitting.id}
          request={resubmitting}
          onClose={() => setResubmitting(null)}
          onSaved={() => void invalidate()}
        />
      ) : null}
    </>
  );
}
