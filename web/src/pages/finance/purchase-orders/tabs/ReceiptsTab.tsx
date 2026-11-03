import { Badge, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cancelExpectedReceipt,
  deleteReceiptInstallment,
  financeErrorMessage,
  financeKeys,
  inflowTrackerQueryOptions,
  markReceiptInstallmentReceived,
  unmarkOfferInstallmentReceived,
  type InflowRow,
} from '@/api/finance/operations';
import { formatDate } from '@/lib/format';
import { AppLink, useAppNavigate } from '@/shell/AppLink';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type DataTableGrouping,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { CreateButton, FinanceHeader } from '../FinanceOperationsPage';
import classes from '../FinanceOperations.module.css';
import { daysUntil, money } from '../shared';
import {
  groupLabel,
  INFLOW_GROUPING_OPTIONS,
  INFLOW_SOURCE_OPTIONS,
  prepareInflowRows,
  readGrouping,
  sumEur,
  type InflowGrouping,
  type InflowTableRow,
} from '../receipts/inflow';
import {
  InstallmentFormModal,
  OfferReceivedModal,
  ReceiptFormModal,
} from '../receipts/ReceiptModals';

const URL_DEFAULTS = { is_received: 'false', source: '', grouping: 'due_month' };
type FilterKey = 'is_received' | 'source' | 'grouping';

const filterConfig: FilterConfig<FilterKey>[] = [
  {
    type: 'select',
    key: 'is_received',
    label: 'Tahsilat durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'false', label: 'Bekleyen' },
      { value: 'true', label: 'Tahsil edilen' },
    ],
  },
  {
    type: 'select',
    key: 'source',
    label: 'Kaynak',
    placeholder: 'Tümü',
    searchable: false,
    options: INFLOW_SOURCE_OPTIONS,
  },
  {
    type: 'select',
    key: 'grouping',
    label: 'Gruplama',
    searchable: false,
    options: INFLOW_GROUPING_OPTIONS,
  },
];

const offerLink = (offerNo: string) => `/sales/offers?offer_no=${encodeURIComponent(offerNo)}`;

function SourceBadge({ row }: { row: InflowRow }) {
  if (row.source === 'sales_offer') {
    return (
      <span
        className={`${classes.source} ${classes.sourceOffer}`}
        title="Satış teklifi ödeme planı"
      >
        <FaIcon icon="fas fa-lock" />
        Satış Teklifi
      </span>
    );
  }
  if (row.source === 'expected_receipt') {
    return <span className={`${classes.source} ${classes.sourceReceipt}`}>Beklenen Tahsilat</span>;
  }
  if (row.editable === false) {
    return (
      <span className={`${classes.source} ${classes.sourceOffer}`}>
        <FaIcon icon="fas fa-lock" />—
      </span>
    );
  }
  return <>—</>;
}

/** Received rows are struck through; badges and buttons are not. */
function Strike({ row, children }: { row: InflowRow; children: ReactNode }) {
  return row.is_received ? <span className={classes.received}>{children}</span> : <>{children}</>;
}

function DueDate({ row }: { row: InflowRow }) {
  if (!row.due_date) {
    return (
      <Text size="sm" c="dimmed" span>
        Vade yok
      </Text>
    );
  }
  const label = formatDate(row.due_date);
  const days = daysUntil(row.due_date);
  if (!row.is_received && days !== null && days < 0)
    return <span className={classes.overdue}>{label}</span>;
  return <Strike row={row}>{label}</Strike>;
}

function ReceivedStatus({ row }: { row: InflowRow }) {
  if (!row.is_received) return <StatusBadge color="yellow">Bekliyor</StatusBadge>;
  const meta = [row.received_at ? formatDate(row.received_at) : '', row.received_by ?? '']
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <StatusBadge color="green">Tahsil edildi</StatusBadge>
      {meta ? <span className={classes.sub}>{meta}</span> : null}
    </>
  );
}

