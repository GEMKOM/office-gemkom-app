import { Alert, Button, Group, NumberInput, SegmentedControl, Table, Text } from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import {
  planningRequestKeys,
  planningRequestQueryOptions,
  submitStockCheck,
  warehouseRequestsQueryOptions,
  type PlanningRequest,
  type PlanningRequestItem,
} from '@/api/planning/planningRequests';
import { lookupCardsByCode } from '@/api/procurement/items';
import { piecesQueryOptions, type MaterialPiece } from '@/api/warehouse/pieces';
import { barMetres, formatDate, formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';

const URL_DEFAULTS = { view: 'bekleyen', search: '', page: '1', request: '' };
const PAGE_SIZE = 20;
const EMPTY: PlanningRequest[] = [];

const PRIORITY: Record<string, { label: string; color: 'grey' | 'orange' | 'red' }> = {
  normal: { label: 'Normal', color: 'grey' },
  urgent: { label: 'Acil', color: 'orange' },
  critical: { label: 'Kritik', color: 'red' },
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Plate / bar cards are stocked as pieces, not as a free balance. */
const isPieceLine = (item: PlanningRequestItem) =>
  item.item_material_class === 'plate' || item.item_material_class === 'boy';
/** Bars are given from stock by picking Hammadde lots; plates are not. */
const isBarLine = (item: PlanningRequestItem) => item.item_material_class === 'boy';

/** Bars picked per lot: piece id → count. */
type Picks = Record<number, number | string>;

const freeBars = (lot: MaterialPiece) => lot.available_quantity ?? lot.quantity;

/** What `count` bars of a lot come to in the card's unit (null: no kg/m on the card). */
function barsQuantity(lot: MaterialPiece, count: number, unit: string): number | null {
  const u = unit.toLowerCase();
  if (u === 'metre') return (num(lot.length_mm) * count) / 1000;
  if (u === 'adet') return count;
  return lot.unit_kg === null ? null : num(lot.unit_kg) * count;
}

const pickList = (picks: Picks | undefined) =>
  Object.entries(picks ?? {})
    .map(([piece, count]) => ({ piece: Number(piece), quantity: Math.trunc(num(count)) }))
    .filter((p) => p.quantity > 0);

const filters: FilterConfig<'search'>[] = [
  { type: 'text', key: 'search', label: 'Ara', placeholder: 'Talep no, başlık…', span: 3 },
];

const columns: DataTableColumn<PlanningRequest>[] = [
  {
    key: 'request_number',
    header: 'Talep',
    render: (row) => (
      <div>
        <Text size="sm" fw={600}>
          {row.request_number}
        </Text>
        <Text size="xs" c="dimmed">
          {row.title}
        </Text>
      </div>
    ),
  },
  {
    key: 'created_by',
    header: 'Talep Eden',
    render: (row) => row.created_by_full_name || row.created_by_username || '-',
  },
  {
    key: 'priority',
    header: 'Öncelik',
    render: (row) => {
      const p = PRIORITY[row.priority ?? 'normal'] ?? PRIORITY.normal!;
      return <StatusBadge color={p.color}>{p.label}</StatusBadge>;
    },
  },
  { key: 'needed_date', header: 'İhtiyaç', render: (row) => formatDate(row.needed_date) },
  { key: 'items', header: 'Kalem', render: (row) => row.items_count ?? row.items?.length ?? '-' },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => (
      <StatusBadge color={row.status === 'pending_inventory' ? 'yellow' : 'green'}>
        {row.status === 'pending_inventory'
          ? 'Depo kontrolü bekliyor'
          : row.status_label || row.status}
      </StatusBadge>
    ),
  },
];

/**
 * Depo › Stok Kontrolü: planning requests sent for a warehouse stock check.
 * The warehouse enters, per line, how much it found in Hammadde; finishing the
 * check moves that stock to İş Emri on the line's job and sends the rest on to
 * purchasing (or closes the request when everything came from stock).
 */
export function StockCheckPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const view = values.view === 'tumu' ? 'tumu' : 'bekleyen';
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const list = useQuery({
    ...warehouseRequestsQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(view === 'bekleyen' ? { status: 'pending_inventory' } : {}),
      ...(values.search ? { search: values.search } : {}),
    }),
    placeholderData: keepPreviousData,
  });
  const openId = Number.parseInt(values.request, 10);

  return (
    <>
      <PageHeader
        title="Stok Kontrolü"
        subtitle="Planlamanın depo kontrolüne gönderdiği talepler: stokta olanı girin, kalanı satınalmaya gitsin"
        icon="clipboard-check"
        backTo="/warehouse"
      />
      <DataTable
        title="Depo Kontrolü"
        icon="fas fa-clipboard-check"
        toolbar={
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(next) => apply({ view: next, page: '1' })}
            data={[
              { value: 'bekleyen', label: 'Bekleyen' },
              { value: 'tumu', label: 'Tümü' },
            ]}
          />
        }
        filters={
          <FilterBar
            inline
            filters={filters}
            values={{ search: values.search }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ search: '', page: '1' })}
          />
        }
        data={list.data?.results ?? EMPTY}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        onRowClick={(row) => apply({ request: String(row.id) })}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        emptyMessage={view === 'bekleyen' ? 'Depo kontrolü bekleyen talep yok' : 'Talep yok'}
      />
      {Number.isFinite(openId) && openId > 0 ? (
        <StockCheckModal key={openId} requestId={openId} onClose={() => apply({ request: '' })} />
      ) : null}
    </>
  );
}

