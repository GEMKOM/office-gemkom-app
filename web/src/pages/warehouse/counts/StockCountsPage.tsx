import { Button, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WAREHOUSE_LABELS, type WarehouseCode } from '@/api/procurement/stock';
import {
  countErrorMessage,
  createStockCount,
  stockCountsQueryOptions,
  useCountMutation,
  type StockCount,
} from '@/api/warehouse/counts';
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
  type StatusFamily,
} from '@/ui';
import { StockCountDetail } from './StockCountDetail';

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

export const STATUS_COLOR: Record<string, StatusFamily> = {
  draft: 'yellow',
  posted: 'green',
  cancelled: 'grey',
};

const columns: DataTableColumn<StockCount>[] = [
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
  { key: 'counted_count', header: 'Sayılan', align: 'right' },
  { key: 'difference_count', header: 'Farklı', align: 'right' },
  { key: 'created_by_name', header: 'Oluşturan', render: (row) => row.created_by_name || '-' },
  {
    key: 'posted_at',
    header: 'İşlenme',
    render: (row) =>
      row.posted_at ? `${formatDateTime(row.posted_at)} · ${row.posted_by_name ?? ''}` : '-',
  },
];

const EMPTY: StockCount[] = [];

function NewCountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (count: StockCount) => void;
}) {
  const [warehouse, setWarehouse] = useState<WarehouseCode | null>('HAMMADDE');
  const [countedOn, setCountedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const create = useCountMutation(createStockCount);

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
      title="Yeni Sayım"
      icon="fas fa-clipboard-check"
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

/** Sayım: the stock counts, and one count's lines when one is opened (?sayim=). */
export function StockCountsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    ...stockCountsQueryOptions({
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
    return <StockCountDetail key={openId} countId={openId} />;
  }

  return (
    <>
      <PageHeader
        title="Sayım"
        subtitle="Depo sayımları; işlenen sayım farkları stoğa düzeltme olarak yansır"
        icon="clipboard-check"
        backTo="/warehouse"
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Sayım
          </Button>
        }
      />
      <DataTable
        title="Sayımlar"
        icon="fas fa-clipboard-check"
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
        emptyMessage="Henüz sayım yok"
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
