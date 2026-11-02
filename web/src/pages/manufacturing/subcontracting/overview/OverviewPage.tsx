import { Button, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_STALE_TIME } from '@/api';
import {
  monthlyReportQueryOptions,
  type MonthlyReportParams,
} from '@/api/subcontracting/subcontractors';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowGroup,
} from '@/ui';
import { exportOverview } from './exportOverview';
import {
  backlogProgressCell,
  groupCells,
  kgCell,
  leafLabel,
  leafProgressCell,
  moneyCell,
  perPersonSummary,
  unitPriceCell,
  workKgCell,
  workUnitPriceCell,
} from './overviewCells';
import {
  buildLookup,
  buildMonthOptions,
  buildTree,
  formatNumber,
  GROUPING_STORAGE_KEY,
  GROUPINGS,
  hasRows,
  monthlyPerPerson,
  nodeTotal,
  num,
  overviewFigures,
  periodRangeLabel,
  singleCurrency,
  totalHeadcount,
  treeRows,
  type Lookup,
  type OverviewRow,
  type Tree,
} from './overviewTree';
import classes from './Overview.module.css';

const URL_DEFAULTS = { search: '', start: '', end: '', is_active: '', job_status: '' };
type FilterState = typeof URL_DEFAULTS;
type FilterKeys = keyof FilterState;
const EMPTY_FILTERS: FilterState = {
  search: '',
  start: '',
  end: '',
  is_active: '',
  job_status: '',
};
const EMPTY_ROWS: OverviewRow[] = [];

function loadGrouping(): string {
  try {
    const saved = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (GROUPINGS.some((g) => g.id === saved)) return saved!;
  } catch {
    // Storage blocked: the default.
  }
  return GROUPINGS[0]!.id;
}

function saveGrouping(value: string) {
  try {
    localStorage.setItem(GROUPING_STORAGE_KEY, value);
  } catch {
    // Storage blocked: the choice just won't survive a reload.
  }
}

const Th = ({ title, children }: { title?: string; children: ReactNode }) => (
  <span title={title}>{children}</span>
);

