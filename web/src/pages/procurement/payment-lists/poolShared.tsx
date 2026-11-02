import { Anchor } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import {
  paymentPoolFacetsQueryOptions,
  type FacetOption,
  type PaymentPoolParams,
  type PoolRow,
} from '@/api/procurement/paymentLists';
import { notify, StatusBadge, type DataTableColumn, type DateRange, type FilterConfig } from '@/ui';
import {
  BASIS_OPTIONS,
  CURRENCY_OPTIONS,
  LIST_STATUS_FAMILY,
  customersOf,
  fmtDate,
  fmtEur,
  fmtMoney,
  fmtPct,
  isOverdue,
  jobNosOf,
  rowEur,
  scheduleHead,
} from './format';
import classes from './PaymentLists.module.css';

// Shared by the Ödeme Havuzu view, the "Havuzdan Ekle" picker and the list
// detail (was the shared half of poolView.js).

export const poolRowId = (row: PoolRow) => String(row.schedule_id);

const Dash = () => <span style={{ color: 'var(--gk-muted)' }}>-</span>;

function termsSub(row: PoolRow): string {
  return [row.terms?.name || row.basis_label || '', fmtPct(row.percentage)].filter(Boolean).join(' · ');
}

/** Excel: MÜŞTERİ | İŞ NO | MALZEME | TEDARİKÇİ | TOPLAM | ... */
export function excelColumns<T extends PoolRow>({ withListed = true } = {}): DataTableColumn<T>[] {
  const columns: DataTableColumn<T>[] = [
    {
      key: 'customers',
      header: 'Müşteri',
      width: 130,
      render: (row) => customersOf(row).join(', ') || <Dash />,
      exportValue: (row) => customersOf(row).join(', '),
    },
    {
      key: 'job_nos',
      header: 'İş No',
      width: 110,
      render: (row) => {
        const jobs = jobNosOf(row);
        return jobs.length ? (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {jobs.map((j, i) => (
              <StatusBadge key={`${j}-${i}`} color="grey">
                {j}
              </StatusBadge>
            ))}
          </span>
        ) : (
          <Dash />
        );
      },
      exportValue: (row) => jobNosOf(row).join(' '),
    },
    {
      key: 'gs_numbers',
      header: 'GS No',
      width: 100,
      render: (row) =>
        row.gs_numbers?.length ? (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {row.gs_numbers.map((gs, i) => (
              <StatusBadge key={`${gs}-${i}`} color="blue">
                {gs}
              </StatusBadge>
            ))}
          </span>
        ) : (
          <Dash />
        ),
      exportValue: (row) => (row.gs_numbers ?? []).join(' '),
    },
    {
      key: 'items_summary',
      header: 'Malzeme',
      render: (row) => {
        const pr = row.pr?.request_number;
        return (
          <>
            {row.items_summary || '-'}
            <div className={classes.sub}>
              {row.line_count || 0} kalem
              {pr ? (
                <>
                  {' · '}
                  <Anchor
                    href={`/procurement/purchase-requests/registry/?talep=${encodeURIComponent(pr)}`}
                    target="_blank"
                    rel="noopener"
                    size="xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pr}
                  </Anchor>
                </>
              ) : null}
            </div>
          </>
        );
      },
      exportValue: (row) =>
        `${row.items_summary || '-'}${row.line_count || 0} kalem${row.pr?.request_number ? ` · ${row.pr.request_number}` : ''}`,
    },
    {
      key: 'supplier',
      header: 'Tedarikçi',
      width: 150,
      render: (row) => (
        <>
          {row.supplier?.name || '-'}
          {row.supplier?.has_dbs ? (
            <>
              {' '}
              <StatusBadge color="purple">DBS</StatusBadge>
            </>
          ) : null}
        </>
      ),
      exportValue: (row) => `${row.supplier?.name || '-'}${row.supplier?.has_dbs ? ' DBS' : ''}`,
    },
    {
      key: 'po_gross_total',
      header: 'PO Toplam (KDV dahil)',
      width: 140,
      align: 'right',
      render: (row) => (
        <span className={classes.money}>
          {fmtMoney(row.po?.gross_total, row.po?.currency)}
          <div className={classes.sub}>PO-{row.po?.id ?? '-'}</div>
        </span>
      ),
      exportValue: (row) => `${fmtMoney(row.po?.gross_total, row.po?.currency)}PO-${row.po?.id ?? '-'}`,
    },
    {
      key: 'gross_amount',
      header: 'Bu Ödeme',
      width: 140,
      align: 'right',
      render: (row) => (
        <span className={classes.money}>
          {fmtMoney(row.gross_amount, row.currency)}
          {row.currency !== 'EUR' ? <div className={classes.sub}>≈ {fmtEur(rowEur(row))}</div> : null}
        </span>
      ),
      exportValue: (row) =>
        `${fmtMoney(row.gross_amount, row.currency)}${row.currency !== 'EUR' ? `≈ ${fmtEur(rowEur(row))}` : ''}`,
    },
    {
      key: 'eur',
      header: 'EUR',
      width: 110,
      align: 'right',
      render: (row) => <span className={classes.money}>{fmtEur(rowEur(row))}</span>,
      exportValue: (row) => fmtEur(rowEur(row)),
    },
    {
      key: 'terms',
      header: 'Ödeme Şekli',
      width: 160,
      render: (row) => (
        <>
          {scheduleHead(row)}
          <div className={classes.sub}>{termsSub(row)}</div>
        </>
      ),
      exportValue: (row) => `${scheduleHead(row)}${termsSub(row)}`,
    },
    {
      key: 'po_created_at',
      header: 'Sipariş Tarihi',
      width: 100,
      render: (row) => fmtDate(row.po?.created_at),
      exportValue: (row) => fmtDate(row.po?.created_at),
    },
    {
      key: 'due_date',
      header: 'Vade',
      width: 100,
      render: (row) =>
        isOverdue(row.due_date, row.is_paid) ? (
          <span className={classes.danger}>{fmtDate(row.due_date)}</span>
        ) : (
          fmtDate(row.due_date)
        ),
      exportValue: (row) => fmtDate(row.due_date),
    },
    {
      key: 'proforma',
      header: 'Proforma',
      width: 90,
      render: (row) =>
        (row.po?.proforma_count ?? 0) > 0 ? (
          <StatusBadge color="green">{row.po.proforma_count} dosya</StatusBadge>
        ) : (
          <StatusBadge color="orange">Yok</StatusBadge>
        ),
      exportValue: (row) => ((row.po?.proforma_count ?? 0) > 0 ? `${row.po.proforma_count} dosya` : 'Yok'),
    },
  ];
  if (withListed) {
    columns.push({
      key: 'open_list',
      header: 'Listede',
      width: 150,
      render: (row) => {
        const v = row.open_list;
        if (!v) return <span style={{ color: 'var(--gk-muted)' }}>—</span>;
        return (
          <Link
            to={`?list=${v.id}`}
            title={v.status_label || ''}
            style={{ textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusBadge color={LIST_STATUS_FAMILY[v.status] ?? 'grey'}>{v.title}</StatusBadge>
          </Link>
        );
      },
      exportValue: (row) => row.open_list?.title ?? '—',
    });
  }
  return columns;
}

// ---- filters -----------------------------------------------------------------

export interface PoolFilterValues {
  [key: string]: string | boolean | string[] | DateRange;
  basis: string;
  currency: string;
  q: string;
  po_date: DateRange;
  hide_listed: boolean;
  job_no: string[];
  gs: string[];
  supplier: string[];
}

export const POOL_FILTER_DEFAULTS: PoolFilterValues = {
  basis: 'immediate',
  currency: '',
  q: '',
  po_date: { start: '', end: '' },
  hide_listed: true,
  job_no: [],
  gs: [],
  supplier: [],
};

const toOptions = (rows: FacetOption[] | undefined) =>
  (rows ?? []).map((r) => ({ value: String(r.value), label: r.label }));

/**
 * The pool filter row; job no / GS / supplier options are the values that
 * occur in the pool, fetched once per page load and shared with the picker.
 */
export function usePoolFilterConfig({ forceHideListed = false } = {}): FilterConfig<keyof PoolFilterValues & string>[] {
  const facets = useQuery(paymentPoolFacetsQueryOptions());
  useEffect(() => {
    if (facets.isError) notify.error(facets.error, { fallback: 'Filtre seçenekleri yüklenemedi' });
  }, [facets.isError, facets.error]);
  const data = facets.data;
  return useMemo(() => {
    const config: FilterConfig<keyof PoolFilterValues & string>[] = [
      { type: 'text', key: 'q', label: 'Ara', placeholder: 'Tedarikçi, iş no, malzeme, PR / GS no…' },
      {
        type: 'select',
        key: 'basis',
        label: 'Ödeme Şekli',
        options: BASIS_OPTIONS,
        placeholder: 'Peşin / Avans (varsayılan)',
        searchable: false,
      },
      { type: 'select', key: 'currency', label: 'Para Birimi', options: CURRENCY_OPTIONS, placeholder: 'Tümü', searchable: false },
      { type: 'dateRange', key: 'po_date', label: 'Sipariş Tarihi' },
    ];
    if (!forceHideListed) config.push({ type: 'checkbox', key: 'hide_listed', label: 'Listede olanları gizle' });
    config.push(
      { type: 'multiselect', key: 'job_no', label: 'İş No', options: toOptions(data?.job_nos), placeholder: 'Tümü' },
      { type: 'multiselect', key: 'gs', label: 'GS No', options: toOptions(data?.gs_numbers), placeholder: 'Tümü' },
      { type: 'multiselect', key: 'supplier', label: 'Tedarikçi', options: toOptions(data?.suppliers), placeholder: 'Tümü' },
    );
    return config;
  }, [data, forceHideListed]);
}

/** Multi-select values travel as one comma-separated param. */
const csv = (list: string[]) => {
  const kept = list.filter((x) => x !== '' && x !== null && x !== undefined);
  return kept.length ? kept.join(',') : undefined;
};

/** Port of poolParams. */
export function poolParams(
  v: PoolFilterValues,
  { page, pageSize, forceHideListed = false }: { page: number; pageSize: number; forceHideListed?: boolean },
): PaymentPoolParams {
  const hideListed = forceHideListed ? true : v.hide_listed === true;
  return {
    basis: v.basis || undefined,
    currency: v.currency || undefined,
    q: v.q.trim() || undefined,
    job_no: csv(v.job_no),
    gs: csv(v.gs),
    supplier: csv(v.supplier),
    created_after: v.po_date.start || undefined,
    created_before: v.po_date.end || undefined,
    listed: hideListed ? 'false' : undefined,
    page,
    page_size: pageSize,
  };
}
