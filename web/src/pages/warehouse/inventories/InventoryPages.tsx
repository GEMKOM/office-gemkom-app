import {
  ActionIcon,
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { stockKeys } from '@/api/procurement/stock';
import { useJobOrderOptions } from '@/api/reference';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  inventoryKeys,
  jobHoldingsQueryOptions,
  moveStock,
  placeBalancesQueryOptions,
  placeParams,
  placeText,
  type InventoryPlace,
  type InventoryWarehouse,
  type JobHolding,
  type MoveInput,
  type MoveResult,
  type PlaceBalance,
} from '@/api/warehouse/inventories';
import {
  KIND_LABELS,
  pieceKeys,
  piecesQueryOptions,
  sizeLabel,
  type MaterialPiece,
  type PieceKind,
} from '@/api/warehouse/pieces';
import { transferKeys, transferShortages, type TransferShortage } from '@/api/warehouse/transfers';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  FormModal,
  notify,
  PageHeader,
  StatusBadge,
  type PageFigure,
  type PageHeaderProps,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { canWriteKind, Weight } from '../pieces/PiecesPage';

// Hammadde (free stock) and İş Emri (stock set aside per job) as two separate
// pages. Each lists a place's normal cards and its plate / bar lots together;
// ticked rows move in one go (warehouse.inventories on the backend): cards as a
// Depo transferi slip, lots with the slip number in their history.

const PAGE_SIZE = 50;
const IS_EMRI_ROUTE = '/warehouse/is-emri';
/** The İş Emri page's job value for the unassigned bucket. */
const UNASSIGNED = '__unassigned__';

const mono = { fontFamily: 'var(--gk-font-mono)' };

/** Plates stay in Hammadde (backend pieces.PLATE_NOT_IN_JOB_TEXT). */
const PLATE_NOT_IN_JOB =
  "Sac İş Emri deposuna alınmaz; Hammadde'de tutulur. Kesime seçildiğinde maliyeti kesimdeki işlere dağıtılır.";

/** Who may move cards (the backend checks the same as Depo transferi). */
function canMoveCards(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

type KindFilter = '' | 'card' | PieceKind;
const KIND_FILTER_OPTIONS = [
  { value: 'card', label: 'Stok kartı' },
  { value: 'plate', label: KIND_LABELS.plate },
  { value: 'boy', label: KIND_LABELS.boy },
];

type FilterKeys = 'search' | 'kind';
const FILTERS: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Kod, ad, ölçü (1500x3000)…' },
  {
    type: 'select',
    key: 'kind',
    label: 'Tür',
    placeholder: 'Tümü',
    searchable: false,
    options: KIND_FILTER_OPTIONS,
  },
];

function CardCell({ code, name }: { code: string; name: string }) {
  return (
    <Stack gap={0}>
      <Text size="sm" fw={600} style={mono}>
        {code}
      </Text>
      <Text size="xs" c="dimmed">
        {name}
      </Text>
    </Stack>
  );
}

const balanceColumns: DataTableColumn<PlaceBalance>[] = [
  {
    key: 'card',
    header: 'Stok Kartı',
    exportValue: (row) => `${row.item_code} ${row.item_name}`,
    render: (row) => <CardCell code={row.item_code} name={row.item_name} />,
  },
  {
    key: 'quantity',
    header: 'Miktar',
    align: 'right',
    render: (row) => (
      <Text size="sm" c={Number(row.quantity) < 0 ? 'red.8' : undefined} fw={500}>
        {formatNumber(row.quantity, 2)} {row.item_unit}
      </Text>
    ),
  },
];

