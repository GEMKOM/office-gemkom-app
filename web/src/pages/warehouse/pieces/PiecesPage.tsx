import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useJobOrderOptions } from '@/api/reference';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  adjustPieces,
  createPieces,
  editPiece,
  KIND_LABELS,
  LOT_HELP,
  missingWeightText,
  movePieces,
  pieceCardFromSearch,
  pieceCardsQueryOptions,
  pieceChangesQueryOptions,
  pieceKeys,
  pieceMovementsQueryOptions,
  piecesQueryOptions,
  placeLabel,
  previewWeight,
  scrapPieces,
  searchPieceCards,
  searchSuppliers,
  sizeLabel,
  ORIGIN_OPTIONS,
  type MaterialPiece,
  type PieceCard,
  type PieceChange,
  type PieceEdit,
  type PieceMovement,
  type PieceKind,
  type PiecePlace,
} from '@/api/warehouse/pieces';
import { hasRouteAccess } from '@/auth/accessControl';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  notify,
  PageHeader,
  SelectRemote,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';

const PAGE_SIZE = 50;
/** The Mikro comparison, on its own page (it was this page's "Mikro ile" view). */
const MIKRO_COMPARISON = '/warehouse/mikro-comparison';
const URL_DEFAULTS = {
  view: 'pieces',
  search: '',
  place: '',
  job_no: '',
  thickness: '',
  min_width: '',
  max_width: '',
  min_length: '',
  max_length: '',
  origin: '',
  review: false,
  item: '',
  piece: '',
  page: '1',
};
type FilterKeys =
  | 'search'
  | 'place'
  | 'job_no'
  | 'thickness'
  | 'min_width'
  | 'max_width'
  | 'min_length'
  | 'max_length'
  | 'origin'
  | 'review';
const FILTER_KEYS: FilterKeys[] = [
  'search',
  'place',
  'job_no',
  'thickness',
  'min_width',
  'max_width',
  'min_length',
  'max_length',
  'origin',
  'review',
];

/** One box for anything on a lot; the backend splits it into words that all must match. */
export const SEARCH_PLACEHOLDER = 'Kod, ad, ölçü (1500x3000), döküm no, iş no, CNC-…, #fire no…';
const SEARCH_FILTER: FilterConfig<FilterKeys> = {
  type: 'text',
  key: 'search',
  label: 'Arama',
  placeholder: SEARCH_PLACEHOLDER,
};
const mmFilter = (key: FilterKeys, label: string): FilterConfig<FilterKeys> => ({
  type: 'text',
  inputType: 'number',
  key,
  label,
  placeholder: 'mm',
});

const PLACE_FILTERS: FilterConfig<FilterKeys>[] = [
  {
    type: 'select',
    key: 'place',
    label: 'Yer',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'HAMMADDE', label: 'Hammadde' },
      { value: 'IS_EMRI', label: 'İş Emri' },
      { value: 'MAMUL', label: 'Mamul' },
      { value: 'FASON', label: 'Fasonda' },
    ],
  },
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'Örn. 254-01' },
];

function filterConfig(kind: PieceKind): FilterConfig<FilterKeys>[] {
  return [
    SEARCH_FILTER,
    ...PLACE_FILTERS,
    ...(kind === 'plate'
      ? [
          mmFilter('thickness', 'Kalınlık'),
          mmFilter('min_width', 'En ≥'),
          mmFilter('max_width', 'En ≤'),
        ]
      : []),
    mmFilter('min_length', 'Boy ≥'),
    mmFilter('max_length', 'Boy ≤'),
    {
      type: 'select',
      key: 'origin',
      label: 'Kaynak',
      placeholder: 'Tümü',
      options: ORIGIN_OPTIONS,
    },
    { type: 'checkbox', key: 'review', label: 'Kontrol edilmeli' },
  ];
}

