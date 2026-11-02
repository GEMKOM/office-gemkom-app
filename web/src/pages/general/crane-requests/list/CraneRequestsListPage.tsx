import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  craneErrorText,
  craneMyPermissionsQueryOptions,
  craneRequestQueryOptions,
  craneRequestsQueryOptions,
  craneTypesQueryOptions,
  useCancelCraneRequest,
  type CraneRequest,
  type CraneRequestsParams,
  type CraneType,
} from '@/api/general/craneRequests';
import { useJobOrderOptions, userLabel, useUsers, type JobOrderOption } from '@/api/reference';
import { useAuth } from '@/auth/AuthProvider';
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
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import {
  actualCostColumn,
  craneTypeColumn,
  createdAtColumn,
  departmentColumn,
  durationColumn,
  estimatedCostColumn,
  jobNoColumn,
  neededDateColumn,
  priorityColumn,
  requestNumberColumn,
  statusColumn,
} from '../columns';
import { craneTypeLabel, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../crane';
import { CraneRequestDetailModal } from '../CraneRequestDetailModal';
import { CraneRequestCompleteModal } from './CraneRequestCompleteModal';
import { CraneRequestCreateModal } from './CraneRequestCreateModal';

// Filters, page and sort live in the URL; `request` is the legacy deep link
// that opens the details modal (notification e-mails, daily summary).
const URL_DEFAULTS = {
  status: '',
  crane_type: '',
  job_no: '',
  priority: '',
  requestor: '',
  page: '1',
  page_size: '20',
  ordering: '-id',
  request: '',
};

type FilterKeys = 'status' | 'crane_type' | 'job_no' | 'priority' | 'requestor';
type FilterState = Record<FilterKeys, string>;
const EMPTY_FILTERS: FilterState = {
  status: '',
  crane_type: '',
  job_no: '',
  priority: '',
  requestor: '',
};

const EMPTY_ROWS: CraneRequest[] = [];
const EMPTY_TYPES: CraneType[] = [];
const EMPTY_JOBS: JobOrderOption[] = [];

const columns: DataTableColumn<CraneRequest>[] = [
  requestNumberColumn,
  craneTypeColumn,
  jobNoColumn,
  departmentColumn,
  durationColumn,
  neededDateColumn(true),
  estimatedCostColumn,
  actualCostColumn,
  priorityColumn,
  statusColumn,
  createdAtColumn,
];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of general/crane-requests/list (list.js): Tüm Vinç Talepleri. */
export function CraneRequestsListPage() {
  const { user } = useAuth();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  // ---- reference data (a failure only empties its dropdown, as legacy) ----
  const permissions = useQuery(craneMyPermissionsQueryOptions());
  const canComplete = permissions.data?.can_complete === true;
  const craneTypes = useQuery(craneTypesQueryOptions()).data ?? EMPTY_TYPES;
  const jobOrders = useJobOrderOptions().data ?? EMPTY_JOBS;
  const users = useUsers().data;

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        options: STATUS_OPTIONS,
      },
      {
        type: 'select',
        key: 'crane_type',
        label: 'Ekipman',
        placeholder: 'Tümü',
        searchable: true,
        options: craneTypes.map((t) => ({ value: String(t.id), label: craneTypeLabel(t) })),
      },
      {
        type: 'select',
        key: 'job_no',
        label: 'İş Emri',
        placeholder: 'Tümü',
        searchable: true,
        options: jobOrders.map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
      },
      {
        type: 'select',
        key: 'priority',
        label: 'Öncelik',
        placeholder: 'Tümü',
        options: PRIORITY_OPTIONS,
      },
      {
        type: 'select',
        key: 'requestor',
        label: 'Talep Eden',
        placeholder: 'Tümü',
        searchable: true,
        options: (users ?? []).map((u) => ({
          value: u.id ? String(u.id) : u.username,
          label: userLabel(u),
        })),
      },
    ],
    [craneTypes, jobOrders, users],
  );

  // ---- list ----
  const filters: FilterState = {
    status: values.status,
    crane_type: values.crane_type,
    job_no: values.job_no,
    priority: values.priority,
    requestor: values.requestor,
  };
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-id');
  const params: CraneRequestsParams = {
    page,
    page_size: pageSize,
    ordering: toOrdering(sort.sortBy, sort.sortDir) ?? '-id',
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
  };
  const list = useQuery({
    ...craneRequestsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError)
      notify.error(`Talepler yüklenirken hata oluştu: ${craneErrorText(list.error)}`);
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // ---- details (?request=<id>) ----
  const requestId = values.request;
  const detail = useQuery({ ...craneRequestQueryOptions(requestId), enabled: Boolean(requestId) });
  const closeDetail = () => apply({ request: '' });
  useEffect(() => {
    if (!requestId || !detail.isError) return;
    notify.error(`Talep detayları yüklenirken hata oluştu: ${craneErrorText(detail.error)}`);
    apply({ request: '' });
  }, [requestId, detail.isError, detail.error, apply]);

  // ---- create / complete / cancel ----
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<CraneRequest | null>(null);
  const cancel = useCancelCraneRequest();

  const isOwnSubmitted = (row: CraneRequest) =>
    row.status === 'submitted' && row.requestor === user.id;

  const cancelRequest = async (row: CraneRequest) => {
    const ok = await confirm({
      title: 'Vinç Talebini İptal Et',
      icon: 'fas fa-ban',
      message: `${row.request_number} numaralı vinç talebini iptal etmek istediğinizden emin misiniz?`,
      confirmLabel: 'Evet, İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(row.id);
      notify.success('Vinç talebi iptal edildi');
      closeDetail();
    } catch (error) {
      notify.error(`Talep iptal edilirken hata oluştu: ${craneErrorText(error)}`);
    }
  };

  const rowActions = (row: CraneRequest): RowAction<CraneRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => apply({ request: String(row.id) }),
    },
    {
      key: 'complete',
      label: 'Tamamla (Fiili Değer Gir)',
      icon: 'fas fa-flag-checkered',
      color: 'success',
      hidden: !(row.status === 'approved' && canComplete),
      onClick: () => setCompleting(row),
    },
    {
      key: 'fix-actuals',
      label: 'Fiili Değeri Düzelt',
      icon: 'fas fa-pen',
      color: 'warning',
      hidden: !(row.status === 'completed' && canComplete),
      onClick: () => setCompleting(row),
    },
    {
      key: 'cancel',
      label: 'İptal Et',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: !isOwnSubmitted(row),
      onClick: (r) => void cancelRequest(r),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) void list.refetch();
    else apply({ page: '1' });
  };

  const request = detail.data ?? null;
  const detailFooter = request ? (
    <>
      {isOwnSubmitted(request) ? (
        <Button
          color="red"
          leftSection={<FaIcon icon="fas fa-ban" />}
          onClick={() => void cancelRequest(request)}
        >
          İptal Et
        </Button>
      ) : null}
      {request.can_complete ? (
        request.status === 'completed' ? (
          <Button
            color="yellow"
            leftSection={<FaIcon icon="fas fa-pen" />}
            onClick={() => setCompleting(request)}
          >
            Fiili Değeri Düzelt
          </Button>
        ) : (
          <Button
            color="green"
            leftSection={<FaIcon icon="fas fa-flag-checkered" />}
            onClick={() => setCompleting(request)}
          >
            Tamamla
          </Button>
        )
      ) : null}
    </>
  ) : null;

  return (
    <>
      <PageHeader
        title="Tüm Vinç Talepleri"
        subtitle="Kiralık vinç/platform taleplerinin yönetimi ve takibi"
        icon="fas fa-truck-pickup"
        backTo="/general/crane-requests"
        stats={[
          {
            id: 'crane-requests-total',
            label: 'Toplam',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Vinç Talebi
          </Button>
        }
      />

      <DataTable
        title="Vinç Talepleri"
        icon="fas fa-truck-pickup"
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
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-id', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={{ canComplete, userId: user.id }}
        emptyMessage="Vinç talebi bulunamadı."
        onRefresh={refresh}
      />

      {creating ? (
        <CraneRequestCreateModal
          craneTypes={craneTypes}
          jobOrders={jobOrders}
          onClose={() => setCreating(false)}
          onCreated={() => apply({ page: '1' })}
        />
      ) : null}

      {requestId ? (
        <CraneRequestDetailModal
          variant="list"
          request={request}
          loading={detail.isPending}
          onClose={closeDetail}
          footerActions={detailFooter}
        />
      ) : null}

      {completing ? (
        <CraneRequestCompleteModal
          key={completing.id}
          request={completing}
          craneTypes={craneTypes}
          onClose={() => setCompleting(null)}
          onCompleted={closeDetail}
        />
      ) : null}
    </>
  );
}