/** One request's stock check: what Hammadde holds per line, what was found. */
export function StockCheckModal({
  requestId,
  onClose,
}: {
  requestId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const request = useQuery(planningRequestQueryOptions(requestId));
  const items = request.data?.items ?? [];
  const codes = items.map((i) => i.item_code ?? '').filter(Boolean);
  const cards = useQuery({
    queryKey: ['stock-check-cards', [...codes].sort().join(',')],
    queryFn: ({ signal }) => lookupCardsByCode(codes, signal),
    enabled: codes.length > 0,
  });
  const pending = request.data?.status === 'pending_inventory';
  // Only what the user typed; untouched lines start at what was found before (0).
  const [found, setFound] = useState<Record<number, number | string>>({});
  // Bar lines: the Hammadde lots picked per line.
  const [bars, setBars] = useState<Record<number, Picks>>({});
  const foundOf = (item: PlanningRequestItem) =>
    found[item.id!] ?? num(item.quantity_from_inventory);
  const hammadde = (item: PlanningRequestItem) =>
    num(cards.data?.get((item.item_code ?? '').trim())?.stock_quantity);

  const save = useMutation({
    mutationFn: () =>
      submitStockCheck(
        requestId,
        items.map((item) => {
          const pieces = isBarLine(item) ? pickList(bars[item.id!]) : [];
          return {
            planning_request_item_id: item.id!,
            quantity_found: num(foundOf(item)).toFixed(2),
            ...(pieces.length ? { pieces } : {}),
          };
        }),
      ),
    onSuccess: (result) => {
      const status = result.planning_request?.status;
      notify.success(
        status === 'completed'
          ? 'Stok kontrolü tamamlandı: talebin tamamı stoktan karşılandı'
          : 'Stok kontrolü tamamlandı: stokta olmayanlar satınalmaya gidiyor',
      );
      void queryClient.invalidateQueries({ queryKey: planningRequestKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
      onClose();
    },
    onError: (error) =>
      notify.error(error instanceof Error ? error.message : 'Stok kontrolü kaydedilemedi'),
  });

  const fillFromStock = () =>
    setFound(
      Object.fromEntries(
        items
          .filter((item) => !isPieceLine(item))
          .map((item) => [item.id!, Math.min(num(item.quantity), hammadde(item))]),
      ),
    );

  const finish = async () => {
    const over = items.find((item) => num(foundOf(item)) > num(item.quantity) + 1e-9);
    if (over) {
      notify.warning(`${over.item_code}: bulunan miktar talep edilenden fazla olamaz`);
      return;
    }
    const total =
      items.reduce((sum, item) => sum + num(foundOf(item)), 0) +
      items.reduce((sum, item) => sum + pickList(bars[item.id!]).length, 0);
    const ok = await confirm({
      title: 'Stok kontrolünü tamamla',
      message:
        total > 0
          ? 'Bulunan miktarlar Hammadde’den iş emri stoğuna aktarılacak; kalanı satınalmaya gidecek.'
          : 'Stokta bir şey bulunmadı: talebin tamamı satınalmaya gidecek.',
      confirmLabel: 'Tamamla',
    });
    if (ok) save.mutate();
  };

  const data = request.data;
  return (
    <DetailModal
      opened
      onClose={onClose}
      size="xl"
      icon="fas fa-clipboard-check"
      loading={request.isPending}
      title={data ? `Stok Kontrolü · ${data.request_number}` : 'Stok Kontrolü'}
      subtitle={data?.title ?? undefined}
      footerActions={
        pending ? (
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-magic" />}
              onClick={fillFromStock}
              disabled={save.isPending}
            >
              Stokta Olanı Doldur
            </Button>
            <Button
              size="xs"
              leftSection={<FaIcon icon="fas fa-check" />}
              loading={save.isPending}
              onClick={() => void finish()}
            >
              Kontrolü Tamamla
            </Button>
          </Group>
        ) : undefined
      }
      sections={
        data
          ? [
              {
                title: 'Talep',
                icon: 'fas fa-info-circle',
                fields: [
                  {
                    label: 'Talep Eden',
                    value: data.created_by_full_name || data.created_by_username,
                  },
                  { label: 'İhtiyaç Tarihi', value: data.needed_date, type: 'date' },
                  { label: 'Durum', value: data.status_label || data.status },
                ],
              },
              {
                title: 'Kalemler',
                icon: 'fas fa-list',
                content: (
                  <>
                    {!pending ? (
                      <Alert color="green" variant="light" mb="sm">
                        Bu talebin stok kontrolü yapılmış; bulunan miktarlar aşağıda.
                      </Alert>
                    ) : null}
                    <Table striped withTableBorder fz="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Kalem</Table.Th>
                          <Table.Th>İş No</Table.Th>
                          <Table.Th ta="right">Talep</Table.Th>
                          <Table.Th ta="right">Hammadde</Table.Th>
                          <Table.Th ta="right" w={150}>
                            Stoktan Bulunan
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {items.map((item, index) => {
                          const unit = item.item_unit || '';
                          const piece = isPieceLine(item);
                          const bar = isBarLine(item) && pending;
                          return (
                            <Fragment key={item.id}>
                              <Table.Tr>
                                <Table.Td>
                                  <Text size="sm" fw={600}>
                                    {item.item_code}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {item.item_name}
                                  </Text>
                                </Table.Td>
                                <Table.Td>{item.job_no || '-'}</Table.Td>
                                <Table.Td ta="right">
                                  {formatNumber(num(item.quantity), 2)} {unit}
                                </Table.Td>
                                <Table.Td ta="right" data-testid={`hammadde-${index + 1}`}>
                                  {piece
                                    ? '—'
                                    : cards.isPending
                                      ? '…'
                                      : `${formatNumber(hammadde(item), 2)} ${unit}`}
                                </Table.Td>
                                <Table.Td ta="right">
                                  {bar ? (
                                    <Text size="xs" c="dimmed">
                                      {num(item.quantity_from_inventory) > 0
                                        ? `${formatNumber(num(item.quantity_from_inventory), 2)} ${unit} + `
                                        : ''}
                                      aşağıdan boy seçin
                                    </Text>
                                  ) : piece && pending ? (
                                    <Text size="xs" c="dimmed">
                                      Sac stoktan karşılanmaz
                                    </Text>
                                  ) : pending ? (
                                    <NumberInput
                                      size="xs"
                                      min={0}
                                      max={num(item.quantity)}
                                      decimalScale={2}
                                      decimalSeparator=","
                                      hideControls
                                      aria-label={`Bulunan ${index + 1}`}
                                      value={foundOf(item)}
                                      onChange={(value) =>
                                        setFound((prev) => ({ ...prev, [item.id!]: value }))
                                      }
                                    />
                                  ) : (
                                    `${formatNumber(num(item.quantity_from_inventory), 2)} ${unit}`
                                  )}
                                </Table.Td>
                              </Table.Tr>
                              {bar ? (
                                <Table.Tr>
                                  <Table.Td colSpan={5}>
                                    <BarPicker
                                      item={item}
                                      index={index}
                                      picks={bars[item.id!] ?? {}}
                                      onChange={(picks) =>
                                        setBars((prev) => ({ ...prev, [item.id!]: picks }))
                                      }
                                    />
                                  </Table.Td>
                                </Table.Tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </>
                ),
              },
            ]
          : []
      }
    />
  );
}

/**
 * A bar line's Hammadde lots: how many bars of each go to the line's job.
 * Whole bars move; what they come to counts as found (capped at the line).
 */
function BarPicker({
  item,
  index,
  picks,
  onChange,
}: {
  item: PlanningRequestItem;
  index: number;
  picks: Picks;
  onChange: (picks: Picks) => void;
}) {
  const unit = item.item_unit || '';
  // The API sends the card as `item`; `item_id` is only what a form sends.
  const cardId = item.item ?? item.item_id ?? null;
  const lots = useQuery({
    ...piecesQueryOptions({
      item: cardId ?? undefined,
      warehouse: 'HAMMADDE',
      page_size: 100,
    }),
    enabled: cardId !== null,
  });
  const free = (lots.data?.results ?? []).filter((lot) => freeBars(lot) > 0);
  if (cardId === null) {
    return (
      <Text size="xs" c="dimmed" data-testid={`bars-${index + 1}`}>
        Bu kalemin stok kartı yok: boy seçilemez.
      </Text>
    );
  }
  if (lots.isError) {
    return (
      <Text size="xs" c="red" data-testid={`bars-${index + 1}`}>
        Hammadde boyları yüklenemedi.
      </Text>
    );
  }
  if (lots.isPending) {
    return (
      <Text size="xs" c="dimmed">
        Hammadde boyları yükleniyor…
      </Text>
    );
  }
  if (!free.length) {
    return (
      <Text size="xs" c="dimmed" data-testid={`bars-${index + 1}`}>
        Hammadde’de bu karttan boy yok: satınalmaya gidecek.
      </Text>
    );
  }
  let total = 0;
  let unknown = false;
  for (const lot of free) {
    const count = Math.trunc(num(picks[lot.id]));
    if (count < 1) continue;
    const q = barsQuantity(lot, count, unit);
    if (q === null) unknown = true;
    else total += q;
  }
  const requested = num(item.quantity);
  return (
    <Group gap="md" align="center" data-testid={`bars-${index + 1}`}>
      <Text size="xs" c="dimmed">
        Hammadde boyları:
      </Text>
      {free.map((lot) => (
        <Group key={lot.id} gap={4} wrap="nowrap">
          <Text size="xs" fw={600}>
            {barMetres(lot.length_mm)}
          </Text>
          <Text size="xs" c="dimmed">
            ({freeBars(lot)} boy)
          </Text>
          <NumberInput
            size="xs"
            w={60}
            min={0}
            max={freeBars(lot)}
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="strict"
            hideControls
            placeholder="0"
            aria-label={`Boy ${index + 1} ${barMetres(lot.length_mm)}`}
            value={picks[lot.id] ?? ''}
            onChange={(value) => onChange({ ...picks, [lot.id]: value })}
          />
        </Group>
      ))}
      {total > 0 || unknown ? (
        <Text size="xs" fw={600} data-testid={`bars-total-${index + 1}`}>
          {unknown
            ? 'Kartta kg/m yok: miktar hesaplanamaz'
            : `= ${formatNumber(Math.min(total, requested), 2)} ${unit}` +
              (total > requested ? ' (talebin tamamı)' : '')}
        </Text>
      ) : null}
    </Group>
  );
}
