import { Button, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  cncTaskKeys,
  cncTaskQueryOptions,
  cncTasksQueryOptions,
  deleteCncTask,
  setCncTaskCompleted,
  type CncTask,
  type CncTasksParams,
} from '@/api/manufacturing/cncTasks';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  StatusBadge,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { plateSource, plateSourceText } from '../reports/parts-search/plateSource';
import { CreateCutModal } from './CreateCutModal';
import { useCuttingMachineOptions } from './cutForm';
import { CutDetailsModal } from './CutDetailsModal';
import { EditCutModal } from './EditCutModal';

// Applied filters, page and sort live in the URL under the legacy
// applyUrlFilters names; its hyphenated aliases are rewritten on load.
// ?cut=KEY opens the details (&mode=edit the edit modal), as legacy did.
const URL_DEFAULTS = {
  key: '',
  name: '',
  nesting_id: '',
  thickness_mm: '',
  material: '',
  machine_fk: '',
  status: '',
  page: '1',
  page_size: '20',
  ordering: '-key',
};

const URL_ALIASES: Record<string, string> = {
  'nesting-id': 'nesting_id',
  'thickness-mm': 'thickness_mm',
  'machine-name': 'machine_fk',
};

type FilterState = Pick<
  typeof URL_DEFAULTS,
  'key' | 'name' | 'nesting_id' | 'thickness_mm' | 'material' | 'machine_fk' | 'status'
>;

const EMPTY_FILTERS: FilterState = {
  key: '',
  name: '',
  nesting_id: '',
  thickness_mm: '',
  material: '',
  machine_fk: '',
  status: '',
};