/** The columns; group rows fill the same keys through groupCells. */
function overviewColumns(lookup: Lookup | null, tree: Tree | null): DataTableColumn<OverviewRow>[] {
  const levels = tree?.levels.length ?? 0;
  const fact = (row: OverviewRow) => (row.kind === 'fact' ? row.fact : null);
  const leaf =
    (render: (f: NonNullable<ReturnType<typeof fact>>) => ReactNode) => (row: OverviewRow) => {
      const f = fact(row);
      return f ? render(f) : null;
    };
  const isAdj = (f: { kind: string }) => f.kind === 'adjustment';
  return [
    {
      key: 'label',
      header: 'Taşeron / Kalem / Ay / İş Emri',
      width: 320,
      render: (row) => {
        if (row.kind !== 'fact' || !lookup || !tree) return null;
        const parent = tree.nodes.get(row.parentId);
        return parent ? (
          // Under the group rows: their indent plus the toggle's width.
          <div style={{ paddingLeft: levels * 18 + 22 }}>{leafLabel(lookup, row.fact, parent)}</div>
        ) : null;
      },
    },
    {
      key: 'employees',
      header: (
        <Th title="Taşeron satırında dönemdeki hakedişlerin ortalaması; ay satırında o ayın hakedişine girilen sayı">
          Çalışan
        </Th>
      ),
      exportHeader: 'Çalışan',
      align: 'right',
      render: () => null,
    },
    {
      key: 'progress',
      header: (
        <Th title="İş emri satırında dönemdeki ilerleme (önceki → sonraki); üst satırlarda bugünkü sözleşme tamamlanma oranı">
          İlerleme
        </Th>
      ),
      render: leaf((f) => (isAdj(f) ? null : leafProgressCell(f))),
    },
    {
      key: 'kg',
      header: 'Yapılan İş',
      align: 'right',
      render: leaf((f) => (isAdj(f) ? null : kgCell(num(f.weight_kg)))),
    },
    {
      key: 'unit',
      header: 'Ort. Birim Fiyat',
      align: 'right',
      render: leaf((f) =>
        isAdj(f) ? null : unitPriceCell(num(f.amount), num(f.weight_kg), f.currency || 'TRY'),
      ),
    },
    {
      key: 'billed',
      header: <Th title="Onaylanmış / ödenmiş hakedişlerdeki iş tutarı">Faturalanan</Th>,
      align: 'right',
      render: leaf((f) =>
        f.kind === 'billed' ? moneyCell(num(f.amount), f.currency || 'TRY') : null,
      ),
    },
    {
      key: 'pending',
      header: <Th title="Henüz onaylı hakedişe girmemiş ilerlemenin tutarı">Bekleyen</Th>,
      align: 'right',
      render: leaf((f) =>
        f.kind === 'pending' ? moneyCell(num(f.amount), f.currency || 'TRY', 'pending') : null,
      ),
    },
    {
      key: 'adjustment',
      header: (
        <Th title="Onaylanmış / ödenmiş hakedişlerdeki ek ödeme ve kesintiler">
          Ek Ödeme / Kesinti
        </Th>
      ),
      align: 'right',
      render: leaf((f) =>
        isAdj(f) ? moneyCell(num(f.amount), f.currency || 'TRY', null, true) : null,
      ),
    },
    {
      key: 'total',
      header: 'Dönem Toplamı',
      align: 'right',
      render: leaf((f) => moneyCell(num(f.amount), f.currency || 'TRY')),
    },
    {
      key: 'perPerson',
      header: (
        <Th title="Kişi başına aylık ödenen. Ay satırında o ayın toplamı ÷ o ayın çalışanı; taşeron satırında seçili ayların aylık ortalaması (Σ tutar ÷ Σ çalışan), çalışan sayısı girilmemiş aylar hariç">
          Kişi Başı
        </Th>
      ),
      align: 'right',
      render: () => null,
    },
    {
      key: 'remainingKg',
      header: <Th title="Bugün itibarıyla, dönemden bağımsız">Kalan İş</Th>,
      align: 'right',
      render: () => null,
    },
    {
      key: 'remainingAmount',
      header: <Th title="Bugün itibarıyla, dönemden bağımsız">Kalan Tutar</Th>,
      align: 'right',
      render: () => null,
    },
  ];
}