const columns: DataTableColumn<InflowTableRow>[] = [
  { key: 'source', header: 'Kaynak', width: 118, render: (r) => <SourceBadge row={r} /> },
  {
    key: 'label',
    header: 'Taksit / Etiket',
    width: '16%',
    render: (r) => (
      <Strike row={r}>
        <strong>{r.label || '—'}</strong>
        {r.title ? <span className={classes.sub}>{r.title}</span> : null}
      </Strike>
    ),
  },
  {
    key: 'customer_name',
    header: 'Müşteri',
    width: '14%',
    render: (r) => <Strike row={r}>{r.customer_name || '—'}</Strike>,
  },
  {
    key: 'job_no',
    header: 'İş emri',
    width: 88,
    render: (r) =>
      r.job_no ? (
        <Strike row={r}>
          <span className={classes.nowrap} title={r.job_title ?? undefined}>
            {r.job_no}
          </span>
        </Strike>
      ) : (
        '—'
      ),
  },
  {
    key: 'reference_no',
    header: 'Referans',
    width: 108,
    render: (r) =>
      r.source === 'sales_offer' && r.offer_no ? (
        <AppLink to={offerLink(r.offer_no)} style={{ fontWeight: 600 }}>
          {r.offer_no}
        </AppLink>
      ) : (
        <Strike row={r}>{r.reference_no || '—'}</Strike>
      ),
  },
  { key: 'due_date', header: 'Vade', width: 100, render: (r) => <DueDate row={r} /> },
  {
    key: 'amount',
    header: 'Tutar',
    width: 120,
    align: 'right',
    render: (r) => {
      const currency = r.currency || 'EUR';
      return (
        <Strike row={r}>
          <span className={classes.money}>{money(r.amount, currency)}</span>
          {currency !== 'EUR' && r.amount_eur ? (
            <span className={classes.sub}>{money(r.amount_eur, 'EUR')}</span>
          ) : null}
        </Strike>
      );
    },
  },
  { key: 'is_received', header: 'Durum', width: 128, render: (r) => <ReceivedStatus row={r} /> },
];

function groupHeader(grouping: InflowGrouping): DataTableGrouping<InflowTableRow>['header'] {
  return (group) => (
    <span className={classes.groupHeader}>
      <strong>{groupLabel(String(group.value), grouping)}</strong>
      <Badge size="sm" color="gray">
        {group.rows.length} satır
      </Badge>
      <span className={classes.groupMeta}>{money(sumEur(group.rows), 'EUR')} EUR</span>
    </span>
  );
}

const EMPTY: InflowRow[] = [];

type Dialog =
  | { kind: 'receipt'; row: InflowRow | null }
  | { kind: 'installment'; row: InflowRow; mode: 'add' | 'edit' }
  | { kind: 'offer-received'; row: InflowRow };

