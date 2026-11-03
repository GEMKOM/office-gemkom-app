import { Button, Modal, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ESTIMATE_STATUS, estimatesQueryOptions, estimatorKeys, REVIEW_LABELS, type EstimateRow } from '@/api/projects/estimator';
import { customersQueryOptions, useCustomer } from '@/api/reference/customers';
import { formatDateTime } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  ModalBody,
  ModalHeader,
  modalClassNames,
  notify,
  PageHeader,
  SelectRemote,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { EstimateReport } from '../estimate-report/EstimateReport';
import { badgeFamily } from '../estimate-report/LegacyBadge';
import { fmt } from '../estimate-report/reportModel';

interface Row extends EstimateRow {
  in_house: number | null;
  subcontract: number | null;
  eur_kg: number | null;
}

const EMPTY_ROWS: Row[] = [];

const FILTERS: FilterConfig<'q' | 'status' | 'reviewed' | 'kind'>[] = [
  { key: 'q', type: 'text', placeholder: 'İş emri, teklif no, başlık…' },
  {
    key: 'status',
    type: 'multiselect',
    label: 'Durum',
    options: Object.entries(ESTIMATE_STATUS).map(([value, s]) => ({ value, label: s.label })),
  },
  {
    key: 'reviewed',
    type: 'select',
    label: 'İnceleme',
    options: [
      { value: '0', label: 'İncelenmemiş' },
      { value: '1', label: 'İncelenmiş' },
    ],
  },
  {
    key: 'kind',
    type: 'select',
    label: 'Konu',
    options: [
      { value: 'job', label: 'İş emri' },
      { value: 'offer', label: 'Teklif' },
    ],
  },
];

const money = (v: number | null | undefined, digits: number) => (v == null ? '—' : fmt(v, digits));

const columns: DataTableColumn<Row>[] = [
  {
    key: 'subject_key',
    header: 'İş / Teklif',
    width: 120,
    render: (row) => (
      <>
        <strong>{row.subject_key}</strong>{' '}
        <Text span size="xs" c="dimmed">
          v{row.version}
        </Text>
      </>
    ),
  },
  { key: 'title', header: 'Başlık' },
  { key: 'customer', header: 'Müşteri' },
  {
    key: 'status',
    header: 'Durum',
    width: 110,
    render: (row) => {
      const s = ESTIMATE_STATUS[row.status];
      return <StatusBadge color={badgeFamily(s?.badge)}>{s?.label ?? row.status}</StatusBadge>;
    },
    exportValue: (row) => ESTIMATE_STATUS[row.status]?.label ?? row.status,
  },
  { key: 'in_house', header: 'İç imalat €', align: 'right', render: (row) => money(row.in_house, 0) },
  { key: 'subcontract', header: 'Taşeron €', align: 'right', render: (row) => money(row.subcontract, 0) },
  { key: 'eur_kg', header: '€/kg', align: 'right', render: (row) => money(row.eur_kg, 2) },
  {
    key: 'suggested_price_eur',
    header: 'Önerilen fiyat €',
    align: 'right',
    render: (row) => money(row.suggested_price_eur, 0),
  },
  {
    key: 'review_decision',
    header: 'İnceleme',
    width: 120,
    accessor: (row) => row.review_decision || '',
    render: (row) => {
      const r = REVIEW_LABELS[row.review_decision || ''] ?? REVIEW_LABELS['']!;
      return (
        <span title={row.reviewed_by_name || undefined}>
          <StatusBadge color={badgeFamily(r.badge)}>{r.label}</StatusBadge>
        </span>
      );
    },
    exportValue: (row) => (REVIEW_LABELS[row.review_decision || ''] ?? REVIEW_LABELS['']!).label,
  },
  {
    key: 'usage_usd',
    header: 'USD',
    align: 'right',
    accessor: (row) => Number(row.usage_usd || 0),
    render: (row) => fmt(Number(row.usage_usd || 0), 2),
  },
  {
    key: 'created_at',
    header: 'Oluşturma',
    width: 130,
    accessor: (row) => row.created_at ?? '',
    render: (row) => (
      <>
        {formatDateTime(row.created_at)}
        {row.created_by_name ? (
          <Text size="xs" c="dimmed">
            {row.created_by_name}
          </Text>
        ) : null}
      </>
    ),
    exportValue: (row) => formatDateTime(row.created_at),
  },
];

/**
 * Port of projects/estimates (estimates.js), Tahminler: every Tahmin report of
 * job orders and offers, filtered by customer / status / review / subject,
 * one opened in a full-screen modal with the report card. `?report=<id>`
 * opens it directly, as legacy did.
 */
