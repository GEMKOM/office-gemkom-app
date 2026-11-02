import { Badge, Button } from '@mantine/core';
import { useDebouncedCallback, useMediaQuery } from '@mantine/hooks';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  costKeys,
  costChildrenQueryOptions,
  costTableQueryOptions,
  type CostTableRow,
} from '@/api/projects/cost';
import { customersQueryOptions, useCustomer } from '@/api/reference/customers';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import {
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  Panel,
  SelectRemote,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import {
  BarsChart,
  CATEGORICAL,
  DashCell,
  DashGrid,
  NEUTRAL,
  compactCurrency,
  valueFormats,
} from '@/ui/charts';
import {
  DATE_FIELD_OPTIONS,
  DEFAULT_ORDERING,
  FACILITY_OPTIONS,
  MANUFACTURED_OPTIONS,
  mergeExpandedChildren,
  ORDERING_OPTIONS,
  STATUS_OPTIONS,
  summaryFigures,
  tableFilters,
  topCostStack,
  type TreeRow,
} from './analyticsData';
import { CatalogPicker } from './CatalogPicker';
import { joinNodeIds, parseNodeIds } from './catalogTree';
import { costColumns, costFooter, type DrillKind } from './columns';
import { EstimatedCostModal } from './EstimatedCostModal';
import {
  JobDetailsModal,
  MachiningDetailsModal,
  MaterialDetailsModal,
  SubcontractorDetailsModal,
  WeldingDetailsModal,
} from './modals';

// Every filter, the sort and the page live in the URL (legacy kept none).
const URL_DEFAULTS = {
  status: [] as string[],
  search: '',
  customer: '',
  facility: '',
  manufactured: '',
  date_field: '',
  date: { start: '', end: '' },
  template_node: '',
  ordering: DEFAULT_ORDERING,
  page: '1',
  page_size: '20',
};

type PillKeys =
  'status' | 'search' | 'facility' | 'manufactured' | 'date_field' | 'date' | 'ordering';

const filterConfig: FilterConfig<PillKeys>[] = [
  { type: 'text', key: 'search', label: 'Ara (iş no / başlık)', placeholder: 'Örn: pump' },
  { type: 'multiselect', key: 'status', label: 'Durum', options: STATUS_OPTIONS },
  { type: 'select', key: 'facility', label: 'Tesis', options: FACILITY_OPTIONS },
  { type: 'select', key: 'manufactured', label: 'İmalat', options: MANUFACTURED_OPTIONS },
  {
    type: 'select',
    key: 'date_field',
    label: 'Tarih Alanı',
    placeholder: 'Hedef Tarih',
    options: DATE_FIELD_OPTIONS,
  },
  { type: 'dateRange', key: 'date', label: 'Tarih Aralığı' },
  { type: 'select', key: 'ordering', label: 'Sıralama', options: ORDERING_OPTIONS },
];

const STACK_SERIES = [
  { key: 'labor', label: 'İşçilik', color: CATEGORICAL[0] },
  { key: 'material', label: 'Malzeme', color: CATEGORICAL[1] },
  { key: 'subcontractor', label: 'Taşeron', color: CATEGORICAL[2] },
  { key: 'other', label: 'Diğer', color: NEUTRAL },
];

const EMPTY_ROWS: CostTableRow[] = [];

interface Drill {
  kind: DrillKind;
  row: TreeRow;
}

/** Port of management/analytics (analytics.js): job profitability, cost split and ranking. */
export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, parseInt(values.page, 10) || 1);
  const pageSize = Math.max(1, parseInt(values.page_size, 10) || 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const nodeIds = useMemo(() => parseNodeIds(values.template_node), [values.template_node]);

  const filters = useMemo(
    () =>
      tableFilters({
        status: values.status,
        search: values.search,
        customer: values.customer,
        facility: values.facility,
        manufactured: values.manufactured,
        date_field: values.date_field,
        date: values.date,
        template_node: values.template_node,
      }),
    [
      values.status,
      values.search,
      values.customer,
      values.facility,
      values.manufactured,
      values.date_field,
      values.date,
      values.template_node,
    ],
  );

  const table = useQuery({
    ...costTableQueryOptions({ ...filters, ordering, page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  });
  const roots = table.isError ? EMPTY_ROWS : (table.data?.results ?? EMPTY_ROWS);
  const total = table.isError ? 0 : (table.data?.count ?? 0);

  useEffect(() => {
    if (table.isError) notify.error(`Analitik yüklenirken hata: ${errorMessage(table.error)}`);
  }, [table.isError, table.errorUpdatedAt, table.error]);

  // Expanded rows belong to one load of the table: a reload collapses them (legacy).
  const loadKey = table.dataUpdatedAt;
  const [expansion, setExpansion] = useState<{ key: number; jobs: string[] }>({ key: 0, jobs: [] });
  const expandedJobs = useMemo(
    () => (expansion.key === loadKey ? expansion.jobs : []),
    [expansion, loadKey],
  );

  const childQueries = useQueries({
    queries: expandedJobs.map((jobNo) => costChildrenQueryOptions(jobNo)),
  });
  const childrenMap = new Map<string, CostTableRow[]>();
  const loadingChildren = new Set<string>();
  const failedChildren: string[] = [];
  expandedJobs.forEach((jobNo, index) => {
    const query = childQueries[index]!;
    if (query.data) childrenMap.set(jobNo, query.data);
    else if (query.isError) failedChildren.push(jobNo);
    else loadingChildren.add(jobNo);
  });
  // Children show once loaded; a row whose children are loading keeps its spinner.
  const shownExpanded = new Set(expandedJobs.filter((jobNo) => childrenMap.has(jobNo)));
  const withChildren = new Set(
    [...childrenMap].filter(([, kids]) => kids.length > 0).map(([jobNo]) => jobNo),
  );
  const failedKey = failedChildren.join(',');

  useEffect(() => {
    if (failedKey) notify.error('Alt işler yüklenirken hata oluştu');
  }, [failedKey]);

  const toggle = useCallback(
    (jobNo: string) => {
      // A failed load shows + again; clicking it retries.
      if (failedKey.split(',').includes(jobNo)) {
        void queryClient.resetQueries({ queryKey: costKeys.children(jobNo) });
        return;
      }
      setExpansion((prev) => {
        const jobs = prev.key === loadKey ? prev.jobs : [];
        return {
          key: loadKey,
          jobs: jobs.includes(jobNo) ? jobs.filter((j) => j !== jobNo) : [...jobs, jobNo],
        };
      });
    },
    [loadKey, failedKey, queryClient],
  );

  const rows = mergeExpandedChildren(roots, shownExpanded, childrenMap);

  const [breakdown, setBreakdown] = useState(false);
  const [drills, setDrills] = useState<Drill[]>([]);
  const openDrill = useCallback(
    (kind: DrillKind, row: TreeRow) => setDrills((prev) => [...prev, { kind, row }]),
    [],
  );
  const closeDrill = useCallback(() => setDrills((prev) => prev.slice(0, -1)), []);

  const expandedKey = [...shownExpanded].join(',');
  const loadingKey = [...loadingChildren].join(',');
  const withChildrenKey = [...withChildren].join(',');
  const columns = useMemo(
    () =>
      costColumns({
        breakdown,
        expanded: new Set(expandedKey ? expandedKey.split(',') : []),
        loadingChildren: new Set(loadingKey ? loadingKey.split(',') : []),
        withChildren: new Set(withChildrenKey ? withChildrenKey.split(',') : []),
        onToggle: toggle,
        onDrill: openDrill,
      }),
    [breakdown, expandedKey, loadingKey, withChildrenKey, toggle, openDrill],
  );
  const footer = useMemo(() => costFooter(columns), [columns]);

  const figures = useMemo(() => summaryFigures(roots), [roots]);
  const stack = useMemo(() => topCostStack(roots), [roots]);

  // Catalog picker: selections apply 450 ms after the last click (legacy debounce).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftNodes, setDraftNodes] = useState<string[] | null>(null);
  const applyNodes = useDebouncedCallback((ids: string[]) => {
    apply({ template_node: joinNodeIds(ids), page: '1' });
    setDraftNodes(null);
  }, 450);
  const scopeFilters = useMemo(() => ({ ...filters, template_node: undefined }), [filters]);

  const customer = useCustomer(values.customer || null);
  const customerOptions = useMemo(
    () =>
      values.customer
        ? [
            {
              value: values.customer,
              label: customer.data?.name || customer.data?.code || `#${values.customer}`,
            },
          ]
        : [],
    [values.customer, customer.data],
  );

  const sort = fromOrdering(ordering);
  const loading = table.isPending;
  const figure = (text: string) => (loading ? '–' : text);
  // The band's plain figures do not wrap; on a phone they go in tiles (which
  // do) and the sums go compact ("€621 B").
  const phone = useMediaQuery('(max-width: 36em)') ?? false;
  const euroFigure = (value: number) =>
    figure(phone ? compactCurrency(value, 'EUR') : formatCurrency(value, 'EUR'));
  const bandLabel = (text: string) =>
    phone ? <span style={{ whiteSpace: 'normal' }}>{text}</span> : text;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: costKeys.all });
  };

  return (
    <>
      <PageHeader
        title="Analitik"
        subtitle="İş bazlı kârlılık, maliyet dağılımı ve sıralama"
        icon="fas fa-chart-pie"
        backTo="/management"
        figureStyle={phone ? 'tiles' : 'plain'}
        stats={[
          { id: 'count', label: bandLabel('İş Sayısı'), value: figure(formatNumber(total)) },
          {
            id: 'avgMargin',
            label: bandLabel('Ortalama Marj %'),
            value: figure(formatPercent(figures.avgMarginPct, 1)),
          },
          {
            id: 'revenue',
            label: bandLabel('Toplam Satış (EUR)'),
            value: euroFigure(figures.totalRevenue),
          },
          {
            id: 'cost',
            label: bandLabel('Toplam Maliyet (EUR)'),
            value: euroFigure(figures.totalCost),
          },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
            loading={table.isFetching && !loading}
          >
            Yenile
          </Button>
        }
      />

      <FilterBar
        title="Analitik Filtreleri"
        filters={filterConfig}
        values={{
          status: values.status,
          search: values.search,
          facility: values.facility,
          manufactured: values.manufactured,
          date_field: values.date_field,
          date: values.date,
          ordering,
        }}
        onApply={(next) =>
          apply({ ...next, ordering: next.ordering || DEFAULT_ORDERING, page: '1' })
        }
        onClear={() => {
          setDraftNodes(null);
          reset();
        }}
        extra={
          <div style={{ minWidth: 240 }}>
            <SelectRemote
              aria-label="Müşteri"
              placeholder="Müşteri ara (en az 3 karakter)"
              queryKey={['analytics-customer-search']}
              minSearchLength={3}
              value={values.customer || null}
              initialOptions={customerOptions}
              clearable
              onChange={(value) => apply({ customer: value ?? '', page: '1' })}
              search={async (term) => {
                const res = await queryClient.fetchQuery(
                  customersQueryOptions({ search: term.trim(), is_active: true, page_size: 50 }),
                );
                return res.results.map((c) => ({
                  value: String(c.id),
                  label: c.name || c.code || `#${c.id}`,
                }));
              }}
            />
          </div>
        }
      />

      <DashGrid>
        <DashCell>
          <Panel title="Top 15 Maliyet (Stacked)" icon="fas fa-layer-group">
            <BarsChart
              label="En yüksek maliyetli 15 iş, maliyet kırılımı"
              data={stack}
              categoryKey="job_no"
              categoryLabel="İş No"
              categoryWidth={110}
              horizontal
              stacked
              series={STACK_SERIES}
              height={Math.max(220, stack.length * 30 + 40)}
              format={valueFormats.currency('EUR', 2)}
              axisFormat={(v) => compactCurrency(v, 'EUR')}
              tooltipNote={(row) => `Toplam: ${formatCurrency(row.total, 'EUR', 2)}`}
              empty={loading ? 'Yükleniyor…' : stack.length ? undefined : 'Veri yok'}
            />
          </Panel>
        </DashCell>
        <DashCell>
          <DataTable
            title="Maliyet Tablosu"
            icon="fas fa-calculator"
            data={rows}
            columns={columns}
            getRowId={(row) => `${row.hierarchy_level}-${row.job_no}`}
            loading={table.isFetching}
            footer={footer}
            pagination={{
              page,
              pageSize,
              total,
              onPageChange: (next) => apply({ page: String(next) }),
              onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
            }}
            sort={{
              sortBy: sort.sortBy,
              sortDir: sort.sortDir,
              onSortChange: (sortBy, sortDir) =>
                apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING, page: '1' }),
            }}
            toolbar={
              <>
                <Button
                  size="xs"
                  variant={nodeIds.length ? 'light' : 'default'}
                  leftSection={<FaIcon icon="fas fa-sitemap" />}
                  rightSection={
                    nodeIds.length ? (
                      <Badge size="xs" circle>
                        {nodeIds.length}
                      </Badge>
                    ) : null
                  }
                  onClick={() => setPickerOpen(true)}
                >
                  Katalog Kalemi
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={
                    <FaIcon icon={breakdown ? 'fas fa-compress-alt' : 'fas fa-expand-alt'} />
                  }
                  aria-pressed={breakdown}
                  onClick={() => setBreakdown((v) => !v)}
                >
                  {breakdown ? 'Maliyet detaylarını gizle' : 'Maliyet detaylarını göster'}
                </Button>
              </>
            }
            stickyHeader
            emptyMessage="Kayıt bulunamadı."
            onRefresh={refresh}
            exportable={{
              fileName: `analitik-maliyet_${new Date().toISOString().slice(0, 10)}.xlsx`,
            }}
          />
        </DashCell>
      </DashGrid>

      <CatalogPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        scopeFilters={scopeFilters}
        selected={draftNodes ?? nodeIds}
        onChange={(ids) => {
          setDraftNodes(ids);
          applyNodes(ids);
        }}
      />

      {drills.map((drill, index) => {
        const jobNo = drill.row.job_no;
        const onClose = closeDrill;
        switch (drill.kind) {
          case 'job':
            return (
              <JobDetailsModal
                key={index}
                jobNo={jobNo}
                onClose={onClose}
                onDepartment={(kind) => openDrill(kind, drill.row)}
              />
            );
          case 'machining':
            return <MachiningDetailsModal key={index} jobNo={jobNo} onClose={onClose} />;
          case 'welding':
            return <WeldingDetailsModal key={index} jobNo={jobNo} onClose={onClose} />;
          case 'material':
            return <MaterialDetailsModal key={index} jobNo={jobNo} onClose={onClose} />;
          case 'subcontractor':
            return <SubcontractorDetailsModal key={index} jobNo={jobNo} onClose={onClose} />;
          case 'estimated':
            return (
              <EstimatedCostModal key={index} jobNo={jobNo} costRow={drill.row} onClose={onClose} />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
