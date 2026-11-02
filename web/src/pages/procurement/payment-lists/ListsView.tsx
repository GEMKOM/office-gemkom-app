import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { paymentListsQueryOptions, type PaymentList } from '@/api/procurement/paymentLists';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { fmtDate, fmtEur, LIST_STATUS_OPTIONS, ListStatusBadge, num, Pill } from './format';
import type { OpenModal } from './modals';
import classes from './PaymentLists.module.css';
import { ViewSwitcher } from './ViewSwitcher';

const URL_DEFAULTS = { status: 'open', q: '', gs: '', page: '1', page_size: '20' };

type FilterState = { status: string; q: string; gs: string };
const EMPTY_FILTERS: FilterState = { status: '', q: '', gs: '' };

const filterConfig: FilterConfig<keyof FilterState>[] = [
  { type: 'text', key: 'q', label: 'Ara', placeholder: 'Liste başlığı veya GS no…' },
  { type: 'select', key: 'status', label: 'Durum', options: LIST_STATUS_OPTIONS, placeholder: 'Tümü', searchable: false },
  { type: 'text', key: 'gs', label: 'GS No', placeholder: 'GS-10162, GS-9794' },
];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const Muted = ({ children }: { children: string }) => <span style={{ color: 'var(--gk-muted)' }}>{children}</span>;

const columns: DataTableColumn<PaymentList>[] = [
  {
    key: 'title',
    header: 'Başlık',
    render: (row) => (
      <>
        <strong>{row.title}</strong>
        <div className={classes.sub}>
          #{row.id}
          {row.created_by_name ? ` · ${row.created_by_name}` : ''}
        </div>
      </>
    ),
  },
  { key: 'list_date', header: 'Tarih', width: 100, render: (row) => fmtDate(row.list_date) },
  { key: 'status', header: 'Durum', width: 110, render: (row) => <ListStatusBadge status={row.status} label={row.status_label} /> },
  {
    key: 'budget_eur',
    header: 'Bütçe',
    width: 120,
    align: 'right',
    render: (row) => <span className={classes.money}>{num(row.budget_eur) === null ? '-' : fmtEur(row.budget_eur)}</span>,
  },
  {
    key: 'total_eur',
    header: 'Dahil Toplam',
    width: 130,
    align: 'right',
    render: (row) => (
      <span className={`${classes.money} ${row.totals?.over_budget ? classes.over : ''}`}>{fmtEur(row.totals?.total_eur)}</span>
    ),
  },
  {
    key: 'paid_eur',
    header: 'Ödenen',
    width: 120,
    align: 'right',
    render: (row) => <span className={classes.money}>{fmtEur(row.totals?.paid_eur)}</span>,
  },
  {
    key: 'included_count',
    header: 'Kalem',
    width: 90,
    render: (row) => {
      const t = row.totals ?? {};
      return (
        <>
          {t.paid_count ?? 0}/{t.included_count ?? 0}
          {t.excluded_count ? <div className={classes.sub}>{t.excluded_count} çıkarıldı</div> : null}
        </>
      );
    },
  },
  {
    key: 'proforma_missing',
    header: 'Proforma',
    width: 90,
    render: (row) => {
      const v = row.totals?.proforma_missing ?? 0;
      return v > 0 ? (
        <Pill color="orange">{v} eksik</Pill>
      ) : (
        <i className="fas fa-check" title="Tamam" style={{ color: 'var(--mantine-color-green-7)' }} aria-label="Tamam" />
      );
    },
  },
  {
    key: 'current_stage_name',
    header: 'Onay',
    render: (row) => {
      if (row.status === 'submitted') {
        const names = (row.pending_approver_names ?? []).join(', ');
        return (
          <>
            {row.current_stage_name || 'Onay'}
            <div className={classes.sub}>Bekleyen: {names || '-'}</div>
          </>
        );
      }
      if (row.status === 'sent_to_finance') {
        if (row.finance_email_error) return <Pill color="red" title={row.finance_email_error}>E-posta hatası</Pill>;
        return row.finance_email_sent_at ? (
          <Pill color="green">E-posta gönderildi</Pill>
        ) : (
          <Pill color="grey">E-posta bekleniyor</Pill>
        );
      }
      return <Muted>—</Muted>;
    },
  },
];

