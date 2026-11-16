import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  cncTaskKeys,
  cncTaskQueryOptions,
  cncTasksQueryOptions,
  previewCncProcessing,
  processCncTask,
  type CncTask,
  type ProcessInput,
  type ProcessPart,
  type ProcessResult,
} from '@/api/manufacturing/cncTasks';
import { pieceKeys, searchPlateCards } from '@/api/warehouse/pieces';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  PageHeader,
  SelectRemote,
  StatCards,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { CutDetailsModal } from '@/pages/manufacturing/cnc-cutting/cuts/CutDetailsModal';
import {
  PieceLotPickerModal,
  pieceText,
  type PieceChoice,
} from '@/pages/manufacturing/cnc-cutting/cuts/PlateSource';
import { plateSource } from '@/pages/manufacturing/cnc-cutting/reports/parts-search/plateSource';
import { deductRows, downloadMikroCsv, partDeductions } from './mikroCsv';

// Ağırlık Düşüşü (port of blue-app warehouse/weight-reduction): the warehouse
// books each finished CNC cut. The sheets it used leave stock, remnants come
// back as pieces, and the fire is what is left over: consumed − parts −
// remnants. Weights come from the backend (not blue-app's 7.88 and its 10%
// guess). The Mikro file of kg to deduct per job is kept: Mikro still does
// the accounting.

const PAGE_SIZE = 20;
const URL_DEFAULTS = { view: 'pending', key: '', name: '', nesting_id: '', page: '1', kesim: '', detay: '' };
type FilterKeys = 'key' | 'name' | 'nesting_id';

const FILTERS: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'key', label: 'Kesim No', placeholder: 'örn. CNC-120' },
  { type: 'text', key: 'name', label: 'Kesim Adı' },
  { type: 'text', key: 'nesting_id', label: 'Nesting ID' },
];

/** The minimum short side of a remnant that goes back to stock (backend: MIN_REMNANT_SIDE_MM). */
export const MIN_REMNANT_SIDE_MM = 500;

