import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { machinesDropdownQueryOptions } from '@/api/manufacturing/finishedTimers';
import {
  deletePart,
  partsKeys,
  partsQueryOptions,
  partsStatsQueryOptions,
  updatePart,
  uploadPartFiles,
  type MachiningPart,
  type PartInput,
  type PartsParams,
} from '@/api/manufacturing/machiningParts';
import { userLabel, useUsers } from '@/api/reference/users';
import type { Paginated } from '@/api/types';
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
  type CellEdit,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { partColumns, type PartColumnHandlers } from './columns';
import { CreatePartModal } from './CreatePartModal';
import classes from './MachiningParts.module.css';
import { PartDetailsModal } from './PartDetailsModal';
import { ConvertToDepartmentRequestModal, PartAllocationsModal } from './PartModals';

// Applied filters, page and sort live in the URL. The keys are the legacy
// applyUrlFilters names (deep links from other pages); the hyphenated aliases
// it also accepted are rewritten on load.
const URL_DEFAULTS = {
  key: '',
  name: '',
  job_no: '',
  image_no: '',
  position_no: '',
  status: '',
  created_by: '',
  has_operations: false,
  has_unassigned_operations: false,
  has_unplanned_operations: false,
  page: '1',
  page_size: '20',
  ordering: '-created_at',
};

const URL_ALIASES: Record<string, string> = {
  'job-no': 'job_no',
  'image-no': 'image_no',
  'position-no': 'position_no',
  'created-by': 'created_by',
  'has-operations': 'has_operations',
  'has-unassigned-operations': 'has_unassigned_operations',
  'has-unplanned-operations': 'has_unplanned_operations',
};

type FilterKeys =
  | 'key'
  | 'name'
  | 'job_no'
  | 'image_no'
  | 'position_no'
  | 'status'
  | 'created_by'
  | 'has_operations'
  | 'has_unassigned_operations'
  | 'has_unplanned_operations';

type FilterState = {
  key: string;
  name: string;
  job_no: string;
  image_no: string;
  position_no: string;
  status: string;
  created_by: string;
  has_operations: boolean;
  has_unassigned_operations: boolean;
  has_unplanned_operations: boolean;
};

const EMPTY_FILTERS: FilterState = {
  key: '',
  name: '',
  job_no: '',
  image_no: '',
  position_no: '',
  status: '',
  created_by: '',
  has_operations: false,
  has_unassigned_operations: false,
  has_unplanned_operations: false,
};

const EMPTY_ROWS: MachiningPart[] = [];
const FILE_INPUT_ID = 'part-file-upload-input';

