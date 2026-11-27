import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { pullRequestKeys } from '@/api/materialTracking/pullRequests';
import { stockKeys } from '@/api/procurement/stock';
import { useJobOrderOptions } from '@/api/reference';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  cancelProductionSlip,
  createProductionSlip,
  productionSlipQueryOptions,
  productionSlipsQueryOptions,
  returnableLinesQueryOptions,
  slipKeys,
  type ProductionSlip,
  type ProductionSlipInput,
  type ReturnableLine,
} from '@/api/warehouse/productionSlips';
import { hasPerm, isAdmin } from '@/auth/authService';
import {
  BAR_METRES_INPUT,
  barMetres,
  formatDateTime,
  formatNumber,
  metresToMm,
  mmToMetres,
} from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const PAGE_SIZE = 20;
const URL_DEFAULTS = {
  kind: '',
  status: '',
  job_no: '',
  search: '',
  fis: '',
  page: '1',
  page_size: '20',
};
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
  { key: 'recipient', header: 'Getiren / Alan', render: (row) => row.recipient || '-' },
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

/** A quantity without trailing zeros: "5", "8,5". */
const qty = (value: string | number) => formatNumber(value, { maximumFractionDigits: 3 });

/** "6 m × 2 boy · 2,5 m × 1 boy" (bars read in metres, never mm). */
export function barsText(bars: { length_mm: string | number | null; quantity: number }[]): string {
  return bars.map((b) => `${barMetres(b.length_mm ?? 0)} × ${b.quantity} boy`).join(' · ');
}

interface BarDraft {
  key: number;
  /** In metres, as typed ("2,5"); sent in mm. */
  length: string | number;
  count: string | number;
}

interface LineDraft {
  quantity: string | number;
  bars: BarDraft[];
}

let nextKey = 1;

/** A bar line handed over as picked bars comes back as bars (length × count). */
const takesBars = (line: ReturnableLine) => line.is_bar && line.pieces.length > 0;

function emptyDraft(line: ReturnableLine): LineDraft {
  return {
    quantity: '',
    bars: [{ key: nextKey++, length: mmToMetres(line.pieces[0]?.length_mm) || '', count: '' }],
  };
}

const filledBars = (draft: LineDraft | undefined) =>
  (draft?.bars ?? []).filter((b) => Number(metresToMm(b.length)) > 0 && Number(b.count) > 0);

/** What the bars come to in the card's unit, when that is plain (metre / adet). */
function barsAmount(line: ReturnableLine, bars: BarDraft[]): string {
  if (bars.length === 0) return '';
  if (line.item_unit === 'metre') {
    const metres =
      bars.reduce((t, b) => t + Number(metresToMm(b.length)) * Number(b.count), 0) / 1000;
    return `${qty(metres)} m`;
  }
  if (line.item_unit === 'adet') {
    return `${bars.reduce((t, b) => t + Number(b.count), 0)} adet`;
  }
  return '';
}

function BarsInput({
  line,
  draft,
  onChange,
}: {
  line: ReturnableLine;
  draft: LineDraft;
  onChange: (bars: BarDraft[]) => void;
}) {
  const set = (key: number, patch: Partial<BarDraft>) =>
    onChange(draft.bars.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const amount = barsAmount(line, filledBars(draft));
  return (
    <Stack gap={4}>
      {draft.bars.map((bar, index) => (
        <Group key={bar.key} gap={4} wrap="nowrap">
          <NumberInput
            size="xs"
            w={100}
            {...BAR_METRES_INPUT}
            suffix=" m"
            aria-label={`${line.item_code} boy ${index + 1} uzunluk`}
            value={bar.length}
            onChange={(value) => set(bar.key, { length: value })}
          />
          <Text size="xs">×</Text>
          <NumberInput
            size="xs"
            w={80}
            min={0}
            allowDecimal={false}
            hideControls
            suffix=" boy"
            aria-label={`${line.item_code} boy ${index + 1} adet`}
            value={bar.count}
            onChange={(value) => set(bar.key, { count: value })}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            aria-label={`${line.item_code} boy ${index + 1} sil`}
            disabled={draft.bars.length === 1}
            onClick={() => onChange(draft.bars.filter((b) => b.key !== bar.key))}
          >
            <FaIcon icon="fas fa-times" />
          </ActionIcon>
        </Group>
      ))}
      <Group gap="xs">
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => onChange([...draft.bars, { key: nextKey++, length: '', count: '' }])}
        >
          Başka boy
        </Button>
        {amount ? (
          <Text size="xs" c="dimmed">
            = {amount}
          </Text>
        ) : null}
      </Group>
    </Stack>
  );
}

function NewReturnModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const jobOrders = useJobOrderOptions({ includeAll: true });
  const [jobNo, setJobNo] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
  const returnable = useQuery({
    ...returnableLinesQueryOptions(jobNo ?? ''),
    enabled: Boolean(jobNo),
  });
  const create = useMutation({
    mutationFn: createProductionSlip,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: slipKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
      void queryClient.invalidateQueries({ queryKey: pullRequestKeys.all });
    },
  });
  const jobOptions = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data],
  );
  const lines = returnable.data ?? EMPTY_LINES;
  const draftOf = (line: ReturnableLine) => drafts[line.id] ?? emptyDraft(line);
  const update = (line: ReturnableLine, patch: Partial<LineDraft>) =>
    setDrafts((prev) => ({
      ...prev,
      [line.id]: { ...(prev[line.id] ?? emptyDraft(line)), ...patch },
    }));

  const save = async () => {
    if (!jobNo) {
      notify.warning('İş numarası seçin');
      return;
    }
    const payload: ProductionSlipInput['lines'] = [];
    for (const line of lines) {
      const draft = drafts[line.id];
      if (takesBars(line)) {
        const bars = filledBars(draft);
        if (bars.length > 0) {
          payload.push({
            pull_item: line.id,
            pieces: bars.map((b) => ({
              length_mm: String(metresToMm(b.length)),
              quantity: Number(b.count),
            })),
          });
        }
      } else if (Number(draft?.quantity) > 0) {
        payload.push({ pull_item: line.id, quantity: String(draft!.quantity) });
      }
    }
    if (payload.length === 0) {
      notify.warning('En az bir satıra iade miktarı girin');
      return;
    }
    try {
      const slip = await create.mutateAsync({ job_no: jobNo, recipient, note, lines: payload });
      notify.success(`${slip.number} işlendi`);
      onClose();
    } catch (error) {
      notify.error(countErrorMessage(error, 'İade kaydedilemedi'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="İmalattan İade"
      icon="fas fa-undo"
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
          <Select
            label="İş No"
            withAsterisk
            searchable
            limit={100}
            placeholder="İş emri seçin"
            data={jobOptions}
            value={jobNo}
            onChange={(value) => {
              setJobNo(value);
              setDrafts({});
            }}
          />
          <TextInput
            label="Getiren kişi / ekip"
            value={recipient}
            onChange={(e) => setRecipient(e.currentTarget.value)}
          />
        </Group>
        <Text size="xs" c="dimmed">
          Bu işe teslim edilmiş imalata çıkış talebi satırlarından iade edilir. Dönen malzeme İş
          Emri deposunda işin stoğuna girer ve yeniden imalata çıkış talebine alınabilir.
        </Text>

        {!jobNo ? null : returnable.isLoading ? (
          <Text size="sm" c="dimmed">
            Yükleniyor…
          </Text>
        ) : lines.length === 0 ? (
          <Text size="sm" c="dimmed" data-testid="no-returnable">
            Bu işte teslim edilmiş imalata çıkış talebi yok.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table withTableBorder verticalSpacing={4} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Talep</Table.Th>
                  <Table.Th>Ürün</Table.Th>
                  <Table.Th ta="right">Teslim Edilen</Table.Th>
                  <Table.Th ta="right">İade Edilen</Table.Th>
                  <Table.Th w={250}>İade</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lines.map((line) => {
                  const left = Number(line.returnable_quantity);
                  const draft = draftOf(line);
                  return (
                    <Table.Tr key={line.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {line.pull_request_number}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {line.destination_name} · {formatDateTime(line.transferred_at)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" className={uiClasses.code}>
                          {line.item_code}
                        </Text>
                        <Text size="sm">{line.item_name}</Text>
                        {line.pieces.length > 0 ? (
                          <Text size="xs" c="dimmed">
                            {barsText(line.pieces)}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td ta="right">
                        {qty(line.quantity)} {line.item_unit}
                      </Table.Td>
                      <Table.Td ta="right">
                        {Number(line.returned_quantity) > 0
                          ? `${qty(line.returned_quantity)} ${line.item_unit}`
                          : '-'}
                      </Table.Td>
                      <Table.Td>
                        {left <= 0 ? (
                          <Text size="xs" c="dimmed">
                            Tamamı iade edildi
                          </Text>
                        ) : takesBars(line) ? (
                          <BarsInput
                            line={line}
                            draft={draft}
                            onChange={(bars) => update(line, { bars })}
                          />
                        ) : (
                          <NumberInput
                            size="xs"
                            min={0}
                            max={left}
                            decimalScale={3}
                            hideControls
                            aria-label={`${line.item_code} iade miktarı`}
                            suffix={` ${line.item_unit}`}
                            description={`En fazla ${qty(left)} ${line.item_unit}`}
                            value={draft.quantity}
                            onChange={(value) => update(line, { quantity: value })}
                          />
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
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
                  {slip.kind === 'return' ? <Table.Th>Talep</Table.Th> : null}
                  <Table.Th ta="right">Miktar</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {slip.lines.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td>{l.item_code}</Table.Td>
                    <Table.Td>
                      {l.item_name}
                      {l.pieces?.length ? (
                        <Text size="xs" c="dimmed" data-testid="returned-bars">
                          {barsText(l.pieces)}
                        </Text>
                      ) : null}
                    </Table.Td>
                    {slip.kind === 'return' ? (
                      <Table.Td>{l.pull_request_number || '-'}</Table.Td>
                    ) : null}
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
const EMPTY_LINES: ReturnableLine[] = [];

/** İmalattan İade: the slips (old direct issues included), a new return, one slip's lines. */
export function ProductionSlipsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(values.page_size, 10) || PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    ...productionSlipsQueryOptions({
      page,
      page_size: pageSize,
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
        title="İmalattan İade"
        subtitle="İmalata çıkış talebiyle teslim edilen malzemenin imalattan dönüşü. İmalata çıkış artık yalnız İmalata Çıkış Talepleri ile yapılır."
        icon="undo"
        backTo="/warehouse"
        actions={
          canWrite ? (
            <Button leftSection={<FaIcon icon="fas fa-undo" />} onClick={() => setCreating(true)}>
              İmalattan İade
            </Button>
          ) : undefined
        }
      />
      <DataTable
        columnsKey="production-slips"
        title="Fişler"
        icon="fas fa-undo"
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
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        emptyMessage="Henüz fiş yok"
      />
      {creating ? <NewReturnModal onClose={() => setCreating(false)} /> : null}
      {open ? <SlipDetail key={open.id} slip={open} onClose={() => apply({ fis: '' })} /> : null}
    </>
  );
}