/** A column header with an (i) that says what the column holds. */
export function HeaderHelp({ label, help }: { label: string; help: string }) {
  return (
    <Group gap={4} wrap="nowrap" component="span" style={{ display: 'inline-flex' }}>
      {label}
      <Tooltip label={help} multiline w={300} withArrow>
        <ActionIcon
          size="xs"
          variant="subtle"
          color="gray"
          aria-label={`${label} nedir?`}
          onClick={(event) => event.stopPropagation()}
        >
          <FaIcon icon="fas fa-info-circle" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

const mono = { fontFamily: 'var(--gk-font-mono)' };

/** Who may change plate / boy stock (the backend checks the same: access_warehouse, staff, superuser). */
function canWritePieces(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

/** The planners who open the same page under Planlama: CNC Kesim (sac), Lineer Kesim (boy). */
const PLANNER_PAGES: Record<PieceKind, string> = {
  plate: '/planning/cnc-cutting/cuts',
  boy: '/planning/linear-cutting/cuts',
};

/**
 * Who may edit a lot's döküm no / sertifika / not and mark it checked: the warehouse,
 * and the planners of its kind (the backend checks the same Kesimler grants).
 */
export function canEditLot(kind: PieceKind | null): boolean {
  return canWritePieces() || (kind !== null && hasRouteAccess(PLANNER_PAGES[kind]));
}

function kg(value: string | null | undefined): string {
  return `${formatNumber(value ?? 0, 2)} kg`;
}

/** Weight, or a clear "ağırlık yok" with what the card is missing (never 0 kg). */
export function Weight({
  value,
  kind,
  missing,
}: {
  value: string | null;
  kind: PieceKind | null;
  missing?: string;
}) {
  if (value !== null && value !== undefined) return <>{kg(value)}</>;
  return (
    <Stack gap={0} align="flex-end">
      <StatusBadge color="orange">Ağırlık yok</StatusBadge>
      <Text size="xs" c="dimmed">
        {missing || missingWeightText(kind)}
      </Text>
    </Stack>
  );
}

function KindBadge({ kind }: { kind: PieceKind }) {
  return (
    <StatusBadge color={kind === 'plate' ? 'blue' : 'purple'}>{KIND_LABELS[kind]}</StatusBadge>
  );
}

function CardCell({ code, name, active }: { code: string; name: string; active: boolean }) {
  return (
    <Stack gap={0}>
      <Text size="sm" fw={600} style={mono}>
        {code}
      </Text>
      <Text size="xs" c="dimmed">
        {name}
        {active ? '' : ' (Pasif)'}
      </Text>
    </Stack>
  );
}

const pieceColumns: DataTableColumn<MaterialPiece>[] = [
  {
    key: 'card',
    header: 'Stok Kartı',
    render: (row) => (
      <CardCell code={row.item_code} name={row.item_name} active={row.item_is_active} />
    ),
  },
  {
    key: 'kind',
    header: 'Tür',
    render: (row) => (row.kind ? <KindBadge kind={row.kind} /> : null),
  },
  { key: 'size', header: 'Ölçü', render: (row) => <span style={mono}>{sizeLabel(row)}</span> },
  {
    key: 'quantity',
    header: 'Adet',
    align: 'right',
    render: (row) =>
      row.reserved_quantity ? (
        <Tooltip
          label={`CNC kesimine ayrılmış: ${(row.reservations ?? [])
            .map((r) => `${r.cnc_task} (${r.quantity})`)
            .join(', ')}`}
        >
          <span>
            {row.quantity}{' '}
            <Text span size="xs" c="orange.8">
              ({row.reserved_quantity} ayrılmış)
            </Text>
          </span>
        </Tooltip>
      ) : (
        row.quantity
      ),
  },
  {
    key: 'unit_kg',
    header: 'Birim',
    align: 'right',
    render: (row) => (row.unit_kg !== null ? kg(row.unit_kg) : '–'),
  },
  {
    key: 'total_kg',
    header: 'Toplam',
    align: 'right',
    render: (row) => <Weight value={row.total_kg} kind={row.kind} />,
  },
  { key: 'place', header: 'Yer', render: (row) => placeLabel(row) },
  { key: 'heat', header: 'Döküm No', render: (row) => row.heat_number || '–' },
  {
    key: 'origin',
    header: 'Kaynak',
    exportValue: (row) => row.origin_label,
    render: (row) =>
      row.needs_review ? (
        <Group gap={4} wrap="nowrap">
          {row.origin_label}
          <Tooltip label={row.review_note || 'Planlama kontrol etmeli'} multiline w={280}>
            <span>
              <StatusBadge color="orange">Kontrol</StatusBadge>
            </span>
          </Tooltip>
        </Group>
      ) : (
        row.origin_label
      ),
  },
];

const cardColumns: DataTableColumn<PieceCard>[] = [
  {
    key: 'card',
    header: 'Stok Kartı',
    render: (row) => <CardCell code={row.code} name={row.name} active={row.is_active} />,
  },
  {
    key: 'kind',
    header: 'Tür',
    render: (row) => <KindBadge kind={row.kind} />,
  },
  {
    key: 'size',
    header: 'Kalınlık / kg/m',
    render: (row) =>
      row.kind === 'plate'
        ? row.plate_thickness_mm
          ? `${formatNumber(row.plate_thickness_mm, 2)} mm`
          : '–'
        : row.kg_per_m
          ? `${formatNumber(row.kg_per_m, 3)} kg/m`
          : '–',
  },
  {
    key: 'lots',
    header: <HeaderHelp label="Lot" help={LOT_HELP} />,
    exportHeader: 'Lot',
    align: 'right',
    render: (row) => row.lots,
  },
  { key: 'pieces', header: 'Adet', align: 'right', render: (row) => row.pieces },
  {
    key: 'kg',
    header: 'Ağırlık',
    align: 'right',
    render: (row) => <Weight value={row.kg} kind={row.kind} missing={row.missing} />,
  },
];

// --- where pieces go ---------------------------------------------------------------

type PlaceKind = 'HAMMADDE' | 'IS_EMRI' | 'MAMUL' | 'FASON';
const UNASSIGNED = '__unassigned__';

interface PlaceDraft {
  kind: PlaceKind;
  /** İş Emri: a job, UNASSIGNED, or null (not picked yet). Fason: the job it belongs to. */
  job: string | null;
  supplier: string | null;
}

function placeToInput(place: PlaceDraft): PiecePlace | string {
  if (place.kind === 'FASON') {
    if (!place.supplier) return 'Fasoncu seçin';
    return { supplier: Number(place.supplier), job_no: place.job ?? '' };
  }
  if (place.kind === 'IS_EMRI') {
    if (place.job === null) return 'İş numarası seçin';
    return { warehouse_code: 'IS_EMRI', job_no: place.job === UNASSIGNED ? '' : place.job };
  }
  return { warehouse_code: place.kind };
}

function PlacePicker({
  place,
  onChange,
  allowFason,
}: {
  place: PlaceDraft;
  onChange: (place: PlaceDraft) => void;
  allowFason: boolean;
}) {
  const jobOrders = useJobOrderOptions({ includeAll: true });
  const jobOptions = useMemo(
    () => [
      { value: UNASSIGNED, label: 'Atanmamış (iş numarasız)' },
      ...(jobOrders.data ?? []).map((j) => ({
        value: j.job_no,
        label: `${j.job_no} - ${j.title}`,
      })),
    ],
    [jobOrders.data],
  );
  const kinds = [
    { value: 'HAMMADDE', label: 'Hammadde' },
    { value: 'IS_EMRI', label: 'İş Emri' },
    { value: 'MAMUL', label: 'Mamul' },
    ...(allowFason ? [{ value: 'FASON', label: 'Fasona' }] : []),
  ];
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Yer
      </Text>
      <SegmentedControl
        value={place.kind}
        onChange={(v) => onChange({ kind: v as PlaceKind, job: null, supplier: null })}
        data={kinds}
      />
      {place.kind === 'IS_EMRI' ? (
        <Select
          aria-label="İş no"
          searchable
          limit={100}
          placeholder="İş emri seçin"
          data={jobOptions}
          value={place.job}
          onChange={(job) => onChange({ ...place, job })}
        />
      ) : null}
      {place.kind === 'FASON' ? (
        <SelectRemote
          aria-label="Fasoncu"
          placeholder="Tedarikçi ara…"
          minSearchLength={2}
          queryKey={pieceKeys.supplierSearch}
          search={searchSuppliers}
          value={place.supplier}
          onChange={(supplier) => onChange({ ...place, supplier })}
        />
      ) : null}
    </Stack>
  );
}

function useInvalidatePieces() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: pieceKeys.all });
}