const lotColumns: DataTableColumn<MaterialPiece>[] = [
  {
    key: 'card',
    header: 'Stok Kartı',
    exportValue: (row) => `${row.item_code} ${row.item_name}`,
    render: (row) => <CardCell code={row.item_code} name={row.item_name} />,
  },
  {
    key: 'kind',
    header: 'Tür',
    render: (row) =>
      row.kind ? (
        <StatusBadge color={row.kind === 'plate' ? 'blue' : 'purple'}>
          {KIND_LABELS[row.kind]}
        </StatusBadge>
      ) : null,
  },
  { key: 'size', header: 'Ölçü', render: (row) => <span style={mono}>{sizeLabel(row)}</span> },
  {
    key: 'quantity',
    header: 'Adet',
    align: 'right',
    render: (row) =>
      row.reserved_quantity ? (
        <span>
          {row.quantity}{' '}
          <Text span size="xs" c="orange.8">
            ({row.reserved_quantity} ayrılmış)
          </Text>
        </span>
      ) : (
        row.quantity
      ),
  },
  {
    key: 'total_kg',
    header: 'Ağırlık',
    align: 'right',
    render: (row) => <Weight value={row.total_kg} kind={row.kind} />,
  },
];

function shortageList(shortages: TransferShortage[]) {
  return (
    <Stack gap={2}>
      {shortages.map((s) => (
        <Text key={s.item} size="sm">
          <strong>{s.item_code}</strong> {s.item_name}: istenen {formatNumber(s.quantity, 2)},
          mevcut {formatNumber(s.available, 2)}
        </Text>
      ))}
    </Stack>
  );
}

/** Where a move goes: a job (picked in the dialog) or Hammadde. */
type MoveTarget = 'job' | 'HAMMADDE';

interface MoveAction {
  target: MoveTarget;
  label: string;
  icon: string;
}

interface MoveModalProps {
  source: InventoryPlace;
  target: MoveTarget;
  title: string;
  cards: PlaceBalance[];
  lots: MaterialPiece[];
  onClose: () => void;
  onDone: () => void;
}