export function EstimatesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useUrlFilters({ q: '', customer: '', status: [] as string[], reviewed: '', kind: '' });
  const { values } = filters;
  const list = useQuery({
    ...estimatesQueryOptions({
      q: values.q || undefined,
      customer: values.customer || undefined,
      status: values.status.length ? values.status.join(',') : undefined,
      reviewed: values.reviewed || undefined,
      limit: 500,
    }),
    placeholderData: keepPreviousData,
  });
  const customer = useCustomer(values.customer || null);

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Tahminler yüklenemedi' });
  }, [list.isError, list.error]);

  // The subject filter is applied here, as legacy did (the API has no such param).
  const rows = useMemo<Row[]>(
    () =>
      (list.data ?? EMPTY_ROWS)
        .filter((r) => !values.kind || r.subject_kind === values.kind)
        .map((r) => ({
          ...r,
          in_house: r.expected_total_eur?.in_house ?? null,
          subcontract: r.expected_total_eur?.subcontract ?? null,
          eur_kg: r.eur_per_kg?.in_house ?? r.eur_per_kg?.subcontract ?? null,
        })),
    [list.data, values.kind],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      open: rows.filter((r) => r.status === 'queued' || r.status === 'running').length,
      unreviewed: rows.filter((r) => r.status === 'done' && !r.review_decision).length,
      usd: rows.reduce((s, r) => s + Number(r.usage_usd || 0), 0),
    }),
    [rows],
  );

  const reportParam = Number(searchParams.get('report')) || null;
  const openRow = rows.find((r) => r.id === reportParam);
  const setReport = (id: number | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('report', String(id));
        else next.delete('report');
        return next;
      },
      { replace: true },
    );

  const figure = (value: string | number) => (list.isPending ? '–' : value);

  return (
    <>
      <PageHeader
        title="Tahminler"
        subtitle="Çizimlerden üretilen maliyet ve risk raporları — iş emirleri ve teklifler"
        icon="fas fa-calculator"
        backTo="/projects/"
        stats={[
          { id: 'stat-reports', label: 'Rapor', value: figure(stats.total) },
          { id: 'stat-open', label: 'Çalışıyor / sırada', value: figure(stats.open) },
          { id: 'stat-unreviewed', label: 'İncelenmemiş', value: figure(stats.unreviewed) },
          { id: 'stat-usd', label: 'Model maliyeti (USD)', value: figure(fmt(stats.usd, 2)) },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            loading={list.isFetching}
            onClick={() => void list.refetch()}
          >
            Yenile
          </Button>
        }
      />

      <DataTable
        data={list.data ? rows : EMPTY_ROWS}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sortable
        pagination={{ pageSize: 20 }}
        exportable={{ fileName: 'tahminler' }}
        onRowClick={(row) => setReport(row.id)}
        emptyMessage="Filtreye uyan tahmin yok"
        filters={
          <FilterBar
            inline
            filters={FILTERS}
            values={values}
            onApply={filters.apply}
            onClear={filters.reset}
            extra={
              <div style={{ minWidth: 240 }}>
                <SelectRemote
                  aria-label="Müşteri"
                  placeholder="Müşteri ara (en az 3 karakter)"
                  queryKey={['estimates-customer-search']}
                  minSearchLength={3}
                  value={values.customer || null}
                  initialOptions={
                    customer.data
                      ? [{ value: String(customer.data.id), label: customer.data.name || customer.data.code || '' }]
                      : []
                  }
                  clearable
                  onChange={(value) => filters.apply({ customer: value ?? '' })}
                  search={async (term) => {
                    const res = await queryClient.fetchQuery(
                      customersQueryOptions({ search: term.trim(), is_active: true, page_size: 50 }),
                    );
                    return res.results.map((c) => ({ value: String(c.id), label: c.name || c.code || `#${c.id}` }));
                  }}
                />
              </div>
            }
          />
        }
      />

      {reportParam ? (
        <Modal
          opened
          fullScreen
          withCloseButton={false}
          classNames={modalClassNames}
          closeOnClickOutside={false}
          onClose={() => {
            setReport(null);
            // A review or a new version changes the row.
            void queryClient.invalidateQueries({ queryKey: [...estimatorKeys.all, 'estimates', 'list'] });
          }}
        >
          <ModalHeader
            icon="fas fa-calculator"
            title={
              openRow
                ? `${openRow.subject_key} · v${openRow.version}${openRow.title ? ` — ${openRow.title}` : ''}`
                : 'Tahmin raporu'
            }
          />
          <ModalBody>
            <EstimateReport subject={{ reportId: reportParam }} />
          </ModalBody>
        </Modal>
      ) : null}
    </>
  );
}
