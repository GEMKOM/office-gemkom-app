import { Alert, Button, Tabs } from '@mantine/core';
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import {
  buildOverviewQuery,
  mergeOverviewResponses,
  overviewKeys,
  overviewSliceQueryOptions,
  type OverviewData,
  type OverviewSlice,
  type OverviewSliceResponse,
} from '@/api/reports/overview';
import {
  errorMessage,
  FaIcon,
  FilterBar,
  PageHeader,
  Panel,
  useUrlFilters,
  type FilterConfig,
  type PageFigure,
} from '@/ui';
import { JobOrdersTab } from './JobOrdersTab';
import { PRESET_OPTIONS, periodStrip } from './overviewData';
import { ProcurementTab } from './ProcurementTab';
import { ProductionTab } from './ProductionTab';
import { QualityTab } from './QualityTab';
import { SalesTab } from './SalesTab';
import { SubcontractingTab } from './SubcontractingTab';
import classes from './overview.module.css';

type TabKey = 'jobs' | 'prod' | 'sales' | 'sub' | 'proc' | 'qlt';

interface TabDef {
  key: TabKey;
  label: string;
  /** The report slices the tab reads; only the active tab's are fetched (legacy TAB_ENDPOINTS). */
  slices: OverviewSlice[];
  render: (data: OverviewData) => ReactNode;
}

const TABS: TabDef[] = [
  {
    key: 'jobs',
    label: 'İş Emirleri',
    slices: ['job-orders'],
    render: (d) => <JobOrdersTab data={d} />,
  },
  {
    key: 'prod',
    label: 'Üretim',
    slices: ['operations'],
    render: (d) => <ProductionTab data={d} />,
  },
  {
    key: 'sales',
    label: 'Satış & Maliyet',
    slices: ['sales'],
    render: (d) => <SalesTab data={d} />,
  },
  {
    key: 'sub',
    label: 'Taşeron',
    slices: ['subcontracting'],
    render: (d) => <SubcontractingTab data={d} />,
  },
  {
    key: 'proc',
    label: 'Satınalma',
    slices: ['procurement'],
    render: (d) => <ProcurementTab data={d} />,
  },
  { key: 'qlt', label: 'Kalite', slices: ['operations'], render: (d) => <QualityTab data={d} /> },
];

const FILTER_DEFAULTS = { preset: 'current_month', date_from: '', date_to: '', compare: true };
type Filters = typeof FILTER_DEFAULTS;

const FILTERS: FilterConfig<keyof Filters>[] = [
  {
    key: 'preset',
    type: 'select',
    label: 'Dönem',
    placeholder: 'Seçiniz',
    options: PRESET_OPTIONS,
  },
  { key: 'date_from', type: 'date', label: 'Başlangıç' },
  { key: 'date_to', type: 'date', label: 'Bitiş' },
  { key: 'compare', type: 'checkbox', label: 'Önceki dönemle karşılaştır' },
];

function sliceResult(
  slices: OverviewSlice[],
  results: UseQueryResult<OverviewSliceResponse | null>[],
  slice: OverviewSlice,
) {
  const index = slices.indexOf(slice);
  return index >= 0 ? (results[index]?.data ?? undefined) : undefined;
}

/**
 * Genel Bakış (management/reports/overview): period metrics in six tabs, each
 * loading its own slice of GET /reports/overview/{slice}/, optionally with the
 * previous period beside it.
 */
