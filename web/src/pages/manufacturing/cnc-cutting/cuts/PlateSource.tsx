import {
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  CncPieceDetails,
  CncTask,
  CncTaskInput,
  RemnantChoice,
} from '@/api/manufacturing/cncTasks';
import {
  markPlanningItemConsumed,
  planningItemKeys,
  planningItemsQueryOptions,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import {
  piecesQueryOptions,
  placeLabel,
  sizeLabel,
  type MaterialPiece,
  type PiecesParams,
} from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  StatusBadge,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';

// The "Plaka Kaynağı" section of the create and edit modals. Every cut uses
// exactly one plate source: sheets from piece stock (a plate lot on the Sac &
// Boy Stoğu page) or a planning request item (plaka kalemi); picking one
// clears the other. A plaka kalemi may also take one of the lots received
// for it in Mal kabul: the cut then reserves the line's own sheets and keeps
// the line. The sheets are reserved for the cut and leave stock when
// the warehouse processes it (Ağırlık Düşüşü). Cuts made before piece stock
// may still show their old remnant plate (fire plaka); it can be kept or
// replaced, not picked anew.

/** Talep Edilen Sac: the cut can't start or finish before its sheets pass Mal kabul. */
export const SHEETS_WAITING_FINISH =
  "Bu kesimin sacı henüz Mal Kabul'den geçmedi; sac gelince bitirilebilir.";

/** A sized plate line (size + sheet count): its cuts take the line's own sheets. */
export function isOrderedLine(item: PlanningItem | null | undefined) {
  if (!item) return false;
  if (item.ordered_line !== undefined) return item.ordered_line;
  return Boolean(item.piece_count && item.piece_width_mm && item.piece_length_mm);
}

const mm = (value: unknown) => formatNumber(Number(value), 0);

export function lineSizeText(item: PlanningItem) {
  return `${mm(item.piece_width_mm)} × ${mm(item.piece_length_mm)} mm`;
}

/** A plate lot as a plate source (available: its free sheets for this cut). */
export interface PieceChoice extends CncPieceDetails {
  available: number | null;
}

export interface PlateSourceValue {
  piece: PieceChoice | null;
  /** Old remnant plate source (cuts from before piece stock). */
  remnant: RemnantChoice | null;
  quantityUsed: number;
  planningItem: PlanningItem | null;
  markConsumed: boolean;
  /** The cut is finished (its sheets are booked): its source is fixed until it is reopened. */
  locked: boolean;
}

export const EMPTY_PLATE_SOURCE: PlateSourceValue = {
  piece: null,
  remnant: null,
  quantityUsed: 1,
  planningItem: null,
  markConsumed: false,
  locked: false,
};

/** The saved source from the GET payload (piece_reservations / plate_usage_records / plate_item). */
export function plateSourceFromTask(task: CncTask): PlateSourceValue {
  const reservation = task.piece_reservations?.[0] ?? null;
  const issue = task.piece_issues?.[0] ?? null;
  const usage = task.plate_usage_records?.[0] ?? null;
  const remnant: RemnantChoice | null = usage
    ? (usage.remnant_plate_details ?? { id: usage.remnant_plate, dimensions: '-', material: '-' })
    : null;
  const piece: PieceChoice | null = reservation
    ? { ...reservation.piece_details, available: reservation.available_quantity }
    : issue
      ? { ...issue.piece_details, available: null }
      : null;
  const used = reservation?.quantity ?? issue?.quantity ?? usage?.quantity_used;
  return {
    piece,
    remnant,
    quantityUsed: used !== undefined && used !== null ? parseInt(String(used), 10) : 1,
    planningItem: task.plate_item ?? null,
    markConsumed: task.plate_item ? Boolean(task.plate_item.is_consumed) : false,
    locked: Boolean(task.completion_date),
  };
}

export function plateSourceInput(
  value: PlateSourceValue,
): Pick<
  CncTaskInput,
  | 'selected_plate_id'
  | 'selected_piece_id'
  | 'quantity_used'
  | 'planning_request_item_id'
  | 'mark_item_consumed'
  | 'keepSource'
> {
  return {
    selected_piece_id: value.piece ? value.piece.id : null,
    selected_plate_id: value.remnant ? value.remnant.id : null,
    quantity_used: value.piece || value.remnant ? value.quantityUsed : null,
    planning_request_item_id: value.planningItem ? value.planningItem.id : null,
    mark_item_consumed: value.planningItem ? value.markConsumed : undefined,
    keepSource: value.locked,
  };
}

/** Has the cut a plate source? */
export function hasPlateSource(value: PlateSourceValue) {
  return Boolean(value.piece || value.remnant || value.planningItem);
}

function availableOf(value: PlateSourceValue): number | null {
  if (value.piece) return value.piece.available;
  const raw = value.remnant?.available_quantity;
  return raw !== undefined && raw !== null ? parseInt(String(raw), 10) : null;
}

export function pieceText(p: Pick<CncPieceDetails, 'item_code' | 'width_mm' | 'length_mm'>) {
  return `${p.item_code} · ${sizeLabel(p)}`;
}

export function remnantText(r: RemnantChoice) {
  const thickness = r.thickness_mm ? `${r.thickness_mm} mm ` : '';
  return `#${r.id} ${thickness}${r.dimensions || ''} ${r.material || ''}`.trim();
}

function deliveryText(item: PlanningItem) {
  const delivered = item.is_delivered === true;
  const partial = !delivered && Number(item.delivered_quantity || 0) > 0;
  if (delivered) return { text: 'Malzeme teslim alındı.', color: 'green' };
  if (partial)
    return {
      text: `Malzeme kısmen teslim alındı (${item.delivered_quantity} / ${item.quantity} ${item.item_unit || ''}).`,
      color: 'blue',
    };
  return { text: 'Malzeme henüz teslim edilmedi — satın alma bekleniyor.', color: 'red' };
}

export interface PlateSourceSectionProps {
  value: PlateSourceValue;
  onChange: (value: PlateSourceValue) => void;
  /** The saved cut's sheets still waiting for Mal kabul (edit modal). */
  sheetsWaiting?: number | null;
}

export function PlateSourceSection({ value, onChange, sheetsWaiting }: PlateSourceSectionProps) {
  const [picking, setPicking] = useState<'piece' | 'item' | 'ordered' | null>(null);
  const [quantityError, setQuantityError] = useState('');
  const { piece, remnant, planningItem, locked } = value;
  const available = availableOf(value);

  const setQuantity = (raw: string | number) => {
    const entered = parseInt(String(raw), 10) || 0;
    if (available !== null && entered > available) {
      const message = `Maksimum ${available} adet kullanılabilir`;
      setQuantityError(message);
      notify.warning(message);
      onChange({ ...value, quantityUsed: available });
      return;
    }
    setQuantityError('');
    onChange({ ...value, quantityUsed: entered >= 1 ? entered : 1 });
  };

  const itemLabel = planningItem
    ? (() => {
        const code = planningItem.item_code || `#${planningItem.id}`;
        return planningItem.item_name ? `${code} — ${planningItem.item_name}` : code;
      })()
    : '';
  const delivery = planningItem ? deliveryText(planningItem) : null;
  const usageCount = planningItem?.cnc_cuts_count ?? 0;
  const ordered = isOrderedLine(planningItem);

  if (locked) {
    return (
      <ModalSection title="Plaka Kaynağı" icon="fas fa-layer-group">
        <Text size="sm">
          {piece && planningItem
            ? `Plaka kalemi: ${itemLabel} · gelen sac: ${pieceText(piece)} × ${value.quantityUsed}`
            : piece
              ? `Stoktan sac: ${pieceText(piece)} × ${value.quantityUsed}`
              : planningItem
                ? `Plaka kalemi: ${itemLabel}`
                : remnant
                  ? `Fire plaka: ${remnantText(remnant)}`
                  : 'Sac partisi seçilmeden işlendi.'}
        </Text>
        <Text size="xs" c="dimmed">
          Kesim tamamlandı ve sacı stoktan düşüldü; sac kaynağını değiştirmek için önce kesimi
          yeniden açın.
        </Text>
      </ModalSection>
    );
  }

  return (
    <ModalSection title="Plaka Kaynağı" icon="fas fa-layer-group">
      <Group gap="xs" mb="xs">
        <Button
          variant="outline"
          color="cyan"
          leftSection={<FaIcon icon="fas fa-layer-group" />}
          onClick={() => setPicking('piece')}
        >
          {piece ? 'Stoktan Sacı Değiştir' : 'Stoktan Sac Seç'}
        </Button>
        <Button
          variant="outline"
          color="grape"
          leftSection={<FaIcon icon="fas fa-truck-loading" />}
          onClick={() => setPicking('ordered')}
        >
          Talep Edilen Sac Seç
        </Button>
        <Button
          variant="outline"
          leftSection={<FaIcon icon="fas fa-box-open" />}
          onClick={() => setPicking('item')}
        >
          {planningItem && !ordered ? 'Plaka Kalemi Değiştir' : 'Plaka Kalemi Seç'}
        </Button>
        {piece ? (
          <Group gap={4}>
            <Badge color="green" leftSection={<FaIcon icon="fas fa-check" />}>
              Seçili: {pieceText(piece)}
            </Badge>
            <CloseButton
              size="sm"
              aria-label="Sacı kaldır"
              onClick={() => {
                setQuantityError('');
                onChange({ ...value, piece: null, quantityUsed: 1 });
              }}
            />
          </Group>
        ) : null}
        {remnant ? (
          <Group gap={4}>
            <Badge color="gray" leftSection={<FaIcon icon="fas fa-history" />}>
              Eski fire plaka: {remnantText(remnant)}
            </Badge>
            <CloseButton
              size="sm"
              aria-label="Fire plakayı kaldır"
              onClick={() => {
                setQuantityError('');
                onChange({ ...value, remnant: null, quantityUsed: 1 });
              }}
            />
          </Group>
        ) : null}
        {planningItem ? (
          <Group gap={4}>
            <Badge color="green" leftSection={<FaIcon icon="fas fa-check" />}>
              Seçili: {itemLabel}
            </Badge>
            <CloseButton
              size="sm"
              aria-label="Plaka kalemini kaldır"
              onClick={() => onChange({ ...value, planningItem: null, markConsumed: false })}
            />
          </Group>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Her kesim için stoktan sac veya plaka kalemi seçilmelidir; malzeme, kalınlık ve ölçü seçilen
        kaynaktan otomatik alınır. Stoktan seçilen saclar kesime ayrılır ve depo kesimi işleyince
        stoktan düşer.
      </Text>

      {planningItem && ordered ? (
        <OrderedLineInfo
          item={planningItem}
          sheetsWaiting={sheetsWaiting ?? null}
          lots={
            <LineLots
              planningItemId={planningItem.id}
              selectedId={piece?.id ?? null}
              hideEmpty
              onPick={(lot) => {
                setQuantityError('');
                onChange({ ...value, piece: lot, remnant: null, quantityUsed: 1 });
              }}
            />
          }
        />
      ) : null}

      {planningItem && delivery && !ordered ? (
        <Stack gap={4} mb="xs">
          <Text size="xs">
            {usageCount > 0
              ? `Bu kalemden daha önce ${usageCount} kesim yapıldı (adetler dahil).`
              : 'Bu kalemden daha önce hiç kesim yapılmadı.'}
          </Text>
          <Text size="xs" c={delivery.color}>
            {delivery.text}
          </Text>
          <Checkbox
            label="Kullanıldı olarak işaretle (bu kalemin son plakası kesiliyor)"
            checked={value.markConsumed}
            onChange={(event) => onChange({ ...value, markConsumed: event.currentTarget.checked })}
          />
          <LineLots
            planningItemId={planningItem.id}
            selectedId={piece?.id ?? null}
            onPick={(lot) => {
              setQuantityError('');
              onChange({ ...value, piece: lot, remnant: null, quantityUsed: 1 });
            }}
          />
        </Stack>
      ) : null}

      {piece || remnant ? (
        <NumberInput
          label="Kullanılacak Adet"
          min={1}
          max={available ?? undefined}
          step={1}
          allowDecimal={false}
          placeholder="1"
          value={value.quantityUsed}
          onChange={setQuantity}
          error={quantityError || undefined}
          description={
            available !== null
              ? `Bu partiden kaç sac kullanılacak (Maksimum: ${available})`
              : 'Kaç sac kullanılacak (varsayılan: 1)'
          }
          maw={320}
        />
      ) : null}

      {picking === 'piece' ? (
        <PieceLotPickerModal
          onClose={() => setPicking(null)}
          onPick={(picked) => {
            setQuantityError('');
            onChange({
              ...EMPTY_PLATE_SOURCE,
              piece: picked,
              quantityUsed: 1,
            });
            setPicking(null);
            notify.success('Sac seçildi');
          }}
        />
      ) : null}
      {picking === 'ordered' ? (
        <OrderedLinePickerModal
          onClose={() => setPicking(null)}
          onPick={(item) => {
            setQuantityError('');
            onChange({ ...EMPTY_PLATE_SOURCE, planningItem: { ...item, ordered_line: true } });
            setPicking(null);
            notify.success('Talep edilen sac seçildi');
          }}
        />
      ) : null}
      {picking === 'item' ? (
        <PlanningItemPickerModal
          onClose={() => setPicking(null)}
          onPick={(item) => {
            setQuantityError('');
            onChange({
              ...EMPTY_PLATE_SOURCE,
              planningItem: item,
              markConsumed: item.is_consumed === true,
            });
            setPicking(null);
            notify.success('Plaka kalemi seçildi');
          }}
        />
      ) : null}
    </ModalSection>
  );
}

// ---- Talep Edilen Sac: a sized plate line's sheets ----

function OrderedLineInfo({
  item,
  sheetsWaiting,
  lots,
}: {
  item: PlanningItem;
  sheetsWaiting: number | null;
  lots: ReactNode;
}) {
  const free = item.sheets_free;
  return (
    <Stack gap={4} mb="xs">
      <Text size="xs">
        Talep: {item.piece_count ?? '-'} sac · {lineSizeText(item)}
        {item.sheets_received !== undefined && item.sheets_received !== null
          ? ` · Mal Kabul'den geçen: ${item.sheets_received}`
          : ''}
        {free !== undefined && free !== null ? ` · boş: ${free}` : ''}
      </Text>
      <Text size="xs" c="dimmed">
        Kesimin adedi kadar sac bu kalemden ayrılır; ölçü ve kalınlık kalemden alınır. Gelen saclar
        kesime kendiliğinden ayrılır. Sac Mal Kabul&apos;den geçmeden kesim başlatılamaz ve
        bitirilemez.
      </Text>
      {sheetsWaiting ? (
        <Badge color="orange" variant="light" leftSection={<FaIcon icon="fas fa-hourglass-half" />}>
          Sac bekleniyor: {sheetsWaiting} sac
        </Badge>
      ) : null}
      {lots}
    </Stack>
  );
}

const ORDERED_COLUMNS: DataTableColumn<PlanningItem>[] = [
  {
    key: 'item_code',
    header: 'Sac',
    width: '28%',
    render: (r) => (
      <Stack gap={0}>
        <Text size="sm" fw={600}>
          {r.item_code}
        </Text>
        <Text size="xs" c="dimmed">
          {r.item_name}
        </Text>
      </Stack>
    ),
  },
  { key: 'piece_width_mm', header: 'Ölçü', width: '14%', render: (r) => lineSizeText(r) },
  { key: 'job_no', header: 'İş Emri', width: '10%' },
  {
    key: 'piece_count',
    header: 'Talep',
    width: '8%',
    render: (r) => `${r.piece_count ?? '-'} sac`,
  },
  {
    key: 'sheets_received',
    header: 'Gelen',
    width: '8%',
    render: (r) => String(r.sheets_received ?? 0),
  },
  {
    key: 'cnc_cuts_count',
    header: 'Kesimde',
    width: '8%',
    render: (r) => String(r.cnc_cuts_count ?? 0),
  },
  {
    key: 'sheets_free',
    header: 'Boş',
    width: '8%',
    render: (r) => (
      <StatusBadge color={(r.sheets_free ?? 0) > 0 ? 'green' : 'grey'}>
        {String(r.sheets_free ?? 0)}
      </StatusBadge>
    ),
  },
  { key: 'planning_request_number', header: 'Talep No', width: '12%' },
];

type OrderedFilters = { job_no: string; search: string };
const EMPTY_ORDERED_FILTERS: OrderedFilters = { job_no: '', search: '' };
const ORDERED_FILTERS: FilterConfig<keyof OrderedFilters>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş Emri No',
    placeholder: 'örn. 270-01',
    suggestions: 'jobOrders',
  },
  { type: 'text', key: 'search', label: 'Kart / Kalınlık', placeholder: 'örn. 10 mm' },
];
const EMPTY_ORDERED: PlanningItem[] = [];

/** "Talep Edilen Sac Seç": sized plate lines, whether their sheets arrived or not. */
export function OrderedLinePickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (item: PlanningItem) => void;
}) {
  const [filters, setFilters] = useState<OrderedFilters>(EMPTY_ORDERED_FILTERS);
  const [page, setPage] = useState(1);
  const params: PlanningItemsParams = {
    is_plate: 'true',
    sized: 'true',
    is_consumed: 'false',
    fields: 'simple',
    ordering: '-id',
    page,
    page_size: 20,
    job_no: filters.job_no.trim() || undefined,
    search: filters.search.trim() || undefined,
  };
  const list = useQuery({
    ...planningItemsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error('Talep edilen saclar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const rowActions = (): RowAction<PlanningItem>[] => [
    {
      key: 'select',
      label: 'Seç',
      icon: 'fas fa-check',
      color: 'success',
      onClick: (row) => {
        if ((row.sheets_free ?? 0) < 1) {
          notify.warning('Bu kalemin bütün sacları kesimlere ayrılmış.');
          return;
        }
        onPick(row);
      },
    },
  ];

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Talep Edilen Sac Seç" icon="fas fa-truck-loading" />
      <ModalBody>
        <ModalSection title="Ölçülü sac talepleri" icon="fas fa-table">
          <DataTable
            title="Siparişteki ve gelen saclar"
            filters={
              <FilterBar
                inline
                filters={ORDERED_FILTERS}
                values={filters}
                onApply={(next) => {
                  setPage(1);
                  setFilters(next);
                }}
                onClear={() => {
                  setPage(1);
                  setFilters(EMPTY_ORDERED_FILTERS);
                }}
              />
            }
            data={list.data?.results ?? EMPTY_ORDERED}
            columns={ORDERED_COLUMNS}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            pagination={{ page, pageSize: 20, total: list.data?.count ?? 0, onPageChange: setPage }}
            rowActions={rowActions}
            emptyMessage="Ölçülü sac talebi bulunamadı"
          />
          <Text size="xs" c="dimmed" mt={4}>
            Henüz gelmemiş sac için de kesim planlanabilir; kesim, sac Mal Kabul&apos;den geçince
            başlatılabilir.
          </Text>
        </ModalSection>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
            İptal
          </Button>
        </Group>
      </ModalBody>
    </Modal>
  );
}

// ---- The sheets received for a plaka kalemi ----

const EMPTY_LINE_LOTS: MaterialPiece[] = [];

/** The lots received for a planning line, to cut from (the line stays on the cut). */
export function LineLots({
  planningItemId,
  selectedId,
  onPick,
  hideEmpty = false,
}: {
  planningItemId: number;
  selectedId: number | null;
  onPick: (lot: PieceChoice) => void;
  /** Talep Edilen Sac: arrivals are reserved by themselves; say nothing while none came. */
  hideEmpty?: boolean;
}) {
  const lots = useQuery(
    piecesQueryOptions({ planning_item: planningItemId, kind: 'plate', page_size: 50 }),
  );
  const rows = lots.data?.results ?? EMPTY_LINE_LOTS;
  if (lots.isLoading) return null;
  if (rows.length === 0) {
    if (hideEmpty) return null;
    return (
      <Text size="xs" c="dimmed">
        Bu kaleme mal kabulde henüz sac girilmedi. Sac gelince kesimi düzenleyip seçebilir ya da
        kesimi bitirirken seçebilirsiniz.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600}>
        Bu kalemin gelen sacları
      </Text>
      {rows.map((lot) => {
        const free = lot.available_quantity ?? lot.quantity;
        const chosen = lot.id === selectedId;
        return (
          <Group key={lot.id} gap="xs">
            <Text size="sm">
              {pieceText(lot)} · {placeLabel(lot)} · boş {free} / {lot.quantity}
              {lot.heat_number ? ` · şarj ${lot.heat_number}` : ''}
            </Text>
            {chosen ? (
              <Badge color="green" leftSection={<FaIcon icon="fas fa-check" />}>
                Seçili
              </Badge>
            ) : (
              <Button
                size="compact-xs"
                variant="light"
                disabled={free < 1 || !lot.warehouse_code}
                onClick={() => onPick(pieceChoice(lot))}
              >
                Bu sacı kullan
              </Button>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}

// ---- "Stoktan Sac Seç": plate lots with free sheets ----

type PieceFilters = { search: string; thickness_mm: string };
const EMPTY_PIECE_FILTERS: PieceFilters = { search: '', thickness_mm: '' };

const PIECE_FILTERS: FilterConfig<keyof PieceFilters>[] = [
  { type: 'text', key: 'search', label: 'Kart / Şarj / İş Emri', placeholder: 'örn. ST 37' },
  { type: 'text', key: 'thickness_mm', label: 'Kalınlık (mm)', placeholder: 'örn. 10' },
];

const kgText = (value: string | null) =>
  value === null ? '-' : `${formatNumber(Number(value), 2)} kg`;

const PIECE_COLUMNS: DataTableColumn<MaterialPiece>[] = [
  {
    key: 'item_code',
    header: 'Sac Kartı',
    width: '30%',
    render: (p) => (
      <Stack gap={0}>
        <Text size="sm" fw={600}>
          {p.item_code}
        </Text>
        <Text size="xs" c="dimmed">
          {p.item_name}
        </Text>
      </Stack>
    ),
  },
  {
    key: 'plate_thickness_mm',
    header: 'Kalınlık',
    width: '9%',
    render: (p) => (p.plate_thickness_mm ? `${Number(p.plate_thickness_mm)} mm` : '-'),
  },
  { key: 'width_mm', header: 'Ölçü', width: '15%', render: (p) => sizeLabel(p) },
  {
    key: 'available_quantity',
    header: 'Boş / Adet',
    width: '10%',
    render: (p) => `${p.available_quantity ?? p.quantity} / ${p.quantity}`,
  },
  { key: 'warehouse_code', header: 'Yer', width: '14%', render: (p) => placeLabel(p) },
  { key: 'heat_number', header: 'Şarj No', width: '10%', render: (p) => p.heat_number || '-' },
  { key: 'unit_kg', header: 'kg / adet', width: '12%', render: (p) => kgText(p.unit_kg) },
];

const EMPTY_PIECES: MaterialPiece[] = [];

export function pieceChoice(p: MaterialPiece): PieceChoice {
  return {
    id: p.id,
    item: p.item,
    item_code: p.item_code,
    item_name: p.item_name,
    width_mm: p.width_mm,
    length_mm: p.length_mm,
    heat_number: p.heat_number,
    warehouse_code: p.warehouse_code,
    job_no: p.job_no,
    unit_kg: p.unit_kg,
    available: p.available_quantity ?? p.quantity,
  };
}

export function PieceLotPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (piece: PieceChoice) => void;
}) {
  const [filters, setFilters] = useState<PieceFilters>(EMPTY_PIECE_FILTERS);
  const [page, setPage] = useState(1);
  const params: PiecesParams = {
    kind: 'plate',
    available: 'true',
    page,
    page_size: 20,
    search: filters.search.trim() || undefined,
    thickness_mm: filters.thickness_mm.trim().replace(',', '.') || undefined,
  };
  const list = useQuery({ ...piecesQueryOptions(params), placeholderData: keepPreviousData });
  useEffect(() => {
    if (list.isError) notify.error('Sac stoğu yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const rowActions = (): RowAction<MaterialPiece>[] => [
    {
      key: 'select',
      label: 'Seç',
      icon: 'fas fa-check',
      color: 'success',
      // Lots at a supplier (Fasonda) can't go to a cut.
      onClick: (row) => {
        if (!row.warehouse_code) {
          notify.warning('Fasoncudaki sac kesime ayrılamaz; önce depoya dönmeli.');
          return;
        }
        onPick(pieceChoice(row));
      },
    },
  ];

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Stoktan Sac Seç" icon="fas fa-layer-group" />
      <ModalBody>
        <ModalSection title="Sac Stoğu" icon="fas fa-table">
          <DataTable
            title="Boş sacı olan partiler"
            filters={
              <FilterBar
                inline
                filters={PIECE_FILTERS}
                values={filters}
                onApply={(next) => {
                  setPage(1);
                  setFilters(next);
                }}
                onClear={() => {
                  setPage(1);
                  setFilters(EMPTY_PIECE_FILTERS);
                }}
              />
            }
            data={list.data?.results ?? EMPTY_PIECES}
            columns={PIECE_COLUMNS}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            pagination={{ page, pageSize: 20, total: list.data?.count ?? 0, onPageChange: setPage }}
            rowActions={rowActions}
            emptyMessage="Boş sacı olan parti bulunamadı"
          />
          <Text size="xs" c="dimmed" mt={4}>
            Listede olmayan sac (fire sac dahil) önce Sac &amp; Boy Stoğu sayfasından girilir.
          </Text>
        </ModalSection>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
            İptal
          </Button>
        </Group>
      </ModalBody>
    </Modal>
  );
}

// ---- "Plaka Kalemi Seç" ----

type ItemFilters = { job_no: string; search: string; is_delivered: string };
const EMPTY_ITEM_FILTERS: ItemFilters = { job_no: '', search: '', is_delivered: '' };

const ITEM_FILTERS: FilterConfig<keyof ItemFilters>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş Emri No',
    placeholder: 'örn. 270-01',
    suggestions: 'jobOrders',
  },
  { type: 'text', key: 'search', label: 'Kalem Kodu / Adı', placeholder: 'örn. 10 mm' },
  {
    type: 'select',
    key: 'is_delivered',
    label: 'Teslim Durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'true', label: 'Teslim Edildi' },
      { value: 'false', label: 'Teslim Bekleniyor' },
    ],
  },
];

const ITEM_COLUMNS: DataTableColumn<PlanningItem>[] = [
  { key: 'item_code', header: 'Kalem Kodu', width: '18%' },
  { key: 'item_name', header: 'Kalem Adı', width: '24%' },
  { key: 'job_no', header: 'İş Emri', width: '10%' },
  {
    key: 'quantity',
    header: 'Miktar',
    width: '10%',
    render: (r) => (r.quantity ? `${r.quantity} ${r.item_unit || ''}`.trim() : '-'),
  },
  {
    key: 'is_delivered',
    header: 'Teslim',
    width: '8%',
    render: (r) =>
      r.is_delivered ? (
        <StatusBadge color="green">Teslim</StatusBadge>
      ) : Number(r.delivered_quantity || 0) > 0 ? (
        <span title={`${r.delivered_quantity} / ${r.quantity} alındı`}>
          <StatusBadge color="purple">Kısmi</StatusBadge>
        </span>
      ) : (
        <StatusBadge color="orange">Bekliyor</StatusBadge>
      ),
  },
  {
    key: 'cnc_cuts_count',
    header: 'Kullanım',
    width: '8%',
    render: (r) => `${r.cnc_cuts_count ?? 0} kesim`,
  },
  { key: 'planning_request_number', header: 'Talep No', width: '12%' },
];

const EMPTY_ITEMS: PlanningItem[] = [];

export function PlanningItemPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (item: PlanningItem) => void;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_ITEM_FILTERS);
  const [page, setPage] = useState(1);

  // Unconsumed plate lines of the user's own planning requests (superusers: all).
  const params: PlanningItemsParams = {
    is_plate: 'true',
    // Sized lines are picked as Talep Edilen Sac.
    sized: 'false',
    is_consumed: 'false',
    mine: 'true',
    fields: 'simple',
    ordering: '-id',
    page,
    page_size: 20,
    job_no: filters.job_no.trim() || undefined,
    search: filters.search.trim() || undefined,
    is_delivered:
      filters.is_delivered === 'true' || filters.is_delivered === 'false'
        ? filters.is_delivered
        : undefined,
  };
  const list = useQuery({
    ...planningItemsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error('Plaka kalemleri yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const consume = useMutation({
    mutationFn: (item: PlanningItem) => markPlanningItemConsumed(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planningItemKeys.all }),
  });

  const markConsumed = async (row: PlanningItem) => {
    const ok = await confirm({
      title: 'Kullanıldı Olarak İşaretle',
      icon: 'fas fa-box',
      message: `${row.item_code || ''} kalemi kullanıldı olarak işaretlenecek.`,
      description:
        'Kullanıldı işaretlenen kalemler yeni kesimler için seçilemez. (Planlama Kalemleri sayfasından geri alınabilir.)',
      confirmLabel: 'Evet, Kullanıldı',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await consume.mutateAsync(row);
      notify.success('Kalem kullanıldı olarak işaretlendi');
    } catch {
      notify.error('Kalem işaretlenirken hata oluştu');
    }
  };

  const rowActions = (): RowAction<PlanningItem>[] => [
    { key: 'select', label: 'Seç', icon: 'fas fa-check', color: 'success', onClick: onPick },
    {
      key: 'mark-consumed',
      label: 'Kullanıldı',
      icon: 'fas fa-box',
      color: 'danger',
      onClick: (row) => void markConsumed(row),
    },
  ];

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Plaka Kalemi Seç" icon="fas fa-box-open" />
      <ModalBody>
        <ModalSection title="Plaka Kalemleri" icon="fas fa-table">
          <DataTable
            title="Plaka Kalemleri Listesi"
            filters={
              <FilterBar
                inline
                filters={ITEM_FILTERS}
                values={filters}
                onApply={(next) => {
                  setPage(1);
                  setFilters(next);
                }}
              />
            }
            data={list.data?.results ?? EMPTY_ITEMS}
            columns={ITEM_COLUMNS}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            pagination={{ page, pageSize: 20, total: list.data?.count ?? 0, onPageChange: setPage }}
            rowActions={rowActions}
            emptyMessage="Plaka kalemi bulunamadı"
          />
        </ModalSection>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
            İptal
          </Button>
        </Group>
      </ModalBody>
    </Modal>
  );
}
