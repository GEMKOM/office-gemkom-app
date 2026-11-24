import { Anchor, Stack, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { countErrorMessage } from '@/api/warehouse/counts';
import {
  dimsLabel,
  shapeLabel,
  USED_REASON_LABELS,
  usedPlatesQueryOptions,
  type UsedPlate,
  type UsedPlatesParams,
  type UsedReason,
} from '@/api/warehouse/pieces';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  DataTable,
  FilterBar,
  notify,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';

// Sac Stoğu › Kullanılan Saclar: every plate sheet that left stock, newest first:
// cut by a CNC job (the cut's jobs carry its cost) or scrapped (Hurdaya Ayır). A
// row opens the sheet's lot, whose Hareketler show the cut. Sheets zeroed by the
// old-records update or a count are not "used" and are not listed.

const PAGE_SIZE = 50;
/** Its own URL keys; search and job_no are the page's, so they carry over between views. */
export const USED_URL_DEFAULTS = {
  search: '',
  job_no: '',
  used_date: { start: '', end: '' },
  used_reason: '',
  item: '',
  page: '1',
  page_size: String(PAGE_SIZE),
};
type UsedFilterKeys = 'used_date' | 'search' | 'job_no' | 'used_reason';

export const USED_SEARCH_PLACEHOLDER = 'Sac kodu, stok kartı, ölçü, döküm no, CNC-…';

const USED_FILTERS: FilterConfig<UsedFilterKeys>[] = [
  { type: 'dateRange', key: 'used_date', label: 'Tarih' },
  { type: 'text', key: 'search', label: 'Arama', placeholder: USED_SEARCH_PLACEHOLDER },
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'Örn. 254-01' },
  {
    type: 'select',
    key: 'used_reason',
    label: 'Neden',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'cut', label: 'Kesim' },
      { value: 'scrap', label: 'Hurda' },
    ],
  },
];

const mono = { fontFamily: 'var(--gk-font-mono)' };

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function kg(value: string | null): string {
  return value === null ? '–' : `${formatNumber(value, 2)} kg`;
}

