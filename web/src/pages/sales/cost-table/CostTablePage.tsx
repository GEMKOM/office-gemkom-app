import { Badge, Button } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  costChildrenQueryOptions,
  costKeys,
  costTableQueryOptions,
  useUpdateSellingPrice,
  type CostTableRow,
} from '@/api/projects/cost';
import { customersQueryOptions, useCustomer } from '@/api/reference/customers';
import {
  DATE_FIELD_OPTIONS,
  MANUFACTURED_OPTIONS,
  mergeExpandedChildren,
  type TreeRow,
} from '@/pages/management/analytics/analyticsData';
import { CatalogPicker } from '@/pages/management/analytics/CatalogPicker';
import { joinNodeIds, parseNodeIds } from '@/pages/management/analytics/catalogTree';
import {
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  SelectRemote,
  toOrdering,
  useUrlFilters,
  type CellEdit,
  type FilterConfig,
} from '@/ui';
import { costColumns, type DrillKind } from './columns';
import { DEFAULT_ORDERING, samePrice, STATUS_OPTIONS, tableFilters } from './costTableData';
import {
  JobDetailsModal,
  MachiningDetailsModal,
  MaterialDetailsModal,
  SubcontractorDetailsModal,
  WeldingDetailsModal,
} from './modals';

// Every filter, the sort and the page live in the URL (legacy kept none).
const URL_DEFAULTS = {
  status: '',
  search: '',
  customer: '',
  manufactured: '',
  date_field: '',
  date: { start: '', end: '' },
  template_node: '',
  ordering: DEFAULT_ORDERING,
  page: '1',
  page_size: '20',
};

type PillKeys = 'status' | 'search' | 'manufactured' | 'date_field' | 'date';

const filterConfig: FilterConfig<PillKeys>[] = [
  { type: 'text', key: 'search', label: 'Ara (iş no / başlık)', placeholder: 'Örn: pump' },
  { type: 'select', key: 'status', label: 'Durum', placeholder: 'Tümü', options: STATUS_OPTIONS },
  {
    type: 'select',
    key: 'manufactured',
    label: 'İmalat',
    placeholder: 'Tümü',
    options: MANUFACTURED_OPTIONS,
  },
  {
    type: 'select',
    key: 'date_field',
    label: 'Tarih Alanı',
    placeholder: 'Hedef Tarih',
    options: DATE_FIELD_OPTIONS,
  },
  { type: 'dateRange', key: 'date', label: 'Tarih Aralığı' },
];

const EMPTY_ROWS: CostTableRow[] = [];

interface Drill {
  kind: DrillKind;
  jobNo: string;
}

