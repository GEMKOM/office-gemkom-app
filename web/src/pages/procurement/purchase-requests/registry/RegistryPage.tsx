import { Button, Group } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPerm, isSuperuser } from '@/auth/authService';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import {
  cancelPurchaseRequest,
  invalidatePurchaseRequests,
  purchaseRequestListQueryOptions,
  revisePurchaseRequest,
  statusChoicesQueryOptions,
  type PurchaseRequestDetail,
  type PurchaseRequestRow,
} from '@/api/procurement/purchaseRequests';
import { useUsers } from '@/api/reference/users';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
  type SortDir,
} from '@/ui';
import { baseColumns, listOrdering } from '../shared/columns';
import { RequestDetailsModal } from '../shared/RequestDetailsModal';
import { useTalepDeepLink } from '../shared/useTalepDeepLink';
import { EvaluationModal } from './EvaluationModal';
import {
  FALLBACK_STATUSES,
  PROCUREMENT_TEAM_GROUP,
  registryCounts,
  registryParams,
  requestorOptions,
  type RegistryFilters,
} from './logic';

// Port of procurement/purchase-requests/registry/registry.js.

const EMPTY: PurchaseRequestRow[] = [];

/** Legacy canWriteProcurement. */
export function canWriteProcurement(): boolean {
  return isSuperuser() || hasPerm('access_procurement_purchase_requests_create');
}

