import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { cardFromSearch, itemKeys, searchStockCards } from '@/api/procurement/items';
import {
  itemBalancesQueryOptions,
  stockKeys,
  WAREHOUSE_LABELS,
  type WarehouseCode,
} from '@/api/procurement/stock';
import { useJobOrderOptions } from '@/api/reference';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  cancelTransfer,
  createTransfer,
  sideLabel,
  transferKeys,
  transferQueryOptions,
  transferShortages,
  transfersQueryOptions,
  type TransferInput,
  type TransferShortage,
  type TransferSlip,
} from '@/api/warehouse/transfers';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDateTime, formatNumber } from '@/lib/format';
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
const URL_DEFAULTS = { status: '', warehouse: '', job_no: '', search: '', transfer: '', page: '1' };
type FilterKeys = 'search' | 'warehouse' | 'status' | 'job_no';

const WAREHOUSES = (Object.keys(WAREHOUSE_LABELS) as WarehouseCode[]).map((code) => ({
  value: code,
  label: WAREHOUSE_LABELS[code],
}));

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Transfer no, iş no, ürün, not…' },
  {
    type: 'select',
    key: 'warehouse',
    label: 'Depo',
    placeholder: 'Tümü',
    searchable: false,
    options: WAREHOUSES,
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
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'Örn. 254-01' },
];

/** Who may write transfers (the backend checks the same: access_warehouse, staff, superuser). */
function canWriteTransfers(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

const fromLabel = (t: TransferSlip) =>
  sideLabel(t.from_warehouse_name, t.from_warehouse_code, t.from_job_no);
const toLabel = (t: TransferSlip) =>
  sideLabel(t.to_warehouse_name, t.to_warehouse_code, t.to_job_no);

const columns: DataTableColumn<TransferSlip>[] = [
  {
    key: 'number',
    header: 'Transfer No',
    render: (row) => (
      <Text size="sm" fw={600} td={row.status === 'cancelled' ? 'line-through' : undefined}>
        {row.number}
      </Text>
    ),
  },
  { key: 'from', header: 'Kaynak', render: fromLabel },
  { key: 'to', header: 'Hedef', render: toLabel },
  { key: 'lines', header: 'Satır', align: 'right', render: (row) => row.lines.length },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => (
      <Group gap={4} wrap="nowrap">
        <StatusBadge color={row.status === 'posted' ? 'green' : 'grey'}>
          {row.status_label}
        </StatusBadge>
        {row.went_negative ? <StatusBadge color="red">Eksiye düştü</StatusBadge> : null}
      </Group>
    ),
  },
  {
    key: 'created_at',
    header: 'Tarih',
    render: (row) => `${formatDateTime(row.created_at)} · ${row.created_by_name ?? ''}`,
  },
];

// The İş Emri job picker's value for the unassigned bucket.
const UNASSIGNED = '__unassigned__';

interface Side {
  warehouse: WarehouseCode;
  /** İş Emri only: a job number, UNASSIGNED, or null (not picked yet). */
  job: string | null;
}

const jobOf = (side: Side) =>
  side.warehouse !== 'IS_EMRI' ? '' : side.job === UNASSIGNED ? '' : (side.job ?? '');

function SidePicker({
  label,
  side,
  onChange,
  jobOptions,
}: {
  label: string;
  side: Side;
  onChange: (side: Side) => void;
  jobOptions: { value: string; label: string }[];
}) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <SegmentedControl
        value={side.warehouse}
        onChange={(v) => onChange({ warehouse: v as WarehouseCode, job: null })}
        data={WAREHOUSES}
      />
      {side.warehouse === 'IS_EMRI' ? (
        <Select
          aria-label={`${label} iş no`}
          searchable
          limit={100}
          placeholder="İş emri seçin"
          data={jobOptions}
          value={side.job}
          onChange={(job) => onChange({ ...side, job })}
        />
      ) : null}
    </Stack>
  );
}

interface DraftLine {
  key: number;
  code: string | null;
  quantity: string | number;
}

let nextKey = 1;
const emptyLine = (): DraftLine => ({ key: nextKey++, code: null, quantity: '' });

