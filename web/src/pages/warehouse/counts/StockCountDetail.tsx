import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  cardFromSearch,
  itemCategoriesQueryOptions,
  itemKeys,
  searchStockCards,
} from '@/api/procurement/items';
import {
  cancelStockCount,
  countErrorMessage,
  postStockCount,
  prefillStockCount,
  removeStockCountLines,
  setStockCountLines,
  stockCountLinesQueryOptions,
  stockCountQueryOptions,
  useCountMutation,
  type PrefillInput,
  type StockCountLine,
} from '@/api/warehouse/counts';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FormModal,
  notify,
  PageHeader,
  SelectRemote,
  StatusBadge,
  type DataTableColumn,
} from '@/ui';
import { STATUS_COLOR } from './StockCountsPage';

const PAGE_SIZE = 50;
const EMPTY: StockCountLine[] = [];

/** Who may change counts (the backend checks the same: access_warehouse, staff, superuser). */
export function canWriteCounts(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

function Qty({ value }: { value: string | number | null | undefined }) {
  const n = toNumber(value);
  if (n === null) return <>-</>;
  return (
    <Text span size="sm" fw={500} c={n < 0 ? 'red.8' : n > 0 ? 'green.8' : 'dimmed'}>
      {n > 0 ? '+' : ''}
      {formatNumber(value, 2)}
    </Text>
  );
}

const countedText = (line: StockCountLine) =>
  line.counted_quantity === null ? '' : String(toNumber(line.counted_quantity));

/**
 * The counted quantity of one line; saved on Enter or when the field is left.
 * Keyed on the saved value by its parent, so a fresh value from the server
 * remounts it instead of syncing state in an effect.
 */
function CountedCell({
  line,
  disabled,
  onSave,
}: {
  line: StockCountLine;
  disabled: boolean;
  onSave: (line: StockCountLine, value: string | null) => Promise<void>;
}) {
  const initial = countedText(line);
  const [value, setValue] = useState<string | number>(initial);
  if (disabled) return <>{initial === '' ? '-' : formatNumber(line.counted_quantity, 2)}</>;
  const commit = () => {
    const next = value === '' ? null : String(value);
    if ((next ?? '') === initial) return;
    void onSave(line, next);
  };
  return (
    <NumberInput
      size="xs"
      w={110}
      min={0}
      decimalScale={3}
      hideControls
      aria-label={`Sayılan ${line.item_code}${line.job_no ? ` ${line.job_no}` : ''}`}
      placeholder="Sayılan"
      value={value}
      onChange={setValue}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

function PrefillModal({
  perJob,
  onClose,
  onSubmit,
  submitting,
}: {
  perJob: boolean;
  onClose: () => void;
  onSubmit: (data: PrefillInput) => void;
  submitting: boolean;
}) {
  const categories = useQuery(itemCategoriesQueryOptions());
  const [category, setCategory] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');
  const [jobNo, setJobNo] = useState('');
  const options = useMemo(
    () =>
      (categories.data ?? [])
        .filter((c) => c.material_class === 'normal' || c.material_class === 'review')
        .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
    [categories.data],
  );
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Bakiyelerden Doldur"
      icon="fas fa-fill-drip"
      submitLabel="Doldur"
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          ...(category ? { category_code: category } : {}),
          ...(prefix.trim() ? { code_prefix: prefix.trim() } : {}),
          ...(perJob && jobNo.trim() ? { job_no: jobNo.trim() } : {}),
        });
      }}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Depoda bakiyesi olan her kart için sayılan miktarı boş bir satır eklenir. Boş bırakırsanız
          deponun tamamı gelir.
        </Text>
        <Select
          label="Aile"
          placeholder="Tümü"
          searchable
          clearable
          limit={50}
          data={options}
          value={category}
          onChange={setCategory}
        />
        <TextInput
          label="Kod öneki"
          placeholder="Örn. 0018 0012"
          value={prefix}
          onChange={(e) => setPrefix(e.currentTarget.value)}
        />
        {perJob ? (
          <TextInput
            label="İş No"
            placeholder="Boş: tüm işler"
            value={jobNo}
            onChange={(e) => setJobNo(e.currentTarget.value)}
          />
        ) : null}
      </Stack>
    </FormModal>
  );
}

export interface StockCountDetailProps {
  countId: number;
}

