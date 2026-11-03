import { Alert, Badge, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  allRemnantPlatesQueryOptions,
  fetchRemnantPlate,
  remnantPlatesQueryOptions,
  useDeleteRemnantPlate,
  type RemnantPlate,
  type RemnantPlatesParams,
} from '@/api/manufacturing/remnants';
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
import { BulkRemnantsModal } from './BulkRemnantsModal';
import {
  DIMENSIONS_EXAMPLE,
  isCanonicalDimensions,
  normalizeDimensions,
  STEEL_DENSITY,
} from './dimensions';
import { RemnantFormModal } from './RemnantFormModal';
import { availableOf, summarizeRemnants } from './remnantSummary';

const URL_DEFAULTS = {
  material: '',
  thickness_mm: '',
  dimensions: '',
  // '' is the legacy default "Atanmamış" (no param); 'assigned' sends unassigned=false.
  assigned: '',
  // 'invalid': only the plates whose dimensions are not in the one format.
  format: '',
  page: '1',
  page_size: '20',
  ordering: 'id',
};

type FilterKeys = 'material' | 'thickness_mm' | 'dimensions' | 'assigned' | 'format';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'material', label: 'Malzeme', placeholder: 'Malzeme türü' },
  { type: 'text', key: 'thickness_mm', label: 'Kalınlık (mm)', placeholder: 'örn. 10' },
  { type: 'text', key: 'dimensions', label: 'Boyutlar', placeholder: 'örn. 1200x800' },
  {
    type: 'select',
    key: 'assigned',
    label: 'Atama Durumu',
    // Clearing the pill goes back to the default, unassigned plates.
    placeholder: 'Atanmamış',
    options: [{ value: 'assigned', label: 'Atanmış' }],
  },
  {
    type: 'select',
    key: 'format',
    label: 'Boyut Formatı',
    placeholder: 'Tümü',
    options: [{ value: 'invalid', label: 'Hatalı format' }],
  },
];

const EMPTY_FILTERS: FilterState = {
  material: '',
  thickness_mm: '',
  dimensions: '',
  assigned: '',
  format: '',
};
const EMPTY_ROWS: RemnantPlate[] = [];

