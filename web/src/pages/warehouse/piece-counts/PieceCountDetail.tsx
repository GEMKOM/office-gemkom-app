import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  cancelPieceCount,
  pieceCountLinesQueryOptions,
  pieceCountQueryOptions,
  postPieceCount,
  prefillPieceCount,
  removePieceCountLines,
  setPieceCountLines,
  usePieceCountMutation,
  type PieceCountLine,
  type PieceCountLineInput,
} from '@/api/warehouse/pieceCounts';
import {
  missingWeightText,
  pieceCardFromSearch,
  pieceKeys,
  searchPieceCards,
  sizeLabel,
  type PieceKind,
} from '@/api/warehouse/pieces';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDate, formatNumber } from '@/lib/format';
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
import { STATUS_COLOR } from '../counts/StockCountsPage';

const PAGE_SIZE = 50;
const EMPTY: PieceCountLine[] = [];
const mono = { fontFamily: 'var(--gk-font-mono)' };

/** Who may change counts (the backend checks the same: access_warehouse, staff, superuser). */
export function canWritePieceCounts(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

function Diff({ value }: { value: number | null }) {
  if (value === null) return <>-</>;
  return (
    <Text span size="sm" fw={500} c={value < 0 ? 'red.8' : value > 0 ? 'green.8' : 'dimmed'}>
      {value > 0 ? '+' : ''}
      {value}
    </Text>
  );
}

/** The counted pieces of one line; saved on Enter or when the field is left. */
function CountedCell({
  line,
  disabled,
  onSave,
}: {
  line: PieceCountLine;
  disabled: boolean;
  onSave: (line: PieceCountLine, value: number | null) => Promise<void>;
}) {
  const initial = line.counted_quantity === null ? '' : String(line.counted_quantity);
  const [value, setValue] = useState<string | number>(initial);
  if (disabled) return <>{initial === '' ? '-' : initial}</>;
  const commit = () => {
    const next = value === '' ? null : Number(value);
    if (String(next ?? '') === initial) return;
    void onSave(line, next);
  };
  return (
    <NumberInput
      size="xs"
      w={90}
      min={0}
      allowDecimal={false}
      hideControls
      aria-label={`Sayılan ${line.item_code} ${sizeLabel(line)}`}
      placeholder="Adet"
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
  onSubmit: (data: { kind?: PieceKind; job_no?: string; code_prefix?: string }) => void;
  submitting: boolean;
}) {
  const [kind, setKind] = useState<'' | PieceKind>('');
  const [prefix, setPrefix] = useState('');
  const [jobNo, setJobNo] = useState('');
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Sistemdeki Parçalardan Doldur"
      icon="fas fa-fill-drip"
      submitLabel="Doldur"
      submitting={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          ...(kind ? { kind } : {}),
          ...(prefix.trim() ? { code_prefix: prefix.trim() } : {}),
          ...(perJob && jobNo.trim() ? { job_no: jobNo.trim() } : {}),
        });
      }}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Bu depoda sistemin bildiği her parça lotu için adedi boş bir satır eklenir; sayan kişi
          bulduğu adedi girer. Sistemde olmayan parçaları ayrıca ekleyin.
        </Text>
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as '' | PieceKind)}
          data={[
            { value: '', label: 'Hepsi' },
            { value: 'plate', label: 'Sac' },
            { value: 'boy', label: 'Boy' },
          ]}
        />
        <TextInput
          label="Kod öneki"
          placeholder="Örn. 0100 0000 0010"
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