// --- new pieces -------------------------------------------------------------------

function WeightPreviewLine({
  card,
  width,
  length,
  quantity,
}: {
  card: PieceCard;
  width: string;
  length: string;
  quantity: number;
}) {
  const ready = Number(length) > 0 && (card.kind === 'boy' || Number(width) > 0);
  const preview = useQuery({
    queryKey: ['pieces', 'weight-preview', card.id, width, length, quantity],
    queryFn: () =>
      previewWeight({
        item: card.id,
        width_mm: card.kind === 'plate' ? width : null,
        length_mm: length,
        quantity: Math.max(1, quantity || 1),
      }),
    enabled: ready,
  });
  if (!ready) {
    return card.missing ? (
      <Text size="sm" c="orange.8">
        Ağırlık yok: {card.missing}
      </Text>
    ) : null;
  }
  if (!preview.data) return null;
  if (preview.data.unit_kg === null) {
    return (
      <Text size="sm" c="orange.8">
        Ağırlık yok: {preview.data.missing || missingWeightText(card.kind)}
      </Text>
    );
  }
  return (
    <Text size="sm">
      Birim <strong>{kg(preview.data.unit_kg)}</strong> · Toplam{' '}
      <strong>{kg(preview.data.total_kg)}</strong>
    </Text>
  );
}