/** What the source holds of one card, under its quantity field. */
function Available({ code, source, quantity }: { code: string; source: Side; quantity: number }) {
  const card = cardFromSearch(code);
  const balances = useQuery({ ...itemBalancesQueryOptions(card?.id ?? 0), enabled: !!card });
  if (!card || !balances.data) return null;
  const job = jobOf(source);
  const row = balances.data.find((b) => b.warehouse_code === source.warehouse && b.job_no === job);
  const available = Number(row?.quantity ?? 0);
  return (
    <Text size="xs" c={quantity > available ? 'red.8' : 'dimmed'}>
      Mevcut: {formatNumber(available, 2)} {card.unit}
    </Text>
  );
}

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

function NewTransferModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const jobOrders = useJobOrderOptions({ includeAll: true });
  const [source, setSource] = useState<Side>({ warehouse: 'HAMMADDE', job: null });
  const [target, setTarget] = useState<Side>({ warehouse: 'IS_EMRI', job: null });
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const create = useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: transferKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
    },
  });
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

  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    for (const [side, name] of [
      [source, 'Kaynak'],
      [target, 'Hedef'],
    ] as const) {
      if (side.warehouse === 'IS_EMRI' && side.job === null) {
        notify.warning(`${name} için iş numarası seçin`);
        return;
      }
    }
    if (source.warehouse === target.warehouse && jobOf(source) === jobOf(target)) {
      notify.warning('Kaynak ve hedef aynı olamaz');
      return;
    }
    const filled = lines.filter((l) => l.code && Number(l.quantity) > 0);
    if (filled.length === 0) {
      notify.warning('En az bir ürün ve miktar girin');
      return;
    }
    const rows = filled.map((l) => ({
      card: cardFromSearch(l.code!),
      quantity: String(l.quantity),
    }));
    if (rows.some((r) => !r.card)) {
      notify.error('Bir satırdaki kart bulunamadı; yeniden seçin');
      return;
    }
    const input: TransferInput = {
      from_warehouse_code: source.warehouse,
      from_job_no: jobOf(source),
      to_warehouse_code: target.warehouse,
      to_job_no: jobOf(target),
      note,
      lines: rows.map((r) => ({ item: r.card!.id, quantity: r.quantity })),
    };
    try {
      let slip: TransferSlip;
      try {
        slip = await create.mutateAsync(input);
      } catch (error) {
        const shortages = transferShortages(error);
        if (!shortages) throw error;
        const ok = await confirm({
          title: 'Kaynakta yeterli stok yok',
          icon: 'fas fa-exclamation-triangle',
          message: 'Bu satırlar kaynakta olandan fazla. Kaydedilirse kaynak eksiye düşer.',
          details: shortageList(shortages),
          confirmLabel: 'Yine de Kaydet',
          cancelLabel: 'Vazgeç',
          danger: true,
        });
        if (!ok) return;
        slip = await create.mutateAsync({ ...input, allow_negative: true });
      }
      notify.success(`${slip.number} işlendi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Transfer kaydedilemedi'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Transfer"
      icon="fas fa-exchange-alt"
      size="xl"
      submitLabel="Kaydet ve İşle"
      submitting={create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        <Group grow align="flex-start">
          <SidePicker label="Kaynak" side={source} onChange={setSource} jobOptions={jobOptions} />
          <SidePicker label="Hedef" side={target} onChange={setTarget} jobOptions={jobOptions} />
        </Group>

        <Table withTableBorder verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ürün</Table.Th>
              <Table.Th w={170}>Miktar</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((line, index) => (
              <Table.Tr key={line.key}>
                <Table.Td>
                  <SelectRemote
                    size="xs"
                    aria-label={`Ürün ${index + 1}`}
                    placeholder="Kod veya ad ile ara…"
                    minSearchLength={2}
                    queryKey={itemKeys.search}
                    search={searchStockCards}
                    comboboxProps={{ width: 560, position: 'bottom-start' }}
                    value={line.code}
                    onChange={(value) => update(line.key, { code: value })}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="xs"
                    min={0}
                    decimalScale={3}
                    hideControls
                    aria-label={`Miktar ${index + 1}`}
                    suffix={line.code ? ` ${cardFromSearch(line.code)?.unit ?? ''}` : undefined}
                    value={line.quantity}
                    onChange={(value) => update(line.key, { quantity: value })}
                  />
                  {line.code && (source.warehouse !== 'IS_EMRI' || source.job !== null) ? (
                    <Available
                      code={line.code}
                      source={source}
                      quantity={Number(line.quantity) || 0}
                    />
                  ) : null}
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Satır ${index + 1} sil`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  >
                    <FaIcon icon="fas fa-times" />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group>
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            Satır Ekle
          </Button>
        </Group>
        <Textarea label="Not" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      </Stack>
    </FormModal>
  );
}