export function canProcessCuts(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

const kg = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '-' : `${formatNumber(Number(value), 2)} kg`;

function SourceCell({ row }: { row: CncTask }) {
  const source = plateSource(row);
  return (
    <Stack gap={2}>
      <Text size="sm">{source.name || '-'}</Text>
      {source.badge ? <StatusBadge color={source.badge.color}>{source.badge.label}</StatusBadge> : null}
    </Stack>
  );
}

const baseColumns: DataTableColumn<CncTask>[] = [
  {
    key: 'key',
    header: 'Kesim No',
    render: (row) => (
      <Text size="sm" fw={600}>
        {row.key}
      </Text>
    ),
  },
  { key: 'name', header: 'Kesim Adı', render: (row) => row.name || '-' },
  { key: 'nesting_id', header: 'Nesting', render: (row) => row.nesting_id || '-' },
  { key: 'material', header: 'Sac', render: (row) => <SourceCell row={row} /> },
  { key: 'dimensions', header: 'Ölçü', render: (row) => row.dimensions || '-' },
  { key: 'quantity', header: 'Sac Adedi', align: 'right', render: (row) => row.quantity ?? 1 },
];

const pendingColumns: DataTableColumn<CncTask>[] = [
  ...baseColumns,
  { key: 'parts_count', header: 'Parça', align: 'right', render: (row) => row.parts_count ?? 0 },
  {
    key: 'completion_date',
    header: 'Tamamlanma',
    render: (row) => (row.completion_date ? formatDateTime(Number(row.completion_date)) : '-'),
  },
];

const doneColumns: DataTableColumn<CncTask>[] = [
  ...baseColumns,
  {
    key: 'processed_warehouse_date',
    header: 'İşlenme',
    render: (row) =>
      `${row.processed_warehouse_date ? formatDateTime(row.processed_warehouse_date) : '-'} · ${row.processed_by_username || '-'}`,
  },
  {
    key: 'consumed_kg',
    header: 'Kullanılan',
    align: 'right',
    render: (row) => `${kg(row.consumed_kg)}${row.consumed_estimated ? ' (tahmini)' : ''}`,
  },
  { key: 'parts_kg', header: 'Parçalar', align: 'right', render: (row) => kg(row.parts_kg) },
  { key: 'remnant_kg', header: 'Fire Sac', align: 'right', render: (row) => kg(row.remnant_kg) },
  { key: 'fire_kg', header: 'Fire', align: 'right', render: (row) => kg(row.fire_kg) },
];

export const PART_DEDUCT_COLUMNS: DataTableColumn<ProcessPart>[] = [
  { key: 'job_no', header: 'İş Emri No' },
  { key: 'image_no', header: 'Resim No', render: (p) => p.image_no || '-' },
  { key: 'position_no', header: 'Pozisyon No', render: (p) => p.position_no || '-' },
  { key: 'weight_kg', header: 'Ağırlık', align: 'right', render: (p) => kg(p.weight_kg) },
  { key: 'quantity', header: 'Miktar', align: 'right', render: (p) => p.quantity ?? '-' },
  { key: 'parts_kg', header: 'Parça kg', align: 'right', render: (p) => kg(p.parts_kg) },
  { key: 'fire_kg', header: 'Fire payı', align: 'right', render: (p) => kg(p.fire_kg) },
  { key: 'deduct_kg', header: 'Düşülecek', align: 'right', render: (p) => kg(p.deduct_kg) },
];

// ---- processing one cut ----

interface RemnantDraft {
  rowId: number;
  width: number | string;
  length: number | string;
  quantity: number | string;
}

type ConsumedMode = 'reserved' | 'other' | 'none';

let nextRowId = 1;
const newRemnant = (): RemnantDraft => ({ rowId: nextRowId++, width: '', length: '', quantity: 1 });

const positive = (value: number | string) => Number(value) > 0;

export function processInput(
  mode: ConsumedMode,
  other: { piece: PieceChoice | null; quantity: number },
  remnants: readonly RemnantDraft[],
  card: string | null,
): ProcessInput | null {
  const rows = remnants
    .filter((r) => positive(r.width) && positive(r.length) && positive(r.quantity))
    .map((r) => ({
      width_mm: String(r.width),
      length_mm: String(r.length),
      quantity: Number(r.quantity),
      ...(card ? { item: Number(card) } : {}),
    }));
  if (mode === 'other') {
    if (!other.piece) return null;
    return { consumed: [{ piece: other.piece.id, quantity: other.quantity }], remnants: rows };
  }
  return mode === 'none' ? { consumed: [], remnants: rows } : { remnants: rows };
}

function Summary({ task, result }: { task: CncTask; result: ProcessResult | undefined }) {
  if (!result) return null;
  const fire = result.fire_kg === null ? null : Number(result.fire_kg);
  return (
    <Stack gap="xs">
      <StatCards
        cols={4}
        cards={[
          {
            id: 'consumed',
            title: result.consumed_estimated ? 'Kullanılan Sac (tahmini)' : 'Kullanılan Sac',
            value: kg(result.consumed_kg),
            icon: 'fas fa-layer-group',
            color: 'blue',
            tooltip: result.consumed_estimated
              ? `Kesimin ölçüsü (${task.dimensions || '-'}), kalınlığı ve sac adedinden`
              : result.consumed.map((c) => `${c.item_code} × ${c.quantity}`).join(', '),
          },
          { id: 'parts', title: 'Parçalar', value: kg(result.parts_kg), icon: 'fas fa-puzzle-piece', color: 'green' },
          { id: 'remnants', title: 'Stoğa Dönen Fire Sac', value: kg(result.remnant_kg), icon: 'fas fa-undo', color: 'purple' },
          { id: 'fire', title: 'Fire', value: kg(result.fire_kg), icon: 'fas fa-fire', color: fire !== null && fire < 0 ? 'red' : 'orange' },
        ]}
      />
      {result.consumed_kg === null ? (
        <Alert color="yellow" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
          Kullanılan sacın ağırlığı hesaplanamadı (kartta kalınlık yok ya da kesimin ölçüsü
          okunamadı); fire hesaplanamaz.
        </Alert>
      ) : null}
      {fire !== null && fire < 0 ? (
        <Alert color="red" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
          Parçalar ve fire saclar kullanılan sactan ağır; parça ağırlıklarını veya fire sac
          ölçülerini kontrol edin.
        </Alert>
      ) : null}
      {result.parts_without_weight > 0 ? (
        <Alert color="yellow" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
          {result.parts_without_weight} parçanın ağırlığı girilmemiş; 0 kg sayıldı, fire o kadar
          yüksek çıkar.
        </Alert>
      ) : null}
      {result.remnants.some((r) => !r.kept) ? (
        <Text size="xs" c="dimmed">
          Kısa kenarı {MIN_REMNANT_SIDE_MM} mm’den kısa fire sac stoğa alınmaz; fireye sayıldı.
        </Text>
      ) : null}
    </Stack>
  );
}

function usePreview(key: string, input: ProcessInput | null, enabled: boolean) {
  const [debounced] = useDebouncedValue(input, 300);
  return useQuery({
    queryKey: ['cncTasks', 'warehouse-preview', key, debounced],
    queryFn: () => previewCncProcessing(key, debounced!),
    enabled: enabled && debounced !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

function ProcessModal({ cutKey, onClose }: { cutKey: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const task = useQuery(cncTaskQueryOptions(cutKey));
  const t = task.data;
  const reservation = t?.piece_reservations?.[0] ?? null;
  const [mode, setMode] = useState<ConsumedMode | null>(null);
  const effectiveMode: ConsumedMode = mode ?? (reservation ? 'reserved' : 'none');
  const [other, setOther] = useState<{ piece: PieceChoice | null; quantity: number }>({
    piece: null,
    quantity: 1,
  });
  const [picking, setPicking] = useState(false);
  const [remnants, setRemnants] = useState<RemnantDraft[]>([]);
  const [card, setCard] = useState<string | null>(null);
  const input = useMemo(
    () => processInput(effectiveMode, other, remnants, card),
    [effectiveMode, other, remnants, card],
  );
  const preview = usePreview(cutKey, input, Boolean(t) && !t?.processed_by_warehouse);
  const process = useMutation({
    mutationFn: () => processCncTask(cutKey, input!),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: cncTaskKeys.all }),
        queryClient.invalidateQueries({ queryKey: pieceKeys.all }),
      ]),
  });

  const updateRow = (rowId: number, patch: Partial<RemnantDraft>) =>
    setRemnants((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!input || !preview.data) return;
    const ok = await confirm({
      title: 'Depoda İşle',
      icon: 'fas fa-weight-hanging',
      message: `${cutKey} depoda işlenecek.`,
      description:
        'Kullanılan saclar stoktan düşer, fire saclar stoğa döner ve fire kesime kaydedilir. Bu işlem geri alınamaz.',
      confirmLabel: 'Evet, İşle',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await process.mutateAsync();
      notify.success(`${cutKey} depoda işlendi`);
      onClose();
    } catch (error) {
      notify.error(errorMessage(error, 'Kesim işlenemedi'));
    }
  };

  const result = preview.data;
  const previewError = preview.isError ? errorMessage(preview.error, 'Hesaplanamadı') : '';

  return (
    <Modal opened onClose={onClose} size="90%" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Ağırlık Düşüşü" subtitle={cutKey} icon="fas fa-weight-hanging" />
      <ModalBody>
        {!t ? (
          <Text c="dimmed">Yükleniyor…</Text>
        ) : (
          <Stack gap="md">
            <ModalSection title="Kesim" icon="fas fa-info-circle">
              <Text size="sm">
                {t.name || '-'} · Nesting {t.nesting_id || '-'} · {t.material || '-'} ·{' '}
                {t.thickness_mm ? `${Number(t.thickness_mm)} mm` : '-'} · {t.dimensions || '-'} ·{' '}
                {t.quantity ?? 1} sac
              </Text>
            </ModalSection>

            <ModalSection title="Kullanılan Sac" icon="fas fa-layer-group">
              <SegmentedControl
                value={effectiveMode}
                onChange={(value) => setMode(value as ConsumedMode)}
                aria-label="Kullanılan sac"
                data={[
                  ...(reservation ? [{ value: 'reserved', label: 'Ayrılan parti' }] : []),
                  { value: 'other', label: 'Başka parti' },
                  { value: 'none', label: 'Parti yok (tahmin)' },
                ]}
              />
              <Text size="sm" mt="xs">
                {effectiveMode === 'reserved' && reservation
                  ? `${pieceText(reservation.piece_details)} × ${reservation.quantity} sac stoktan düşülecek.`
                  : effectiveMode === 'other'
                    ? other.piece
                      ? `${pieceText(other.piece)} partisinden düşülecek.`
                      : 'Kesimde kullanılan partiyi seçin.'
                    : 'Stoktan sac düşülmez; kullanılan sacın ağırlığı kesimin ölçüsü, kalınlığı ve sac adedinden tahmin edilir.'}
              </Text>
              {effectiveMode === 'other' ? (
                <Group gap="xs" mt="xs" align="flex-end">
                  <Button
                    variant="outline"
                    size="xs"
                    leftSection={<FaIcon icon="fas fa-search" />}
                    onClick={() => setPicking(true)}
                  >
                    {other.piece ? 'Partiyi Değiştir' : 'Parti Seç'}
                  </Button>
                  <NumberInput
                    size="xs"
                    w={120}
                    label="Sac adedi"
                    min={1}
                    max={other.piece?.available ?? undefined}
                    allowDecimal={false}
                    value={other.quantity}
                    onChange={(value) => setOther({ ...other, quantity: Number(value) || 1 })}
                  />
                </Group>
              ) : null}
            </ModalSection>

            <ModalSection title="Stoğa Dönen Fire Saclar" icon="fas fa-undo">
              <Text size="xs" c="dimmed" mb="xs">
                Kesimden artan dikdörtgen saclar. Kısa kenarı {MIN_REMNANT_SIDE_MM} mm ve üstü olanlar
                aynı sac kartıyla Hammadde deposuna döner; daha kısası fireye sayılır.
              </Text>
              <Stack gap="xs">
                {remnants.map((r, index) => (
                  <Group key={r.rowId} gap="xs" align="flex-end">
                    <NumberInput
                      size="xs"
                      w={110}
                      label={index === 0 ? 'En (mm)' : undefined}
                      aria-label={`Fire sac eni ${index + 1}`}
                      min={0}
                      hideControls
                      value={r.width}
                      onChange={(value) => updateRow(r.rowId, { width: value })}
                    />
                    <NumberInput
                      size="xs"
                      w={110}
                      label={index === 0 ? 'Boy (mm)' : undefined}
                      aria-label={`Fire sac boyu ${index + 1}`}
                      min={0}
                      hideControls
                      value={r.length}
                      onChange={(value) => updateRow(r.rowId, { length: value })}
                    />
                    <NumberInput
                      size="xs"
                      w={80}
                      label={index === 0 ? 'Adet' : undefined}
                      aria-label={`Fire sac adedi ${index + 1}`}
                      min={1}
                      allowDecimal={false}
                      value={r.quantity}
                      onChange={(value) => updateRow(r.rowId, { quantity: value })}
                    />
                    {positive(r.width) &&
                    positive(r.length) &&
                    Math.min(Number(r.width), Number(r.length)) < MIN_REMNANT_SIDE_MM ? (
                      <StatusBadge color="orange">Fire (stoğa alınmaz)</StatusBadge>
                    ) : null}
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      aria-label={`Fire sacı sil ${index + 1}`}
                      onClick={() => setRemnants((rows) => rows.filter((x) => x.rowId !== r.rowId))}
                    >
                      <FaIcon icon="fas fa-trash" />
                    </Button>
                  </Group>
                ))}
                <Group gap="xs" align="flex-end">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<FaIcon icon="fas fa-plus" />}
                    onClick={() => setRemnants((rows) => [...rows, newRemnant()])}
                  >
                    Fire Sac Ekle
                  </Button>
                  {remnants.length ? (
                    <SelectRemote
                      size="xs"
                      label="Sac kartı"
                      aria-label="Fire sac kartı"
                      description="Boş bırakılırsa kesilen sacın kartı"
                      placeholder="Sac kartı ara…"
                      minSearchLength={2}
                      queryKey={['pieces', 'plate-card-search']}
                      search={searchPlateCards}
                      value={card}
                      onChange={setCard}
                    />
                  ) : null}
                </Group>
              </Stack>
            </ModalSection>

            {previewError ? (
              <Alert color="red" icon={<FaIcon icon="fas fa-exclamation-circle" />}>
                {previewError}
              </Alert>
            ) : (
              <Summary task={t} result={result} />
            )}

            <DataTable
              title="Parçalar ve Düşülecek Ağırlık"
              icon="fas fa-puzzle-piece"
              data={result?.parts ?? []}
              columns={PART_DEDUCT_COLUMNS}
              getRowId={(p) => String(p.id)}
              loading={preview.isFetching}
              striped
              verticalSpacing="xs"
              emptyMessage="Parça bulunamadı"
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
                Kapat
              </Button>
              <Button
                variant="outline"
                color="green"
                leftSection={<FaIcon icon="fas fa-file-csv" />}
                disabled={!result || !result.parts.length || Boolean(previewError)}
                onClick={() => result && downloadMikroCsv(deductRows(result.parts))}
              >
                Mikro CSV
              </Button>
              {canProcessCuts() ? (
                <Button
                  leftSection={<FaIcon icon="fas fa-check" />}
                  disabled={!result || Boolean(previewError) || preview.isFetching}
                  loading={process.isPending}
                  onClick={() => void save()}
                >
                  Depoda İşle
                </Button>
              ) : null}
            </Group>
          </Stack>
        )}
        {picking ? (
          <PieceLotPickerModal
            onClose={() => setPicking(false)}
            onPick={(piece) => {
              setOther({ piece, quantity: Math.min(t?.quantity ?? 1, piece.available ?? 1) || 1 });
              setPicking(false);
            }}
          />
        ) : null}
      </ModalBody>
    </Modal>
  );
}

/** Mikro CSV of a processed cut, from its stored fire. */
async function exportProcessed(key: string, fetchTask: (key: string) => Promise<CncTask>) {
  try {
    const task = await fetchTask(key);
    const fire = task.fire_kg === null || task.fire_kg === undefined ? null : Number(task.fire_kg);
    const rows = deductRows(partDeductions(task.parts ?? [], task.quantity ?? 1, fire));
    if (!rows.length) {
      notify.error('Dışa aktarılacak parça bulunamadı');
      return;
    }
    downloadMikroCsv(rows);
  } catch (error) {
    notify.error(errorMessage(error, 'Kesim yüklenemedi'));
  }
}

const EMPTY: CncTask[] = [];

export function WeightReductionPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const done = values.view === 'done';
  const list = useQuery({
    ...cncTasksQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ordering: '-completion_date',
      completion_date__isnull: 'false',
      processed_by_warehouse: done ? 'true' : 'false',
      key: values.key.trim() || undefined,
      name: values.name.trim() || undefined,
      nesting_id: values.nesting_id.trim() || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error(errorMessage(list.error, 'Kesimler yüklenemedi'));
  }, [list.isError, list.error]);

  const rowActions = (): RowAction<CncTask>[] =>
    done
      ? [
          {
            key: 'detail',
            label: 'Detay',
            icon: 'fas fa-eye',
            onClick: (row) => apply({ detay: row.key }),
          },
          {
            key: 'csv',
            label: 'Mikro CSV',
            icon: 'fas fa-file-csv',
            color: 'success',
            onClick: (row) =>
              void exportProcessed(row.key, (key) => queryClient.fetchQuery(cncTaskQueryOptions(key))),
          },
        ]
      : [
          {
            key: 'process',
            label: 'İşle',
            icon: 'fas fa-weight-hanging',
            color: 'success',
            onClick: (row) => apply({ kesim: row.key }),
          },
        ];

  return (
    <>
      <PageHeader
        title="Ağırlık Düşüşü"
        subtitle="Biten CNC kesimlerinin sacı stoktan düşülür, fire saclar stoğa döner, fire hesaplanır"
        icon="weight-hanging"
        backTo="/warehouse"
      />
      <SegmentedControl
        mb="sm"
        value={done ? 'done' : 'pending'}
        onChange={(view) => apply({ view, page: '1' })}
        data={[
          { value: 'pending', label: 'Bekleyen Kesimler' },
          { value: 'done', label: 'İşlenen Kesimler' },
        ]}
      />
      <DataTable
        title={done ? 'İşlenen Kesimler' : 'Depoda işlenmeyi bekleyen kesimler'}
        filters={
          <FilterBar
            inline
            filters={FILTERS}
            values={{ key: values.key, name: values.name, nesting_id: values.nesting_id }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ key: '', name: '', nesting_id: '', page: '1' })}
          />
        }
        data={list.data?.results ?? EMPTY}
        columns={done ? doneColumns : pendingColumns}
        getRowId={(row) => row.key}
        loading={list.isFetching}
        onRowClick={(row) => apply(done ? { detay: row.key } : { kesim: row.key })}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        rowActions={rowActions}
        emptyMessage={done ? 'İşlenen kesim yok' : 'Depoda işlenmeyi bekleyen kesim yok'}
      />
      {values.kesim ? (
        <ProcessModal key={values.kesim} cutKey={values.kesim} onClose={() => apply({ kesim: '' })} />
      ) : null}
      {values.detay ? (
        <CutDetailsModal cutKey={values.detay} onClose={() => apply({ detay: '' })} />
      ) : null}
    </>
  );
}
