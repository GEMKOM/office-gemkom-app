import { Button, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WAREHOUSE_LABELS, type WarehouseCode } from '@/api/procurement/stock';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  createPieceCount,
  pieceCountsQueryOptions,
  usePieceCountMutation,
  type PieceCount,
} from '@/api/warehouse/pieceCounts';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  DataTable,
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
import { STATUS_COLOR } from '../counts/StockCountsPage';
import { canWritePieceCounts, PieceCountDetail } from './PieceCountDetail';

const PAGE_SIZE = 20;
const URL_DEFAULTS = { status: '', warehouse__code: '', sayim: '', page: '1' };
type FilterKeys = 'status' | 'warehouse__code';

const WAREHOUSE_OPTIONS = (Object.keys(WAREHOUSE_LABELS) as WarehouseCode[]).map((code) => ({
  value: code,
  label: WAREHOUSE_LABELS[code],
}));

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'draft', label: 'Taslak' },
      { value: 'posted', label: 'İşlendi' },
      { value: 'cancelled', label: 'İptal Edildi' },
    ],
  },
  {
    type: 'select',
    key: 'warehouse__code',
    label: 'Depo',
    placeholder: 'Tümü',
    searchable: false,
    options: WAREHOUSE_OPTIONS,
  },
];

const columns: DataTableColumn<PieceCount>[] = [
  {
    key: 'number',
    header: 'Sayım No',
    render: (row) => (
      <Text size="sm" fw={600}>
        {row.number}
      </Text>
    ),
  },
  { key: 'warehouse_name', header: 'Depo' },
  { key: 'counted_on', header: 'Sayım Tarihi', render: (row) => formatDate(row.counted_on) },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => (
      <StatusBadge color={STATUS_COLOR[row.status] ?? 'grey'}>{row.status_label}</StatusBadge>
    ),
  },
  { key: 'line_count', header: 'Satır', align: 'right' },
  {
    key: 'counted_pieces',
    header: 'Sayılan Adet',
    align: 'right',
    render: (row) => row.counted_pieces ?? 0,
  },
  { key: 'difference_count', header: 'Farklı', align: 'right' },
  { key: 'created_by_name', header: 'Oluşturan', render: (row) => row.created_by_name || '-' },
  {
    key: 'posted_at',
    header: 'İşlenme',
    render: (row) =>
      row.posted_at ? `${formatDateTime(row.posted_at)} · ${row.posted_by_name ?? ''}` : '-',
  },
];

const EMPTY: PieceCount[] = [];

function NewCountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (count: PieceCount) => void;
}) {
  const [warehouse, setWarehouse] = useState<WarehouseCode | null>('HAMMADDE');
  const [countedOn, setCountedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const create = usePieceCountMutation(createPieceCount);

  const save = async () => {
    if (!warehouse) return;
    try {
      const count = await create.mutateAsync({
        warehouse_code: warehouse,
        counted_on: countedOn,
        note,
      });
      notify.success(`${count.number} oluşturuldu`);
      onCreated(count);
    } catch (error) {
      notify.error(countErrorMessage(error, 'Sayım oluşturulamadı'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Sac ve Boy Sayımı"
      icon="fas fa-ruler-combined"
      submitLabel="Oluştur"
      submitting={create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="sm">
        <Select
          label="Depo"
          withAsterisk
          allowDeselect={false}
          data={WAREHOUSE_OPTIONS}
          value={warehouse}
          onChange={(value) => setWarehouse(value as WarehouseCode | null)}
          description="İş Emri sayımında her satır kendi iş numarasıyla sayılır"
        />
        <TextInput
          type="date"
          label="Sayım Tarihi"
          value={countedOn}
          onChange={(e) => setCountedOn(e.currentTarget.value)}
        />
        <Textarea label="Not" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      </Stack>
    </FormModal>
  );
}

/** Sac ve boy sayımı: the counts, and one count's lines when one is opened (?sayim=). */
export function PieceCountsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    ...pieceCountsQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(values.status ? { status: values.status } : {}),
      ...(values.warehouse__code ? { warehouse__code: values.warehouse__code } : {}),
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (list.isError) notify.error(countErrorMessage(list.error, 'Sayımlar yüklenemedi'));
  }, [list.isError, list.error]);

  const openId = Number.parseInt(values.sayim, 10);
  if (openId > 0) {
    return <PieceCountDetail key={openId} countId={openId} />;
  }

  return (
    <>
      <PageHeader
        title="Sac ve Boy Sayımı"
        subtitle="Sac, profil, boru ve çubuk parçalarının sayımı; ilk sayım açılış stoğu olur"
        icon="ruler-combined"
        backTo="/warehouse"
        actions={
          canWritePieceCounts() ? (
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Yeni Sayım
            </Button>
          ) : undefined
        }
      />
      <DataTable
        title="Sayımlar"
        icon="fas fa-ruler-combined"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ status: values.status, warehouse__code: values.warehouse__code }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ status: '', warehouse__code: '', page: '1' })}
          />
        }
        data={list.data?.results ?? EMPTY}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        onRowClick={(row) => apply({ sayim: String(row.id) })}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        emptyMessage="Henüz sac / boy sayımı yok"
      />
      {creating ? (
        <NewCountModal
          onClose={() => setCreating(false)}
          onCreated={(count) => {
            setCreating(false);
            apply({ sayim: String(count.id) });
          }}
        />
      ) : null}
    </>
  );
}