/** Beklenen Tahsilatlar: sales-offer instalments and expected receipts, by due month. */
export function ReceiptsTab() {
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  const grouping = readGrouping(values.grouping);
  // The backend returns the whole tracker; legacy filtered it here.
  const list = useQuery(inflowTrackerQueryOptions());
  const all = list.data ?? EMPTY;
  const rows = useMemo(
    () =>
      prepareInflowRows(all, { isReceived: values.is_received, source: values.source, grouping }),
    [all, values.is_received, values.source, grouping],
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    if (list.isError)
      notify.error(financeErrorMessage(list.error, 'Tahsilatlar yüklenirken hata oluştu.'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: financeKeys.inflow });

  const run = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    try {
      await action();
      notify.success(success);
      refresh();
    } catch (error) {
      notify.error(financeErrorMessage(error, fallback));
    }
  };

  const quoted = (row: InflowRow) => (row.label ? `"${row.label}"` : 'Bu taksit');

  const markReceived = async (row: InflowRow) => {
    if (row.source === 'sales_offer') {
      setDialog({ kind: 'offer-received', row });
      return;
    }
    if (row.source !== 'expected_receipt' || !row.receipt_id || !row.installment_id) return;
    const ok = await confirm({
      message: `${quoted(row)} tahsil edildi olarak işaretlensin mi?`,
      confirmLabel: 'Tahsil Edildi',
    });
    if (!ok) return;
    await run(
      () => markReceiptInstallmentReceived(row.receipt_id!, row.installment_id!),
      'Taksit tahsil edildi olarak işaretlendi.',
      'Taksit işaretlenirken hata oluştu.',
    );
  };

  const unmark = async (row: InflowRow) => {
    const ok = await confirm({
      message: `${quoted(row)} için tahsilat işareti kaldırılsın mı?`,
      confirmLabel: 'Geri Al',
    });
    if (!ok || !row.offer_id || row.sequence === null || row.sequence === undefined) return;
    const sequence = row.sequence;
    await run(
      () => unmarkOfferInstallmentReceived(row.offer_id!, sequence),
      'Tahsilat işareti kaldırıldı.',
      'İşlem sırasında hata oluştu.',
    );
  };

  const deleteInstallment = async (row: InflowRow) => {
    const ok = await confirm({
      message: `${quoted(row)} silinsin mi?`,
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok || !row.receipt_id || !row.installment_id) return;
    await run(
      () => deleteReceiptInstallment(row.receipt_id!, row.installment_id!),
      'Taksit silindi.',
      'Taksit silinirken hata oluştu.',
    );
  };

  const cancelReceipt = async (row: InflowRow) => {
    if (!row.receipt_id) return;
    const label = row.title ? `"${row.title}"` : `#${row.receipt_id}`;
    const ok = await confirm({
      message: `${label} tahsilat kaydını iptal etmek istediğinize emin misiniz?`,
      confirmLabel: 'İptal Et',
      danger: true,
    });
    if (!ok) return;
    await run(
      () => cancelExpectedReceipt(row.receipt_id!),
      'Tahsilat iptal edildi.',
      'Tahsilat iptal edilirken hata oluştu.',
    );
  };

  const rowActions = (row: InflowTableRow): RowAction<InflowTableRow>[] => {
    const managed = row.source === 'expected_receipt' && Boolean(row.editable);
    return [
      {
        key: 'mark_received',
        label: 'Tahsil edildi',
        icon: 'fas fa-check',
        color: 'success',
        hidden: Boolean(row.is_received),
        onClick: (r) => void markReceived(r),
      },
      {
        key: 'unmark_received',
        label: 'Tahsilatı geri al',
        icon: 'fas fa-undo',
        color: 'warning',
        hidden: !(row.is_received && row.source === 'sales_offer'),
        onClick: (r) => void unmark(r),
      },
      {
        key: 'view_offer',
        label: 'Teklifi görüntüle',
        icon: 'fas fa-file-invoice',
        color: 'primary',
        hidden: !(row.source === 'sales_offer' && row.offer_no),
        onClick: (r) => navigate(offerLink(r.offer_no!)),
      },
      // Legacy "İşlemler" dropdown of an expected receipt's row.
      {
        key: 'edit_installment',
        label: 'Taksiti düzenle',
        icon: 'fas fa-pen',
        hidden: !managed,
        onClick: (r) => setDialog({ kind: 'installment', row: r, mode: 'edit' }),
      },
      {
        key: 'delete_installment',
        label: 'Taksiti sil',
        icon: 'fas fa-trash',
        color: 'danger',
        hidden: !managed || Boolean(row.is_received),
        onClick: (r) => void deleteInstallment(r),
      },
      {
        key: 'edit_receipt',
        label: 'Kaydı düzenle',
        icon: 'fas fa-edit',
        hidden: !managed,
        onClick: (r) => setDialog({ kind: 'receipt', row: r }),
      },
      {
        key: 'add_installment',
        label: 'Taksit ekle',
        icon: 'fas fa-plus',
        hidden: !managed,
        onClick: (r) => setDialog({ kind: 'installment', row: r, mode: 'add' }),
      },
      {
        key: 'cancel_receipt',
        label: 'Kaydı iptal et',
        icon: 'fas fa-ban',
        color: 'danger',
        hidden: !managed,
        onClick: (r) => void cancelReceipt(r),
      },
    ];
  };

  const tableGrouping = useMemo<DataTableGrouping<InflowTableRow> | undefined>(
    () =>
      grouping === 'none'
        ? undefined
        : {
            by: '_groupKey',
            header: groupHeader(grouping),
            collapsible: true,
            defaultExpanded: true,
            sort: 'asc',
          },
    [grouping],
  );

  const siblings = (row: InflowRow) =>
    all.filter(
      (r) => r.source === 'expected_receipt' && Number(r.receipt_id) === Number(row.receipt_id),
    );

  return (
    <>
      <FinanceHeader
        tab="receipts"
        actions={
          <CreateButton
            label="Yeni Tahsilat"
            onClick={() => setDialog({ kind: 'receipt', row: null })}
          />
        }
      />
      <DataTable
        title="Beklenen Tahsilatlar"
        icon="fas fa-hand-holding-usd"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              is_received: values.is_received,
              source: values.source,
              grouping: values.grouping,
            }}
            onApply={apply}
            onClear={reset}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(r) => r._rowKey}
        grouping={tableGrouping}
        loading={list.isFetching}
        rowActions={rowActions}
        rowStyle={(r) =>
          r.is_received ? { backgroundColor: 'rgba(25, 135, 84, 0.06)' } : undefined
        }
        emptyMessage="Beklenen tahsilat satırı bulunmamaktadır."
        onRefresh={refresh}
      />
      {dialog?.kind === 'receipt' ? (
        <ReceiptFormModal row={dialog.row} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'installment' ? (
        <InstallmentFormModal
          row={dialog.row}
          mode={dialog.mode}
          siblings={siblings(dialog.row)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'offer-received' ? (
        <OfferReceivedModal row={dialog.row} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}