interface ListsViewProps {
  openModal: OpenModal;
  openList: (id: number) => void;
}

/** Port of listsView.js: stat figures + filterable table of lists. */
export function ListsView({ openModal, openList }: ListsViewProps) {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(() => ({ status: values.status, q: values.q, gs: values.gs }), [values.status, values.q, values.gs]);
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);

  const params = {
    status: filters.status || undefined,
    q: filters.q.trim() || undefined,
    gs:
      filters.gs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(',') || undefined,
    page,
    page_size: pageSize,
  };
  const list = useQuery({ ...paymentListsQueryOptions(params), placeholderData: keepPreviousData });
  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Ödeme listeleri yüklenemedi' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // Legacy loadStats: every open list (one 200-row page).
  const statsQuery = useQuery(paymentListsQueryOptions({ status: 'open', page_size: 200 }));
  const stats = useMemo(() => {
    const rows = statsQuery.data?.results;
    if (!rows) return null;
    const inFinance = rows
      .filter((r) => r.status === 'sent_to_finance')
      .reduce((acc, r) => acc + ((num(r.totals?.total_eur) || 0) - (num(r.totals?.paid_eur) || 0)), 0);
    return {
      open: rows.length,
      submitted: rows.filter((r) => r.status === 'submitted').length,
      inFinance,
      missing: rows.reduce((acc, r) => acc + (num(r.totals?.proforma_missing) || 0), 0),
    };
  }, [statsQuery.data]);
  const figure = (value: string | number | undefined) => (value === undefined ? '–' : String(value));

  const refresh = () => {
    void list.refetch();
    void statsQuery.refetch();
  };

  const rows = list.isError ? [] : (list.data?.results ?? []);
  const total = list.isError ? 0 : (list.data?.count ?? 0);

  const rowActions = (row: PaymentList): RowAction<PaymentList>[] => [
    { key: 'open', label: 'Aç', icon: 'fas fa-folder-open', color: 'primary', onClick: (r) => openList(r.id) },
    {
      key: 'carry',
      label: 'Yeni listeye aktar',
      icon: 'fas fa-forward',
      hidden: !['completed', 'cancelled'].includes(row.status),
      onClick: (r) => openModal({ kind: 'listForm', mode: 'create', carryOverFrom: r, onSaved: (saved) => openList(saved.id) }),
    },
    {
      key: 'cancel',
      label: 'İptal et',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: !['draft', 'submitted', 'rejected', 'approved'].includes(row.status),
      onClick: (r) => openModal({ kind: 'cancel', list: r }),
    },
  ];

  return (
    <>
      <PageHeader
        title="Ödeme Listeleri"
        subtitle="Haftalık tedarikçi ödeme planı: havuzdan seç, genel müdür onayı, finansa gönder"
        icon="money-check-dollar"
        backTo="/procurement/"
        stats={[
          { id: 'pl-open', label: 'Açık Liste', value: figure(stats?.open) },
          { id: 'pl-submitted', label: 'Onay Bekleyen', value: figure(stats?.submitted) },
          { id: 'pl-finance', label: 'Finansta Bekleyen (EUR)', value: stats ? fmtEur(stats.inFinance) : '–' },
          { id: 'pl-missing', label: 'Proforma Eksik Kalem', value: figure(stats?.missing) },
        ]}
        actions={
          <Button
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => openModal({ kind: 'listForm', mode: 'create', onSaved: (saved) => openList(saved.id) })}
          >
            Yeni Liste
          </Button>
        }
      />
      <ViewSwitcher active="lists" />
      <DataTable
        title="Ödeme Listeleri"
        icon="fas fa-list-check"
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
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        onRowClick={(row) => openList(row.id)}
        rowStyle={(row) => (row.status === 'submitted' ? { backgroundColor: 'var(--mantine-color-orange-0)' } : undefined)}
        rowActions={rowActions}
        onRefresh={refresh}
        emptyMessage='Ödeme listesi yok. "Yeni Liste" ile başlayın.'
      />
    </>
  );
}
