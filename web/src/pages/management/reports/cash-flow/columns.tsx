import { Progress } from '@mantine/core';
import { formatNumber } from '@/lib/format';
import { FaIcon, type DataTableColumn } from '@/ui';
import { expirySoon, num, utilizationTone, type CashFlowRow, type DbsRow } from './cashFlowData';
import { eur, nativeAmount, NetAmount } from './money';
import classes from './cashFlow.module.css';

const EUR_FORMAT = '#,##0.00 "€"';

export const monthlyColumns: DataTableColumn<CashFlowRow>[] = [
  {
    key: 'monthLabel',
    header: 'Ay',
    accessor: 'month',
    exportValue: (row) => row.monthLabel,
    render: (row) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        {row.monthLabel}
        {row.crossesZero ? (
          <span className={classes.crossMark} title="Kümülatif net bu ay işaret değiştirdi">
            <FaIcon icon="fas fa-right-left" /> işaret değişti
          </span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'inflow',
    header: 'Giriş',
    align: 'right',
    exportFormat: EUR_FORMAT,
    render: (row) => <span className={classes.in}>{eur(row.inflow)}</span>,
  },
  {
    key: 'outflow',
    header: 'Çıkış',
    align: 'right',
    exportFormat: EUR_FORMAT,
    render: (row) => <span className={classes.out}>{eur(row.outflow)}</span>,
  },
  {
    key: 'net',
    header: 'Net',
    align: 'right',
    exportFormat: EUR_FORMAT,
    render: (row) => <NetAmount value={row.net} />,
  },
  {
    key: 'cumulative',
    header: 'Küm. Net',
    align: 'right',
    exportFormat: EUR_FORMAT,
    render: (row) => <NetAmount value={row.cumulative} bold />,
  },
  {
    key: 'paid',
    header: 'Ödenen',
    align: 'right',
    exportFormat: EUR_FORMAT,
    render: (row) => <span className={classes.muted}>{eur(row.paid)}</span>,
  },
  {
    key: 'awaiting',
    header: 'Bekleyen',
    align: 'right',
    exportFormat: EUR_FORMAT,
    render: (row) => (
      <span className={row.awaiting > 0 ? classes.await : classes.muted}>{eur(row.awaiting)}</span>
    ),
  },
  {
    key: 'po_count',
    header: 'PO',
    align: 'right',
    render: (row) => <span className={classes.muted}>{row.po_count}</span>,
  },
  {
    key: 'offer_count',
    header: 'Teklif',
    align: 'right',
    render: (row) => <span className={classes.muted}>{row.offer_count}</span>,
  },
];

const UTIL_COLOR = { bad: 'red', warning: 'yellow', normal: 'blue' } as const;

export function dbsColumns(now: Date): DataTableColumn<DbsRow>[] {
  return [
    { key: 'supplier_name', header: 'Tedarikçi' },
    { key: 'dbs_bank', header: 'Banka' },
    { key: 'dbs_currency', header: 'PB' },
    {
      key: 'dbs_used',
      header: 'Kullanılan',
      align: 'right',
      accessor: (row) => num(row.dbs_used),
      render: (row) => nativeAmount(row.dbs_used, row.dbs_currency),
    },
    {
      key: 'dbs_used_eur',
      header: 'Kullanılan (EUR)',
      align: 'right',
      accessor: (row) => num(row.dbs_used_eur),
      render: (row) => eur(row.dbs_used_eur),
    },
    {
      key: 'dbs_limit_eur',
      header: 'Limit (EUR)',
      align: 'right',
      accessor: (row) => num(row.dbs_limit_eur),
      render: (row) => (num(row.dbs_limit_eur) ? eur(row.dbs_limit_eur) : '—'),
    },
    {
      key: 'dbs_available_eur',
      header: 'Kalan (EUR)',
      align: 'right',
      accessor: (row) =>
        row.dbs_available_eur === null ||
        row.dbs_available_eur === undefined ||
        row.dbs_available_eur === ''
          ? null
          : num(row.dbs_available_eur),
      render: (row) =>
        row.dbs_available_eur !== null &&
        row.dbs_available_eur !== undefined &&
        row.dbs_available_eur !== '' ? (
          <span className={classes.in} style={{ fontWeight: 600 }}>
            {eur(row.dbs_available_eur)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'dbs_expiry_date',
      header: 'Vade',
      render: (row) => {
        if (!row.dbs_expiry_date) return '—';
        return expirySoon(row.dbs_expiry_date, now) ? (
          <span className={classes.overdue} title="30 gün içinde ya da geçmiş">
            <FaIcon icon="fas fa-triangle-exclamation" /> {row.dbs_expiry_date}
          </span>
        ) : (
          row.dbs_expiry_date
        );
      },
    },
    {
      key: 'utilization',
      header: 'Doluluk',
      sortable: false,
      exportValue: (row) => Math.round(row.utilization),
      render: (row) => {
        const pct = num(row.utilization);
        return (
          <span className={classes.util}>
            <Progress
              value={Math.min(100, pct)}
              color={UTIL_COLOR[utilizationTone(pct)]}
              size="sm"
              aria-label={`Doluluk ${formatNumber(pct, { maximumFractionDigits: 0 })}%`}
            />
            <small>{formatNumber(pct, { maximumFractionDigits: 0 })}%</small>
          </span>
        );
      },
    },
  ];
}
