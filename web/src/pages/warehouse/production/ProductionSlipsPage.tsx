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
  TextInput,
  Textarea,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { cardFromSearch, itemKeys, searchStockCards } from '@/api/procurement/items';
import { stockKeys } from '@/api/procurement/stock';
import { useJobOrderOptions } from '@/api/reference';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  cancelProductionSlip,
  createProductionSlip,
  productionSlipQueryOptions,
  productionSlipsQueryOptions,
  slipKeys,
  type ProductionSlip,
  type SlipKind,
  type SlipWarehouse,
} from '@/api/warehouse/productionSlips';
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
const URL_DEFAULTS = { kind: '', status: '', job_no: '', search: '', fis: '', page: '1' };
type FilterKeys = 'search' | 'kind' | 'status' | 'job_no';

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Fiş no, iş no, kişi, ürün…' },
  {
    type: 'select',
    key: 'kind',
    label: 'Tür',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'issue', label: 'İmalata Çıkış' },
      { value: 'return', label: 'İmalattan İade' },
    ],
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

const WAREHOUSES: { value: SlipWarehouse; label: string }[] = [
  { value: 'IS_EMRI', label: 'İş Emri' },
  { value: 'HAMMADDE', label: 'Hammadde' },
];

/** Who may write slips (the backend checks the same: access_warehouse, staff, superuser). */
function canWriteSlips(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

const kindBadge = (slip: ProductionSlip) => (
  <StatusBadge color={slip.kind === 'issue' ? 'orange' : 'blue'}>{slip.kind_label}</StatusBadge>
);

const columns: DataTableColumn<ProductionSlip>[] = [
  {
    key: 'number',
    header: 'Fiş No',
    render: (row) => (
      <Text size="sm" fw={600} td={row.status === 'cancelled' ? 'line-through' : undefined}>
        {row.number}
      </Text>
    ),
  },
  { key: 'kind', header: 'Tür', render: kindBadge },
  { key: 'job_no', header: 'İş No' },
  { key: 'warehouse_name', header: 'Depo' },
  { key: 'recipient', header: 'Alan / Getiren', render: (row) => row.recipient || '-' },
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

interface DraftLine {
  key: number;
  code: string | null;
  quantity: string | number;
}

let nextKey = 1;
const emptyLine = (): DraftLine => ({ key: nextKey++, code: null, quantity: '' });

function NewSlipModal({ kind, onClose }: { kind: SlipKind; onClose: () => void }) {
  const queryClient = useQueryClient();
  const jobOrders = useJobOrderOptions({ includeAll: kind === 'return' });
  const [warehouse, setWarehouse] = useState<SlipWarehouse>('IS_EMRI');
  const [jobNo, setJobNo] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const create = useMutation({
    mutationFn: createProductionSlip,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: slipKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
    },
  });
  const jobOptions = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data],
  );

  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!jobNo) {
      notify.warning('İş numarası seçin');
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
    try {
      const slip = await create.mutateAsync({
        kind,
        warehouse_code: warehouse,
        job_no: jobNo,
        recipient,
        note,
        lines: rows.map((r) => ({ item: r.card!.id, quantity: r.quantity })),
      });
      notify.success(`${slip.number} işlendi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'Fiş kaydedilemedi'));
    }
  };

  const title = kind === 'issue' ? 'İmalata Çıkış' : 'İmalattan İade';
  return (
    <FormModal
      opened
      onClose={onClose}
      title={title}
      icon={kind === 'issue' ? 'fas fa-dolly' : 'fas fa-undo'}
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
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {kind === 'issue' ? 'Nereden' : 'Nereye'}
            </Text>
            <SegmentedControl
              value={warehouse}
              onChange={(v) => setWarehouse(v as SlipWarehouse)}
              data={WAREHOUSES}
            />
            <Text size="xs" c="dimmed">
              {warehouse === 'IS_EMRI'
                ? kind === 'issue'
                  ? 'Önce işin kendi stoğu, sonra atanmamış stok kullanılır'
                  : 'İş Emri deposuna, bu işin stoğuna döner'
                : kind === 'issue'
                  ? 'Hammadde stoğundan düşer; iş fişte kayıtlı kalır'
                  : 'Hammadde stoğuna döner'}
            </Text>
          </Stack>
          <Select
            label="İş No"
            withAsterisk
            searchable
            limit={100}
            placeholder="İş emri seçin"
            data={jobOptions}
            value={jobNo}
            onChange={setJobNo}
          />
          <TextInput
            label={kind === 'issue' ? 'Alan kişi / ekip' : 'Getiren kişi / ekip'}
            value={recipient}
            onChange={(e) => setRecipient(e.currentTarget.value)}
          />
        </Group>

        <Table withTableBorder verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ürün</Table.Th>
              <Table.Th w={140}>Miktar</Table.Th>
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

function SlipDetail({ slip, onClose }: { slip: ProductionSlip; onClose: () => void }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => cancelProductionSlip(slip.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: slipKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
    },
  });
  const undo = async () => {
    const ok = await confirm({
      title: 'Fişi Geri Al',
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
      notify.error(countErrorMessage(error, 'Fiş geri alınamadı'));
    }
  };
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${slip.kind_label} - ${slip.number}`}
      icon={slip.kind === 'issue' ? 'fas fa-dolly' : 'fas fa-undo'}
      size="lg"
      sections={[
        {
          title: 'Bilgiler',
          icon: 'fas fa-info-circle',
          content: (
            <Stack gap={4}>
              <Text size="sm">
                <strong>İş No:</strong> {slip.job_no} · <strong>Depo:</strong> {slip.warehouse_name}
              </Text>
              <Text size="sm">
                <strong>{slip.kind === 'issue' ? 'Alan' : 'Getiren'}:</strong>{' '}
                {slip.recipient || '-'}
              </Text>
              <Text size="sm">
                <strong>Kaydeden:</strong> {slip.created_by_name} ·{' '}
                {formatDateTime(slip.created_at)}
              </Text>
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
        slip.status === 'posted' && canWriteSlips() ? (
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

const EMPTY: ProductionSlip[] = [];

/** İmalata çıkış / iade: the slips, a new issue or return, one slip's lines. */
export function ProductionSlipsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const [creating, setCreating] = useState<SlipKind | null>(null);
  const list = useQuery({
    ...productionSlipsQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(values.kind ? { kind: values.kind } : {}),
      ...(values.status ? { status: values.status } : {}),
      ...(values.job_no ? { job_no: values.job_no } : {}),
      ...(values.search ? { search: values.search } : {}),
    }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error(countErrorMessage(list.error, 'Fişler yüklenemedi'));
  }, [list.isError, list.error]);

  const rows = list.data?.results ?? EMPTY;
  const openId = Number.parseInt(values.fis, 10);
  const inList = rows.find((r) => r.id === openId);
  // A link to a slip that is not on this page of the list.
  const single = useQuery({
    ...productionSlipQueryOptions(openId),
    enabled: Number.isFinite(openId) && list.isSuccess && !inList,
  });
  const open = inList ?? (single.data?.id === openId ? single.data : null);
  const canWrite = canWriteSlips();

  return (
    <>
      <PageHeader
        title="İmalata Çıkış / İade"
        subtitle="Depo çekme talebi olmadan imalata verilen ve imalattan dönen malzeme"
        icon="dolly"
        backTo="/warehouse"
        actions={
          canWrite ? (
            <Group gap="xs">
              <Button
                variant="default"
                leftSection={<FaIcon icon="fas fa-undo" />}
                onClick={() => setCreating('return')}
              >
                İmalattan İade
              </Button>
              <Button
                leftSection={<FaIcon icon="fas fa-dolly" />}
                onClick={() => setCreating('issue')}
              >
                İmalata Çıkış
              </Button>
            </Group>
          ) : undefined
        }
      />
      <DataTable
        title="Fişler"
        icon="fas fa-dolly"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              search: values.search,
              kind: values.kind,
              status: values.status,
              job_no: values.job_no,
            }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ search: '', kind: '', status: '', job_no: '', page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        onRowClick={(row) => apply({ fis: String(row.id) })}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        emptyMessage="Henüz fiş yok"
      />
      {creating ? <NewSlipModal kind={creating} onClose={() => setCreating(null)} /> : null}
      {open ? <SlipDetail key={open.id} slip={open} onClose={() => apply({ fis: '' })} /> : null}
    </>
  );
}