/** Port of sales/cost-table (costTable.js): every job order's cost summary, selling price editable. */
export function CostTablePage() {
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
        manufactured: values.manufactured,
        date_field: values.date_field,
        date: values.date,
        template_node: values.template_node,
      }),
    [
      values.status,
      values.search,
      values.customer,
      values.manufactured,
      values.date_field,
      values.date,
      values.template_node,
    ],
  );
  const params = useMemo(
    () => ({ ...filters, ordering, page, page_size: pageSize }),
    [filters, ordering, page, pageSize],
  );

  const table = useQuery({ ...costTableQueryOptions(params), placeholderData: keepPreviousData });
  const roots = table.isError ? EMPTY_ROWS : (table.data?.results ?? EMPTY_ROWS);
  const total = table.isError ? 0 : (table.data?.count ?? 0);

  useEffect(() => {
    if (table.isError) notify.error(`Maliyet tablosu yüklenemedi: ${errorMessage(table.error)}`);
  }, [table.isError, table.errorUpdatedAt, table.error]);

  // Expanded rows belong to one load of the table: new filters, a new page or
  // sort and Yenile collapse them (legacy loadData). A saved selling price does not.
  const [reloads, setReloads] = useState(0);
  const loadKey = `${JSON.stringify(params)}#${reloads}`;
  const [expansion, setExpansion] = useState<{ key: string; jobs: string[] }>({
    key: '',
    jobs: [],
  });
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

  const [drills, setDrills] = useState<Drill[]>([]);
  const openDrill = useCallback(
    (kind: DrillKind, jobNo: string) => setDrills((prev) => [...prev, { kind, jobNo }]),
    [],
  );
  const closeDrill = useCallback(() => setDrills((prev) => prev.slice(0, -1)), []);

  const expandedKey = [...shownExpanded].join(',');
  const loadingKey = [...loadingChildren].join(',');
  const withChildrenKey = [...withChildren].join(',');
  const columns = useMemo(
    () =>
      costColumns({
        expanded: new Set(expandedKey ? expandedKey.split(',') : []),
        loadingChildren: new Set(loadingKey ? loadingKey.split(',') : []),
        withChildren: new Set(withChildrenKey ? withChildrenKey.split(',') : []),
        onToggle: toggle,
        onDrill: openDrill,
      }),
    [expandedKey, loadingKey, withChildrenKey, toggle, openDrill],
  );

  const updatePrice = useUpdateSellingPrice();
  const onCellEdit = ({ row, value }: CellEdit<TreeRow>) => {
    if (typeof value !== 'number' || samePrice(value, row.selling_price)) return;
    return updatePrice.mutateAsync({ jobNo: row.job_no, price: value }).catch((error: unknown) => {
      throw new Error(`Satış fiyatı güncellenemedi: ${errorMessage(error)}`);
    });
  };

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

  const refresh = () => {
    setReloads((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: costKeys.all });
  };

  return (
    <>
      <PageHeader
        title="Maliyet Tablosu"
        subtitle="Tüm iş emirlerinin maliyet özeti: işçilik, malzeme, taşeron, boya, kalite, sevkiyat ve toplam maliyet."
        icon="fas fa-calculator"
        backTo="/sales"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
            loading={table.isFetching && !table.isPending}
          >
            Yenile
          </Button>
        }
      />

      <DataTable
        title="Maliyet Tablosu"
        icon="fas fa-calculator"
        data={rows}
        columns={columns}
        getRowId={(row) => `${row.hierarchy_level}-${row.job_no}`}
        loading={table.isFetching}
        skeleton
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              status: values.status,
              search: values.search,
              manufactured: values.manufactured,
              date_field: values.date_field,
              date: values.date,
            }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              setDraftNodes(null);
              reset();
            }}
            extra={
              <div style={{ minWidth: 240 }}>
                <SelectRemote
                  aria-label="Müşteri"
                  placeholder="Müşteri ara (en az 3 karakter)"
                  queryKey={['cost-table-customer-search']}
                  minSearchLength={3}
                  value={values.customer || null}
                  initialOptions={customerOptions}
                  clearable
                  onChange={(value) => apply({ customer: value ?? '', page: '1' })}
                  search={async (term) => {
                    const res = await queryClient.fetchQuery(
                      customersQueryOptions({
                        search: term.trim(),
                        is_active: true,
                        page_size: 50,
                      }),
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
        }
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
        }
        onCellEdit={onCellEdit}
        stickyHeader
        emptyMessage="Kayıt bulunamadı."
        onRefresh={refresh}
        exportable={{ fileName: 'maliyet-tablosu' }}
      />

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
        const { jobNo } = drill;
        switch (drill.kind) {
          case 'job':
            return (
              <JobDetailsModal
                key={index}
                jobNo={jobNo}
                onClose={closeDrill}
                onDepartment={(kind) => openDrill(kind, jobNo)}
              />
            );
          case 'machining':
            return <MachiningDetailsModal key={index} jobNo={jobNo} onClose={closeDrill} />;
          case 'welding':
            return <WeldingDetailsModal key={index} jobNo={jobNo} onClose={closeDrill} />;
          case 'material':
            return <MaterialDetailsModal key={index} jobNo={jobNo} onClose={closeDrill} />;
          case 'subcontractor':
            return <SubcontractorDetailsModal key={index} jobNo={jobNo} onClose={closeDrill} />;
          default:
            return null;
        }
      })}
    </>
  );
}