/** Pieces the system did not know: card, size, count (and job in İş Emri). */
function AddLinePanel({
  perJob,
  submitting,
  onAdd,
}: {
  perJob: boolean;
  submitting: boolean;
  onAdd: (line: PieceCountLineInput, code: string) => Promise<boolean>;
}) {
  const [cardId, setCardId] = useState<string | null>(null);
  const [width, setWidth] = useState<string | number>('');
  const [length, setLength] = useState<string | number>('');
  const [quantity, setQuantity] = useState<string | number>('');
  const [jobNo, setJobNo] = useState('');
  const [heat, setHeat] = useState('');
  const card = cardId ? pieceCardFromSearch(cardId) : undefined;

  const add = async () => {
    if (!card) return notify.warning('Stok kartı seçin');
    if (!(Number(length) > 0)) return notify.warning('Boy (mm) girin');
    if (card.kind === 'plate' && !(Number(width) > 0))
      return notify.warning('Sac için en (mm) girin');
    const ok = await onAdd(
      {
        item: card.id,
        width_mm: card.kind === 'plate' ? String(width) : null,
        length_mm: String(length),
        ...(perJob ? { job_no: jobNo.trim() } : {}),
        counted_quantity: quantity === '' ? null : Number(quantity),
        heat_number: heat,
      },
      card.code,
    );
    if (ok) {
      setWidth('');
      setLength('');
      setQuantity('');
      setHeat('');
    }
  };

  return (
    <Paper withBorder p="sm">
      <Text size="sm" fw={600} mb={6}>
        Sistemde olmayan parça ekle
      </Text>
      <SimpleGrid cols={{ base: 1, md: perJob ? 7 : 6 }} spacing="sm">
        <SelectRemote
          label="Stok kartı"
          placeholder="Sac / boy kartı ara…"
          minSearchLength={2}
          queryKey={pieceKeys.cardSearch}
          search={searchPieceCards}
          value={cardId}
          onChange={setCardId}
        />
        <NumberInput
          label="En (mm)"
          min={0}
          decimalScale={1}
          hideControls
          disabled={card?.kind === 'boy'}
          value={width}
          onChange={setWidth}
        />
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
          min={0}
          allowDecimal={false}
          value={quantity}
          onChange={setQuantity}
        />
        {perJob ? (
          <TextInput
            label="İş No"
            placeholder="Boş: atanmamış"
            value={jobNo}
            onChange={(e) => setJobNo(e.currentTarget.value)}
          />
        ) : null}
        <TextInput label="Döküm no" value={heat} onChange={(e) => setHeat(e.currentTarget.value)} />
        <Group align="flex-end">
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-plus" />}
            disabled={!card}
            loading={submitting}
            onClick={() => void add()}
          >
            Ekle
          </Button>
        </Group>
      </SimpleGrid>
      {card?.missing ? (
        <Text size="xs" c="orange.8" mt={4}>
          Bu kartın parçaları ağırlıksız kalır: {card.missing}
        </Text>
      ) : null}
    </Paper>
  );
}

export interface PieceCountDetailProps {
  countId: number;
}