/** Legacy buildCutQuery without page and ordering. */
export function cutFilterParams(values: FilterState): CncTasksParams {
  const params: CncTasksParams = {};
  const set = (name: keyof FilterState) => {
    const value = values[name].trim();
    if (value) params[name] = value;
  };
  set('key');
  set('name');
  set('nesting_id');
  set('material');
  set('machine_fk');
  set('thickness_mm');
  if (values.status === 'pending') params.completion_date__isnull = 'true';
  else if (values.status === 'completed') params.completion_date__isnull = 'false';
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const EMPTY_ROWS: CncTask[] = [];

/** Port of manufacturing/cnc-cutting/cuts (CNC Kesim Kesimler). */
export function CncCutsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const [searchParams, setSearchParams] = useSearchParams();
  const cutParam = searchParams.get('cut');
  const mode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';

  // Once: rewrite the legacy aliases, and filter the list to a deep-linked cut.
  useEffect(() => {
    const needsKey = searchParams.has('cut') && !searchParams.has('key');
    if (!needsKey && !Object.keys(URL_ALIASES).some((alias) => searchParams.has(alias))) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [alias, key] of Object.entries(URL_ALIASES)) {
          const value = next.get(alias);
          next.delete(alias);
          if (value !== null && !next.has(key)) next.set(key, value);
        }
        const cut = next.get('cut');
        if (cut && !next.has('key')) next.set('key', cut);
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = useMemo<FilterState>(
    () => ({
      key: values.key,
      name: values.name,
      nesting_id: values.nesting_id,
      thickness_mm: values.thickness_mm,
      material: values.material,
      machine_fk: values.machine_fk,
      status: values.status,
    }),
    [
      values.key,
      values.name,
      values.nesting_id,
      values.thickness_mm,
      values.material,
      values.machine_fk,
      values.status,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-key');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? '-key';

  const params: CncTasksParams = {
    ...cutFilterParams(filters),
    page,
    page_size: pageSize,
    ordering,
  };
  const list = useQuery({ ...cncTasksQueryOptions(params), placeholderData: keepPreviousData });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;
  useEffect(() => {
    if (list.isError) notify.error('Kesimler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const machineOptions = useCuttingMachineOptions();
  const filterConfig = useMemo<FilterConfig<keyof FilterState>[]>(
    () => [
      { type: 'text', key: 'key', label: 'Kesim No', placeholder: 'CNC-623' },
      { type: 'text', key: 'name', label: 'Kesim Adı', placeholder: 'Kesim adı' },
      { type: 'text', key: 'nesting_id', label: 'Nesting ID', placeholder: 'Nesting ID' },
      { type: 'text', key: 'thickness_mm', label: 'Kalınlık (mm)', placeholder: 'örn. 10' },
      { type: 'text', key: 'material', label: 'Malzeme', placeholder: 'Malzeme türü' },
      {
        type: 'select',
        key: 'machine_fk',
        label: 'Makine',
        placeholder: 'Tüm Makineler',
        options: machineOptions,
      },
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'completed', label: 'Tamamlanan' },
          { value: 'pending', label: 'Bekliyor' },
        ],
      },
    ],
    [machineOptions],
  );

  const reload = () => queryClient.invalidateQueries({ queryKey: cncTaskKeys.all });

  // ---- ?cut / &mode (legacy pushState: back closes the modal) ----
  const openCut = (key: string, edit: boolean) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('cut', key);
      if (edit) next.set('mode', 'edit');
      else next.delete('mode');
      return next;
    });
  const closeCut = (replace = false) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cut');
        next.delete('mode');
        return next;
      },
      { replace },
    );
  const deepLinked = useQuery({
    ...cncTaskQueryOptions(cutParam ?? ''),
    enabled: Boolean(cutParam),
  });
  useEffect(() => {
    if (!cutParam || !deepLinked.isError) return;
    notify.error('Kesim bulunamadı');
    closeCut(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutParam, deepLinked.isError]);

  // ---- status toggle (legacy editable-status button) ----
  const toggleStatus = async (row: CncTask) => {
    const completed = Boolean(row.completion_date);
    const ok = await confirm({
      title: 'Durum Değişikliği Onayı',
      icon: 'fas fa-exchange-alt',
      message: 'Durumu değiştirmek istediğinize emin misiniz?',
      description: 'Kesim durumu güncellenecektir.',
      details: (
        <span>
          <strong>Kesim:</strong> {row.key}
          <br />
          <strong>Mevcut Durum:</strong> {completed ? 'Tamamlandı' : 'Bekliyor'}
          <br />
          <strong>Yeni Durum:</strong> {completed ? 'Bekliyor' : 'Tamamlandı'}
        </span>
      ),
      confirmLabel: 'Evet, Değiştir',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await setCncTaskCompleted(row.key, !completed);
      notify.success(
        completed ? 'Kesim tamamlanmadı olarak işaretlendi' : 'Kesim tamamlandı olarak işaretlendi',
      );
      await reload();
    } catch (error) {
      notify.error(error, { fallback: 'Durum güncellenirken hata oluştu' });
    }
  };

  const removeCut = async (row: CncTask) => {
    const ok = await confirm({
      title: 'Kesim Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu kesimi silmek istediğinize emin misiniz?',
      description: 'Bu işlem geri alınamaz ve kesim kalıcı olarak silinecektir.',
      details: (
        <span>
          <strong>Kesim:</strong> {row.name || row.key}
        </span>
      ),
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCncTask(row.key);
      notify.success('Kesim silindi');
      await reload();
    } catch {
      notify.error('Kesim silinirken hata oluştu');
    }
  };

  const columns = useMemo<DataTableColumn<CncTask>[]>(
    () => [
      {
        key: 'key',
        header: 'Kesim No',
        sortable: true,
        width: '10%',
        render: (r) => <strong>{r.key || `CNC-${r.id ?? 'N/A'}`}</strong>,
      },
      {
        key: 'nesting_id',
        header: 'Nesting ID',
        sortable: true,
        width: '10%',
        render: (r) => <strong>{r.nesting_id || '-'}</strong>,
      },
      { key: 'dimensions', header: 'Boyutlar', sortable: true, width: '10%' },
      {
        key: 'plate_item_code',
        header: 'Plaka Kaynağı',
        width: '18%',
        accessor: plateSourceText,
        render: (r) => {
          const source = plateSource(r);
          if (!source.badge) return source.name;
          return (
            <div title={source.tooltip}>
              {source.name ? <div>{source.name}</div> : null}
              <StatusBadge color={source.badge.color}>{source.badge.label}</StatusBadge>
            </div>
          );
        },
      },
      {
        key: 'quantity',
        header: 'Adet',
        sortable: true,
        width: '6%',
        render: (r) => (r.quantity ? String(r.quantity) : '-'),
      },
      {
        key: 'machine_fk',
        header: 'Makine',
        sortable: true,
        width: '10%',
        accessor: 'machine_name',
      },
      {
        key: 'parts_count',
        header: 'Parça Sayısı',
        sortable: true,
        width: '10%',
        accessor: (r) => r.parts_count || 0,
      },
      {
        key: 'status',
        header: 'Durum',
        width: '8%',
        accessor: (r) => (r.completion_date ? 'Tamamlandı' : 'Bekliyor'),
        render: (r) => (
          <UnstyledButton
            title="Durumu değiştirmek için tıklayın"
            aria-label={`${r.key} durumunu değiştir`}
            onClick={(event) => {
              event.stopPropagation();
              void toggleStatus(r);
            }}
          >
            <StatusBadge color={r.completion_date ? 'green' : 'orange'}>
              {r.completion_date ? 'Tamamlandı' : 'Bekliyor'}
            </StatusBadge>
          </UnstyledButton>
        ),
      },
      {
        key: 'estimated_hours',
        header: 'Tahmini Saat',
        sortable: true,
        width: '8%',
        render: (r) => (r.estimated_hours ? `${r.estimated_hours} saat` : '-'),
      },
      {
        key: 'total_hours_spent',
        header: 'Harcanan Saat',
        sortable: true,
        width: '8%',
        render: (r) => (r.total_hours_spent ? `${r.total_hours_spent} saat` : '0 saat'),
      },
    ],
    // toggleStatus only reads stable helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const rowActions = (): RowAction<CncTask>[] => [
    {
      key: 'view',
      label: 'Detaylar',
      icon: 'fas fa-eye',
      color: 'info',
      onClick: (r) => openCut(r.key, false),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'warning',
      onClick: (r) => openCut(r.key, true),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void removeCut(r),
    },
  ];

  const [creating, setCreating] = useState(false);

  // Legacy counts: the total, and completed / pending on the page shown.
  const completedOnPage = rows.filter((r) => r.completion_date).length;
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="CNC Kesim Kesimler"
        subtitle="CNC kesim görevleri yönetimi ve takibi"
        icon="cut"
        backTo="/planning/cnc-cutting/"
        stats={[
          { id: 'all-cuts-count', label: 'Tüm Kesimler', value: figure(total) },
          { id: 'active-cuts-count', label: 'Aktif Kesimler', value: figure(0) },
          { id: 'completed-cuts-count', label: 'Tamamlanan', value: figure(completedOnPage) },
          {
            id: 'pending-cuts-count',
            label: 'Bekleyen',
            value: figure(rows.length - completedOnPage),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Kesim
          </Button>
        }
      />

      <DataTable
        title="Kesim Listesi"
        icon="fas fa-table"
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
        columns={columns}
        getRowId={(row) => row.key}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-key', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage="Kesim bulunamadı"
        onRefresh={() => {
          void list.refetch();
        }}
        exportable={{ fileName: `cuts-table-container_${today}` }}
      />

      {creating ? <CreateCutModal onClose={() => setCreating(false)} /> : null}
      {cutParam && !deepLinked.isError ? (
        mode === 'edit' ? (
          <EditCutModal key={`edit-${cutParam}`} cutKey={cutParam} onClose={() => closeCut()} />
        ) : (
          <CutDetailsModal key={`view-${cutParam}`} cutKey={cutParam} onClose={() => closeCut()} />
        )
      ) : null}
    </>
  );
}