export function OverviewReportPage() {
  const queryClient = useQueryClient();
  const filters = useUrlFilters(FILTER_DEFAULTS);
  const tabState = useUrlFilters({ tab: 'jobs' });
  const activeTab = TABS.find((t) => t.key === tabState.values.tab) ?? TABS[0]!;
  const { preset, date_from, date_to, compare } = filters.values;

  const built = useMemo(() => {
    try {
      return {
        query: buildOverviewQuery({
          preset: preset || null,
          date_from: date_from || null,
          date_to: date_to || null,
          compare,
        }),
        error: null,
      };
    } catch (error) {
      return { query: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [preset, date_from, date_to, compare]);

  const slices = activeTab.slices;
  const results = useQueries({
    queries: slices.map((slice) => ({
      ...overviewSliceQueryOptions(slice, built.query ?? {}),
      enabled: built.query !== null,
      // Keep the figures on screen while a new period loads, but only for the same slice.
      placeholderData: (
        previous: OverviewSliceResponse | null | undefined,
        previousQuery?: { queryKey: readonly unknown[] },
      ) => (previousQuery?.queryKey[2] === slice ? previous : undefined),
    })),
  });

  const failed = results.find((r) => r.isError);
  const loading = built.query !== null && results.some((r) => r.data === undefined && !r.isError);
  const fetching = results.some((r) => r.isFetching);

  // Cheap: a handful of object spreads over the active tab's slices.
  const merged = mergeOverviewResponses(
    sliceResult(slices, results, 'operations'),
    sliceResult(slices, results, 'subcontracting'),
    sliceResult(slices, results, 'procurement'),
    sliceResult(slices, results, 'sales'),
    sliceResult(slices, results, 'job-orders'),
  );

  const strip = periodStrip(merged.meta);
  const stats: PageFigure[] =
    built.error || failed
      ? [{ id: 'ov-period', label: 'Seçilen dönem', value: 'Veri yüklenemedi' }]
      : loading
        ? [{ id: 'ov-period', label: 'Seçilen dönem', value: 'Yükleniyor…' }]
        : strip
          ? [
              { id: 'ov-period', label: 'Seçilen dönem', value: strip.primary },
              ...(strip.previous
                ? [
                    {
                      id: 'ov-prev-period',
                      label: 'Önceki dönem (karşılaştırma)',
                      value: strip.previous,
                    },
                  ]
                : []),
            ]
          : [{ id: 'ov-period', label: 'Seçilen dönem', value: 'Dönem bilgisi yok' }];

  const applyFilters = (next: Filters) => {
    const current = filters.values;
    const value = { ...next };
    // A preset clears the custom range; a custom date clears the preset (legacy handleFilterChange).
    if (value.preset && value.preset !== current.preset) {
      value.date_from = '';
      value.date_to = '';
    } else if (
      (value.date_from !== current.date_from || value.date_to !== current.date_to) &&
      (value.date_from || value.date_to)
    ) {
      value.preset = '';
    }
    filters.apply(value);
  };

  let content: ReactNode;
  if (built.error) {
    content = (
      <Alert color="red" icon={<FaIcon icon="fas fa-triangle-exclamation" />}>
        {built.error}
      </Alert>
    );
  } else if (failed) {
    content = (
      <Alert
        color="red"
        icon={<FaIcon icon="fas fa-triangle-exclamation" />}
        title="Raporlar yüklenirken hata"
      >
        {errorMessage(failed.error)}
      </Alert>
    );
  } else if (loading) {
    content = (
      <Panel>
        <div className={classes.state} role="status">
          Yükleniyor…
        </div>
      </Panel>
    );
  } else {
    content = activeTab.render(merged);
  }

  return (
    <>
      <PageHeader
        title="Genel Bakış"
        subtitle="Dönem bazlı özet metrikler ve karşılaştırmalar"
        icon="fas fa-chart-line"
        backTo="/management/reports"
        stats={stats}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            loading={fetching}
            onClick={() => queryClient.invalidateQueries({ queryKey: overviewKeys.all })}
          >
            Yenile
          </Button>
        }
      />
      <Tabs
        value={activeTab.key}
        onChange={(value) => tabState.apply({ tab: value ?? 'jobs' })}
        keepMounted={false}
      >
        <Panel padded={false}>
          <div className={classes.toolbar}>
            <FilterBar
              inline
              filters={FILTERS}
              values={filters.values}
              onApply={applyFilters}
              onClear={filters.reset}
            />
          </div>
          <Tabs.List className={classes.tabs} mt="sm">
            {TABS.map((tab) => (
              <Tabs.Tab key={tab.key} value={tab.key}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Panel>
        {TABS.map((tab) => (
          <Tabs.Panel key={tab.key} value={tab.key} className={classes.pane}>
            {tab.key === activeTab.key ? content : null}
          </Tabs.Panel>
        ))}
      </Tabs>
    </>
  );
}