function TransferDetail({ slip, onClose }: { slip: TransferSlip; onClose: () => void }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => cancelTransfer(slip.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: transferKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
    },
  });
  const undo = async () => {
    const ok = await confirm({
      title: 'Transferi Geri Al',
      icon: 'fas fa-undo',
      message: `${slip.number} iptal edilecek ve stok hareketleri ters kayıtla geri alınacak. Devam edilsin mi?`,
      confirmLabel: 'Evet, Geri Al',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync();
      notify.success(`${slip.number} geri alındı`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Transfer geri alınamadı'));
    }
  };
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Depo Transferi - ${slip.number}`}
      icon="fas fa-exchange-alt"
      size="lg"
      sections={[
        {
          title: 'Bilgiler',
          icon: 'fas fa-info-circle',
          content: (
            <Stack gap={4}>
              <Text size="sm">
                <strong>Kaynak:</strong> {fromLabel(slip)} → <strong>Hedef:</strong> {toLabel(slip)}
              </Text>
              <Text size="sm">
                <strong>Kaydeden:</strong> {slip.created_by_name} ·{' '}
                {formatDateTime(slip.created_at)}
              </Text>
              {slip.went_negative ? (
                <Text size="sm" c="red.8">
                  Kaynakta olandan fazla aktarıldı; kaynak eksiye düştü.
                </Text>
              ) : null}
              {slip.cancelled_at ? (
                <Text size="sm" c="red.8">
                  İptal: {slip.cancelled_by_name} · {formatDateTime(slip.cancelled_at)}
                </Text>
              ) : null}
              {slip.note ? <Text size="sm">{slip.note}</Text> : null}
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
                  <Table.Th ta="right">Miktar</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {slip.lines.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td>{l.item_code}</Table.Td>
                    <Table.Td>{l.item_name}</Table.Td>
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
        slip.status === 'posted' && canWriteTransfers() ? (
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

const EMPTY: TransferSlip[] = [];

/** Depo transferi: the transfers, a new one, one transfer's lines. */
export function TransfersPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    ...transfersQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(values.status ? { status: values.status } : {}),
      ...(values.warehouse ? { warehouse: values.warehouse } : {}),
      ...(values.job_no ? { job_no: values.job_no } : {}),
      ...(values.search ? { search: values.search } : {}),
    }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error(countErrorMessage(list.error, 'Transferler yüklenemedi'));
  }, [list.isError, list.error]);

  const rows = list.data?.results ?? EMPTY;
  const openId = Number.parseInt(values.transfer, 10);
  const inList = rows.find((r) => r.id === openId);
  // A link to a transfer that is not on this page of the list.
  const single = useQuery({
    ...transferQueryOptions(openId),
    enabled: Number.isFinite(openId) && list.isSuccess && !inList,
  });
  const open = inList ?? (single.data?.id === openId ? single.data : null);

  return (
    <>
      <PageHeader
        title="Depo Transferi"
        subtitle="Hammadde, İş Emri ve Mamul depoları arasında, işler arasında stok aktarımı"
        icon="exchange-alt"
        backTo="/warehouse"
        actions={
          canWriteTransfers() ? (
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Yeni Transfer
            </Button>
          ) : undefined
        }
      />
      <DataTable
        title="Transferler"
        icon="fas fa-exchange-alt"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              search: values.search,
              warehouse: values.warehouse,
              status: values.status,
              job_no: values.job_no,
            }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ search: '', warehouse: '', status: '', job_no: '', page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        onRowClick={(row) => apply({ transfer: String(row.id) })}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        emptyMessage="Henüz transfer yok"
      />
      {creating ? <NewTransferModal onClose={() => setCreating(false)} /> : null}
      {open ? (
        <TransferDetail key={open.id} slip={open} onClose={() => apply({ transfer: '' })} />
      ) : null}
    </>
  );
}