/** Filter params as buildRemnantQuery sent them; the format filter is applied here, not by the API. */
export function remnantFilterParams(values: FilterState): RemnantPlatesParams {
  const params: RemnantPlatesParams = {};
  const thickness = values.thickness_mm.trim();
  const dimensions = values.dimensions.trim();
  const material = values.material.trim();
  if (thickness) params.thickness_mm = thickness;
  if (dimensions) params.dimensions = dimensions;
  if (material) params.material = material;
  if (values.assigned === 'assigned') params.unassigned = false;
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const mm = (value: unknown) => (value ? `${String(value)} mm` : '-');

const KG = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

/** The task column tried several field names in legacy. */
function taskOf(row: RemnantPlate): string {
  const task = row.task || row.task_key || row.cnc_task || row.related_task || row.task_id;
  return task ? String(task) : '-';
}

/** The stored value, flagged when it is not in the one format, with the fix if there is one. */
function DimensionsCell({ value }: { value: string | null | undefined }) {
  if (isCanonicalDimensions(value)) return <>{value}</>;
  const fixed = normalizeDimensions(value);
  return (
    <Group gap={6} wrap="nowrap">
      <span>{value || '-'}</span>
      <Tooltip
        label={
          fixed
            ? `${DIMENSIONS_EXAMPLE} biçiminde değil; kaydedince ${fixed} olur`
            : `${DIMENSIONS_EXAMPLE} biçiminde okunamıyor; elle düzeltilmeli`
        }
      >
        <Badge color="yellow" variant="light" size="sm" data-testid="dimensions-flag">
          Hatalı
        </Badge>
      </Tooltip>
    </Group>
  );
}

const columns: DataTableColumn<RemnantPlate>[] = [
  {
    key: 'id',
    header: 'ID',
    width: '8%',
    render: (row) => (
      <Text ff="monospace" size="sm">
        {row.id || '-'}
      </Text>
    ),
  },
  {
    key: 'thickness_mm',
    header: 'Kalınlık (mm)',
    width: '10%',
    render: (row) => mm(row.thickness_mm),
  },
  {
    key: 'thickness_mm_2',
    header: 'Kalınlık 2 (mm)',
    width: '10%',
    render: (row) => mm(row.thickness_mm_2),
  },
  {
    key: 'dimensions',
    header: 'Boyutlar',
    width: '15%',
    render: (row) => <DimensionsCell value={row.dimensions} />,
  },
  {
    key: 'quantity',
    header: 'Adet',
    width: '8%',
    accessor: (row) =>
      row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    render: (row) => (row.quantity ? String(row.quantity) : '-'),
  },
  {
    key: 'available_quantity',
    header: 'Kalan',
    width: '8%',
    // Computed by the serializer; not in the backend's ordering_fields.
    sortable: false,
    accessor: availableOf,
  },
  { key: 'material', header: 'Malzeme', width: '14%', render: (row) => row.material || '-' },
  { key: 'task', header: 'Görev', width: '15%', sortable: false, accessor: taskOf },
];

/** Port of manufacturing/cnc-cutting/remnants (remnants.js). */
export function RemnantsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      material: values.material,
      thickness_mm: values.thickness_mm,
      dimensions: values.dimensions,
      assigned: values.assigned,
      format: values.format,
    }),
    [values.material, values.thickness_mm, values.dimensions, values.assigned, values.format],
  );
  const invalidOnly = values.format === 'invalid';
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || 'id');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const list = useQuery({
    ...remnantPlatesQueryOptions({
      page,
      page_size: pageSize,
      ordering,
      ...remnantFilterParams(filters),
    }),
    enabled: !invalidOnly,
    placeholderData: keepPreviousData,
  });
  // Every plate the filters match, for the figures and the format filter.
  // (Legacy summed one page and read an assigned_to the API never sends, so
  // "Atanmış" was always 0 and "Atanmamış" the page size.)
  const all = useQuery({
    ...allRemnantPlatesQueryOptions(remnantFilterParams(filters)),
    placeholderData: keepPreviousData,
  });
  const allRows = all.data ?? EMPTY_ROWS;
  const malformedRows = useMemo(
    () => allRows.filter((row) => !isCanonicalDimensions(row.dimensions)),
    [allRows],
  );
  const rows = invalidOnly ? malformedRows : (list.data?.results ?? EMPTY_ROWS);
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError || all.isError) notify.error('Fire plakalar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt, all.isError, all.errorUpdatedAt]);

  const summary = useMemo(() => summarizeRemnants(allRows), [allRows]);
  const summaryReady = !all.isPending && !all.isError;
  const figure = (value: number) => (summaryReady ? value.toLocaleString('tr-TR') : '–');
  const weightNote =
    `Boyut × kalınlık × ${STEEL_DENSITY.toLocaleString('tr-TR')} g/cm³ (çelik) × kalan adet. ` +
    'Kalınlık 2 ve malzeme hesaba katılmaz.' +
    (summary.uncounted > 0
      ? ` Boyutu veya kalınlığı okunamayan ${summary.uncounted} plaka hesaba katılmadı.`
      : '');

  // ---- create / bulk / edit ----
  const [creating, setCreating] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [editing, setEditing] = useState<RemnantPlate | null>(null);
  // Legacy fetches the plate, then opens the form with it.
  const openEdit = async (id: number) => {
    try {
      setEditing(await fetchRemnantPlate(id));
    } catch (error) {
      console.error('Error loading remnant plate for editing:', error);
      notify.error('Plaka bilgileri yüklenirken hata oluştu');
    }
  };

  // ---- delete ----
  const remove = useDeleteRemnantPlate();
  const deleteRemnant = async (row: RemnantPlate) => {
    const ok = await confirm({
      title: 'Plaka Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu plakayı silmek istediğinize emin misiniz?',
      details: (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600}>
            Plaka:
          </Text>
          <Text size="sm">{`ID: ${row.id} - ${row.dimensions || '-'} - ${row.material || '-'}`}</Text>
        </Group>
      ),
      description: 'Bu işlem geri alınamaz ve plaka kalıcı olarak silinecektir.',
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Plaka başarıyla silindi');
    } catch (error) {
      console.error('Error deleting remnant:', error);
      notify.error('Plaka silinirken hata oluştu');
    }
  };

  const rowActions = (row: RemnantPlate): RowAction<RemnantPlate>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => void openEdit(row.id),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteRemnant(r),
    },
  ];

  return (
    <>
      <PageHeader
        title="Fire Plakalar"
        subtitle="CNC kesim fire plakaları yönetimi ve takibi"
        backTo="/manufacturing/cnc-cutting/"
        stats={[
          { id: 'total-remnants-count', label: 'Plaka Kaydı', value: figure(summary.plates) },
          { id: 'total-quantity-count', label: 'Kalan Adet', value: figure(summary.available) },
          {
            id: 'unassigned-remnants-count',
            label: 'Atanmamış',
            value: figure(summary.unassigned),
          },
          { id: 'assigned-remnants-count', label: 'Atanmış', value: figure(summary.assigned) },
          {
            id: 'estimated-weight',
            label: (
              <Tooltip label={weightNote} multiline w={280}>
                <span>
                  Tahmini Ağırlık
                  {summary.uncounted > 0 ? ` · ${summary.uncounted} plaka hariç` : ''}
                </span>
              </Tooltip>
            ),
            value: summaryReady ? `≈ ${KG.format(summary.weightKg)} kg` : '–',
          },
        ]}
        actions={
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-layer-group" />}
              onClick={() => setBulkCreating(true)}
            >
              Toplu Plaka Ekle
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Plaka Ekle
            </Button>
          </>
        }
      />

      <DataTable
        title="Fire Plakalar Listesi"
        filters={
          <Stack gap="sm">
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
            {summary.malformed > 0 ? (
              <Alert
                color="yellow"
                icon={<FaIcon icon="fas fa-exclamation-triangle" />}
                data-testid="malformed-dimensions"
              >
                <Group justify="space-between" gap="sm">
                  <Text size="sm">
                    {`${summary.malformed} plakanın boyutu ${DIMENSIONS_EXAMPLE} (Genişlik x Yükseklik, mm) biçiminde değil. `}
                    Düzenle ile açıp kaydetmek boyutu bu biçime getirir.
                  </Text>
                  {invalidOnly ? null : (
                    <Button
                      size="xs"
                      variant="light"
                      color="yellow"
                      onClick={() => apply({ format: 'invalid', page: '1' })}
                    >
                      Hatalı kayıtları göster
                    </Button>
                  )}
                </Group>
              </Alert>
            ) : null}
          </Stack>
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={invalidOnly ? all.isFetching : list.isFetching}
        sortable
        // The format filter has every matching plate in hand: sorted and paged here.
        sort={
          invalidOnly
            ? undefined
            : {
                sortBy: sort.sortBy,
                sortDir: sort.sortDir,
                onSortChange: (sortBy, sortDir) =>
                  apply({ ordering: toOrdering(sortBy, sortDir) ?? 'id', page: '1' }),
              }
        }
        pagination={
          invalidOnly
            ? { pageSize }
            : {
                page,
                pageSize,
                total,
                onPageChange: (next) => apply({ page: String(next) }),
                onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
              }
        }
        rowActions={rowActions}
        emptyMessage="Fire plaka bulunamadı"
        onRefresh={() => void (invalidOnly ? all.refetch() : list.refetch())}
        exportable={{ fileName: 'fire-plakalar', sheetName: 'Fire Plakalar' }}
      />

      {creating ? <RemnantFormModal onClose={() => setCreating(false)} /> : null}
      {bulkCreating ? <BulkRemnantsModal onClose={() => setBulkCreating(false)} /> : null}
      {editing ? (
        <RemnantFormModal key={editing.id} remnant={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
