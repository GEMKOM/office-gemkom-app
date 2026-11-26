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
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type {
  CncPieceDetails,
  CncPieceReservation,
  CncPlateMismatch,
  CncTask,
  CncTaskInput,
  RemnantChoice,
} from '@/api/manufacturing/cncTasks';
import {
  planningItemsQueryOptions,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import {
  lineSheetsQueryOptions,
  piecesQueryOptions,
  placeLabel,
  sizeLabel,
  type MaterialPiece,
  type PiecesParams,
} from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';
import {
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
// exactly one plate source: coded sheets from Sac Stoğu, or a sized plate
// line still on order (Talep Edilen Sac); picking one clears the other. An
// unsized planning line (plaka kalemi) is no longer picked for a new cut:
// once its sheets pass Mal Kabul they are in Sac Stoğu with their codes. Older
// cuts keep and show theirs, and may take one of the lots received for it.
// The sheets are reserved for the cut and leave stock when
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
  /** The first picked sheet (or an old uncoded lot). */
  piece: PieceChoice | null;
  /**
   * The coded sheets picked for the cut, one each (S26-…); the cut's Adet is
   * their count. Empty for an old uncoded lot (piece + quantityUsed).
   */
  sheets?: PieceChoice[];
  /** Old remnant plate source (cuts from before piece stock). */
  remnant: RemnantChoice | null;
  quantityUsed: number;
  planningItem: PlanningItem | null;
  markConsumed: boolean;
  /** The cut is finished (its sheets are booked): its source is fixed until it is reopened. */
  locked: boolean;
  /** Talep Edilen Sac: the sheets the backend reserved for the cut (shown, never sent). */
  reserved?: CncPieceReservation[];
}

export const EMPTY_PLATE_SOURCE: PlateSourceValue = {
  piece: null,
  sheets: [],
  remnant: null,
  quantityUsed: 1,
  planningItem: null,
  markConsumed: false,
  locked: false,
};

/** The saved source from the GET payload (piece_reservations / plate_usage_records / plate_item). */
export function plateSourceFromTask(task: CncTask): PlateSourceValue {
  // A Talep Edilen Sac cut's sheets are reserved by the backend (one lot or several):
  // the form shows them but keeps no lot of its own, so an edit never resends them.
  if (isOrderedLine(task.plate_item) && !task.completion_date) {
    return {
      ...EMPTY_PLATE_SOURCE,
      planningItem: task.plate_item ?? null,
      markConsumed: Boolean(task.plate_item?.is_consumed),
      reserved: task.piece_reservations ?? [],
    };
  }
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
  // Coded sheets: the cut holds one row per sheet.
  const held = task.piece_reservations?.length
    ? task.piece_reservations.map((r) => ({ ...r.piece_details, available: r.available_quantity }))
    : (task.piece_issues ?? []).map((r) => ({ ...r.piece_details, available: null }));
  const sheets = held.length && held.every((p) => p.code) ? held : [];
  const used = sheets.length || (reservation?.quantity ?? issue?.quantity ?? usage?.quantity_used);
  return {
    piece,
    sheets,
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
  | 'selected_piece_ids'
  | 'quantity_used'
  | 'planning_request_item_id'
  | 'mark_item_consumed'
  | 'keepSource'
> {
  const sheets = value.sheets ?? [];
  return {
    selected_piece_id: value.piece ? value.piece.id : null,
    ...(sheets.length ? { selected_piece_ids: sheets.map((s) => s.id) } : {}),
    selected_plate_id: value.remnant ? value.remnant.id : null,
    quantity_used: value.piece || value.remnant ? value.quantityUsed : null,
    planning_request_item_id: value.planningItem ? value.planningItem.id : null,
    mark_item_consumed: value.planningItem ? value.markConsumed : undefined,
    keepSource: value.locked,
  };
}

/** The plate source as the user left it equals the one the cut was opened with. */
export function samePlateSource(a: PlateSourceValue, b: PlateSourceValue) {
  const ids = (v: PlateSourceValue) => (v.sheets ?? []).map((s) => s.id).join(',');
  return (
    (a.piece?.id ?? null) === (b.piece?.id ?? null) &&
    ids(a) === ids(b) &&
    (a.remnant?.id ?? null) === (b.remnant?.id ?? null) &&
    (a.planningItem?.id ?? null) === (b.planningItem?.id ?? null) &&
    a.markConsumed === b.markConsumed &&
    (a.piece || a.remnant ? a.quantityUsed === b.quantityUsed : true)
  );
}

/** The cut's Adet follows the sheets taken from a stock lot (not on a Talep Edilen Sac line). */
export function adetFollowsLot(value: PlateSourceValue) {
  return Boolean(value.piece && !value.locked && !isOrderedLine(value.planningItem));
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

export function pieceText(
  p: Pick<CncPieceDetails, 'item_code' | 'width_mm' | 'length_mm' | 'shape' | 'area_m2'> & {
    code?: string | null;
  },
) {
  return `${p.code ? `${p.code} · ` : ''}${p.item_code} · ${sizeLabel(p)}`;
}

/**
 * A cut's sheets in one line: "S26-00001, S26-00002 · 0100… · 1500 × 3000 mm"
 * per card, size and shape ("Ø 600 mm"); an old uncoded lot reads "0100… · 1500 × 3000 mm × 3".
 */
export function sheetsText(
  rows: {
    quantity: number;
    piece_details: Pick<
      CncPieceDetails,
      'code' | 'item_code' | 'width_mm' | 'length_mm' | 'shape' | 'area_m2'
    >;
  }[],
): string {
  const groups = new Map<
    string,
    { codes: string[]; uncoded: number; p: (typeof rows)[number]['piece_details'] }
  >();
  for (const r of rows) {
    const p = r.piece_details;
    const key = `${p.item_code}|${p.width_mm}|${p.length_mm}|${p.shape ?? 'rectangle'}|${p.area_m2 ?? ''}`;
    const g = groups.get(key) ?? { codes: [], uncoded: 0, p };
    if (p.code) g.codes.push(p.code);
    else g.uncoded += r.quantity;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ codes, uncoded, p }) => {
      const what = pieceText({ ...p, code: null });
      const parts = [
        codes.length ? `${codes.join(', ')} · ${what}` : '',
        uncoded ? `${what} × ${uncoded}` : '',
      ];
      return parts.filter(Boolean).join(' · ');
    })
    .join(' · ');
}

/** The value with these coded sheets as the cut's plate (Adet = their count). */
export function withSheets(value: PlateSourceValue, sheets: PieceChoice[]): PlateSourceValue {
  return {
    ...value,
    sheets,
    piece: sheets[0] ?? null,
    remnant: sheets.length ? null : value.remnant,
    quantityUsed: Math.max(1, sheets.length),
  };
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
  /** Lots of the cut's line that arrived in another size (edit modal). */
  mismatch?: CncPlateMismatch[];
}

export function PlateSourceSection({
  value,
  onChange,
  sheetsWaiting,
  mismatch,
}: PlateSourceSectionProps) {
  const [picking, setPicking] = useState<'piece' | 'ordered' | null>(null);
  const [quantityError, setQuantityError] = useState('');
  const { piece, remnant, planningItem, locked } = value;
  const sheets = value.sheets ?? [];
  const available = availableOf(value);
  const pickedText = sheets.length
    ? sheetsText(sheets.map((s) => ({ quantity: 1, piece_details: s })))
    : piece
      ? `${pieceText(piece)} × ${value.quantityUsed}`
      : '';
  // A line's received sheet picked or dropped (coded sheets: one each).
  const toggleSheet = (lot: PieceChoice) => {
    setQuantityError('');
    if (!lot.code) {
      onChange({ ...value, sheets: [], piece: lot, remnant: null, quantityUsed: 1 });
      return;
    }
    const next = sheets.some((s) => s.id === lot.id)
      ? sheets.filter((s) => s.id !== lot.id)
      : [...sheets, lot];
    onChange(withSheets(value, next));
  };

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
            ? `Plaka kalemi: ${itemLabel} · gelen sac: ${pickedText}`
            : piece
              ? `Stoktan sac: ${pickedText}`
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
        {piece ? (
          <Group gap={4} wrap="nowrap" maw="100%">
            <Badge
              color="green"
              leftSection={<FaIcon icon="fas fa-check" />}
              maw={560}
              title={pickedText}
            >
              {sheets.length
                ? `Seçili (${sheets.length} sac): ${pickedText}`
                : `Seçili: ${pieceText(piece)}`}
            </Badge>
            <CloseButton
              size="sm"
              aria-label="Sacı kaldır"
              onClick={() => {
                setQuantityError('');
                onChange({ ...value, piece: null, sheets: [], quantityUsed: 1 });
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
        Her kesim için stoktan sac veya talep edilen sac seçilmelidir; malzeme, kalınlık ve ölçü
        seçilen kaynaktan otomatik alınır. Stoktan seçilen saclar kesime ayrılır ve depo kesimi
        işleyince stoktan düşer.
      </Text>

      {planningItem && ordered ? (
        <OrderedLineInfo
          item={planningItem}
          sheetsWaiting={sheetsWaiting ?? null}
          reserved={value.reserved ?? []}
          mismatch={mismatch ?? []}
          lots={
            sheetsWaiting ? (
              <LineLots
                planningItemId={planningItem.id}
                selectedIds={sheets.length ? sheets.map((s) => s.id) : piece ? [piece.id] : []}
                hideEmpty
                pickLabel="Bu kesime ayır"
                onPick={(lot) => {
                  if (lot.code) {
                    toggleSheet(lot);
                    return;
                  }
                  setQuantityError('');
                  onChange({
                    ...value,
                    sheets: [],
                    piece: lot,
                    remnant: null,
                    quantityUsed: Math.max(1, Math.min(lot.available ?? 1, sheetsWaiting)),
                  });
                }}
              />
            ) : null
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
            selectedIds={sheets.length ? sheets.map((s) => s.id) : piece ? [piece.id] : []}
            onPick={toggleSheet}
          />
        </Stack>
      ) : null}

      {(piece && !sheets.length) || remnant ? (
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
          initial={sheets.length ? sheets : piece ? [piece] : []}
          onClose={() => setPicking(null)}
          onPick={(picked) => {
            setQuantityError('');
            const coded = picked.every((p) => p.code);
            onChange(
              coded
                ? withSheets(EMPTY_PLATE_SOURCE, picked)
                : { ...EMPTY_PLATE_SOURCE, piece: picked[0] ?? null, quantityUsed: 1 },
            );
            setPicking(null);
            notify.success(picked.length > 1 ? `${picked.length} sac seçildi` : 'Sac seçildi');
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
    </ModalSection>
  );
}

// ---- Talep Edilen Sac: a sized plate line's sheets ----

function OrderedLineInfo({
  item,
  sheetsWaiting,
  reserved,
  mismatch,
  lots,
}: {
  item: PlanningItem;
  sheetsWaiting: number | null;
  reserved: CncPieceReservation[];
  mismatch: CncPlateMismatch[];
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
      {reserved.length > 0 ? <Text size="xs">Ayrılan saclar: {sheetsText(reserved)}</Text> : null}
      {sheetsWaiting ? (
        <Badge color="orange" variant="light" leftSection={<FaIcon icon="fas fa-hourglass-half" />}>
          Sac bekleniyor: {sheetsWaiting} sac
        </Badge>
      ) : null}
      {mismatch.length > 0 ? (
        <Text size="xs" c="red">
          Bu kaleme farklı ölçüde sac geldi (
          {mismatch.map((m) => `${sizeLabel(m)} · boş ${m.available_quantity}`).join(', ')}).
          Aşağıdan bu kesime ayırabilir ya da doğru ölçüyü bekleyebilirsiniz; kesimin adedi ve
          ölçüsü değişmez.
        </Text>
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
  selectedIds,
  onPick,
  hideEmpty = false,
  pickLabel = 'Bu sacı kullan',
}: {
  planningItemId: number;
  /** The sheets picked (a picked coded sheet is dropped by picking it again). */
  selectedIds: number[];
  onPick: (lot: PieceChoice) => void;
  /** Talep Edilen Sac: arrivals are reserved by themselves; say nothing while none came. */
  hideEmpty?: boolean;
  pickLabel?: string;
}) {
  const lots = useQuery(lineSheetsQueryOptions(planningItemId));
  const rows = lots.data ?? EMPTY_LINE_LOTS;
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
        const chosen = selectedIds.includes(lot.id);
        return (
          <Group key={lot.id} gap="xs">
            <Text size="sm">
              {pieceText(lot)} · {placeLabel(lot)} ·{' '}
              {lot.code ? (free > 0 ? 'boş' : 'ayrılmış') : `boş ${free} / ${lot.quantity}`}
              {lot.heat_number ? ` · döküm ${lot.heat_number}` : ''}
            </Text>
            {chosen && lot.code ? (
              <Button
                size="compact-xs"
                variant="light"
                color="green"
                leftSection={<FaIcon icon="fas fa-check" />}
                onClick={() => onPick(pieceChoice(lot))}
              >
                Seçili (kaldır)
              </Button>
            ) : chosen ? (
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
                {pickLabel}
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
  {
    type: 'text',
    key: 'search',
    label: 'Sac kodu / Kart / Döküm no',
    placeholder: 'örn. S26-00012 veya ST 37',
  },
  { type: 'text', key: 'thickness_mm', label: 'Kalınlık (mm)', placeholder: 'örn. 10' },
];

const kgText = (value: string | null) =>
  value === null ? '-' : `${formatNumber(Number(value), 2)} kg`;

const PIECE_COLUMNS: DataTableColumn<MaterialPiece>[] = [
  {
    key: 'code',
    header: 'Sac Kodu',
    width: '12%',
    render: (p) => (
      <Text size="sm" fw={700} ff="monospace" style={{ whiteSpace: 'nowrap' }}>
        {p.code || '-'}
      </Text>
    ),
  },
  {
    key: 'item_code',
    header: 'Sac Kartı',
    width: '26%',
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
    width: '8%',
    // A coded sheet is one sheet; an old lot shows its free sheets.
    render: (p) => (p.code ? '1' : `${p.available_quantity ?? p.quantity} / ${p.quantity}`),
  },
  { key: 'warehouse_code', header: 'Yer', width: '12%', render: (p) => placeLabel(p) },
  { key: 'heat_number', header: 'Döküm No', width: '10%', render: (p) => p.heat_number || '-' },
  { key: 'unit_kg', header: 'kg / adet', width: '10%', render: (p) => kgText(p.unit_kg) },
];

const EMPTY_PIECES: MaterialPiece[] = [];

export function pieceChoice(p: MaterialPiece): PieceChoice {
  return {
    id: p.id,
    code: p.code ?? null,
    item: p.item,
    item_code: p.item_code,
    item_name: p.item_name,
    width_mm: p.width_mm,
    length_mm: p.length_mm,
    shape: p.shape,
    area_m2: p.area_m2,
    heat_number: p.heat_number,
    warehouse_code: p.warehouse_code,
    job_no: p.job_no,
    unit_kg: p.unit_kg,
    available: p.available_quantity ?? p.quantity,
  };
}

export function PieceLotPickerModal({
  initial = [],
  onClose,
  onPick,
}: {
  /** The sheets the cut has now (ticked when the picker opens). */
  initial?: PieceChoice[];
  onClose: () => void;
  /** The ticked sheets (an old uncoded lot alone). */
  onPick: (pieces: PieceChoice[]) => void;
}) {
  const [filters, setFilters] = useState<PieceFilters>(EMPTY_PIECE_FILTERS);
  const [page, setPage] = useState(1);
  // Ticked sheets by id; kept across pages and searches.
  const [ticked, setTicked] = useState<Map<number, PieceChoice>>(
    () => new Map(initial.filter((p) => p.code).map((p) => [p.id, p])),
  );
  const tickedList = [...ticked.values()];
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

  const rows = list.data?.results ?? EMPTY_PIECES;
  // An old uncoded lot (several sheets in one row) is picked alone, with an Adet.
  const rowActions = (lot: MaterialPiece): RowAction<MaterialPiece>[] => [
    {
      key: 'select',
      label: 'Seç',
      icon: 'fas fa-check',
      color: 'success',
      hidden: Boolean(lot.code),
      // Lots at a supplier (Fasonda) can't go to a cut.
      onClick: (row) => {
        if (!row.warehouse_code) {
          notify.warning('Fasoncudaki sac kesime ayrılamaz; önce depoya dönmeli.');
          return;
        }
        onPick([pieceChoice(row)]);
      },
    },
  ];
  const tick = (ids: string[]) => {
    const next = new Map(ticked);
    const onPage = new Set(rows.map((r) => r.id));
    // Rows on this page follow the boxes; ticked rows on other pages stay.
    for (const id of onPage) if (!ids.includes(String(id))) next.delete(id);
    for (const row of rows) if (ids.includes(String(row.id))) next.set(row.id, pieceChoice(row));
    setTicked(next);
  };
  const confirmPick = () => {
    if (!tickedList.length) return notify.warning('Kesim için sac işaretleyin.');
    const cards = new Set(tickedList.map((p) => p.item_code));
    if (cards.size > 1) return notify.warning('Bir kesimin sacları aynı sac kartından olmalı.');
    const sizes = new Set(tickedList.map((p) => sizeLabel(p)));
    if (sizes.size > 1)
      notify.warning('İşaretli saclar farklı ölçüde; kesimin ölçüsü ilk sacdan alınır.');
    onPick(tickedList);
  };

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Stoktan Sac Seç" icon="fas fa-layer-group" />
      <ModalBody>
        <ModalSection title="Sac Stoğu" icon="fas fa-table">
          <DataTable
            title="Boş saclar"
            selection={{
              selectedIds: rows.filter((r) => ticked.has(r.id)).map((r) => String(r.id)),
              onChange: tick,
              isRowSelectable: (row) => Boolean(row.code && row.warehouse_code),
            }}
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
            data={rows}
            columns={PIECE_COLUMNS}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            pagination={{ page, pageSize: 20, total: list.data?.count ?? 0, onPageChange: setPage }}
            rowActions={rowActions}
            extraData={ticked}
            emptyMessage="Boş sac bulunamadı"
          />
          <Text size="xs" c="dimmed" mt={4}>
            Kesilecek sacları kodlarıyla işaretleyin; kesimin adedi işaretli sac sayısıdır. Listede
            olmayan sac (fire sac dahil) önce Sac &amp; Boy Stoğu sayfasından girilir.
          </Text>
        </ModalSection>
        <Group justify="space-between" mt="md">
          <Text size="sm" c={tickedList.length ? undefined : 'dimmed'}>
            {tickedList.length
              ? `${tickedList.length} sac: ${tickedList.map((p) => p.code).join(', ')}`
              : 'Sac işaretlenmedi'}
          </Text>
          <Group gap="xs">
            <Button
              variant="default"
              onClick={onClose}
              leftSection={<FaIcon icon="fas fa-times" />}
            >
              İptal
            </Button>
            <Button
              leftSection={<FaIcon icon="fas fa-check" />}
              disabled={!tickedList.length}
              onClick={confirmPick}
            >
              {tickedList.length ? `${tickedList.length} sacı kesime al` : 'İşaretli sacları al'}
            </Button>
          </Group>
        </Group>
      </ModalBody>
    </Modal>
  );
}