/** One count: its lines, the counted quantities, and posting. */
export function StockCountDetail({ countId }: StockCountDetailProps) {
  const count = useQuery(stockCountQueryOptions(countId));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [uncounted, setUncounted] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [newJob, setNewJob] = useState('');
  const lines = useQuery({
    ...stockCountLinesQueryOptions(countId, {
      page,
      page_size: PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(uncounted ? { uncounted: 'true' as const } : {}),
    }),
    placeholderData: keepPreviousData,
  });

  const setLines = useCountMutation((rows: Parameters<typeof setStockCountLines>[1]) =>
    setStockCountLines(countId, rows),
  );
  const remove = useCountMutation((ids: number[]) => removeStockCountLines(countId, ids));
  const prefill = useCountMutation((data: PrefillInput) => prefillStockCount(countId, data));
  const post = useCountMutation(() => postStockCount(countId), { movesStock: true });
  const cancel = useCountMutation(() => cancelStockCount(countId));

  const c = count.data;
  const perJob = c?.warehouse_code === 'IS_EMRI';
  const editable = c?.status === 'draft' && canWriteCounts();

  const saveCounted = async (line: StockCountLine, value: string | null) => {
    try {
      await setLines.mutateAsync([
        { item: line.item, job_no: line.job_no, counted_quantity: value },
      ]);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Sayılan miktar kaydedilemedi'));
    }
  };

  const addCard = async () => {
    const card = newCode ? cardFromSearch(newCode) : undefined;
    if (!card) return;
    try {
      await setLines.mutateAsync([{ item: card.id, ...(perJob ? { job_no: newJob.trim() } : {}) }]);
      notify.success(`${card.code} sayıma eklendi`);
      setNewCode(null);
      setSearch(card.code);
      setPage(1);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Kart eklenemedi'));
    }
  };

  const doPrefill = async (data: PrefillInput) => {
    try {
      const result = await prefill.mutateAsync(data);
      notify.success(`${result.added} satır eklendi`);
      setPrefilling(false);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Doldurulamadı'));
    }
  };

  const doPost = async () => {
    if (!c) return;
    const ok = await confirm({
      title: 'Sayımı İşle',
      icon: 'fas fa-check-double',
      message: `${c.number}: ${c.line_count} satırın farkı ${c.warehouse_name} stoğuna düzeltme olarak işlenecek. İşlenen sayım değiştirilemez. Devam edilsin mi?`,
      confirmLabel: 'Evet, İşle',
      cancelLabel: 'Vazgeç',
    });
    if (!ok) return;
    try {
      await post.mutateAsync(undefined);
      notify.success(`${c.number} işlendi`);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Sayım işlenemedi'));
    }
  };

  const doCancel = async () => {
    if (!c) return;
    const ok = await confirm({
      title: 'Sayımı İptal Et',
      icon: 'fas fa-ban',
      message: `${c.number} iptal edilecek; stok değişmez. Devam edilsin mi?`,
      confirmLabel: 'Evet, İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(undefined);
      notify.success(`${c.number} iptal edildi`);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Sayım iptal edilemedi'));
    }
  };

  const columns: DataTableColumn<StockCountLine>[] = [
    { key: 'item_code', header: 'Kod' },
    { key: 'item_name', header: 'Ürün Adı' },
    ...(perJob
      ? [
          {
            key: 'job_no',
            header: 'İş No',
            render: (row: StockCountLine) =>
              row.job_no || (
                <Text span size="sm" c="dimmed">
                  atanmamış
                </Text>
              ),
          } satisfies DataTableColumn<StockCountLine>,
        ]
      : []),
    { key: 'item_unit', header: 'Birim' },
    {
      key: 'system_quantity',
      header: c?.status === 'posted' ? 'Sistem (işlenirken)' : 'Sistem',
      align: 'right',
      render: (row) => formatNumber(row.system_quantity, 2),
    },
    {
      key: 'counted_quantity',
      header: 'Sayılan',
      align: 'right',
      render: (row) => (
        <CountedCell
          key={`${row.id}:${countedText(row)}`}
          line={row}
          disabled={!editable}
          onSave={saveCounted}
        />
      ),
    },
    {
      key: 'difference',
      header: 'Fark',
      align: 'right',
      render: (row) => <Qty value={row.difference} />,
    },
    ...(editable
      ? [
          {
            key: 'remove',
            header: '',
            render: (row: StockCountLine) => (
              <Tooltip label="Satırı kaldır" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`${row.item_code} satırını kaldır`}
                  onClick={() => void remove.mutateAsync([row.id])}
                >
                  <FaIcon icon="fas fa-times" />
                </ActionIcon>
              </Tooltip>
            ),
          } satisfies DataTableColumn<StockCountLine>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={c ? `Sayım ${c.number}` : 'Sayım'}
        subtitle={
          c
            ? `${c.warehouse_name} · ${formatDate(c.counted_on)}${c.note ? ` · ${c.note}` : ''}`
            : undefined
        }
        icon="clipboard-check"
        backTo="/warehouse/counts"
        actions={
          editable ? (
            <Group gap="xs">
              <Button
                variant="default"
                leftSection={<FaIcon icon="fas fa-ban" />}
                onClick={() => void doCancel()}
              >
                İptal Et
              </Button>
              <Button
                leftSection={<FaIcon icon="fas fa-check-double" />}
                loading={post.isPending}
                onClick={() => void doPost()}
              >
                Sayımı İşle
              </Button>
            </Group>
          ) : undefined
        }
        stats={
          c
            ? [
                { id: 'count-lines', label: 'Satır', value: String(c.line_count) },
                { id: 'count-counted', label: 'Sayılan', value: String(c.counted_count) },
                ...(c.status === 'posted'
                  ? [{ id: 'count-diff', label: 'Farklı', value: String(c.difference_count) }]
                  : []),
              ]
            : undefined
        }
      />

      <Stack gap="md">
        {c ? (
          <Group gap="xs">
            <StatusBadge color={STATUS_COLOR[c.status] ?? 'grey'}>{c.status_label}</StatusBadge>
            {c.posted_at ? (
              <Text size="sm" c="dimmed">
                {formatDate(c.posted_at)} · {c.posted_by_name}
              </Text>
            ) : null}
          </Group>
        ) : null}

        {editable ? (
          <Paper withBorder p="sm">
            <SimpleGrid cols={{ base: 1, md: perJob ? 3 : 2 }} spacing="sm">
              <SelectRemote
                label="Kart ekle"
                placeholder="Kod veya ad ile ara…"
                minSearchLength={2}
                queryKey={itemKeys.search}
                search={searchStockCards}
                value={newCode}
                onChange={(value) => setNewCode(value)}
              />
              {perJob ? (
                <TextInput
                  label="İş No"
                  placeholder="Boş: atanmamış"
                  value={newJob}
                  onChange={(e) => setNewJob(e.currentTarget.value)}
                />
              ) : null}
              <Group gap="xs" align="flex-end">
                <Button
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-plus" />}
                  disabled={!newCode}
                  loading={setLines.isPending}
                  onClick={() => void addCard()}
                >
                  Ekle
                </Button>
                <Button
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-fill-drip" />}
                  onClick={() => setPrefilling(true)}
                >
                  Bakiyelerden Doldur
                </Button>
              </Group>
            </SimpleGrid>
          </Paper>
        ) : null}

        <DataTable
          title="Sayım Satırları"
          icon="fas fa-list"
          filters={
            <Group gap="sm">
              <TextInput
                placeholder="Kod, ad veya iş no ara…"
                aria-label="Satır ara"
                w={260}
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
              />
              <Checkbox
                label="Sadece sayılmamış"
                checked={uncounted}
                onChange={(e) => {
                  setUncounted(e.currentTarget.checked);
                  setPage(1);
                }}
              />
            </Group>
          }
          data={lines.data?.results ?? EMPTY}
          columns={columns}
          getRowId={(row) => String(row.id)}
          loading={lines.isFetching}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: lines.data?.count ?? 0,
            onPageChange: setPage,
          }}
          emptyMessage={
            editable
              ? 'Satır yok: kart ekleyin ya da bakiyelerden doldurun'
              : 'Bu sayımda satır yok'
          }
        />
      </Stack>

      {prefilling ? (
        <PrefillModal
          perJob={perJob}
          submitting={prefill.isPending}
          onClose={() => setPrefilling(false)}
          onSubmit={(data) => void doPrefill(data)}
        />
      ) : null}
    </>
  );
}
