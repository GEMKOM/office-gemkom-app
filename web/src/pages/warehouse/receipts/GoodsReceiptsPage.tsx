import {
  Alert,
  Button,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { stockKeys } from '@/api/procurement/stock';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  cancelGoodsReceipt,
  createGoodsReceipt,
  goodsReceiptQueryOptions,
  goodsReceiptsQueryOptions,
  orderLinesQueryOptions,
  receiptKeys,
  searchReceivableOrders,
  type GoodsReceipt,
  type OrderLineState,
} from '@/api/warehouse/goodsReceipts';
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
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';

const PAGE_SIZE = 20;
const URL_DEFAULTS = { status: '', search: '', mk: '', page: '1' };
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
}: {
  lines: OrderLineState[];
  quantities: Record<number, string | number>;
  onChange: (poLine: number, value: string | number) => void;
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
          return (
            <Table.Tr key={line.po_line}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {line.item_code}
                </Text>
                <Text size="xs" c="dimmed">
                  {line.item_name}
                </Text>
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
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function NewReceiptModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<string | null>(null);
  // Only what the user changed; untouched lines take everything receivable.
  const [quantities, setQuantities] = useState<Record<number, string | number>>({});
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [irsaliyeDate, setIrsaliyeDate] = useState(today);
  const [note, setNote] = useState('');
  const orderId = order ? Number(order) : 0;
  const lines = useQuery({ ...orderLinesQueryOptions(orderId), enabled: orderId > 0 });
  const create = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
      void queryClient.invalidateQueries({ queryKey: ['planningItems'] });
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
    try {
      const receipt = await create.mutateAsync({
        purchase_order: orderId,
        irsaliye_no: irsaliyeNo.trim(),
        irsaliye_date: irsaliyeDate || null,
        note,
        lines: picked.map((r) => ({ po_line: r.line.po_line, quantity: String(r.qty) })),
      });
      notify.success(`${receipt.number} işlendi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Mal kabul kaydedilemedi'));
    }
  };

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
          value={order}
          onChange={(value) => {
            setOrder(value);
            setQuantities({});
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
                  <Table.Tr key={l.id}>
                    <Table.Td>{l.item_code}</Table.Td>
                    <Table.Td>{l.item_name}</Table.Td>
                    <Table.Td>{l.job_no ?? '-'}</Table.Td>
                    <Table.Td ta="right">
                      {formatNumber(l.quantity, 2)} {l.item_unit}
                    </Table.Td>
                  </Table.Tr>
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

/** Mal kabul: the receipts, a new one against a purchase order, one receipt's lines. */
export function GoodsReceiptsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    ...goodsReceiptsQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(values.status ? { status: values.status } : {}),
      ...(values.search ? { search: values.search } : {}),
    }),
    placeholderData: keepPreviousData,
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
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Yeni Mal Kabul
            </Button>
          ) : undefined
        }
      />
      <DataTable
        title="Mal Kabuller"
        icon="fas fa-truck-loading"
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
          pageSize: PAGE_SIZE,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        emptyMessage="Henüz mal kabul yok"
      />
      {creating ? <NewReceiptModal onClose={() => setCreating(false)} /> : null}
      {open ? (
        <ReceiptDetail key={open.id} receipt={open} onClose={() => apply({ mk: '' })} />
      ) : null}
    </>
  );
}
