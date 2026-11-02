import { Button, Group, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  DEPARTMENT_OPTIONS,
  DEPARTMENT_REQUEST_PRIORITY_OPTIONS,
  DEPARTMENT_REQUEST_STATUS_OPTIONS,
  departmentRequestKeys,
  departmentRequestQueryOptions,
  departmentRequestsQueryOptions,
  useDeleteDepartmentRequest,
  type DepartmentRequest,
  type DepartmentRequestsParams,
} from '@/api/general/departmentRequests';
import { userLabel, useUsers } from '@/api/reference';
import {
  confirm,
  DataTable,
  errorMessage,
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
import { departmentRequestColumns } from './columns';
import { DepartmentRequestDetailModal } from './DepartmentRequestDetailModal';
import { DepartmentRequestFormModal } from './DepartmentRequestFormModal';

// Page state lives in the URL. `request` opens the detail modal (the link
// manufacturing/machining/tasks builds: ?request=<id>).
const URL_DEFAULTS = {
  search: '',
  status: '',
  department: '',
  priority: '',
  requestor: '',
  page: '1',
  page_size: '20',
  ordering: '-id',
  request: '',
};

type FilterKeys = 'search' | 'status' | 'department' | 'priority' | 'requestor';
type FilterState = Record<FilterKeys, string>;

const EMPTY_FILTERS: FilterState = {
  search: '',
  status: '',
  department: '',
  priority: '',
  requestor: '',
};
const EMPTY_ROWS: DepartmentRequest[] = [];

const toOptions = (list: readonly { value: string; label: string }[]) =>
  list.map(({ value, label }) => ({ value, label }));

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of general/department-requests/list (list.js). */
export function DepartmentRequestsListPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      status: values.status,
      department: values.department,
      priority: values.priority,
      requestor: values.requestor,
    }),
    [values.search, values.status, values.department, values.priority, values.requestor],
  );

  const users = useUsers();
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      {
        type: 'text',
        key: 'search',
        label: 'Ara',
        placeholder: 'Talep kodu veya başlık (örn. GS-10162)',
      },
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Durum seçin',
        searchable: false,
        options: toOptions(DEPARTMENT_REQUEST_STATUS_OPTIONS),
      },
      {
        type: 'select',
        key: 'department',
        label: 'Departman',
        placeholder: 'Departman seçin',
        searchable: false,
        options: toOptions(DEPARTMENT_OPTIONS),
      },
      {
        type: 'select',
        key: 'priority',
        label: 'Öncelik',
        placeholder: 'Öncelik seçin',
        searchable: false,
        options: toOptions(DEPARTMENT_REQUEST_PRIORITY_OPTIONS),
      },
      {
        type: 'select',
        key: 'requestor',
        label: 'Talep Eden',
        placeholder: users.isError ? 'Kullanıcı yüklenemedi' : 'Kullanıcı seçin',
        searchable: true,
        options: (users.data ?? []).map((u) => ({
          value: u.id ? String(u.id) : u.username,
          label: userLabel(u),
        })),
      },
    ],
    [users.data, users.isError],
  );

  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-id');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? '-id';

  const params: DepartmentRequestsParams = {
    page,
    page_size: pageSize,
    ordering,
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.requestor ? { requestor: filters.requestor } : {}),
  };
  const list = useQuery({
    ...departmentRequestsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error(`Talepler yüklenirken hata oluştu: ${errorMessage(list.error)}`);
  }, [list.isError, list.errorUpdatedAt, list.error]);

  // ---- details (?request=<id>) ----
  const detailId = values.request;
  const detail = useQuery({
    ...departmentRequestQueryOptions(detailId || 0),
    enabled: Boolean(detailId),
  });
  const closeDetail = () => apply({ request: '' });
  useEffect(() => {
    if (!detailId || !detail.isError) return;
    notify.error(`Talep detayları yüklenirken hata oluştu: ${errorMessage(detail.error)}`);
    apply({ request: '' });
  }, [detailId, detail.isError, detail.error, apply]);

  // ---- create / edit ----
  const [creating, setCreating] = useState(false);
  // The list rows carry no items or files; the edit modal shows both, so it
  // opens on the full record.
  const [editing, setEditing] = useState<DepartmentRequest | null>(null);
  const openEdit = async (id: number) => {
    try {
      setEditing(await queryClient.fetchQuery(departmentRequestQueryOptions(id)));
    } catch (error) {
      notify.error(`Talep detayları yüklenirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  // ---- delete ----
  const remove = useDeleteDepartmentRequest();
  const deleteRequest = async (row: DepartmentRequest) => {
    const ok = await confirm({
      title: 'Departman Talebini Sil',
      icon: 'fas fa-trash-alt',
      message: 'Bu departman talebini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      details: (
        <Group gap="sm" wrap="nowrap">
          <Text ff="monospace" size="xs" c="dimmed">
            #{row.id}
          </Text>
          <Text size="sm">{row.title || '-'}</Text>
        </Group>
      ),
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Departman talebi başarıyla silindi');
    } catch (error) {
      notify.error(`Departman talebi silinirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  const rowActions = (row: DepartmentRequest): RowAction<DepartmentRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => apply({ request: String(row.id) }),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'warning',
      onClick: () => void openEdit(row.id),
      hidden: !(row.status === 'draft' || row.status === 'submitted'),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteRequest(r),
      hidden: !(row.status === 'draft' || row.status === 'cancelled'),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({
        queryKey: departmentRequestKeys.all,
        refetchType: 'none',
      });
      apply({ page: '1' });
    }
  };

  return (
    <>
      <PageHeader
        title="Tüm Departman Talepleri"
        subtitle="Departman taleplerinin yönetimi ve takibi"
        icon="boxes"
        backTo="/general/department-requests"
        stats={[
          {
            id: 'total-requests-count',
            label: 'Toplam',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Talep Oluştur
          </Button>
        }
      />

      <DataTable
        title="Departman Talepleri"
        icon="fas fa-boxes"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              apply({ ...EMPTY_FILTERS, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={departmentRequestColumns}
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
        emptyMessage="Departman talebi bulunamadı."
        onRefresh={refresh}
      />

      {creating ? <DepartmentRequestFormModal onClose={() => setCreating(false)} /> : null}

      {editing ? (
        <DepartmentRequestFormModal
          key={editing.id}
          request={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {detailId ? (
        <DepartmentRequestDetailModal
          request={detail.data}
          loading={detail.isFetching}
          onClose={closeDetail}
        />
      ) : null}
    </>
  );
}