/** The cut's key, opening it under Planlama › CNC Kesim › Kesimler in a new tab. */
function CutLink({ cut }: { cut: string }) {
  return (
    <Anchor
      href={`/planning/cnc-cutting/cuts?cut=${encodeURIComponent(cut)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={uiClasses.code}
      title="Kesimi yeni sekmede aç"
      onClick={(event) => event.stopPropagation()}
    >
      {cut}
    </Anchor>
  );
}

const REASON_COLORS: Record<UsedReason, 'blue' | 'red'> = { cut: 'blue', scrap: 'red' };

function SheetCell({ row }: { row: UsedPlate }): ReactNode {
  if (row.piece_code) {
    return (
      <Text size="sm" fw={600} style={mono}>
        {row.piece_code}
      </Text>
    );
  }
  // An old lot of several sheets before codes: the sheet used had no code of its own.
  return (
    <Tooltip label="Kodlar verilmeden önceki bir lottan alınan sac" withArrow>
      <Text size="sm" c="dimmed">
        {row.lot_remaining > 0 ? `Lot #${row.piece}` : '–'}
      </Text>
    </Tooltip>
  );
}

export const usedPlateColumns: DataTableColumn<UsedPlate>[] = [
  {
    key: 'date',
    header: 'Tarih',
    exportValue: (row) => new Date(row.created_at),
    render: (row) => formatDateTime(row.created_at),
  },
  {
    key: 'code',
    header: 'Sac Kodu',
    exportValue: (row) => row.piece_code ?? '',
    render: (row) => <SheetCell row={row} />,
  },
  {
    key: 'card',
    header: 'Stok Kartı',
    exportValue: (row) => row.item_code,
    render: (row) => (
      <Stack gap={0}>
        <Text size="sm" fw={600} style={mono}>
          {row.item_code}
        </Text>
        <Text size="xs" c="dimmed">
          {row.item_name}
          {row.item_is_active ? '' : ' (Pasif)'}
        </Text>
      </Stack>
    ),
  },
  { key: 'shape', header: 'Şekil', render: (row) => shapeLabel(row.shape) },
  { key: 'size', header: 'Ölçü', render: (row) => <span style={mono}>{dimsLabel(row)}</span> },
  {
    key: 'quantity',
    header: 'Adet',
    align: 'right',
    render: (row) => row.quantity,
  },
  {
    key: 'kg',
    header: 'Ağırlık',
    align: 'right',
    exportValue: (row) => (row.total_kg === null ? '' : Number(row.total_kg)),
    render: (row) => kg(row.total_kg),
  },
  {
    key: 'reason',
    header: 'Neden',
    exportValue: (row) => USED_REASON_LABELS[row.reason],
    render: (row) => (
      <StatusBadge color={REASON_COLORS[row.reason]}>{USED_REASON_LABELS[row.reason]}</StatusBadge>
    ),
  },
  {
    key: 'cut',
    header: 'Kesim',
    exportValue: (row) => row.cnc_task ?? '',
    render: (row) => (row.cnc_task ? <CutLink cut={row.cnc_task} /> : '–'),
  },
  {
    key: 'job',
    header: 'İş No',
    exportValue: (row) => row.job_nos.join(', '),
    render: (row) => (row.job_nos.length ? row.job_nos.join(', ') : '–'),
  },
  {
    key: 'heat',
    header: 'Döküm No',
    hideBelow: 1400,
    render: (row) => row.heat_number || '–',
  },
  {
    key: 'who',
    header: 'Kim',
    exportValue: (row) => row.created_by_name ?? '',
    render: (row) => row.created_by_name || '–',
  },
  {
    key: 'note',
    header: 'Not',
    hideBelow: 1600,
    maxWidth: 'clamp(160px, 16vw, 320px)',
    render: (row) => row.note || '–',
  },
];

/** The view's filters as the API takes them. */
export function usedPlatesParams(values: typeof USED_URL_DEFAULTS): UsedPlatesParams {
  const search = values.search.trim();
  const job = values.job_no.trim();
  return {
    page: positiveInt(values.page, 1),
    page_size: positiveInt(values.page_size, PAGE_SIZE),
    ...(values.used_date.start ? { date_from: values.used_date.start } : {}),
    ...(values.used_date.end ? { date_to: values.used_date.end } : {}),
    ...(search ? { search } : {}),
    ...(job ? { job_no: job } : {}),
    ...(values.used_reason === 'cut' || values.used_reason === 'scrap'
      ? { reason: values.used_reason }
      : {}),
    ...(values.item ? { item: Number(values.item) } : {}),
  };
}

/** Sac Stoğu's Kullanılan Saclar view: server-paged, its columns kept per user. */
export function UsedPlatesView({
  toolbar,
  onOpen,
}: {
  /** The page's view switch. */
  toolbar: ReactNode;
  /** Opens the sheet's lot (its Hareketler). */
  onOpen: (pieceId: number) => void;
}) {
  const { values, apply } = useUrlFilters(USED_URL_DEFAULTS);
  const params = usedPlatesParams(values);
  const used = useQuery({ ...usedPlatesQueryOptions(params), placeholderData: keepPreviousData });
  useEffect(() => {
    if (used.isError) notify.error(countErrorMessage(used.error, 'Kullanılan saclar yüklenemedi'));
  }, [used.isError, used.error]);
  const summary = used.data?.summary;
  const filterValues = {
    used_date: values.used_date,
    search: values.search,
    job_no: values.job_no,
    used_reason: values.used_reason,
  };

  return (
    <DataTable
      title="Kullanılan Saclar"
      icon="fas fa-history"
      toolbar={toolbar}
      filters={
        <FilterBar
          inline
          filters={USED_FILTERS}
          values={filterValues}
          extra={
            summary && used.data?.count ? (
              <Text size="sm" c="dimmed">
                {summary.sheets} sac · {kg(summary.kg)}
              </Text>
            ) : null
          }
          onApply={(next) => apply({ ...next, page: '1' })}
          onClear={() =>
            apply({
              used_date: { start: '', end: '' },
              search: '',
              job_no: '',
              used_reason: '',
              item: '',
              page: '1',
            })
          }
        />
      }
      columnsKey="warehouse-used-plates"
      data={used.data?.results ?? []}
      columns={usedPlateColumns}
      getRowId={(row) => String(row.id)}
      loading={used.isFetching}
      onRowClick={(row) => onOpen(row.piece)}
      pagination={{
        page: params.page ?? 1,
        pageSize: params.page_size ?? PAGE_SIZE,
        total: used.data?.count ?? 0,
        onPageChange: (next) => apply({ page: String(next) }),
        onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
      }}
      emptyMessage="Bu filtrelerle kullanılan sac yok"
    />
  );
}