/** Port of manufacturing/subcontracting/overview (overview.js). */
export function OverviewPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      start: values.start,
      end: values.end,
      is_active: values.is_active,
      job_status: values.job_status,
    }),
    [values.search, values.start, values.end, values.is_active, values.job_status],
  );

  const [grouping, setGrouping] = useState(loadGrouping);
  // Tümünü Aç / Kapat open or close every group; a new table starts from that.
  const [expandAll, setExpandAll] = useState(false);
  const [tableKey, setTableKey] = useState(0);

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(() => {
    const months = buildMonthOptions();
    return [
      {
        type: 'text',
        key: 'search',
        label: 'Taşeron',
        placeholder: 'Taşeron adı / kısa ad / yetkili...',
      },
      {
        type: 'select',
        key: 'start',
        label: 'Başlangıç Ayı',
        placeholder: 'Tümü',
        searchable: false,
        options: months,
      },
      {
        type: 'select',
        key: 'end',
        label: 'Bitiş Ayı',
        placeholder: 'Tümü',
        searchable: false,
        options: months,
      },
      {
        type: 'select',
        key: 'is_active',
        label: 'Taşeron Durumu',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'true', label: 'Aktif' },
          { value: 'false', label: 'Pasif' },
        ],
      },
      {
        type: 'select',
        key: 'job_status',
        label: 'İş Emri Durumu',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'active', label: 'Aktif' },
          { value: 'completed', label: 'Tamamlandı' },
          { value: 'active,completed', label: 'Aktif + Tamamlandı' },
        ],
      },
    ];
  }, []);

  const applyFilters = (next: FilterState) => {
    if (next.start && next.end && next.start > next.end) {
      notify.error('Başlangıç ayı bitiş ayından sonra olamaz.');
      return;
    }
    apply(next);
  };

  const params: MonthlyReportParams = {
    start: filters.start || undefined,
    end: filters.end || undefined,
    search: filters.search || undefined,
    is_active: filters.is_active || undefined,
    job_status: filters.job_status || undefined,
  };
  const query = useQuery({
    ...monthlyReportQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (query.isError)
      notify.error(query.error, {
        fallback: 'Taşeron genel bakış verileri yüklenirken hata oluştu',
      });
  }, [query.isError, query.error, query.errorUpdatedAt]);

  const report = query.isError ? null : (query.data ?? null);
  const levels = GROUPINGS.find((g) => g.id === grouping)!.levels;
  const lookup = useMemo(() => (report ? buildLookup(report) : null), [report]);
  const tree = useMemo(() => (lookup ? buildTree(lookup, levels) : null), [lookup, levels]);
  const rows = useMemo(() => (tree ? treeRows(tree) : EMPTY_ROWS), [tree]);
  const columns = useMemo(() => overviewColumns(lookup, tree), [lookup, tree]);
  const figures = useMemo(
    () => (lookup && tree ? overviewFigures(lookup, tree) : null),
    [lookup, tree],
  );

  const groupBy = useMemo(
    () => levels.map((_, depth) => (row: OverviewRow) => row.path[depth]),
    [levels],
  );

  const changeGrouping = (next: string) => {
    if (next === grouping) return;
    setGrouping(next);
    saveGrouping(next);
    setExpandAll(false);
    setTableKey((k) => k + 1);
  };
  const expandEverything = (open: boolean) => {
    setExpandAll(open);
    setTableKey((k) => k + 1);
  };

  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    if (!lookup) {
      notify.info('Dışa aktarılacak veri yok');
      return;
    }
    setExporting(true);
    try {
      await exportOverview(lookup);
    } catch (error) {
      console.error('Export failed:', error);
      notify.error(error, { fallback: 'Dışa aktarma başarısız' });
    } finally {
      setExporting(false);
    }
  };

  const groupHeader = (group: RowGroup<OverviewRow>) => {
    const node = tree?.nodes.get(String(group.value));
    // Groups under a backlog-only node are hidden (Overview.module.css).
    if (!node || !lookup) return { cells: {} };
    return { cells: groupCells(lookup, node) };
  };

  const totalRow = () => {
    if (!tree || !lookup || rows.length === 0) return null;
    const root = tree.root;
    const currency = singleCurrency(root.agg.currencies);
    const headcount = totalHeadcount(lookup);
    const cells: Record<string, ReactNode> = {
      label: 'Genel Toplam',
      employees: headcount ? formatNumber(headcount, 1) : null,
      progress: backlogProgressCell(root.backlog),
      kg: workKgCell(root.agg),
      unit: workUnitPriceCell(root.agg, currency),
      billed: moneyCell(root.agg.billed, currency),
      pending: moneyCell(root.agg.pending, currency),
      adjustment: moneyCell(root.agg.adjustment, currency, null, true),
      total: moneyCell(nodeTotal(root), currency),
      perPerson: perPersonSummary(
        monthlyPerPerson(lookup, new Set(lookup.report.subcontractors.map((s) => String(s.id)))),
        currency,
        false,
      ),
      remainingKg: kgCell(root.backlog?.remainingKg, true),
      remainingAmount: moneyCell(
        root.backlog?.remainingAmount,
        singleCurrency(root.backlog?.currencies),
      ),
    };
    return (
      <Table.Tr className={classes.total} data-testid="overview-total">
        {columns.map((column) => (
          <Table.Td key={column.key} style={{ textAlign: column.align }}>
            {cells[column.key]}
          </Table.Td>
        ))}
      </Table.Tr>
    );
  };

  const figure = (value: string) => (figures ? value : '0');

  return (
    <>
      <PageHeader
        title="Taşeron Genel Bakış"
        subtitle="Taşeron, ay ve fiyat kalemi bazında yapılan iş, hakediş ve kalan iş"
        icon="chart-line"
        backTo="/manufacturing/"
        stats={[
          {
            id: 'overview-total-subcontractors',
            label: 'Taşeron',
            value: figure(String(figures?.subcontractors)),
          },
          {
            id: 'overview-done-kg',
            label: figures?.doneExcludesPaint ? 'Yapılan İş (Boya Hariç)' : 'Yapılan İş',
            value: figure(`${formatNumber(figures?.doneKg, 0)} kg`),
          },
          { id: 'overview-billed', label: 'Faturalanan İş', value: figure(figures?.billed ?? '') },
          {
            id: 'overview-pending',
            label: 'Bekleyen Hakediş',
            value: figure(figures?.pending ?? ''),
          },
          { id: 'overview-remaining', label: 'Kalan İş', value: figure(figures?.remaining ?? '') },
          {
            id: 'overview-avg-employees',
            label: 'Ort. Toplam Çalışan',
            value: figure(formatNumber(figures?.avgEmployees, 1)),
          },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={() => void query.refetch()}
          >
            Yenile
          </Button>
        }
      />

      <Stack gap="md">
        <FilterBar
          title="Genel Bakış Filtreleri"
          filters={filterConfig}
          values={filters}
          onApply={applyFilters}
          onClear={() => apply(EMPTY_FILTERS)}
        />

        <div className={classes.tree}>
          <DataTable
            key={`${grouping}:${tableKey}`}
            title={
              <>
                Taşeron Aylık İş Raporu{' '}
                <Text span size="sm" c="dimmed" fw={500} ml={6} data-testid="period-label">
                  {report ? periodRangeLabel(report.period) : ''}
                </Text>
              </>
            }
            icon="fas fa-chart-line"
            toolbar={
              <Group gap="xs" wrap="wrap">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Gruplama
                </Text>
                <SegmentedControl
                  size="xs"
                  aria-label="Gruplama"
                  value={grouping}
                  onChange={changeGrouping}
                  data={GROUPINGS.map((g) => ({ value: g.id, label: g.label }))}
                />
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-angles-down" />}
                  onClick={() => expandEverything(true)}
                >
                  Tümünü Aç
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-angles-up" />}
                  onClick={() => expandEverything(false)}
                >
                  Tümünü Kapat
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-download" />}
                  onClick={() => void runExport()}
                  loading={exporting}
                >
                  Dışa Aktar
                </Button>
              </Group>
            }
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            loading={query.isFetching}
            // Placeholder rows only carry a backlog-only node; they never show.
            rowStyle={(row) => (row.kind === 'placeholder' ? { display: 'none' } : undefined)}
            grouping={{
              by: groupBy,
              // Rows arrive in tree order, so the groups keep it.
              sort: false,
              defaultExpanded: expandAll,
              // A node with nothing under it (remaining work only) has nothing to open.
              collapsible: (group) => {
                const node = tree?.nodes.get(String(group.value));
                return node ? hasRows(node) : true;
              },
              header: groupHeader,
            }}
            footer={totalRow}
            emptyMessage={
              query.isError ? 'Veriler yüklenemedi' : 'Seçilen dönem ve filtrelerde veri bulunamadı'
            }
          />
        </div>

        <div className={classes.legend}>
          <span>
            <strong>Faturalanan:</strong> onaylanmış/ödenmiş hakediş satırları, hakedişin ayında.
          </span>
          <span>
            <strong>Bekleyen:</strong> henüz faturalanmamış ilerleme; açık hakedişin ayına, yoksa bu
            aya yazılır.
          </span>
          <span>
            <strong>Kalan İş:</strong> sözleşmede kalan iş, bugün itibarıyla (dönem filtresinden
            bağımsız).
          </span>
          <span>
            <strong>Kişi Başı:</strong> kişi başına aylık ödenen; taşeron satırında seçili ayların
            aylık ortalaması, çalışan sayısı girilmemiş aylar hariç.
          </span>
        </div>
      </Stack>
    </>
  );
}
