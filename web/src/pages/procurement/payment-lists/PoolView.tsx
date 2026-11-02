import { Button } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { paymentPoolQueryOptions, type PoolRow } from '@/api/procurement/paymentLists';
import { DataTable, FaIcon, FilterBar, notify, PageHeader, useUrlFilters, type RowAction } from '@/ui';
import { currencyBreakdown, fmtEur, sumEur, todayIso } from './format';
import type { OpenModal } from './modals';
import classes from './PaymentLists.module.css';
import { excelColumns, POOL_FILTER_DEFAULTS, poolParams, poolRowId, usePoolFilterConfig, type PoolFilterValues } from './poolShared';
import { ViewSwitcher } from './ViewSwitcher';

const URL_DEFAULTS = { ...POOL_FILTER_DEFAULTS, page: '1', page_size: '50' };
const EMPTY_FILTERS: PoolFilterValues = {
  basis: '',
  currency: '',
  q: '',
  po_date: { start: '', end: '' },
  hide_listed: false,
  job_no: [],
  gs: [],
  supplier: [],
};

const columns = excelColumns<PoolRow>({ withListed: true });

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type PoolSelection = ReadonlyMap<string, PoolRow>;

/** Keep the selected rows across pages: ids from the table, rows from what was on screen. */
export function nextSelection(prev: PoolSelection, ids: string[], pageRows: readonly PoolRow[]): Map<string, PoolRow> {
  const onPage = new Map(pageRows.map((r) => [poolRowId(r), r]));
  const next = new Map<string, PoolRow>();
  for (const id of ids) {
    const row = onPage.get(id) ?? prev.get(id);
    if (row) next.set(id, row);
  }
  return next;
}

interface PoolViewProps {
  openModal: OpenModal;
  selection: PoolSelection;
  onSelectionChange: (next: Map<string, PoolRow>) => void;
}

/** Port of poolView.js: every unpaid instalment of a live order, with the bulk bar. */
export function PoolView({ openModal, selection, onSelectionChange }: PoolViewProps) {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<PoolFilterValues>(
    () => ({
      basis: values.basis,
      currency: values.currency,
      q: values.q,
      po_date: values.po_date,
      hide_listed: values.hide_listed,
      job_no: values.job_no,
      gs: values.gs,
      supplier: values.supplier,
    }),
    [values.basis, values.currency, values.q, values.po_date, values.hide_listed, values.job_no, values.gs, values.supplier],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 50);
  const filterConfig = usePoolFilterConfig();

  const pool = useQuery(paymentPoolQueryOptions(poolParams(filters, { page, pageSize })));
  useEffect(() => {
    if (pool.isError) notify.error(pool.error, { fallback: 'Ödeme havuzu yüklenemedi' });
  }, [pool.isError, pool.error, pool.errorUpdatedAt]);
  const rows = pool.isError ? [] : (pool.data?.results ?? []);
  const total = pool.isError ? 0 : (pool.data?.count ?? 0);

  const selectedRows = [...selection.values()];
  const clearSelection = () => onSelectionChange(new Map());

  const rowActions = (row: PoolRow): RowAction<PoolRow>[] => [
    {
      key: 'paid',
      label: 'Ödendi İşaretle',
      icon: 'fas fa-check',
      color: 'success',
      hidden: Boolean(row.is_paid),
      onClick: (r) => openModal({ kind: 'markPaid', row: r, mode: 'pool' }),
    },
    { key: 'proforma', label: 'Proforma', icon: 'fas fa-paperclip', onClick: (r) => openModal({ kind: 'proforma', row: r }) },
    { key: 'split', label: 'Böl (taksitlendir)', icon: 'fas fa-scissors', onClick: (r) => openModal({ kind: 'split', row: r }) },
    {
      key: 'po',
      label: 'Sipariş detayı',
      icon: 'fas fa-external-link-alt',
      onClick: (r) => window.open(`/finance/purchase-orders/?order=${r.po.id}`, '_blank', 'noopener'),
    },
  ];

  return (
    <>
      <PageHeader
        title="Ödeme Havuzu"
        subtitle="Ödenmemiş sipariş taksitleri — listeye ekle, böl, proforma yükle, toplu ödendi işaretle"
        icon="water"
        backTo="/procurement/payment-lists"
      />
      <ViewSwitcher active="pool" />
      <DataTable
        title="Ödeme Havuzu"
        icon="fas fa-water"
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
        getRowId={poolRowId}
        loading={pool.isFetching}
        selection={{
          selectedIds: [...selection.keys()],
          onChange: (ids) => onSelectionChange(nextSelection(selection, ids, rows)),
        }}
        rowActions={rowActions}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        stickyHeader
        verticalSpacing="xs"
        exportable={{ fileName: `odeme_havuzu_${todayIso()}` }}
        onRefresh={() => void pool.refetch()}
        emptyMessage="Havuzda bekleyen taksit yok."
      />
      {selectedRows.length ? (
        <div className={`${classes.bulkBar} ${classes.noPrint}`} data-testid="pool-bulk-bar">
          <span style={{ marginRight: 'auto' }}>
            <strong>{selectedRows.length}</strong> kalem seçildi · toplam <strong>{fmtEur(sumEur(selectedRows))}</strong>{' '}
            <span className={classes.sub}>({currencyBreakdown(selectedRows)})</span>
          </span>
          <Button
            size="xs"
            leftSection={<FaIcon icon="fas fa-list-check" />}
            onClick={() => openModal({ kind: 'addToList', rows: selectedRows, onDone: clearSelection })}
          >
            Listeye Ekle
          </Button>
          <Button
            size="xs"
            color="green"
            leftSection={<FaIcon icon="fas fa-check-double" />}
            onClick={() => openModal({ kind: 'bulkPaid', rows: selectedRows, onDone: clearSelection })}
          >
            Ödendi İşaretle (toplu)
          </Button>
          <Button size="xs" variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={clearSelection}>
            Seçimi Temizle
          </Button>
        </div>
      ) : null}
    </>
  );
}
