import {
  Alert,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { stockKeys } from '@/api/procurement/stock';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  cancelGoodsReceipt,
  createGoodsReceipt,
  goodsReceiptQueryOptions,
  goodsReceiptsQueryOptions,
  orderLinesQueryOptions,
  pendingLinesQueryOptions,
  receiptKeys,
  searchReceivableOrders,
  type GoodsReceipt,
  type OrderLineState,
  type PendingLine,
  type ReceiptPiece,
  type ReceiptPieceInput,
} from '@/api/warehouse/goodsReceipts';
import { pieceKeys, sizeLabel } from '@/api/warehouse/pieces';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  notify,
  PageHeader,
  SelectRemote,
  SizeNote,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import {
  isBlankPiece,
  pieceInput,
  ReceiptPiecesEditor,
  startPieces,
  type PieceDraft,
} from './ReceiptPiecesEditor';
import { codedSheets, SheetCodesModal, type CodedSheet } from '../pieces/SheetCodes';

const PAGE_SIZE = 20;
const URL_DEFAULTS = {
  view: 'bekleyen',
  status: '',
  search: '',
  mk: '',
  page: '1',
  page_size: '20',
  // Bekleyen Siparişler
  supplier: '',
  psearch: '',
  overdue: '',
  since: '90',
  ppage: '1',
  ppage_size: '20',
};
type FilterKeys = 'search' | 'status';

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'search',
    label: 'Arama',
    placeholder: 'Fiş no, irsaliye, tedarikçi, sipariş no, ürün…',
  },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'posted', label: 'İşlendi' },
      { value: 'cancelled', label: 'İptal Edildi' },
    ],
  },
];

/** Who may receive (the backend checks the same: access_warehouse, staff, superuser). */
function canReceive(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

const columns: DataTableColumn<GoodsReceipt>[] = [
  {
    key: 'number',
    header: 'Fiş No',
    render: (row) => (
      <Text size="sm" fw={600} td={row.status === 'cancelled' ? 'line-through' : undefined}>
        {row.number}
      </Text>
    ),
  },
  {
    key: 'purchase_order',
    header: 'Sipariş',
    render: (row) => `#${row.purchase_order} · ${row.pr_number}`,
  },
  { key: 'supplier_name', header: 'Tedarikçi' },
  {
    key: 'irsaliye_no',
    header: 'İrsaliye',
    render: (row) =>
      row.irsaliye_no
        ? `${row.irsaliye_no}${row.irsaliye_date ? ` · ${formatDate(row.irsaliye_date)}` : ''}`
        : '-',
  },
  { key: 'lines', header: 'Satır', align: 'right', render: (row) => row.lines.length },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => (
      <StatusBadge color={row.status === 'posted' ? 'green' : 'grey'}>
        {row.status_label}
      </StatusBadge>
    ),
  },
  {
    key: 'created_at',
    header: 'Tarih',
    render: (row) => `${formatDateTime(row.created_at)} · ${row.created_by_name ?? ''}`,
  },
];

const today = () => new Date().toISOString().slice(0, 10);
const num = (value: string | number | null | undefined) => Number(value ?? 0) || 0;