export function RegistryPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // The registry opens on the current user's requests (legacy default).
  const { values, apply } = useUrlFilters<RegistryFilters>({
    request_number: '',
    requestor: user?.id ? String(user.id) : '',
    status: '',
    priority: '',
    created_at__gte: '',
    page: '1',
    page_size: '20',
  });
  const [sort, setSort] = useState<{ sortBy: string | null; sortDir: SortDir }>({
    sortBy: null,
    sortDir: 'asc',
  });
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(values.page_size, 10) || 20);

  const params = useMemo(
    () => ({
      ...registryParams(values),
      ordering: listOrdering(sort.sortBy, sort.sortDir),
      page,
      page_size: pageSize,
    }),
    [values, sort, page, pageSize],
  );
  const list = useQuery(purchaseRequestListQueryOptions('all', params));
  const rows = list.data?.results ?? EMPTY;

  const users = useUsers({ group: PROCUREMENT_TEAM_GROUP });
  const statuses = useQuery(statusChoicesQueryOptions());
  const deepLink = useTalepDeepLink((talep, hadResults) =>
    hadResults
      ? `API arama hatası: ${talep} için tam eşleşme bulunamadı`
      : `Talep ${talep} bulunamadı`,
  );
  const [evaluating, setEvaluating] = useState<number | null>(null);

  const counts = registryCounts(rows);

  const filters = useMemo<FilterConfig<keyof RegistryFilters>[]>(
    () => [
      {
        key: 'request_number',
        type: 'text',
        label: 'Talep No',
        placeholder: 'Talep numarası girin...',
      },
      {
        key: 'requestor',
        type: 'select',
        label: 'Talep Eden',
        searchable: true,
        options: [
          { value: '', label: 'Tüm Kullanıcılar' },
          ...requestorOptions(users.data ?? [], user),
        ],
      },
      {
        key: 'status',
        type: 'select',
        label: 'Durum',
        options: [
          { value: '', label: 'Tüm Durumlar' },
          ...(statuses.isError ? FALLBACK_STATUSES : (statuses.data ?? [])).map((s) => ({
            value: s.value,
            label: s.label,
          })),
        ],
      },
      {
        key: 'priority',
        type: 'select',
        label: 'Öncelik',
        options: [
          { value: '', label: 'Tüm Öncelikler' },
          { value: 'normal', label: 'Normal' },
          { value: 'urgent', label: 'Acil' },
          { value: 'critical', label: 'Kritik' },
        ],
      },
      { key: 'created_at__gte', type: 'date', label: 'Oluşturulma Tarihi' },
    ],
    [users.data, statuses.data, statuses.isError, user],
  );

  const revise = useCallback(
    async (row: PurchaseRequestRow) => {
      const ok = await confirm({
        title: 'Revize Et',
        message: `"${row.request_number || row.id}" numaralı talebi revize etmek istediğinize emin misiniz? Talep iptal edilecektir ve talebin bir kopyası taslaklara kaydedilecektir.`,
        confirmLabel: 'Revize Et',
        cancelLabel: 'İptal',
      });
      if (!ok) return;
      try {
        await revisePurchaseRequest(row.id);
        notify.success('Talep başarıyla revize edildi');
        await invalidatePurchaseRequests(queryClient);
      } catch (error) {
        notify.error(`Talep revize edilirken hata oluştu: ${(error as Error).message}`);
      }
    },
    [queryClient],
  );

  const cancel = useCallback(
    async (request: PurchaseRequestDetail) => {
      const ok = await confirm({
        title: 'Onay',
        message: `"${request.request_number}" numaralı talebi iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
        confirmLabel: 'Evet',
        cancelLabel: 'İptal',
        danger: true,
      });
      if (!ok) return;
      try {
        await cancelPurchaseRequest(request.id);
        notify.success('Talep başarıyla iptal edildi');
        deepLink.close();
        await invalidatePurchaseRequests(queryClient);
      } catch (error) {
        notify.error(`Talep iptal edilirken hata oluştu: ${(error as Error).message}`);
      }
    },
    [queryClient, deepLink],
  );

  const columns = useMemo<DataTableColumn<PurchaseRequestRow>[]>(
    () => [
      ...baseColumns({ truncateDescription: true }),
      {
        key: 'planning_request_keys',
        header: 'Planlama Talepleri',
        sortable: false,
        render: (row) =>
          Array.isArray(row.planning_request_keys) && row.planning_request_keys.length > 0 ? (
            <Group gap={4} miw={150}>
              {row.planning_request_keys.map((key) => (
                <Button
                  key={key}
                  component="a"
                  href={`/planning/department-requests/?talep=${encodeURIComponent(key)}`}
                  target="_blank"
                  size="compact-xs"
                  variant="outline"
                  color="cyan"
                  leftSection={<i className="fas fa-clipboard-list" />}
                  onClick={(e) => e.stopPropagation()}
                >
                  {key}
                </Button>
              ))}
            </Group>
          ) : (
            <span style={{ color: 'var(--gk-muted)' }}>-</span>
          ),
      },
      {
        key: 'purchase_orders',
        header: 'Satın Alma Emirleri',
        sortable: false,
        render: (row) =>
          Array.isArray(row.purchase_orders) && row.purchase_orders.length > 0 ? (
            <Group gap={4}>
              {row.purchase_orders.map((id) => (
                <Button
                  key={id}
                  component="a"
                  href={`/finance/purchase-orders/?order=${id}`}
                  target="_blank"
                  size="compact-xs"
                  variant="outline"
                  leftSection={<i className="fas fa-file-invoice" />}
                  onClick={(e) => e.stopPropagation()}
                >
                  {id}
                </Button>
              ))}
            </Group>
          ) : (
            <span style={{ color: 'var(--gk-muted)' }}>-</span>
          ),
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: PurchaseRequestRow): RowAction<PurchaseRequestRow>[] => {
      const po = row.po_count || 0;
      const evaluated = row.evaluated_po_count || 0;
      return [
        {
          key: 'view',
          label: 'Detayları Görüntüle',
          icon: 'fas fa-eye',
          color: 'primary',
          onClick: (r) => deepLink.open(r),
        },
        {
          key: 'rate',
          label: 'Tedarikçi Değerlendir',
          icon: 'fas fa-star',
          color: 'warning',
          hidden: !(canWriteProcurement() && po > 0 && evaluated < po),
          onClick: (r) => setEvaluating(r.id),
        },
        {
          key: 'rated',
          label: 'Değerlendirildi',
          icon: 'fas fa-star',
          color: 'success',
          hidden: !(po > 0 && evaluated >= po),
          onClick: (r) => setEvaluating(r.id),
        },
        {
          key: 'revise',
          label: 'Revize Et',
          icon: 'fas fa-edit',
          color: 'warning',
          hidden: row.status === 'cancelled',
          onClick: (r) => void revise(r),
        },
      ];
    },
    [deepLink, revise],
  );

  const refresh = () => void list.refetch();

  return (
    <>
      <PageHeader
        title="Satın Alma Talepleri Kayıt Defteri"
        subtitle="Tüm satın alma taleplerinin geçmişi ve yönetimi"
        icon="archive"
        backTo="/procurement/purchase-requests/"
        stats={[
          { label: 'Tüm Talepler', value: counts.all, icon: 'fas fa-list' },
          { label: 'Bekleyen', value: counts.submitted, icon: 'fas fa-paper-plane' },
          { label: 'Tamamlanan', value: counts.completed, icon: 'fas fa-check' },
          { label: 'İptal Edilen', value: counts.cancelled, icon: 'fas fa-times' },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
          >
            Yenile
          </Button>
        }
      />
      <DataTable
        title="Tüm Satın Alma Talepleri"
        icon="fas fa-table"
        filters={
          <FilterBar
            inline
            filters={filters}
            values={values}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() =>
              apply({
                request_number: '',
                requestor: '',
                status: '',
                priority: '',
                created_at__gte: '',
                page: '1',
              })
            }
          />
        }
        data={list.isError ? EMPTY : rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sortable
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) => {
            setSort({ sortBy, sortDir });
            if (page !== 1) apply({ page: '1' });
          },
        }}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
          pageSizeOptions: [10, 20, 50, 100],
        }}
        rowActions={rowActions}
        emptyMessage={
          list.isError
            ? `Talepler yüklenirken hata oluştu: ${(list.error as Error).message}`
            : 'Satın alma talebi bulunamadı.'
        }
        onRefresh={refresh}
        toolbar={
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-file-export" />}
            onClick={() => notify.info('Dışa aktarma özelliği yakında eklenecek')}
          >
            Dışa Aktar
          </Button>
        }
      />
      {deepLink.openId ? (
        <RequestDetailsModal
          key={deepLink.openId}
          requestId={deepLink.openId}
          onClose={deepLink.close}
          showWorkflow
          loadErrorPrefix="Talep detayları açılırken hata oluştu"
          footerActions={(request) =>
            request.status === 'draft' || request.status === 'submitted' ? (
              <Button
                color="red"
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={() => void cancel(request)}
              >
                İptal Et
              </Button>
            ) : null
          }
        />
      ) : null}
      {evaluating !== null ? (
        <EvaluationModal
          requestId={evaluating}
          canWrite={canWriteProcurement()}
          onClose={() => setEvaluating(null)}
          onSaved={() =>
            void queryClient.invalidateQueries({ queryKey: ['purchaseRequests', 'list'] })
          }
        />
      ) : null}
    </>
  );
}
