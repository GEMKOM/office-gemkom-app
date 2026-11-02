import { Button, Stack, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  machineDropdownQueryOptions,
  machineFaultsQueryOptions,
  useDeleteMaintenanceRequest,
  type MachineFault,
  type MachineFaultsParams,
} from '@/api/maintenance/faults';
import { staffActivityQueryOptions } from '@/api/maintenance/reports';
import { useAuth } from '@/auth/AuthProvider';
import {
  confirm,
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { legacyExportName } from '../shared';
import { faultColumns } from './columns';
import { FaultCreateModal } from './FaultCreateModal';
import { FaultDetailModal } from './FaultDetailModal';

// Legacy kept its filters in memory only; here they live in the URL, named
// after the API params they become. The list opens on unresolved faults.
const URL_DEFAULTS = {
  status: 'false',
  type: '',
  machine_id: '',
  resolved_by: '',
  reported_after: '',
  reported_before: '',
  page: '1',
  page_size: '20',
};

type FilterKeys =
  'status' | 'type' | 'machine_id' | 'resolved_by' | 'reported_after' | 'reported_before';
type FilterState = Record<FilterKeys, string>;

const EMPTY_FILTERS: FilterState = {
  status: '',
  type: '',
  machine_id: '',
  resolved_by: '',
  reported_after: '',
  reported_before: '',
};
const EMPTY_ROWS: MachineFault[] = [];

/** Legacy applyFilters: the pills as API params (unset ones are left out). */
export function faultFilterParams(values: FilterState): MachineFaultsParams {
  const params: MachineFaultsParams = {};
  if (values.status === 'true' || values.status === 'false')
    params.unresolved = values.status === 'false';
  if (values.type === 'breaking') {
    params.is_breaking = true;
  } else if (values.type === 'maintenance') {
    params.is_maintenance = true;
  } else if (values.type === 'fault') {
    params.is_breaking = false;
    params.is_maintenance = false;
  }
  if (values.machine_id) params.machine_id = values.machine_id;
  if (values.resolved_by) params.resolved_by = values.resolved_by;
  if (values.reported_after) params.reported_after = values.reported_after;
  if (values.reported_before) params.reported_before = values.reported_before;
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of manufacturing/maintenance/fault-requests (list.js). */
export function FaultRequestsPage() {
  const { user, isAdmin } = useAuth();
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;

  const filters = useMemo<FilterState>(
    () => ({
      status: values.status,
      type: values.type,
      machine_id: values.machine_id,
      resolved_by: values.resolved_by,
      reported_after: values.reported_after,
      reported_before: values.reported_before,
    }),
    [
      values.status,
      values.type,
      values.machine_id,
      values.resolved_by,
      values.reported_after,
      values.reported_before,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);

  const params: MachineFaultsParams = { page, page_size: pageSize, ...faultFilterParams(filters) };
  const list = useQuery({
    ...machineFaultsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Arıza talepleri yüklenirken hata oluştu.');
  }, [list.isError, list.errorUpdatedAt]);

  // Filter options: every machine, and the staff who resolved at least one fault.
  const machines = useQuery(machineDropdownQueryOptions());
  const staff = useQuery(staffActivityQueryOptions());
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'false', label: 'Çözülmemiş' },
          { value: 'true', label: 'Çözüldü' },
        ],
      },
      {
        type: 'select',
        key: 'type',
        label: 'Tür',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'breaking', label: 'Makine Duruşu' },
          { value: 'maintenance', label: 'Bakım' },
          { value: 'fault', label: 'Arıza (Duruşsuz)' },
        ],
      },
      {
        type: 'select',
        key: 'machine_id',
        label: 'Ekipman',
        placeholder: 'Tümü',
        searchable: true,
        options: (machines.data ?? []).map((m) => ({ value: String(m.id), label: m.name })),
      },
      {
        type: 'select',
        key: 'resolved_by',
        label: 'Çözen Kişi',
        placeholder: 'Tümü',
        searchable: true,
        options: (staff.data ?? [])
          .filter((s) => (s.faults_resolved_count ?? 0) > 0)
          .map((s) => ({
            value: String(s.user_id),
            label: s.full_name || s.username || String(s.user_id),
          })),
      },
      { type: 'date', key: 'reported_after', label: 'Başlangıç Tarihi' },
      { type: 'date', key: 'reported_before', label: 'Bitiş Tarihi' },
    ],
    [machines.data, staff.data],
  );

  // Legacy figures come from the loaded page; Toplam is the server count.
  const stats = useMemo(
    () => ({
      pending: rows.filter((f) => !f.resolved_at && !f.is_breaking).length,
      breaking: rows.filter((f) => f.is_breaking && !f.resolved_at).length,
      resolved: rows.filter((f) => f.resolved_at).length,
    }),
    [rows],
  );

  // ---- view / create ----
  const [viewing, setViewing] = useState<MachineFault | null>(null);
  const [creating, setCreating] = useState(false);

  // ---- delete ----
  // Legacy canDeleteRequest: admins (is_superuser or is_admin, i.e. isAdmin()) always;
  // the reporter while the fault is unresolved.
  const canDelete = (row: MachineFault) =>
    isAdmin || (row.reported_by === user.id && !row.resolved_at);

  const remove = useDeleteMaintenanceRequest();
  const deleteFault = async (row: MachineFault) => {
    const description = row.description
      ? row.description.length > 100
        ? `${row.description.slice(0, 100)}...`
        : row.description
      : '';
    const ok = await confirm({
      title: 'Arıza Talebi Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu arıza talebini silmek istediğinize emin misiniz?',
      details: (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            {row.machine_name || row.asset_name || 'Bilinmeyen Ekipman'}
          </Text>
          {description ? (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          ) : null}
        </Stack>
      ),
      description: 'Bu işlem geri alınamaz.',
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Arıza talebi başarıyla silindi');
    } catch (error) {
      notify.error(`Arıza talebi silinirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  const rowActions = (row: MachineFault): RowAction<MachineFault>[] => [
    {
      key: 'view',
      label: 'Detayları görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: setViewing,
    },
    {
      key: 'delete',
      label: 'Arıza talebini sil',
      icon: 'fas fa-trash',
      color: 'danger',
      hidden: !canDelete(row),
      onClick: (r) => void deleteFault(r),
    },
  ];

  // Figures stay blank until the first page arrives rather than flashing 0.
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="Arıza Talepleri"
        subtitle="Tüm arıza taleplerini görüntüleyin ve yönetin"
        icon="exclamation-triangle"
        backTo="/manufacturing/maintenance"
        stats={[
          { id: 'faults-total', label: 'Toplam', value: figure(total) },
          { id: 'faults-pending', label: 'Bekleyen', value: figure(stats.pending) },
          { id: 'faults-breaking', label: 'Makine Duruşu', value: figure(stats.breaking) },
          { id: 'faults-resolved', label: 'Çözüldü', value: figure(stats.resolved) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Arıza Talebi
          </Button>
        }
      />

      <DataTable
        title="Arıza Talepleri"
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
        columns={faultColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={user.id}
        emptyMessage="Arıza talebi bulunamadı"
        onRefresh={() => void list.refetch()}
        // Legacy export: the rows on screen (the current page).
        exportable={{ fileName: legacyExportName(), sheetName: 'Sheet1' }}
      />

      {creating ? <FaultCreateModal onClose={() => setCreating(false)} /> : null}
      {viewing ? <FaultDetailModal fault={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
