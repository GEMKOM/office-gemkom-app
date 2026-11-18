import { Button, Table, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  cncPartsSearchQueryOptions,
  type CncPartSearchRow,
  type CncPartsSearchParams,
} from '@/api/manufacturing/cncParts';
import { formatDateTime } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { exportPartsSearch } from './exportPartsSearch';
import { plateSource, plateSourceText } from './plateSource';

const URL_DEFAULTS = {
  job_no: '',
  image_no: '',
  position_no: '',
  thickness_mm: '',
  plate: '',
  plate_source: '',
  page: '1',
  page_size: '20',
};

type FilterKeys = 'job_no' | 'image_no' | 'position_no' | 'thickness_mm' | 'plate' | 'plate_source';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş No',
    placeholder: 'İş numarası...',
    suggestions: 'jobOrders',
  },
  { type: 'text', key: 'image_no', label: 'Resim No', placeholder: 'Resim numarası...' },
  { type: 'text', key: 'position_no', label: 'Pozisyon No', placeholder: 'Pozisyon numarası...' },
  // The plate the cut used.
  {
    type: 'text',
    key: 'thickness_mm',
    label: 'Sac Kalınlığı (mm)',
    inputType: 'number',
    placeholder: 'Örn. 20',
  },
  {
    type: 'text',
    key: 'plate',
    label: 'Sac / Malzeme',
    placeholder: 'Kalite, stok kodu veya ölçü (ST44, P355GH...)',
  },
  {
    type: 'select',
    key: 'plate_source',
    label: 'Plaka Kaynağı',
    options: [
      { value: 'request', label: 'Talep edilen sac' },
      { value: 'piece', label: 'Stok sac' },
      { value: 'remnant', label: 'Fire plaka' },
      { value: 'none', label: 'Kaynak belirtilmemiş' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = {
  job_no: '',
  image_no: '',
  position_no: '',
  thickness_mm: '',
  plate: '',
  plate_source: '',
};
const EMPTY_ROWS: CncPartSearchRow[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/** "12.345 kg" with three decimals, as legacy formatWeight. */
export function formatWeight(weight: unknown): string {
  if (!weight) return '-';
  return `${toNumber(weight, 0).toFixed(3)} kg`;
}

/** Weight × quantity over the shown rows (quantity defaults to 1). */
export function totalWeight(rows: readonly CncPartSearchRow[]): number {
  return rows.reduce((sum, row) => {
    const quantity = toNumber(row.quantity, 1);
    return sum + toNumber(row.weight_kg, 0) * (quantity > 0 ? Math.trunc(quantity) : 1);
  }, 0);
}

const dateCell = (value: unknown) => (value ? formatDateTime(value as string | number) : '-');

function PlateSourceCell({ row }: { row: CncPartSearchRow }) {
  const source = plateSource(row);
  if (!source.badge) return <>{source.name}</>;
  return (
    <Tooltip label={source.tooltip} disabled={!source.tooltip}>
      <div>
        {source.name ? <div>{source.name}</div> : null}
        <StatusBadge color={source.badge.color}>{source.badge.label}</StatusBadge>
      </div>
    </Tooltip>
  );
}

const columns: DataTableColumn<CncPartSearchRow>[] = [
  { key: 'id', header: 'ID', width: 60 },
  { key: 'job_no', header: 'İş No' },
  { key: 'image_no', header: 'Resim No' },
  { key: 'position_no', header: 'Pozisyon No' },
  {
    key: 'weight_kg',
    header: 'Ağırlık',
    accessor: (row) => toNumber(row.weight_kg, 0),
    render: (row) => formatWeight(row.weight_kg),
  },
  { key: 'quantity', header: 'Adet', accessor: (row) => toNumber(row.quantity, 0) },
  { key: 'nesting_id', header: 'Nesting ID' },
  {
    key: 'plate_item_name',
    header: 'Plaka Kaynağı',
    sortable: false,
    accessor: plateSourceText,
    render: (row) => <PlateSourceCell row={row} />,
  },
  {
    key: 'planned_start_ms',
    header: 'Planlanan Başlangıç',
    render: (row) => dateCell(row.planned_start_ms),
  },
  {
    key: 'planned_end_ms',
    header: 'Planlanan Bitiş',
    render: (row) => dateCell(row.planned_end_ms),
  },
  {
    key: 'completion_date',
    header: 'Tamamlanma Tarihi',
    accessor: (row) => (row.completion_date ? new Date(row.completion_date).getTime() : null),
    render: (row) => dateCell(row.completion_date),
  },
];

const WEIGHT_INDEX = columns.findIndex((c) => c.key === 'weight_kg');

/** Port of manufacturing/cnc-cutting/reports/parts-search (partsSearch.js). */
export function PartsSearchPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      job_no: values.job_no,
      image_no: values.image_no,
      position_no: values.position_no,
      thickness_mm: values.thickness_mm,
      plate: values.plate,
      plate_source: values.plate_source,
    }),
    [
      values.job_no,
      values.image_no,
      values.position_no,
      values.thickness_mm,
      values.plate,
      values.plate_source,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);

  const params: CncPartsSearchParams = {
    ...filters,
    plate_source: filters.plate_source as CncPartsSearchParams['plate_source'],
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...cncPartsSearchQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.isError ? EMPTY_ROWS : (list.data?.results ?? EMPTY_ROWS);
  const total = list.isError ? 0 : (list.data?.count ?? 0);
  const hasFilters = Object.values(filters).some((v) => v.trim() !== '');

  const emptyMessage = list.isError
    ? 'Veri yüklenirken bir hata oluştu. Lütfen tekrar deneyin.'
    : hasFilters
      ? 'Arama kriterlerine uygun sonuç bulunamadı.'
      : 'Kayıt bulunamadı.';

  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    // Legacy exports the rows on screen.
    if (rows.length === 0) {
      notify.warning('İndirilecek veri bulunamadı.');
      return;
    }
    setExporting(true);
    try {
      await exportPartsSearch(rows);
    } catch (error) {
      console.error('Error exporting data:', error);
      notify.error('Veri dışa aktarılırken bir hata oluştu.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="CNC Parça Arama"
        subtitle="İş No, Resim No, Pozisyon No veya kullanılan sac ile CNC parçalarını arayın"
        backTo="/planning/cnc-cutting/reports/"
      />

      <DataTable
        title="CNC Parça Arama Sonuçları"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        // Legacy sorts the loaded page in the browser.
        sortable
        striped
        withColumnBorders
        rowStyle={(row) =>
          row.completion_date ? { backgroundColor: 'var(--mantine-color-green-0)' } : undefined
        }
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        emptyMessage={emptyMessage}
        onRefresh={() => void list.refetch()}
        footer={({ rows: shown }) => (
          <Table.Tr>
            <Table.Td colSpan={Math.max(1, WEIGHT_INDEX)} ta="right" fw={600}>
              Toplam
            </Table.Td>
            <Table.Td fw={600}>
              <Text span fw={600} size="sm" data-testid="parts-total-weight">
                {formatWeight(totalWeight(shown))}
              </Text>
            </Table.Td>
            <Table.Td colSpan={columns.length - WEIGHT_INDEX - 1} />
          </Table.Tr>
        )}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void runExport()}
            loading={exporting}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dışa Aktar
          </Button>
        }
      />
    </>
  );
}