/** One plate / boy count: its lines, the counted pieces, and posting. */
export function PieceCountDetail({ countId }: PieceCountDetailProps) {
  const count = useQuery(pieceCountQueryOptions(countId));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [uncounted, setUncounted] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const lines = useQuery({
    ...pieceCountLinesQueryOptions(countId, {
      page,
      page_size: PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(uncounted ? { uncounted: 'true' as const } : {}),
    }),
    placeholderData: keepPreviousData,
  });

  const setLines = usePieceCountMutation((rows: PieceCountLineInput[]) =>
    setPieceCountLines(countId, rows),
  );
  const remove = usePieceCountMutation((ids: number[]) => removePieceCountLines(countId, ids));
  const prefill = usePieceCountMutation((data: Parameters<typeof prefillPieceCount>[1]) =>
    prefillPieceCount(countId, data),
  );
  const post = usePieceCountMutation(() => postPieceCount(countId), { movesPieces: true });
  const cancel = usePieceCountMutation(() => cancelPieceCount(countId));

  const c = count.data;
  const perJob = c?.warehouse_code === 'IS_EMRI';
  const editable = c?.status === 'draft' && canWritePieceCounts();

  const saveCounted = async (line: PieceCountLine, value: number | null) => {
    try {
      await setLines.mutateAsync([{ id: line.id, counted_quantity: value }]);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Sayılan adet kaydedilemedi'));
    }
  };

  const addLine = async (line: PieceCountLineInput, code: string) => {
    try {
      await setLines.mutateAsync([line]);
      notify.success(`${code} sayıma eklendi`);
      return true;
    } catch (error) {
      notify.error(countErrorMessage(error, 'Satır eklenemedi'));
      return false;
    }
  };

  const doPrefill = async (data: Parameters<typeof prefillPieceCount>[1]) => {
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
      message: `${c.number}: sayılan lotlar düzeltilecek, sistemde olmayan parçalar yeni lot olarak ${c.warehouse_name} stoğuna açılacak. İşlenen sayım değiştirilemez. Devam edilsin mi?`,
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

  const columns: DataTableColumn<PieceCountLine>[] = [
    {
      key: 'card',
      header: 'Stok Kartı',
      render: (row) => (
        <Stack gap={0}>
          <Text size="sm" fw={600} style={mono}>
            {row.item_code}
          </Text>
          <Text size="xs" c="dimmed">
            {row.item_name}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'size',
      header: 'Ölçü',
      render: (row) => (
        <Group gap={6} wrap="nowrap">
          <span style={mono}>{sizeLabel(row)}</span>
          {row.piece === null ? <StatusBadge color="blue">Yeni</StatusBadge> : null}
        </Group>
      ),
    },
    ...(perJob
      ? [
          {
            key: 'job_no',
            header: 'İş No',
            render: (row: PieceCountLine) =>
              row.job_no || (
                <Text span size="sm" c="dimmed">
                  atanmamış
                </Text>
              ),
          } satisfies DataTableColumn<PieceCountLine>,
        ]
      : []),
    {
      key: 'system_quantity',
      header: c?.status === 'posted' ? 'Sistem (işlenirken)' : 'Sistem',
      align: 'right',
      render: (row) => row.system_quantity,
    },
    {
      key: 'counted_quantity',
      header: 'Sayılan',
      align: 'right',
      render: (row) => (
        <CountedCell
          key={`${row.id}:${row.counted_quantity ?? ''}`}
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
      render: (row) => <Diff value={row.difference} />,
    },
    {
      key: 'kg',
      header: 'Ağırlık',
      align: 'right',
      render: (row) =>
        row.unit_kg === null ? (
          <Tooltip label={missingWeightText(row.kind)} withArrow>
            <span>
              <StatusBadge color="orange">Ağırlık yok</StatusBadge>
            </span>
          </Tooltip>
        ) : row.counted_kg !== null ? (
          `${formatNumber(row.counted_kg, 2)} kg`
        ) : (
          '-'
        ),
    },
    { key: 'heat', header: 'Döküm No', render: (row) => row.heat_number || '-' },
    ...(editable
      ? [
          {
            key: 'remove',
            header: '',
            render: (row: PieceCountLine) => (
              <Tooltip label="Satırı kaldır" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`${row.item_code} ${sizeLabel(row)} satırını kaldır`}
                  onClick={() => void remove.mutateAsync([row.id])}
                >
                  <FaIcon icon="fas fa-times" />
                </ActionIcon>
              </Tooltip>
            ),
          } satisfies DataTableColumn<PieceCountLine>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={c ? `Sac ve Boy Sayımı ${c.number}` : 'Sac ve Boy Sayımı'}
        subtitle={
          c
            ? `${c.warehouse_name} · ${formatDate(c.counted_on)}${c.note ? ` · ${c.note}` : ''}`
            : undefined
        }
        icon="ruler-combined"
        backTo="/warehouse/piece-counts"
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
                { id: 'count-counted', label: 'Sayılan satır', value: String(c.counted_count) },
                { id: 'count-pieces', label: 'Sayılan adet', value: String(c.counted_pieces ?? 0) },
                {
                  id: 'count-kg',
                  label: c.totals?.pieces_without_weight
                    ? `Ağırlık (${c.totals.pieces_without_weight} parça hariç)`
                    : 'Ağırlık',
                  value: c.totals ? `${formatNumber(c.totals.kg, 2)} kg` : '-',
                },
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
          <>
            <Group>
              <Button
                variant="default"
                leftSection={<FaIcon icon="fas fa-fill-drip" />}
                onClick={() => setPrefilling(true)}
              >
                Sistemdeki Parçalardan Doldur
              </Button>
            </Group>
            <AddLinePanel perJob={perJob} submitting={setLines.isPending} onAdd={addLine} />
          </>
        ) : null}

        <DataTable
          title="Sayım Satırları"
          icon="fas fa-list"
          filters={
            <Group gap="sm">
              <TextInput
                placeholder="Kod, ad, iş no, döküm no…"
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
              ? 'Satır yok: sistemdeki parçalardan doldurun ya da parça ekleyin'
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