/** Legacy buildPartQuery (without page / ordering). */
export function partFilterParams(values: FilterState): PartsParams {
  const params: PartsParams = {};
  const key = values.key.trim();
  if (key) params.key = /^\d+$/.test(key) ? `PT-${key}` : key;
  if (values.name.trim()) params.name = values.name.trim();
  if (values.job_no.trim()) params.job_no = values.job_no.trim();
  if (values.image_no.trim()) params.image_no = values.image_no.trim();
  if (values.position_no.trim()) params.position_no = values.position_no.trim();
  if (values.created_by) params.created_by = values.created_by;
  if (values.status === 'completed') params.completion_date__isnull = 'false';
  else if (values.status === 'incomplete') params.completion_date__isnull = 'true';
  // "Operasyonsuz Parçalar" asks for parts without operations.
  if (values.has_operations) params.has_operations = 'false';
  if (values.has_unassigned_operations) params.has_unassigned_operations = 'true';
  if (values.has_unplanned_operations) params.has_unplanned_operations = 'true';
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const STAT_CARDS = [
  {
    id: 'unassigned-operations-count',
    label: 'Makine Atanmamış',
    field: 'parts_with_unassigned_operations',
    filter: 'has_unassigned_operations',
    tooltip: 'Makine atanmamış parçaları göster',
  },
  {
    id: 'unplanned-operations-count',
    label: 'Plana Eklenmemiş',
    field: 'parts_with_unplanned_operations',
    filter: 'has_unplanned_operations',
    tooltip: 'Plana eklenmemiş parçaları göster',
  },
  {
    id: 'parts-without-operations-count',
    label: 'Operasyonsuz Parçalar',
    field: 'parts_without_operations',
    filter: 'has_operations',
    tooltip: 'Operasyonsuz parçaları göster',
  },
] as const;

/** Port of manufacturing/machining/tasks/list (Parça Listesi). */
export function MachiningPartsPage() {
  const queryClient = useQueryClient();
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;

  // Legacy also accepted job-no, created-by, has-operations, …: rewrite them once.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!Object.keys(URL_ALIASES).some((alias) => searchParams.has(alias))) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [alias, key] of Object.entries(URL_ALIASES)) {
          const value = next.get(alias);
          next.delete(alias);
          if (value !== null && !next.has(key)) next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const filters = useMemo<FilterState>(
    () => ({
      key: values.key,
      name: values.name,
      job_no: values.job_no,
      image_no: values.image_no,
      position_no: values.position_no,
      status: values.status,
      created_by: values.created_by,
      has_operations: values.has_operations,
      has_unassigned_operations: values.has_unassigned_operations,
      has_unplanned_operations: values.has_unplanned_operations,
    }),
    [
      values.key,
      values.name,
      values.job_no,
      values.image_no,
      values.position_no,
      values.status,
      values.created_by,
      values.has_operations,
      values.has_unassigned_operations,
      values.has_unplanned_operations,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-created_at');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? '-created_at';

  const params: PartsParams = { ...partFilterParams(filters), page, page_size: pageSize, ordering };
  const listOptions = partsQueryOptions(params);
  const list = useQuery({
    ...listOptions,
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Parçalar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy refreshes the counts after every list load.
  const stats = useQuery(partsStatsQueryOptions());
  useEffect(() => {
    if (list.dataUpdatedAt) void queryClient.invalidateQueries({ queryKey: partsKeys.stats });
  }, [list.dataUpdatedAt, queryClient]);

  const users = useUsers();
  const machines = useQuery(machinesDropdownQueryOptions('machining'));
  const machineList = useMemo(() => machines.data ?? [], [machines.data]);

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'key', label: 'Parça No', placeholder: 'PT-001' },
      { type: 'text', key: 'name', label: 'Parça Adı', placeholder: 'Parça adı' },
      { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'İş numarası' },
      { type: 'text', key: 'image_no', label: 'Resim No', placeholder: 'Resim numarası' },
      { type: 'text', key: 'position_no', label: 'Pozisyon No', placeholder: 'Pozisyon numarası' },
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'completed', label: 'Tamamlanan' },
          { value: 'incomplete', label: 'Devam Eden' },
        ],
      },
      {
        type: 'select',
        key: 'created_by',
        label: 'Oluşturan',
        placeholder: 'Tüm Kullanıcılar',
        options: (users.data ?? []).map((u) => ({ value: String(u.id), label: userLabel(u) })),
      },
      { type: 'checkbox', key: 'has_operations', label: 'Operasyonsuz Parçalar' },
      { type: 'checkbox', key: 'has_unassigned_operations', label: 'Makine Atanmamış' },
      { type: 'checkbox', key: 'has_unplanned_operations', label: 'Plana Eklenmemiş' },
    ],
    [users.data],
  );

  // ---- selection (legacy clears it on page change) ----
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.key)),
    [rows, selectedIds],
  );
  const goTo = (next: Partial<typeof values>) => {
    setSelectedIds([]);
    apply(next);
  };

  // ---- cache helpers ----
  const patchRow = (key: string, patch: Partial<MachiningPart>) => {
    queryClient.setQueryData<Paginated<MachiningPart>>(listOptions.queryKey, (old) =>
      old
        ? { ...old, results: old.results.map((r) => (r.key === key ? { ...r, ...patch } : r)) }
        : old,
    );
  };
  const reload = () => queryClient.invalidateQueries({ queryKey: partsKeys.all });

  // ---- inline editing (legacy onEdit) ----
  const onCellEdit = async ({ row, columnKey, value }: CellEdit<MachiningPart>) => {
    try {
      await updatePart(row.key, { [columnKey]: value } as PartInput);
    } catch (error) {
      const detail =
        error instanceof Error && error.message && !/^HTTP \d+$/.test(error.message)
          ? error.message
          : '';
      throw new Error(`Parça güncellenirken hata oluştu${detail ? `: ${detail}` : ''}`, {
        cause: error,
      });
    }
    patchRow(row.key, { [columnKey]: value } as Partial<MachiningPart>);
    notify.success('Parça başarıyla güncellendi');
  };

  // ---- modals ----
  const [creating, setCreating] = useState(false);
  const [details, setDetails] = useState<MachiningPart | null>(null);
  const [allocating, setAllocating] = useState<MachiningPart | null>(null);
  const [converting, setConverting] = useState(false);

  // ---- file upload from the Dosyalar cell ----
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const onFilesPicked = async (input: HTMLInputElement) => {
    const picked = input.files;
    const target = uploadTarget;
    if (!picked?.length || !target) return;
    try {
      await uploadPartFiles(target, Array.from(picked));
      notify.success('Dosyalar yüklendi');
      await reload();
    } catch (error) {
      notify.error(error, { fallback: 'Dosya yüklenirken hata oluştu' });
    } finally {
      input.value = '';
      setUploadTarget(null);
    }
  };

  const openAllocations = useCallback<PartColumnHandlers['openAllocations']>((part) => {
    if (part.is_locked) {
      notify.warning('Bu parça departman talebine dönüştürüldü, düzenlenemez.');
      return;
    }
    setAllocating(part);
  }, []);
  const uploadFiles = useCallback<PartColumnHandlers['uploadFiles']>((part) => {
    setUploadTarget(part.key);
    document.getElementById(FILE_INPUT_ID)?.click();
  }, []);
  const columns = useMemo(
    () => partColumns({ openAllocations, uploadFiles }),
    [openAllocations, uploadFiles],
  );

  // ---- delete ----
  const removePart = async (row: MachiningPart) => {
    const ok = await confirm({
      title: 'Parça Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu parçayı silmek istediğinize emin misiniz?',
      description: 'Bu işlem geri alınamaz ve parça kalıcı olarak silinecektir.',
      details: (
        <span>
          <strong>Parça:</strong> {row.key} - {row.name}
        </span>
      ),
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePart(row.key);
      notify.success('Parça silindi');
      await reload();
    } catch {
      notify.error('Parça silinirken hata oluştu');
    }
  };

  const rowActions = (row: MachiningPart): RowAction<MachiningPart>[] => [
    {
      key: 'view',
      label: 'Parça Detayları',
      icon: 'fas fa-edit',
      color: 'blue',
      onClick: (r) => setDetails(r),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      hidden: Boolean(row.is_locked),
      onClick: (r) => void removePart(r),
    },
  ];

  const openConvert = () => {
    if (!selectedRows.length) {
      notify.warning('Lütfen en az bir parça seçin');
      return;
    }
    if (selectedRows.some((p) => p.is_locked)) {
      notify.warning('Kilitli parçalar dönüştürme işlemine dahil edilemez');
      return;
    }
    setConverting(true);
  };

  // A figure with a count applies its filter (legacy handleStatCardClick).
  const figure = (card: (typeof STAT_CARDS)[number]) => {
    if (stats.isPending) return '–';
    const count = (stats.data?.[card.field] as number | undefined) ?? 0;
    if (count <= 0) return '0';
    return (
      <button
        type="button"
        className={classes.figureButton}
        title={card.tooltip}
        onClick={() => {
          goTo({ [card.filter]: true, page: '1' });
          notify.info(`${card.label} filtresi uygulandı`);
        }}
      >
        {count.toLocaleString('tr-TR')}
      </button>
    );
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Parça Listesi"
        subtitle="Parça yönetimi ve takibi"
        icon="tasks"
        backTo="/manufacturing/machining/tasks/"
        stats={STAT_CARDS.map((card) => ({ id: card.id, label: card.label, value: figure(card) }))}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Parça
          </Button>
        }
      />

      <input
        id={FILE_INPUT_ID}
        type="file"
        multiple
        hidden
        onChange={(event) => void onFilesPicked(event.currentTarget)}
      />

      <DataTable
        columnsKey="machining-parts"
        title="Parça Listesi"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => goTo({ ...next, page: '1' })}
            onClear={() => {
              goTo({ ...EMPTY_FILTERS, page: '1' });
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
            goTo({ ordering: toOrdering(sortBy, sortDir) ?? '-created_at', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => goTo({ page: String(next) }),
          onPageSizeChange: (size) => goTo({ page_size: String(size), page: '1' }),
        }}
        selection={{
          selectedIds,
          onChange: setSelectedIds,
          isRowSelectable: (row) => !row.is_locked,
        }}
        isRowEditable={(row) => !row.is_locked}
        onCellEdit={onCellEdit}
        rowActions={rowActions}
        emptyMessage="Parça bulunamadı"
        onRefresh={() => {
          void list.refetch();
        }}
        exportable={{ fileName: `parts-table-container_${today}` }}
        toolbar={
          selectedIds.length > 0 ? (
            <Button size="xs" onClick={openConvert}>
              Departman Talebine Dönüştür ({selectedIds.length})
            </Button>
          ) : null
        }
      />

      {creating ? (
        <CreatePartModal
          opened
          machines={machineList}
          onClose={() => setCreating(false)}
          onCreated={() => void reload()}
        />
      ) : null}

      {details ? (
        <PartDetailsModal
          key={details.key}
          part={rows.find((r) => r.key === details.key) ?? details}
          machines={machineList}
          onClose={() => setDetails(null)}
        />
      ) : null}

      {allocating ? (
        <PartAllocationsModal
          part={allocating}
          onClose={() => setAllocating(null)}
          onSaved={(updated) => {
            const patch: Partial<MachiningPart> = {};
            for (const field of [
              'job_no',
              'job_no_primary',
              'job_allocations',
              'is_multi_job',
              'quantity',
            ] as const) {
              if (updated?.[field] !== undefined)
                (patch as Record<string, unknown>)[field] = updated[field];
            }
            patchRow(allocating.key, patch);
          }}
        />
      ) : null}

      {converting ? (
        <ConvertToDepartmentRequestModal
          parts={selectedRows}
          onClose={() => setConverting(false)}
          onConverted={() => {
            setSelectedIds([]);
            void reload();
          }}
        />
      ) : null}
    </>
  );
}
