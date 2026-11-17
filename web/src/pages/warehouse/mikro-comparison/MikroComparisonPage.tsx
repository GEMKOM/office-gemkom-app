import { Checkbox, Group, Stack, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { mikroComparisonQueryOptions, type MikroComparisonRow } from '@/api/warehouse/pieceCounts';
import { formatNumber } from '@/lib/format';
import { Weight } from '@/pages/warehouse/pieces/PiecesPage';
import {
  DataTable,
  FilterBar,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';

// Sac ve boy: our piece stock against Mikro's balance, card by card, each in
// its own unit (kg, total length or count). Its own page, apart from Sac ve
// Boy Stoğu, which shows only our pieces.

const PAGE_SIZE = 50;
const URL_DEFAULTS = { search: '', kind: '', diff: '', page: '1' };
const mono = { fontFamily: 'var(--gk-font-mono)' };
const EMPTY: MikroComparisonRow[] = [];
const BASIS_UNIT: Record<string, string> = { kg: 'kg', metre: 'm', adet: 'adet' };

function amount(value: string | number | null, basis: string): string {
  return `${formatNumber(value ?? 0, basis === 'adet' ? 0 : 2)} ${BASIS_UNIT[basis] ?? ''}`.trim();
}

const filterConfig: FilterConfig<'search' | 'kind'>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Kod veya ad…' },
  {
    type: 'select',
    key: 'kind',
    label: 'Tür',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'plate', label: 'Sac' },
      { value: 'boy', label: 'Boy (profil, boru, çubuk)' },
    ],
  },
];

const columns: DataTableColumn<MikroComparisonRow>[] = [
  {
    key: 'card',
    header: 'Stok Kartı',
    render: (row) => (
      <Stack gap={0}>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600} style={mono}>
            {row.code}
          </Text>
          {row.in_app ? null : <StatusBadge color="grey">Uygulamada kart yok</StatusBadge>}
        </Group>
        <Text size="xs" c="dimmed">
          {row.name}
        </Text>
      </Stack>
    ),
  },
  {
    key: 'basis',
    header: 'Karşılaştırma',
    render: (row) =>
      row.basis === 'kg'
        ? 'Ağırlık'
        : row.basis === 'metre'
          ? 'Toplam boy'
          : row.basis
            ? 'Adet'
            : '–',
  },
  { key: 'pieces', header: 'Parça', align: 'right', render: (row) => row.pieces },
  {
    key: 'stock',
    header: 'Stokta',
    align: 'right',
    render: (row) =>
      !row.in_app ? (
        '–'
      ) : row.stock === null ? (
        <Weight value={null} kind={row.kind} missing={row.missing} />
      ) : (
        amount(row.stock, row.basis)
      ),
  },
  {
    key: 'mikro',
    header: "Mikro'da",
    align: 'right',
    render: (row) => amount(row.mikro, row.basis || 'kg'),
  },
  {
    key: 'difference',
    header: 'Fark',
    align: 'right',
    render: (row) => {
      if (row.difference === null) return '–';
      const n = Number(row.difference);
      return (
        <Text span size="sm" fw={500} c={n < 0 ? 'red.8' : n > 0 ? 'green.8' : 'dimmed'}>
          {n > 0 ? '+' : ''}
          {amount(row.difference, row.basis)}
        </Text>
      );
    },
  },
];

export function MikroComparisonPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const kind = values.kind === 'plate' || values.kind === 'boy' ? values.kind : '';
  const onlyDiff = values.diff === '1';
  const rows = useQuery({
    ...mikroComparisonQueryOptions({
      page,
      page_size: PAGE_SIZE,
      ...(values.search ? { search: values.search } : {}),
      ...(kind ? { kind } : {}),
      ...(onlyDiff ? { only_diff: 'true' as const } : {}),
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Sac ve Boy · Mikro Karşılaştırması"
        subtitle="Parça stoğumuz Mikro'daki bakiyeyle kart kart: ağırlık, toplam boy ya da adet"
        icon="balance-scale"
        backTo="/warehouse"
        stats={[{ id: 'cards', label: 'Kart', value: rows.data?.count ?? '–' }]}
      />
      <DataTable
        title="Mikro ile karşılaştırma"
        icon="fas fa-balance-scale"
        toolbar={
          <Checkbox
            size="xs"
            label="Sadece farklı"
            checked={onlyDiff}
            onChange={(e) => apply({ diff: e.currentTarget.checked ? '1' : '', page: '1' })}
          />
        }
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ search: values.search, kind: values.kind }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ search: '', kind: '', page: '1' })}
          />
        }
        data={rows.data?.results ?? EMPTY}
        columns={columns}
        getRowId={(row) => row.code}
        loading={rows.isFetching}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: rows.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        emptyMessage="Karşılaştırılacak kart yok (Mikro bakiyeleri yüklenmemiş olabilir)"
      />
    </>
  );
}