function MoveModal({ source, target, title, cards, lots, onClose, onDone }: MoveModalProps) {
  const queryClient = useQueryClient();
  const jobOrders = useJobOrderOptions({ includeAll: true });
  const [jobNo, setJobNo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [cardQty, setCardQty] = useState<Record<number, string | number>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, Math.max(Number(c.quantity), 0) || ''])),
  );
  const [lotQty, setLotQty] = useState<Record<number, string | number>>(() =>
    Object.fromEntries(lots.map((l) => [l.id, l.quantity])),
  );
  const [cardRows, setCardRows] = useState(cards);
  // Plates never go on a job (the backend refuses them): they wait in Hammadde
  // for a cut, whose jobs carry their cost. A job move leaves them out.
  const leftOutPlates = target === 'job' ? lots.filter((l) => l.kind === 'plate').length : 0;
  const [lotRows, setLotRows] = useState(() =>
    target === 'job' ? lots.filter((l) => l.kind !== 'plate') : lots,
  );
  const move = useMutation({
    mutationFn: moveStock,
    onSuccess: () => {
      for (const key of [inventoryKeys.all, pieceKeys.all, stockKeys.all, transferKeys.all]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
    },
  });
  const jobOptions = useMemo(
    () =>
      (jobOrders.data ?? [])
        .filter((j) => !(source.warehouse === 'IS_EMRI' && j.job_no === source.jobNo))
        .map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data, source],
  );

  const destination: InventoryPlace =
    target === 'HAMMADDE'
      ? { warehouse: 'HAMMADDE', jobNo: '' }
      : { warehouse: 'IS_EMRI', jobNo: jobNo ?? '' };

  const save = async () => {
    if (target === 'job' && !jobNo) {
      notify.warning('Hangi işe taşınacağını seçin');
      return;
    }
    const lines = cardRows
      .filter((c) => Number(cardQty[c.id]) > 0)
      .map((c) => ({ item: c.item, quantity: String(cardQty[c.id]) }));
    const pieces = lotRows
      .filter((l) => Number(lotQty[l.id]) > 0)
      .map((l) => ({ piece: l.id, quantity: Number(lotQty[l.id]) }));
    if (lines.length === 0 && pieces.length === 0) {
      notify.warning(
        cardRows.length === 0 && lotRows.length === 0 && leftOutPlates
          ? PLATE_NOT_IN_JOB
          : 'Taşınacak miktar girin',
      );
      return;
    }
    const tooMany = lotRows.find((l) => Number(lotQty[l.id]) > l.quantity);
    if (tooMany) {
      notify.warning(`${tooMany.item_code} lotunda ${tooMany.quantity} adet var`);
      return;
    }
    const input: MoveInput = {
      from_warehouse_code: source.warehouse,
      from_job_no: source.jobNo,
      to_warehouse_code: destination.warehouse as InventoryWarehouse,
      to_job_no: destination.jobNo,
      note,
      lines,
      pieces,
    };
    try {
      let result: MoveResult;
      try {
        result = await move.mutateAsync(input);
      } catch (error) {
        const shortages = transferShortages(error);
        if (!shortages) throw error;
        const ok = await confirm({
          title: 'Kaynakta yeterli stok yok',
          icon: 'fas fa-exclamation-triangle',
          message: `Bu satırlar ${placeText(source)} içinde olandan fazla. Kaydedilirse orası eksiye düşer.`,
          details: shortageList(shortages),
          confirmLabel: 'Yine de Kaydet',
          cancelLabel: 'Vazgeç',
          danger: true,
        });
        if (!ok) return;
        result = await move.mutateAsync({ ...input, allow_negative: true });
      }
      const parts = [
        lines.length ? `${lines.length} kart` : '',
        pieces.length ? `${pieces.length} lot` : '',
      ].filter(Boolean);
      notify.success(
        `${parts.join(' ve ')} taşındı: ${placeText(source)} → ${placeText(destination)}${
          result.slip ? ` (${result.slip.number})` : ''
        }`,
      );
      onDone();
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Taşınamadı'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={title}
      icon="fas fa-exchange-alt"
      size="xl"
      submitLabel="Kaydet"
      submitting={move.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        {leftOutPlates ? (
          <Alert color="orange" variant="light" icon={<FaIcon icon="fas fa-layer-group" />}>
            {leftOutPlates} sac lotu listeye alınmadı. {PLATE_NOT_IN_JOB}
          </Alert>
        ) : null}
        <Group grow align="flex-end">
          <Stack gap={2}>
            <Text size="sm" fw={500}>
              Nereden
            </Text>
            <Text size="sm">{placeText(source)}</Text>
          </Stack>
          {target === 'job' ? (
            <Select
              label="Hangi işe (İş No)"
              searchable
              limit={100}
              placeholder="İş emri seçin"
              data={jobOptions}
              value={jobNo}
              onChange={setJobNo}
              data-autofocus
            />
          ) : (
            <Stack gap={2}>
              <Text size="sm" fw={500}>
                Nereye
              </Text>
              <Text size="sm">Hammadde (serbest stok)</Text>
            </Stack>
          )}
        </Group>

        <Table withTableBorder verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Stok Kartı</Table.Th>
              <Table.Th>Ölçü</Table.Th>
              <Table.Th w={180}>Miktar / Adet</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cardRows.map((c) => (
              <Table.Tr key={`card-${c.id}`}>
                <Table.Td>
                  <CardCell code={c.item_code} name={c.item_name} />
                </Table.Td>
                <Table.Td>–</Table.Td>
                <Table.Td>
                  <NumberInput
                    aria-label={`${c.item_code} miktar`}
                    min={0}
                    decimalScale={3}
                    value={cardQty[c.id] ?? ''}
                    onChange={(v) => setCardQty((prev) => ({ ...prev, [c.id]: v }))}
                    rightSection={
                      <Text size="xs" c="dimmed">
                        {c.item_unit}
                      </Text>
                    }
                    rightSectionWidth={48}
                  />
                  <Text size="xs" c="dimmed">
                    Mevcut: {formatNumber(c.quantity, 2)} {c.item_unit}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`${c.item_code} satırını çıkar`}
                    onClick={() => setCardRows((prev) => prev.filter((r) => r.id !== c.id))}
                  >
                    <FaIcon icon="fas fa-times" />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            {lotRows.map((l) => (
              <Table.Tr key={`lot-${l.id}`}>
                <Table.Td>
                  <CardCell code={l.item_code} name={l.item_name} />
                </Table.Td>
                <Table.Td style={mono}>{sizeLabel(l)}</Table.Td>
                <Table.Td>
                  <NumberInput
                    aria-label={`Lot ${l.id} adet`}
                    min={0}
                    max={l.quantity}
                    allowDecimal={false}
                    value={lotQty[l.id] ?? ''}
                    onChange={(v) => setLotQty((prev) => ({ ...prev, [l.id]: v }))}
                    rightSection={
                      <Text size="xs" c="dimmed">
                        adet
                      </Text>
                    }
                    rightSectionWidth={48}
                  />
                  <Text size="xs" c={l.reserved_quantity ? 'orange.8' : 'dimmed'}>
                    Lotta {l.quantity} adet
                    {l.reserved_quantity
                      ? ` (${l.reserved_quantity} kesime ayrılmış: ya hepsi ya en fazla ${l.available_quantity ?? 0})`
                      : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Lot ${l.id} satırını çıkar`}
                    onClick={() => setLotRows((prev) => prev.filter((r) => r.id !== l.id))}
                  >
                    <FaIcon icon="fas fa-times" />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed">
          Stok kartları Depo Transferi fişiyle taşınır (Depo Transferi sayfasından iptal
          edilebilir); sac ve boy lotları kendi geçmişlerine fiş numarasıyla yazılır.
        </Text>
        <Textarea label="Not" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      </Stack>
    </FormModal>
  );
}

/** Keeps the ticked rows' data across pages: ids from the table, rows from what was seen. */
function useSelection<T extends { id: number }>() {
  const [selected, setSelected] = useState<Map<number, T>>(() => new Map());
  const ids = useMemo(() => [...selected.keys()].map(String), [selected]);
  const onChange = (rows: T[]) => (next: string[]) =>
    setSelected((prev) => {
      const out = new Map<number, T>();
      for (const id of next.map(Number)) {
        const row = prev.get(id) ?? rows.find((r) => r.id === id);
        if (row) out.set(id, row);
      }
      return out;
    });
  return { selected, ids, onChange, clear: () => setSelected(new Map()) };
}

const EMPTY_BALANCES: PlaceBalance[] = [];
const EMPTY_LOTS: MaterialPiece[] = [];

/** One place's cards and lots, with the move buttons for the ticked rows. */
function PlaceStock({
  place,
  header,
  notice,
  actions,
  values,
  apply,
}: {
  place: InventoryPlace;
  /** The band: title, subtitle, back link. Its figures and buttons come from here. */
  header: Pick<PageHeaderProps, 'title' | 'subtitle' | 'icon' | 'backTo' | 'backLabel'>;
  /** Shown above the tables (e.g. a closed job still holding stock). */
  notice?: ReactNode;
  actions: MoveAction[];
  values: { search: string; kind: string; card_page: string; lot_page: string };
  apply: (
    next: Partial<{ search: string; kind: string; card_page: string; lot_page: string }>,
  ) => void;
}) {
  const search = values.search.trim();
  const kind = (values.kind || '') as KindFilter;
  const cardPage = Math.max(1, Number.parseInt(values.card_page, 10) || 1);
  const lotPage = Math.max(1, Number.parseInt(values.lot_page, 10) || 1);
  const showCards = kind === '' || kind === 'card';
  const showLots = kind !== 'card';

  const balances = useQuery({
    ...placeBalancesQueryOptions(place, {
      page: cardPage,
      page_size: PAGE_SIZE,
      ...(search ? { search } : {}),
    }),
    placeholderData: keepPreviousData,
    enabled: showCards,
  });
  const lots = useQuery({
    ...piecesQueryOptions({
      ...placeParams(place),
      page: lotPage,
      page_size: PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(kind === 'plate' || kind === 'boy' ? { kind } : {}),
    }),
    placeholderData: keepPreviousData,
    enabled: showLots,
  });
  useEffect(() => {
    const error = balances.error ?? lots.error;
    if (error) notify.error(countErrorMessage(error, 'Stok yüklenemedi'));
  }, [balances.error, lots.error]);

  const cardSel = useSelection<PlaceBalance>();
  const lotSel = useSelection<MaterialPiece>();
  const [moving, setMoving] = useState<MoveAction | null>(null);
  const cardRows = balances.data?.results ?? EMPTY_BALANCES;
  const lotRows = lots.data?.results ?? EMPTY_LOTS;
  const selectedCards = showCards ? [...cardSel.selected.values()] : [];
  const selectedLots = showLots ? [...lotSel.selected.values()] : [];
  const count = selectedCards.length + selectedLots.length;
  const canCards = canMoveCards();
  // A plate can only go back to Hammadde (one already sitting on a job from before).
  const platesCanMove = actions.some((a) => a.target === 'HAMMADDE');

  const filters = (
    <FilterBar
      inline
      filters={FILTERS}
      values={{ search: values.search, kind: values.kind }}
      onApply={(next) => apply({ ...next, card_page: '1', lot_page: '1' })}
      onClear={() => apply({ search: '', kind: '', card_page: '1', lot_page: '1' })}
    />
  );

  // Same as the other list pages: figures and the move buttons on the band,
  // the search inside the first table's card.
  const figure = (loaded: boolean, value: number | undefined) =>
    loaded ? (value ?? 0).toLocaleString('tr-TR') : '–';
  const stats: PageFigure[] = [
    ...(showCards
      ? [
          {
            id: 'cards',
            label: 'Stok kartı',
            value: figure(balances.isSuccess, balances.data?.count),
          },
        ]
      : []),
    ...(showLots
      ? [{ id: 'lots', label: 'Sac / boy lotu', value: figure(lots.isSuccess, lots.data?.count) }]
      : []),
    ...(count ? [{ id: 'selected', label: 'Seçili', value: count }] : []),
  ];

  return (
    <>
      <PageHeader
        {...header}
        stats={stats}
        actions={actions.map((a) => (
          <Button
            key={a.label}
            leftSection={<FaIcon icon={a.icon} />}
            disabled={count === 0}
            title={count === 0 ? 'Taşımak için tablodan satırları işaretleyin' : undefined}
            onClick={() => setMoving(a)}
          >
            {a.label}
          </Button>
        ))}
      />
      <Stack gap="md">
        {notice}
        {showCards ? (
          <DataTable
            title="Stok Kartları"
            icon="fas fa-boxes"
            filters={filters}
            data={cardRows}
            columns={balanceColumns}
            getRowId={(row) => String(row.id)}
            loading={balances.isFetching}
            selection={{
              selectedIds: cardSel.ids,
              onChange: cardSel.onChange(cardRows),
              isRowSelectable: () => canCards,
            }}
            pagination={{
              page: cardPage,
              pageSize: PAGE_SIZE,
              total: balances.data?.count ?? 0,
              onPageChange: (next) => apply({ card_page: String(next) }),
            }}
            emptyMessage={search ? 'Bu aramayla stok kartı yok' : 'Burada stok kartı yok'}
          />
        ) : null}
        {showLots ? (
          <DataTable
            title="Sac ve Boy Lotları"
            icon="fas fa-layer-group"
            filters={showCards ? undefined : filters}
            data={lotRows}
            columns={lotColumns}
            getRowId={(row) => String(row.id)}
            loading={lots.isFetching}
            selection={{
              selectedIds: lotSel.ids,
              onChange: lotSel.onChange(lotRows),
              // On Hammadde (moves only go to a job) a plate cannot be picked: it stays here.
              isRowSelectable: (row) =>
                canWriteKind(row.kind) && (row.kind !== 'plate' || platesCanMove),
            }}
            pagination={{
              page: lotPage,
              pageSize: PAGE_SIZE,
              total: lots.data?.count ?? 0,
              onPageChange: (next) => apply({ lot_page: String(next) }),
            }}
            emptyMessage={search ? 'Bu aramayla lot yok' : 'Burada sac veya boy lotu yok'}
          />
        ) : null}
        {showLots && !platesCanMove && kind !== 'boy' ? (
          <Text size="xs" c="dimmed">
            {PLATE_NOT_IN_JOB}
          </Text>
        ) : null}
        {moving ? (
          <MoveModal
            source={place}
            target={moving.target}
            title={moving.label}
            cards={selectedCards}
            lots={selectedLots}
            onClose={() => setMoving(null)}
            onDone={() => {
              cardSel.clear();
              lotSel.clear();
            }}
          />
        ) : null}
      </Stack>
    </>
  );
}

const PLACE_DEFAULTS = { search: '', kind: '', card_page: '1', lot_page: '1' };

export function HammaddePage() {
  const { values, apply } = useUrlFilters(PLACE_DEFAULTS);
  return (
    <>
      <PlaceStock
        place={{ warehouse: 'HAMMADDE', jobNo: '' }}
        header={{
          title: 'Hammadde',
          subtitle: 'Serbest stok: hiçbir işe ayrılmamış stok kartları ile sac ve boy lotları',
          icon: 'fas fa-cubes',
        }}
        actions={[{ target: 'job', label: 'İşe Ayır', icon: 'fas fa-arrow-right' }]}
        values={values}
        apply={apply}
      />
    </>
  );
}

function closedJobLabel(row: JobHolding): string {
  return row.job_status === 'cancelled' ? 'İş iptal' : 'İş tamamlandı';
}

const CLOSED_JOB_ROW = { background: 'var(--mantine-color-red-0)' };

function kgText(row: JobHolding): string {
  if (row.lots === 0) return '–';
  return `${formatNumber(row.kg, 2)} kg${row.kg_unknown ? ' +' : ''}`;
}

const jobColumns: DataTableColumn<JobHolding>[] = [
  {
    key: 'job_no',
    header: 'İş No',
    exportValue: (row) => row.job_no || 'Atanmamış',
    render: (row) =>
      row.job_no ? (
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600} style={mono}>
            {row.job_no}
          </Text>
          {row.job_closed ? <StatusBadge color="red">{closedJobLabel(row)}</StatusBadge> : null}
        </Group>
      ) : (
        <StatusBadge color="orange">Atanmamış</StatusBadge>
      ),
  },
  {
    key: 'job_title',
    header: 'İş Adı',
    render: (row) => (row.job_no ? row.job_title || '–' : 'Hiçbir işe bağlı olmayan İş Emri stoğu'),
  },
  {
    key: 'cards',
    header: 'Stok Kartı',
    align: 'right',
    render: (row) => (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        {row.cards}
        {row.negative_cards ? (
          <StatusBadge color="red">{row.negative_cards} eksi</StatusBadge>
        ) : null}
      </Group>
    ),
  },
  {
    key: 'lots',
    header: 'Sac / Boy',
    align: 'right',
    render: (row) => (row.lots ? `${row.lots} lot · ${row.pieces} adet` : '–'),
  },
  { key: 'kg', header: 'Ağırlık', align: 'right', render: kgText },
];

const JOB_DEFAULTS = { ...PLACE_DEFAULTS, job: '', job_search: '' };

export function IsEmriPage() {
  const { values, apply } = useUrlFilters(JOB_DEFAULTS);
  const jobSearch = values.job_search.trim();
  const jobs = useQuery({
    ...jobHoldingsQueryOptions(jobSearch),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (jobs.isError) notify.error(countErrorMessage(jobs.error, 'İşler yüklenemedi'));
  }, [jobs.isError, jobs.error]);
  const all = jobs.data ?? [];

  if (values.job) {
    const jobNo = values.job === UNASSIGNED ? '' : values.job;
    const row = all.find((j) => j.job_no === jobNo);
    const actions: MoveAction[] = [
      {
        target: 'job',
        label: jobNo ? 'Başka İşe Aktar' : 'İşe Ata',
        icon: 'fas fa-arrow-right',
      },
      { target: 'HAMMADDE', label: 'Hammaddeye İade', icon: 'fas fa-undo' },
    ];
    return (
      <>
        <PlaceStock
          key={values.job}
          place={{ warehouse: 'IS_EMRI', jobNo }}
          header={{
            title: jobNo ? `İş Emri · ${jobNo}` : 'İş Emri · Atanmamış',
            subtitle: jobNo
              ? row?.job_title || 'Bu işe ayrılmış stok'
              : 'İş Emri deposunda olup hiçbir işe bağlı olmayan stok',
            icon: 'fas fa-clipboard-list',
            backTo: IS_EMRI_ROUTE,
            backLabel: 'Tüm işler',
          }}
          notice={
            row?.job_closed ? (
              <Alert
                color="red"
                variant="white"
                icon={<FaIcon icon="fas fa-exclamation-triangle" />}
              >
                {row.job_status === 'cancelled'
                  ? 'Bu iş emri iptal edildi'
                  : 'Bu iş emri tamamlandı'}{' '}
                ama İş Emri deposunda stoğu duruyor. Kalan malzemeyi Hammaddeye iade edin ya da
                başka işe aktarın.
              </Alert>
            ) : undefined
          }
          actions={actions}
          values={values}
          apply={apply}
        />
      </>
    );
  }

  const assigned = all.filter((j) => j.job_no);
  const closed = assigned.filter((j) => j.job_closed);
  return (
    <>
      <PageHeader
        title="İş Emri"
        subtitle="İşlere ayrılmış stok: bir işi açınca o işe ayrılan her şey görünür"
        icon="fas fa-clipboard-list"
        stats={[
          { id: 'jobs', label: 'Stoklu iş', value: jobs.isSuccess ? assigned.length : '–' },
          {
            id: 'unassigned',
            label: 'Atanmamış kart',
            value: jobs.isSuccess ? (all.find((j) => !j.job_no)?.cards ?? 0) : '–',
          },
          {
            id: 'closed',
            label: 'Kapanmış işte stok',
            value: jobs.isSuccess ? closed.length : '–',
          },
        ]}
      />
      <DataTable
        title="İşler"
        icon="fas fa-clipboard-list"
        filters={
          <FilterBar
            inline
            filters={[
              { type: 'text', key: 'job_search', label: 'İş', placeholder: 'İş no veya iş adı' },
            ]}
            values={{ job_search: values.job_search }}
            onApply={(next) => apply(next)}
            onClear={() => apply({ job_search: '' })}
          />
        }
        data={all}
        columns={jobColumns}
        getRowId={(row) => row.job_no || UNASSIGNED}
        rowStyle={(row) => (row.job_closed ? CLOSED_JOB_ROW : undefined)}
        loading={jobs.isFetching}
        onRowClick={(row) =>
          apply({ job: row.job_no || UNASSIGNED, card_page: '1', lot_page: '1' })
        }
        pagination
        emptyMessage={jobSearch ? 'Bu aramayla iş yok' : 'İş Emri deposunda stok yok'}
      />
    </>
  );
}