function NewPiecesModal({ onClose, kind }: { onClose: () => void; kind: PieceKind }) {
  const invalidate = useInvalidatePieces();
  const [cardId, setCardId] = useState<string | null>(null);
  const [width, setWidth] = useState<string | number>('');
  const [length, setLength] = useState<string | number>('');
  const [quantity, setQuantity] = useState<string | number>(1);
  const [place, setPlace] = useState<PlaceDraft>({ kind: 'HAMMADDE', job: null, supplier: null });
  const [heat, setHeat] = useState('');
  const [certificate, setCertificate] = useState('');
  const [note, setNote] = useState('');
  const card = cardId ? pieceCardFromSearch(cardId) : undefined;
  const create = useMutation({ mutationFn: createPieces, onSuccess: invalidate });

  const save = async () => {
    if (!card) return notify.warning('Stok kartı seçin');
    if (!(Number(length) > 0)) return notify.warning('Boy (mm) girin');
    if (card.kind === 'plate' && !(Number(width) > 0))
      return notify.warning('Sac için en (mm) girin');
    if (!(Number(quantity) >= 1)) return notify.warning('Adet en az 1 olmalı');
    const where = placeToInput(place);
    if (typeof where === 'string') return notify.warning(where);
    try {
      await create.mutateAsync({
        item: card.id,
        quantity: Number(quantity),
        width_mm: card.kind === 'plate' ? String(width) : null,
        length_mm: String(length),
        heat_number: heat,
        certificate_no: certificate,
        note,
        ...where,
      });
      notify.success(`${card.code}: ${quantity} adet eklendi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Parça eklenemedi'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Parça Ekle"
      icon="fas fa-layer-group"
      size="lg"
      submitLabel="Kaydet"
      submitting={create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        <SelectRemote
          label="Stok kartı"
          aria-label="Stok kartı"
          placeholder={`${KIND_LABELS[kind]} kartı: kod veya ad ile ara…`}
          minSearchLength={2}
          queryKey={[...pieceKeys.cardSearch, kind]}
          search={(term, signal) => searchPieceCards(term, signal, kind)}
          value={cardId}
          onChange={setCardId}
        />
        {card ? (
          <Group grow align="flex-start">
            {card.kind === 'plate' ? (
              <NumberInput
                label="En (mm)"
                min={0}
                decimalScale={1}
                hideControls
                value={width}
                onChange={setWidth}
              />
            ) : null}
            <NumberInput
              label="Boy (mm)"
              min={0}
              decimalScale={1}
              hideControls
              value={length}
              onChange={setLength}
            />
            <NumberInput
              label="Adet"
              min={1}
              allowDecimal={false}
              value={quantity}
              onChange={setQuantity}
            />
          </Group>
        ) : null}
        {card ? (
          <WeightPreviewLine
            card={card}
            width={String(width)}
            length={String(length)}
            quantity={Number(quantity)}
          />
        ) : null}
        <PlacePicker place={place} onChange={setPlace} allowFason={false} />
        <Group grow>
          <TextInput
            label="Döküm no"
            value={heat}
            onChange={(e) => setHeat(e.currentTarget.value)}
          />
          <TextInput
            label="Sertifika no"
            value={certificate}
            onChange={(e) => setCertificate(e.currentTarget.value)}
          />
        </Group>
        <Textarea label="Not" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      </Stack>
    </FormModal>
  );
}

// --- one lot ------------------------------------------------------------------------

type LotAction = 'move' | 'adjust' | 'scrap';
type DetailAction = LotAction | 'edit';

function LotActionModal({
  piece,
  action,
  onClose,
}: {
  piece: MaterialPiece;
  action: LotAction;
  onClose: () => void;
}) {
  const invalidate = useInvalidatePieces();
  const [quantity, setQuantity] = useState<string | number>(
    action === 'adjust' ? piece.quantity : 1,
  );
  const [note, setNote] = useState('');
  const [place, setPlace] = useState<PlaceDraft>({ kind: 'IS_EMRI', job: null, supplier: null });
  const run = useMutation({
    mutationFn: async () => {
      const n = Number(quantity);
      if (action === 'adjust') return adjustPieces(piece.id, { quantity: n, note });
      if (action === 'scrap') return scrapPieces(piece.id, { quantity: n, note });
      const where = placeToInput(
        place.kind === 'FASON' && place.job === null ? { ...place, job: piece.job_no } : place,
      );
      if (typeof where === 'string') throw new Error(where);
      return movePieces(piece.id, { quantity: n, note, ...where });
    },
    onSuccess: invalidate,
  });
  const titles: Record<LotAction, string> = {
    move: 'Taşı / Fasona Gönder',
    adjust: 'Adedi Düzelt',
    scrap: 'Hurdaya Ayır',
  };
  const save = async () => {
    const n = Number(quantity);
    if (action === 'adjust') {
      if (!(n >= 0)) return notify.warning('Adet negatif olamaz');
      if (!note.trim()) return notify.warning('Düzeltme için açıklama girin');
    } else if (!(n >= 1 && n <= piece.quantity)) {
      return notify.warning(`Adet 1 ile ${piece.quantity} arasında olmalı`);
    }
    try {
      await run.mutateAsync();
      notify.success(`${piece.item_code}: işlendi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'İşlem yapılamadı'));
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title={titles[action]}
      subtitle={`${piece.item_code} · ${sizeLabel(piece)} · ${piece.quantity} adet · ${placeLabel(piece)}`}
      icon="fas fa-layer-group"
      size="md"
      submitLabel="Kaydet"
      submitting={run.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        <NumberInput
          label={action === 'adjust' ? 'Doğru adet' : 'Adet'}
          min={0}
          max={action === 'adjust' ? undefined : piece.quantity}
          allowDecimal={false}
          value={quantity}
          onChange={setQuantity}
        />
        {action === 'move' ? <PlacePicker place={place} onChange={setPlace} allowFason /> : null}
        <Textarea
          label={action === 'adjust' ? 'Açıklama (zorunlu)' : 'Not'}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}

function LotEditModal({ piece, onClose }: { piece: MaterialPiece; onClose: () => void }) {
  const invalidate = useInvalidatePieces();
  const [heat, setHeat] = useState(piece.heat_number);
  const [certificate, setCertificate] = useState(piece.certificate_no);
  const [note, setNote] = useState(piece.note);
  const [checked, setChecked] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const run = useMutation({
    mutationFn: (data: PieceEdit) => editPiece(piece.id, data),
    onSuccess: invalidate,
  });
  const save = async () => {
    if (checked && !changeNote.trim()) return notify.warning('Kontrol edildi için açıklama girin');
    try {
      await run.mutateAsync({
        heat_number: heat,
        certificate_no: certificate,
        note,
        ...(checked ? { needs_review: false as const } : {}),
        change_note: changeNote,
      });
      notify.success(`${piece.item_code}: bilgiler kaydedildi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Kaydedilemedi'));
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Lotu Düzenle"
      subtitle={`${piece.item_code} · ${sizeLabel(piece)} · ${piece.quantity} adet · ${placeLabel(piece)}`}
      icon="fas fa-pen"
      size="md"
      submitLabel="Kaydet"
      submitting={run.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Adet, ölçü ve yer kendi işlemleriyle değişir (Adedi Düzelt, Taşı). Değişiklik lotun
          geçmişinde kim ve ne zaman ile görünür.
        </Text>
        <Group grow>
          <TextInput
            label="Döküm no"
            maxLength={100}
            value={heat}
            onChange={(e) => setHeat(e.currentTarget.value)}
          />
          <TextInput
            label="Sertifika no"
            maxLength={100}
            value={certificate}
            onChange={(e) => setCertificate(e.currentTarget.value)}
          />
        </Group>
        <Textarea
          label="Not"
          maxLength={255}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        {piece.needs_review ? (
          <Alert color="orange" variant="light" icon={<FaIcon icon="fas fa-clipboard-check" />}>
            <Stack gap={6}>
              <Text size="sm">
                Kontrol edilmeli: {piece.review_note || 'planlama kontrol etmeli'}
              </Text>
              <Checkbox
                label="Kontrol edildi (işareti kaldır)"
                checked={checked}
                onChange={(e) => setChecked(e.currentTarget.checked)}
              />
            </Stack>
          </Alert>
        ) : null}
        <Textarea
          label={checked ? 'Açıklama (zorunlu)' : 'Açıklama'}
          description="Geçmişte bu değişikliğin yanında görünür"
          maxLength={255}
          value={changeNote}
          onChange={(e) => setChangeNote(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}

const CHANGE_LABELS: Record<string, string> = {
  heat_number: 'Döküm no',
  certificate_no: 'Sertifika no',
  note: 'Not',
};

/** "Döküm no: – → D-901" lines of an edit (needs_review is the row's own label). */
export function changeLines(change: PieceChange): string[] {
  return Object.entries(change.changes)
    .filter(([field]) => field in CHANGE_LABELS)
    .map(([field, pair]) => {
      const [before, after] = pair ?? ['', ''];
      return `${CHANGE_LABELS[field]}: ${String(before || '–')} → ${String(after || '–')}`;
    });
}

type HistoryRow =
  | { kind: 'movement'; at: string; key: string; movement: PieceMovement }
  | { kind: 'change'; at: string; key: string; change: PieceChange };

/** The lot's ledger and the edits of its details, newest first. */
export function lotHistory(movements: PieceMovement[], changes: PieceChange[]): HistoryRow[] {
  return [
    ...movements.map((m) => ({
      kind: 'movement' as const,
      at: m.created_at,
      key: `m${m.id}`,
      movement: m,
    })),
    ...changes.map((c) => ({
      kind: 'change' as const,
      at: c.created_at,
      key: `c${c.id}`,
      change: c,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

function movementPlace(code: string | null, job: string, supplier: string | null): string {
  if (!code && !supplier) return '';
  return placeLabel({ warehouse_code: code, job_no: job, supplier_name: supplier });
}

function PieceDetail({ piece, onClose }: { piece: MaterialPiece; onClose: () => void }) {
  const [action, setAction] = useState<DetailAction | null>(null);
  const movements = useQuery(pieceMovementsQueryOptions(piece.id));
  const changes = useQuery(pieceChangesQueryOptions(piece.id));
  const history = lotHistory(movements.data ?? [], changes.data ?? []);
  const actions: { key: LotAction; label: string; icon: string; color?: string }[] = [
    { key: 'move', label: 'Taşı / Fasona Gönder', icon: 'fas fa-exchange-alt' },
    { key: 'adjust', label: 'Adedi Düzelt', icon: 'fas fa-pen' },
    { key: 'scrap', label: 'Hurdaya Ayır', icon: 'fas fa-trash', color: 'red' },
  ];
  const info: { label: string; value: ReactNode }[] = [
    { label: 'Ölçü', value: sizeLabel(piece) },
    { label: 'Adet', value: piece.quantity },
    { label: 'Birim ağırlık', value: piece.unit_kg !== null ? kg(piece.unit_kg) : '–' },
    { label: 'Toplam ağırlık', value: <Weight value={piece.total_kg} kind={piece.kind} /> },
    { label: 'Yer', value: placeLabel(piece) },
    { label: 'Döküm no', value: piece.heat_number || '–' },
    { label: 'Sertifika no', value: piece.certificate_no || '–' },
    { label: 'Kaynak', value: piece.origin_label },
    ...(piece.needs_review
      ? [{ label: 'Kontrol', value: <StatusBadge color="orange">Kontrol edilmeli</StatusBadge> }]
      : []),
  ];
  return (
    <>
      <DetailModal
        opened={action === null}
        onClose={onClose}
        title={`${piece.item_code} · ${sizeLabel(piece)}`}
        subtitle={piece.item_name}
        icon="fas fa-layer-group"
        size="lg"
        sections={[
          {
            title: 'Bilgiler',
            icon: 'fas fa-info-circle',
            fields: info.map((f) => ({ label: f.label, render: f.value })),
          },
          {
            title: 'Not',
            icon: 'fas fa-sticky-note',
            hidden: !piece.note && !piece.review_note,
            content: (
              <Stack gap={4}>
                {piece.note ? <Text size="sm">{piece.note}</Text> : null}
                {piece.review_note ? (
                  <Text size="sm" c={piece.needs_review ? 'orange.8' : 'dimmed'}>
                    {piece.needs_review ? '' : 'Kontrol edildi · '}
                    {piece.review_note}
                  </Text>
                ) : null}
              </Stack>
            ),
          },
          {
            title: 'Hareketler',
            icon: 'fas fa-history',
            content: (
              <Table withTableBorder verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tarih</Table.Th>
                    <Table.Th>Hareket</Table.Th>
                    <Table.Th ta="right">Adet</Table.Th>
                    <Table.Th>Nereden → Nereye</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {history.map((row) => {
                    if (row.kind === 'change') {
                      const c = row.change;
                      return (
                        <Table.Tr key={row.key}>
                          <Table.Td>
                            {formatDateTime(c.created_at)}
                            {c.created_by_username ? ` · ${c.created_by_username}` : ''}
                          </Table.Td>
                          <Table.Td>
                            {c.changes.needs_review ? 'Kontrol edildi' : 'Bilgi düzenlendi'}
                            {[...changeLines(c), c.note].filter(Boolean).map((line) => (
                              <Text key={line} size="xs" c="dimmed">
                                {line}
                              </Text>
                            ))}
                          </Table.Td>
                          <Table.Td ta="right">–</Table.Td>
                          <Table.Td />
                        </Table.Tr>
                      );
                    }
                    const m = row.movement;
                    const from = movementPlace(
                      m.from_warehouse_code,
                      m.from_job_no,
                      m.from_supplier_name,
                    );
                    const to = movementPlace(m.to_warehouse_code, m.to_job_no, m.to_supplier_name);
                    return (
                      <Table.Tr key={row.key}>
                        <Table.Td>
                          {formatDateTime(m.created_at)}
                          {m.created_by_username ? ` · ${m.created_by_username}` : ''}
                        </Table.Td>
                        <Table.Td>
                          {m.movement_type_label}
                          {m.note ? (
                            <Text size="xs" c="dimmed">
                              {m.note}
                            </Text>
                          ) : null}
                        </Table.Td>
                        <Table.Td ta="right">
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </Table.Td>
                        <Table.Td>{[from, to].filter(Boolean).join(' → ')}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            ),
          },
        ]}
        footerActions={
          canEditLot(piece.kind) ? (
            <Group gap="xs">
              <Button
                variant="light"
                leftSection={<FaIcon icon="fas fa-edit" />}
                onClick={() => setAction('edit')}
              >
                Düzenle
              </Button>
              {(canWritePieces() && piece.quantity > 0 ? actions : []).map((a) => (
                <Button
                  key={a.key}
                  variant="light"
                  color={a.color}
                  leftSection={<FaIcon icon={a.icon} />}
                  onClick={() => setAction(a.key)}
                >
                  {a.label}
                </Button>
              ))}
            </Group>
          ) : undefined
        }
      />
      {action === 'edit' ? <LotEditModal piece={piece} onClose={() => setAction(null)} /> : null}
      {action && action !== 'edit' ? (
        <LotActionModal
          piece={piece}
          action={action}
          onClose={() => {
            setAction(null);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

// --- the page -----------------------------------------------------------------------

const EMPTY_PIECES: MaterialPiece[] = [];

function pickFilters(values: typeof URL_DEFAULTS): Pick<typeof URL_DEFAULTS, FilterKeys> {
  return Object.fromEntries(FILTER_KEYS.map((k) => [k, values[k]])) as Pick<
    typeof URL_DEFAULTS,
    FilterKeys
  >;
}
const EMPTY_CARDS: PieceCard[] = [];
/** Sac & boy stoğu: plate and boy material in pieces, by lot or by stock card. */
/** Where a stock page sits: Depo, or the planning cutting section of its kind. */
interface StockPageProps {
  kind: PieceKind;
  title: string;
  subtitle: string;
  backTo: string;
}

const PAGE_TEXT: Record<PieceKind, { title: string; subtitle: string }> = {
  plate: {
    title: 'Sac Stoğu',
    subtitle: 'Sac parçaları ve fire saclar: stok kartına bağlı, ölçüleri, ağırlıkları ve yerleri',
  },
  boy: {
    title: 'Boy Stoğu',
    subtitle:
      'Profil, boru ve çubuk parçaları: stok kartına bağlı, boyları, ağırlıkları ve yerleri',
  },
};

/** Depo › Stoklar › Sac Stoğu. */
export function WarehousePlateStockPage() {
  return <PiecesPage kind="plate" {...PAGE_TEXT.plate} backTo="/warehouse" />;
}

/** Depo › Stoklar › Boy Stoğu. */
export function WarehouseBarStockPage() {
  return <PiecesPage kind="boy" {...PAGE_TEXT.boy} backTo="/warehouse" />;
}

/** Planlama › CNC Kesim › Sac Stoğu: the same page under the planning URL. */
export function CncPlateStockPage() {
  return <PiecesPage kind="plate" {...PAGE_TEXT.plate} backTo="/planning/cnc-cutting" />;
}

/** Planlama › Lineer Kesim › Boy Stoğu: the same page under the planning URL. */
export function LinearBarStockPage() {
  return <PiecesPage kind="boy" {...PAGE_TEXT.boy} backTo="/planning/linear-cutting" />;
}

/** Plate or boy pieces: one kind per page (Sac Stoğu / Boy Stoğu). */
export function PiecesPage({ kind, title, subtitle, backTo }: StockPageProps) {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const navigate = useNavigate();
  useEffect(() => {
    if (values.view === 'mikro') navigate(MIKRO_COMPARISON, { replace: true });
  }, [values.view, navigate]);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const [creating, setCreating] = useState(false);
  const view = values.view === 'cards' ? 'cards' : 'pieces';

  // Every card of this kind that holds pieces, for the band's figures and the Kartlar view.
  const cards = useQuery({
    ...pieceCardsQueryOptions({ in_stock: 'true', kind, page_size: 1000 }),
    placeholderData: keepPreviousData,
  });
  const search = values.search.trim();
  // Kartlar with a search: the backend matches cards by their own details or by a lot.
  const searchedCards = useQuery({
    ...pieceCardsQueryOptions({ in_stock: 'true', kind, page_size: 1000, search }),
    placeholderData: keepPreviousData,
    enabled: view === 'cards' && search !== '',
  });
  const mm = (
    key: 'thickness' | 'min_width' | 'max_width' | 'min_length' | 'max_length',
    param: string,
  ) => (values[key] ? { [param]: values[key] } : {});
  const list = useQuery({
    ...piecesQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(search ? { search } : {}),
      kind,
      ...(kind === 'plate' ? mm('thickness', 'thickness_mm') : {}),
      ...(kind === 'plate' ? mm('min_width', 'min_width_mm') : {}),
      ...(kind === 'plate' ? mm('max_width', 'max_width_mm') : {}),
      ...mm('min_length', 'min_length_mm'),
      ...mm('max_length', 'max_length_mm'),
      ...(values.origin ? { origin: values.origin } : {}),
      ...(values.review ? { needs_review: 'true' as const } : {}),
      ...(values.place === 'FASON'
        ? { at_supplier: 'true' as const }
        : values.place
          ? { warehouse: values.place }
          : {}),
      ...(values.job_no ? { job_no: values.job_no } : {}),
      ...(values.item ? { item: Number(values.item) } : {}),
    }),
    placeholderData: keepPreviousData,
    enabled: view === 'pieces',
  });
  useEffect(() => {
    if (list.isError) notify.error(countErrorMessage(list.error, 'Parçalar yüklenemedi'));
  }, [list.isError, list.error]);

  const allCards = cards.data?.results ?? EMPTY_CARDS;
  const figures = useMemo(() => {
    const weighed = allCards.filter((c) => c.kg !== null);
    const unweighed = allCards.filter((c) => c.kg === null);
    return {
      cards: allCards.length,
      pieces: allCards.reduce((n, c) => n + c.pieces, 0),
      kg: weighed.reduce((n, c) => n + Number(c.kg), 0),
      noWeightLots: unweighed.reduce((n, c) => n + c.lots, 0),
      noWeightPieces: unweighed.reduce((n, c) => n + c.pieces, 0),
    };
  }, [allCards]);
  const shownCards = useMemo(
    () =>
      (search ? (searchedCards.data?.results ?? EMPTY_CARDS) : allCards).filter(
        (c) => c.kind === kind,
      ),
    [allCards, kind, search, searchedCards.data],
  );

  const rows = list.data?.results ?? EMPTY_PIECES;
  const openId = Number.parseInt(values.piece, 10);
  const open = rows.find((r) => r.id === openId) ?? null;
  const itemCard = values.item ? allCards.find((c) => String(c.id) === values.item) : undefined;

  const viewSwitch = (
    <SegmentedControl
      size="xs"
      value={view}
      onChange={(next) => apply({ view: next, page: '1' })}
      data={[
        { value: 'pieces', label: 'Parçalar' },
        { value: 'cards', label: 'Kartlar' },
      ]}
    />
  );
  const filters = (
    <FilterBar
      inline
      filters={view === 'pieces' ? filterConfig(kind) : [SEARCH_FILTER]}
      values={pickFilters(values)}
      onApply={(next) => apply({ ...next, page: '1' })}
      onClear={() => apply({ ...pickFilters(URL_DEFAULTS), item: '', page: '1' })}
    />
  );

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={kind === 'plate' ? 'layer-group' : 'ruler-horizontal'}
        backTo={backTo}
        stats={[
          { id: 'cards', label: 'Kart', value: cards.isSuccess ? figures.cards : '–' },
          { id: 'pieces', label: 'Parça', value: cards.isSuccess ? figures.pieces : '–' },
          {
            id: 'kg',
            label: 'Bilinen ağırlık',
            value: cards.isSuccess ? kg(String(figures.kg)) : '–',
          },
          {
            id: 'no-weight',
            label: 'Ağırlığı olmayan',
            value: cards.isSuccess ? `${figures.noWeightPieces} parça` : '–',
          },
        ]}
        actions={
          canWritePieces() ? (
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Parça Ekle
            </Button>
          ) : undefined
        }
      />
      {cards.isSuccess && figures.noWeightLots > 0 ? (
        <Alert
          color="orange"
          variant="light"
          mb="sm"
          icon={<FaIcon icon="fas fa-weight-hanging" />}
        >
          {figures.noWeightLots} lotun ({figures.noWeightPieces} parça) ağırlığı yok: stok kartında
          sac kalınlığı veya metre ağırlığı (kg/m) girilmemiş. Bu parçalar ağırlık toplamına
          katılmadı.
        </Alert>
      ) : null}
      {view === 'pieces' ? (
        <DataTable
          title={itemCard ? `Parçalar · ${itemCard.code}` : 'Parçalar'}
          icon="fas fa-layer-group"
          toolbar={
            <Group gap="xs">
              {itemCard ? (
                <Button size="xs" variant="subtle" onClick={() => apply({ item: '', page: '1' })}>
                  Tüm kartlar
                </Button>
              ) : null}
              {viewSwitch}
            </Group>
          }
          filters={filters}
          data={rows}
          columns={pieceColumns}
          getRowId={(row) => String(row.id)}
          loading={list.isFetching}
          onRowClick={(row) => apply({ piece: String(row.id) })}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: list.data?.count ?? 0,
            onPageChange: (next) => apply({ page: String(next) }),
          }}
          emptyMessage="Bu filtrelerle parça yok"
        />
      ) : (
        <DataTable
          title="Kartlar"
          icon="fas fa-boxes"
          toolbar={viewSwitch}
          filters={filters}
          data={shownCards}
          columns={cardColumns}
          getRowId={(row) => String(row.id)}
          loading={cards.isFetching || searchedCards.isFetching}
          onRowClick={(row) => apply({ view: 'pieces', item: String(row.id), page: '1' })}
          pagination
          emptyMessage={search ? 'Bu aramayla kart yok' : 'Parçası olan kart yok'}
        />
      )}
      {creating ? <NewPiecesModal kind={kind} onClose={() => setCreating(false)} /> : null}
      {open ? (
        <PieceDetail key={open.id} piece={open} onClose={() => apply({ piece: '' })} />
      ) : null}
    </>
  );
}