function OrderLinesTable({
  lines,
  quantities,
  onChange,
  pieces,
  onPiecesChange,
}: {
  lines: OrderLineState[];
  quantities: Record<number, string | number>;
  onChange: (poLine: number, value: string | number) => void;
  pieces: Record<number, PieceDraft[]>;
  onPiecesChange: (poLine: number, rows: PieceDraft[]) => void;
}) {
  return (
    <Table withTableBorder verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Ürün</Table.Th>
          <Table.Th>Gideceği Yer</Table.Th>
          <Table.Th ta="right">Sipariş</Table.Th>
          <Table.Th ta="right">Alınan</Table.Th>
          <Table.Th ta="right">Kalan</Table.Th>
          <Table.Th w={150}>Bu Teslimat</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {lines.map((line) => {
          const max = num(line.receivable);
          const value = quantities[line.po_line] ?? line.receivable;
          const takesPieces = !!line.piece_kind && max > 0 && num(value) > 0;
          return (
            <Fragment key={line.po_line}>
              <Table.Tr>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {line.item_code}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {line.item_name}
                  </Text>
                  <SizeNote text={line.size_summary} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{line.destination || '-'}</Text>
                  {line.planning_item ? null : (
                    <Text size="xs" c="dimmed">
                      Planlama kalemi yok
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{formatNumber(line.ordered, 2)}</Table.Td>
                <Table.Td ta="right">{formatNumber(line.received, 2)}</Table.Td>
                <Table.Td ta="right">
                  {formatNumber(line.outstanding, 2)} {line.item_unit}
                </Table.Td>
                <Table.Td>
                  {max > 0 ? (
                    <NumberInput
                      size="xs"
                      min={0}
                      max={max}
                      decimalScale={2}
                      hideControls
                      aria-label={`Bu teslimat ${line.item_code}`}
                      error={num(value) > max ? `En fazla ${formatNumber(max, 2)}` : undefined}
                      value={value}
                      onChange={(v) => onChange(line.po_line, v)}
                    />
                  ) : (
                    <Text size="xs" c={line.reason ? 'red.8' : 'dimmed'}>
                      {line.reason || 'Tamamı alındı'}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
              {takesPieces ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <ReceiptPiecesEditor
                      line={line}
                      quantity={num(value)}
                      rows={pieces[line.po_line] ?? startPieces(line, num(value))}
                      onChange={(rows) => onPiecesChange(line.po_line, rows)}
                    />
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Fragment>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/** The order "Kabul Et" opened the form for: all its lines, to receive at once. */
export interface ReceiveTarget {
  order: number;
  label: string;
}

function NewReceiptModal({ onClose, target }: { onClose: () => void; target?: ReceiveTarget }) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<string | null>(target ? String(target.order) : null);
  // Only what the user changed; untouched lines take everything receivable.
  const [quantities, setQuantities] = useState<Record<number, string | number>>({});
  // Plate / boy lines: the pieces that came, per PO line.
  const [pieces, setPieces] = useState<Record<number, PieceDraft[]>>({});
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [irsaliyeDate, setIrsaliyeDate] = useState(today);
  const [note, setNote] = useState('');
  // The receipt's new plate sheets and their codes, shown once it is saved.
  const [coded, setCoded] = useState<{ number: string; sheets: CodedSheet[] } | null>(null);
  const orderId = order ? Number(order) : 0;
  const lines = useQuery({ ...orderLinesQueryOptions(orderId), enabled: orderId > 0 });
  const create = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
      void queryClient.invalidateQueries({ queryKey: ['planningItems'] });
      void queryClient.invalidateQueries({ queryKey: pieceKeys.all });
    },
  });

  const save = async () => {
    if (!orderId || !lines.data) {
      notify.warning('Sipariş seçin');
      return;
    }
    if (!irsaliyeNo.trim()) {
      notify.warning('İrsaliye numarasını girin');
      return;
    }
    const picked = lines.data
      .filter((l) => num(l.receivable) > 0)
      .map((l) => ({ line: l, qty: num(quantities[l.po_line] ?? l.receivable) }))
      .filter((r) => r.qty > 0);
    if (picked.length === 0) {
      notify.warning('Teslim alınan en az bir satır girin');
      return;
    }
    const over = picked.find((r) => r.qty > num(r.line.receivable));
    if (over) {
      notify.warning(`${over.line.item_code}: en fazla ${formatNumber(over.line.receivable, 2)}`);
      return;
    }
    // Plate / boy lines need the pieces that came.
    const pieceRows: Record<number, ReceiptPieceInput[]> = {};
    for (const { line, qty } of picked) {
      if (!line.piece_kind) continue;
      const kind = line.piece_kind;
      const rows = (pieces[line.po_line] ?? startPieces(line, qty))
        .filter((row) => !isBlankPiece(row))
        .map((row) => pieceInput(kind, row));
      if (rows.length === 0) {
        notify.warning(`${line.item_code}: gelen parçaları (ölçü ve adet) girin`);
        return;
      }
      const complete = rows.filter((row): row is ReceiptPieceInput => row !== null);
      if (complete.length !== rows.length) {
        const what = kind === 'plate' ? 'en, boy' : 'boy';
        notify.warning(`${line.item_code}: her parça satırında ${what} ve adet girilmeli`);
        return;
      }
      pieceRows[line.po_line] = complete;
    }
    try {
      const receipt = await create.mutateAsync({
        purchase_order: orderId,
        irsaliye_no: irsaliyeNo.trim(),
        irsaliye_date: irsaliyeDate || null,
        note,
        lines: picked.map((r) => ({
          po_line: r.line.po_line,
          quantity: String(r.qty),
          ...(pieceRows[r.line.po_line] ? { pieces: pieceRows[r.line.po_line] } : {}),
        })),
      });
      notify.success(`${receipt.number} işlendi`);
      const sheets = receiptSheets(receipt);
      if (sheets.length) setCoded({ number: receipt.number, sheets });
      else onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Mal kabul kaydedilemedi'));
    }
  };

  if (coded) {
    return (
      <SheetCodesModal
        opened
        onClose={onClose}
        title={`Mal Kabul ${coded.number}`}
        sheets={coded.sheets}
      />
    );
  }

  const receivable = (lines.data ?? []).filter((l) => num(l.receivable) > 0).length;
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Mal Kabul"
      icon="fas fa-truck-loading"
      size="90%"
      submitLabel="Kaydet ve İşle"
      submitting={create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        <SelectRemote
          label="Sipariş"
          required
          placeholder="Sipariş no, tedarikçi, talep no veya ürün ile ara…"
          minSearchLength={2}
          queryKey={receiptKeys.orders}
          search={searchReceivableOrders}
          initialOptions={
            target ? [{ value: String(target.order), label: target.label }] : undefined
          }
          value={order}
          onChange={(value) => {
            setOrder(value);
            setQuantities({});
            setPieces({});
          }}
        />
        <Group grow align="flex-start">
          <TextInput
            label="İrsaliye No"
            withAsterisk
            value={irsaliyeNo}
            onChange={(e) => setIrsaliyeNo(e.currentTarget.value)}
          />
          <TextInput
            label="İrsaliye Tarihi"
            type="date"
            value={irsaliyeDate}
            onChange={(e) => setIrsaliyeDate(e.currentTarget.value)}
          />
        </Group>
        {lines.data ? (
          <>
            {receivable === 0 ? (
              <Alert color="yellow" icon={<FaIcon icon="fas fa-info-circle" />}>
                Bu siparişte teslim alınacak satır kalmadı.
              </Alert>
            ) : null}
            <OrderLinesTable
              lines={lines.data}
              quantities={quantities}
              onChange={(poLine, value) => setQuantities((prev) => ({ ...prev, [poLine]: value }))}
              pieces={pieces}
              onPiecesChange={(poLine, rows) => setPieces((prev) => ({ ...prev, [poLine]: rows }))}
            />
          </>
        ) : orderId ? (
          <Text size="sm" c="dimmed">
            Sipariş satırları yükleniyor…
          </Text>
        ) : null}
        <Textarea label="Not" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      </Stack>
    </FormModal>
  );
}

function pieceText(p: {
  width_mm: string | null;
  length_mm: string;
  quantity: number;
  heat_number: string;
}) {
  const heat = p.heat_number ? ` (döküm ${p.heat_number})` : '';
  return `${sizeLabel(p)} × ${p.quantity}${heat}`;
}

/** A line's pieces: each size and heat no once, with its sheets' codes. */
export function receiptPiecesText(pieces: ReceiptPiece[]): string {
  const groups = new Map<string, { piece: ReceiptPiece; quantity: number; codes: string[] }>();
  for (const p of pieces) {
    const key = `${p.width_mm}|${p.length_mm}|${p.heat_number}`;
    const group = groups.get(key) ?? { piece: p, quantity: 0, codes: [] };
    group.quantity += p.quantity;
    if (p.code) group.codes.push(p.code);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ piece, quantity, codes }) => {
      const text = pieceText({ ...piece, quantity });
      return codes.length ? `${text}: ${codes.join(', ')}` : text;
    })
    .join(' · ');
}

/** The plate sheets a saved receipt brought, with their codes. */
function receiptSheets(receipt: GoodsReceipt): CodedSheet[] {
  return (receipt.lines ?? []).flatMap((line) =>
    codedSheets(line.pieces ?? []).map((p) => ({
      code: p.code,
      item_code: line.item_code,
      item_name: line.item_name,
      width_mm: p.width_mm,
      length_mm: p.length_mm,
      heat_number: p.heat_number,
    })),
  );
}

function ReceiptDetail({ receipt, onClose }: { receipt: GoodsReceipt; onClose: () => void }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => cancelGoodsReceipt(receipt.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
      void queryClient.invalidateQueries({ queryKey: ['planningItems'] });
    },
  });
  const undo = async () => {
    const ok = await confirm({
      title: 'Mal Kabulü Geri Al',
      icon: 'fas fa-undo',
      message: `${receipt.number} iptal edilecek; teslimatlar ve stok hareketleri geri alınacak. Devam edilsin mi?`,
      confirmLabel: 'Evet, Geri Al',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync();
      notify.success(`${receipt.number} geri alındı`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Mal kabul geri alınamadı'));
    }
  };
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Mal Kabul - ${receipt.number}`}
      icon="fas fa-truck-loading"
      size="lg"
      sections={[
        {
          title: 'Bilgiler',
          icon: 'fas fa-info-circle',
          content: (
            <Stack gap={4}>
              <Text size="sm">
                <strong>Sipariş:</strong> #{receipt.purchase_order} · {receipt.pr_number} ·{' '}
                {receipt.supplier_name}
              </Text>
              <Text size="sm">
                <strong>İrsaliye:</strong> {receipt.irsaliye_no || '-'}
                {receipt.irsaliye_date ? ` · ${formatDate(receipt.irsaliye_date)}` : ''}
              </Text>
              <Text size="sm">
                <strong>Kaydeden:</strong> {receipt.created_by_name} ·{' '}
                {formatDateTime(receipt.created_at)}
              </Text>
              {receipt.cancelled_at ? (
                <Text size="sm" c="red.8">
                  İptal: {receipt.cancelled_by_name} · {formatDateTime(receipt.cancelled_at)}
                </Text>
              ) : null}
              {receipt.note ? <Text size="sm">{receipt.note}</Text> : null}
            </Stack>
          ),
        },
        {
          title: 'Satırlar',
          icon: 'fas fa-list',
          content: (
            <Table withTableBorder verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Kod</Table.Th>
                  <Table.Th>Ürün</Table.Th>
                  <Table.Th>İş No</Table.Th>
                  <Table.Th ta="right">Miktar</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {receipt.lines.map((l) => (
                  <Fragment key={l.id}>
                    <Table.Tr>
                      <Table.Td>{l.item_code}</Table.Td>
                      <Table.Td>{l.item_name}</Table.Td>
                      <Table.Td>{l.job_no ?? '-'}</Table.Td>
                      <Table.Td ta="right">
                        {formatNumber(l.quantity, 2)} {l.item_unit}
                      </Table.Td>
                    </Table.Tr>
                    {l.pieces?.length ? (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text size="xs" c="dimmed">
                            {'Parçalar: '}
                            {receiptPiecesText(l.pieces)}
                            {l.pieces_kg !== null
                              ? ` — ${formatNumber(l.pieces_kg, 2)} kg`
                              : ' — ağırlık yok'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          ),
        },
      ]}
      footerActions={
        receipt.status === 'posted' && canReceive() ? (
          <Button
            color="red"
            variant="light"
            leftSection={<FaIcon icon="fas fa-undo" />}
            loading={cancel.isPending}
            onClick={() => void undo()}
          >
            Geri Al
          </Button>
        ) : undefined
      }
    />
  );
}

const EMPTY: GoodsReceipt[] = [];
const EMPTY_PENDING: PendingLine[] = [];

const SINCE_OPTIONS = [
  { value: '30', label: 'Son 30 gün' },
  { value: '90', label: 'Son 3 ay' },
  { value: '180', label: 'Son 6 ay' },
  { value: 'all', label: 'Tümü' },
];

/** YYYY-MM-DD of `days` ago, or undefined for "all". */
export function sinceDate(days: string, now = new Date()): string | undefined {
  const n = Number.parseInt(days, 10);
  if (!Number.isFinite(n)) return undefined;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Days a line is late (0 when not late). */
export function daysLate(expected: string | null, now = new Date()): number {
  if (!expected) return 0;
  const [y, m, d] = expected.split('-').map(Number);
  const due = new Date(y!, m! - 1, d!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86_400_000));
}

const qty = (value: string, unit: string) => `${formatNumber(Number(value), 2)} ${unit}`;

const pendingColumns: DataTableColumn<PendingLine>[] = [
  {
    key: 'supplier_name',
    header: 'Tedarikçi',
    render: (row) => (
      <Stack gap={0}>
        <Text size="sm" fw={500}>
          {row.supplier_name}
        </Text>
        <Text size="xs" c="dimmed">
          Sipariş #{row.purchase_order} · {row.pr_number}
        </Text>
      </Stack>
    ),
  },
  {
    key: 'item_code',
    header: 'Malzeme',
    render: (row) => (
      <Stack gap={0}>
        <Text size="sm" fw={600}>
          {row.item_code}
        </Text>
        <Text size="xs" c="dimmed">
          {row.item_name}
        </Text>
        <SizeNote text={row.size_summary} />
      </Stack>
    ),
  },
  {
    key: 'ordered',
    header: 'Sipariş / Gelen',
    align: 'right',
    render: (row) =>
      `${qty(row.ordered, row.item_unit)} / ${formatNumber(Number(row.received), 2)}`,
  },
  {
    key: 'remaining',
    header: 'Kalan',
    align: 'right',
    render: (row) => (
      <Text size="sm" fw={600}>
        {qty(row.remaining, row.item_unit)}
      </Text>
    ),
  },
  {
    key: 'expected_date',
    header: 'Beklenen',
    render: (row) =>
      row.expected_date ? (
        <Stack gap={2}>
          <Text size="sm">{formatDate(row.expected_date)}</Text>
          {row.overdue ? (
            <StatusBadge color="red">{daysLate(row.expected_date)} gün gecikti</StatusBadge>
          ) : null}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          Teslim süresi yok
        </Text>
      ),
  },
  {
    key: 'job_no',
    header: 'İş / Yer',
    render: (row) => (
      <Stack gap={0}>
        <Text size="sm">{row.job_no || '-'}</Text>
        <Text size="xs" c="dimmed">
          {row.destination}
        </Text>
      </Stack>
    ),
  },
];

/** Bekleyen Siparişler: PO lines still to arrive, across orders. */
function PendingOrders({
  values,
  apply,
  toolbar,
  onReceive,
}: {
  values: typeof URL_DEFAULTS;
  apply: (next: Partial<typeof URL_DEFAULTS>) => void;
  toolbar: ReactNode;
  onReceive: (target: ReceiveTarget) => void;
}) {
  const page = Math.max(1, Number.parseInt(values.ppage, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(values.ppage_size, 10) || PAGE_SIZE);
  const since = sinceDate(values.since);
  const list = useQuery({
    ...pendingLinesQueryOptions({
      page,
      page_size: pageSize,
      ...(values.supplier ? { supplier: Number(values.supplier) } : {}),
      ...(values.psearch ? { search: values.psearch } : {}),
      ...(values.overdue === 'true' || values.overdue === 'false'
        ? { overdue: values.overdue }
        : {}),
      ...(since ? { ordered_since: since } : {}),
    }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError)
      notify.error(countErrorMessage(list.error, 'Bekleyen siparişler yüklenemedi'));
  }, [list.isError, list.error]);
  const suppliers = list.data?.suppliers ?? [];
  const filters: FilterConfig<'psearch' | 'supplier' | 'overdue' | 'since'>[] = [
    {
      type: 'text',
      key: 'psearch',
      label: 'Arama',
      placeholder: 'Sipariş no, talep no, malzeme, iş no…',
    },
    {
      type: 'select',
      key: 'supplier',
      label: 'Tedarikçi',
      placeholder: 'Tümü',
      options: suppliers.map((s) => ({ value: String(s.id), label: `${s.name} (${s.lines})` })),
    },
    {
      type: 'select',
      key: 'overdue',
      label: 'Gecikme',
      placeholder: 'Tümü',
      searchable: false,
      options: [
        { value: 'true', label: 'Gecikenler' },
        { value: 'false', label: 'Gecikmeyenler' },
      ],
    },
    {
      type: 'select',
      key: 'since',
      label: 'Sipariş tarihi',
      placeholder: 'Tümü',
      searchable: false,
      options: SINCE_OPTIONS,
    },
  ];
  const label = (row: PendingLine) =>
    `#${row.purchase_order} · ${row.supplier_name} · ${row.pr_number}`;
  return (
    <DataTable
      columnsKey="goods-receipts-pending-orders"
      title="Bekleyen Siparişler"
      icon="fas fa-hourglass-half"
      toolbar={
        <Group gap="xs">
          {list.data ? (
            <Text size="xs" c="dimmed">
              {list.data.count} satır · {list.data.overdue_count} geciken
            </Text>
          ) : null}
          {toolbar}
        </Group>
      }
      filters={
        <FilterBar
          inline
          filters={filters}
          values={{
            psearch: values.psearch,
            supplier: values.supplier,
            overdue: values.overdue,
            since: values.since,
          }}
          onApply={(next) => apply({ ...next, ppage: '1' })}
          onClear={() => apply({ psearch: '', supplier: '', overdue: '', since: '90', ppage: '1' })}
        />
      }
      data={list.data?.results ?? EMPTY_PENDING}
      columns={pendingColumns}
      getRowId={(row) => String(row.po_line)}
      loading={list.isFetching}
      rowActions={
        canReceive()
          ? () => [
              {
                key: 'order',
                label: 'Kabul Et',
                icon: 'fas fa-check',
                color: 'success',
                onClick: (row) => onReceive({ order: row.purchase_order, label: label(row) }),
              },
            ]
          : undefined
      }
      pagination={{
        page,
        pageSize,
        total: list.data?.count ?? 0,
        onPageChange: (next) => apply({ ppage: String(next) }),
        onPageSizeChange: (size) => apply({ ppage_size: String(size), ppage: '1' }),
      }}
      emptyMessage="Bu filtrelerle bekleyen sipariş satırı yok"
    />
  );
}

/**
 * Mal kabul: Bekleyen Siparişler (PO lines still to arrive; "Kabul Et" opens
 * the receive form for that order) and Mal Kabuller (posted receipts).
 */
export function GoodsReceiptsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(values.page_size, 10) || PAGE_SIZE);
  const [creating, setCreating] = useState<ReceiveTarget | 'new' | null>(null);
  const view = values.view === 'kabuller' ? 'kabuller' : 'bekleyen';
  const viewSwitch = (
    <SegmentedControl
      size="xs"
      value={view}
      onChange={(next) => apply({ view: next })}
      data={[
        { value: 'bekleyen', label: 'Bekleyen Siparişler' },
        { value: 'kabuller', label: 'Mal Kabuller' },
      ]}
    />
  );
  const list = useQuery({
    ...goodsReceiptsQueryOptions({
      page,
      page_size: pageSize,
      ...(values.status ? { status: values.status } : {}),
      ...(values.search ? { search: values.search } : {}),
    }),
    placeholderData: keepPreviousData,
    // A receipt link (?mk=) finds its receipt in the list, whichever tab is shown.
    enabled: view === 'kabuller' || Boolean(values.mk),
  });
  useEffect(() => {
    if (list.isError) notify.error(countErrorMessage(list.error, 'Mal kabuller yüklenemedi'));
  }, [list.isError, list.error]);

  const rows = list.data?.results ?? EMPTY;
  const openId = Number.parseInt(values.mk, 10);
  const inList = rows.find((r) => r.id === openId);
  // A link to a receipt that is not on this page of the list.
  const single = useQuery({
    ...goodsReceiptQueryOptions(openId),
    enabled: Number.isFinite(openId) && list.isSuccess && !inList,
  });
  const open = inList ?? (single.data?.id === openId ? single.data : null);

  return (
    <>
      <PageHeader
        title="Mal Kabul"
        subtitle="Siparişe karşı gelen malzeme, irsaliyesiyle; stoğa ve planlama kalemlerine işlenir"
        icon="truck-loading"
        backTo="/warehouse"
        actions={
          canReceive() ? (
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating('new')}>
              Yeni Mal Kabul
            </Button>
          ) : undefined
        }
      />
      {view === 'bekleyen' ? (
        <PendingOrders values={values} apply={apply} toolbar={viewSwitch} onReceive={setCreating} />
      ) : null}
      {view === 'kabuller' ? (
        <DataTable
          columnsKey="goods-receipts"
          title="Mal Kabuller"
          icon="fas fa-truck-loading"
          toolbar={viewSwitch}
          filters={
            <FilterBar
              inline
              filters={filterConfig}
              values={{ search: values.search, status: values.status }}
              onApply={(next) => apply({ ...next, page: '1' })}
              onClear={() => apply({ search: '', status: '', page: '1' })}
            />
          }
          data={rows}
          columns={columns}
          getRowId={(row) => String(row.id)}
          loading={list.isFetching}
          onRowClick={(row) => apply({ mk: String(row.id) })}
          pagination={{
            page,
            pageSize,
            total: list.data?.count ?? 0,
            onPageChange: (next) => apply({ page: String(next) }),
            onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
          }}
          emptyMessage="Henüz mal kabul yok"
        />
      ) : null}
      {creating ? (
        <NewReceiptModal
          target={creating === 'new' ? undefined : creating}
          onClose={() => setCreating(null)}
        />
      ) : null}
      {open ? (
        <ReceiptDetail key={open.id} receipt={open} onClose={() => apply({ mk: '' })} />
      ) : null}
    </>
  );
}
