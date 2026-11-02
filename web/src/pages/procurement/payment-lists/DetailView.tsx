import { Alert, Button, Stack, Table } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  completePaymentList,
  decidePaymentList,
  deletePaymentList,
  excludePaymentListItem,
  includePaymentListItem,
  isApiErrorStatus,
  paymentListKeys,
  paymentListQueryOptions,
  refreshPaymentListAmounts,
  refreshPaymentListFx,
  removePaymentListItem,
  resendFinanceEmail,
  sendPaymentListToFinance,
  submitPaymentList,
  unmarkPaymentListItemPaid,
  updatePaymentListItem,
  type PaymentList,
  type PaymentListItem,
} from '@/api/procurement/paymentLists';
import { confirm, DataTable, FaIcon, notify, PageHeader, Panel, type DataTableColumn, type RowAction } from '@/ui';
import { exportPaymentList } from './exportList';
import {
  currencyBreakdown,
  fmtDate,
  fmtDateTime,
  fmtEur,
  fmtMoney,
  fmtRate,
  includedItems,
  ListStatusBadge,
  num,
  Pill,
  rowEur,
  userLabel,
} from './format';
import { useInvalidatePayments, type OpenModal } from './modals';
import classes from './PaymentLists.module.css';
import { excelColumns } from './poolShared';
import { PoolPicker } from './PoolPicker';
import { usePaymentNavigate, ViewSwitcher } from './ViewSwitcher';

const sumRowsEur = (rows: readonly PaymentListItem[]) => rows.reduce((s, it) => s + (rowEur(it) || 0), 0);

function ItemState({ row }: { row: PaymentListItem }) {
  if (row.po_cancelled) return <Pill color="red">Sipariş iptal</Pill>;
  if (row.is_paid) {
    return (
      <Pill color="green" title={`${fmtDateTime(row.paid_at)}${row.paid_by_name ? ' · ' + row.paid_by_name : ''}`}>
        Ödendi
      </Pill>
    );
  }
  if (row.is_excluded) {
    return (
      <Pill color="grey" title={`${row.exclusion_reason || ''}${row.excluded_by_name ? ' — ' + row.excluded_by_name : ''}`}>
        Çıkarıldı
      </Pill>
    );
  }
  return <Pill color="blue">Bekliyor</Pill>;
}

function itemStateText(row: PaymentListItem): string {
  if (row.po_cancelled) return 'Sipariş iptal';
  if (row.is_paid) return 'Ödendi';
  if (row.is_excluded) return 'Çıkarıldı';
  return 'Bekliyor';
}

function itemColumns(canEditNote: boolean): DataTableColumn<PaymentListItem>[] {
  return [
    {
      key: 'sequence',
      header: '#',
      width: 44,
      render: (row) => (
        <>
          {row.is_urgent ? <span className={classes.urgentDot} title="Acil" /> : null}
          {row.sequence ?? ''}
        </>
      ),
    },
    ...excelColumns<PaymentListItem>({ withListed: false }),
    {
      key: 'note',
      header: 'Açıklama',
      width: 180,
      editable: canEditNote,
      render: (row) => (
        <>
          {row.note ? row.note : <span style={{ color: 'var(--gk-muted)' }}>—</span>}
          {row.amount_changed ? (
            <div className={`${classes.sub} ${classes.danger}`} title="Taksit tutarı listeye eklendiğinden beri değişti">
              Güncel: {fmtMoney(row.live?.gross, row.currency)}
            </div>
          ) : null}
        </>
      ),
    },
    { key: 'state', header: 'Durum', width: 110, render: (row) => <ItemState row={row} />, exportValue: itemStateText },
  ];
}

/** Legacy rowAttributes: excluded rows struck through, paid green, cancelled orders red. */
function itemRowStyle(row: PaymentListItem): CSSProperties | undefined {
  if (row.is_excluded) {
    return { textDecoration: 'line-through', color: 'var(--gk-muted)', backgroundColor: 'var(--mantine-color-gray-1)' };
  }
  if (row.is_paid) return { backgroundColor: 'var(--mantine-color-green-0)' };
  if (row.po_cancelled) return { backgroundColor: 'var(--mantine-color-red-0)' };
  return undefined;
}

// ---- strip ---------------------------------------------------------------------

function BudgetBlock({ data }: { data: PaymentList }) {
  const t = data.totals ?? {};
  const budget = num(data.budget_eur);
  const total = num(t.total_eur) || 0;
  const paid = num(t.paid_eur) || 0;
  const pct = budget ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  const over = budget !== null && total > budget;
  return (
    <div data-testid="pl-budget">
      <h3 className={classes.blockTitle}>Bütçe</h3>
      <div className={classes.big}>
        {fmtEur(total)} <span style={{ color: 'var(--gk-muted)' }}>/ {budget === null ? 'bütçe yok' : fmtEur(budget)}</span>
      </div>
      {budget !== null ? (
        <div className={classes.budgetBar} data-over={over || undefined}>
          <div style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <div className={classes.sub}>
        {over ? (
          <>
            <span className={classes.over}>Bütçe aşımı: +{fmtEur(total - (budget ?? 0))}</span> ·{' '}
          </>
        ) : budget !== null ? (
          `Kalan bütçe: ${fmtEur(budget - total)} · `
        ) : null}
        Dahil {t.included_count ?? 0} kalem · Çıkarılan {t.excluded_count ?? 0} · Ödenen {fmtEur(paid)}
        {t.missing_rate_count ? <span className={classes.danger}> · {t.missing_rate_count} kalemde kur yok</span> : null}
        {t.cancelled_po_count ? <span className={classes.danger}> · {t.cancelled_po_count} iptal sipariş</span> : null}
      </div>
      <div className={classes.sub}>{currencyBreakdown(includedItems(data.items))}</div>
    </div>
  );
}

function FxBlock({ data }: { data: PaymentList }) {
  const fx = data.fx ?? {};
  return (
    <div>
      <h3 className={classes.blockTitle}>
        Kur {fx.source === 'manual' ? <Pill color="purple">Manuel</Pill> : <Pill color="grey">Kur tablosu</Pill>}
      </h3>
      <div className={classes.tabular}>
        1 € = <strong>{fmtRate(fx.eur_try)}</strong> TL · 1 $ = <strong>{fmtRate(fx.usd_try)}</strong> TL
      </div>
      <div className={classes.sub}>{fx.date ? fmtDate(fx.date) : 'Kur alınmadı'}</div>
    </div>
  );
}

function ApprovalBlock({ data }: { data: PaymentList }) {
  const wf = data.approval;
  const meta: ReactNode[] = [];
  if (data.submitted_at) meta.push(`Gönderildi: ${fmtDateTime(data.submitted_at)}${data.submitted_by_name ? ' · ' + data.submitted_by_name : ''}`);
  if (data.approved_at) meta.push(`Onaylandı: ${fmtDateTime(data.approved_at)}`);
  if (data.sent_to_finance_at) {
    meta.push(
      `Finansa iletildi: ${fmtDateTime(data.sent_to_finance_at)}${data.sent_to_finance_by_name ? ' · ' + data.sent_to_finance_by_name : ''}`,
    );
  }
  if (data.completed_at) meta.push(`Tamamlandı: ${fmtDateTime(data.completed_at)}`);
  if (data.cancelled_at) meta.push(`İptal: ${fmtDateTime(data.cancelled_at)}${data.cancellation_reason ? ' · ' + data.cancellation_reason : ''}`);
  if (data.status === 'sent_to_finance' || data.status === 'completed') {
    if (data.finance_email_error) meta.push(<span className={classes.danger}>E-posta hatası: {data.finance_email_error}</span>);
    else if (data.finance_email_sent_at) meta.push(`E-posta gönderildi: ${fmtDateTime(data.finance_email_sent_at)}`);
  }
  const metaNode = meta.length ? (
    <div className={classes.sub}>
      {meta.map((m, i) => (
        <div key={i}>{m}</div>
      ))}
    </div>
  ) : null;

  let stages: ReactNode;
  if (!wf || !wf.stage_instances?.length) {
    stages = <div className={classes.sub}>{data.status === 'draft' ? 'Henüz onaya gönderilmedi.' : '—'}</div>;
  } else {
    stages = wf.stage_instances.map((s) => {
      let color: 'grey' | 'red' | 'green' | 'orange' = 'grey';
      let label = 'Bekliyor';
      if (s.is_rejected) {
        color = 'red';
        label = 'Reddedildi';
      } else if (s.is_complete) {
        color = 'green';
        label = 'Onaylandı';
      } else if (s.order === wf.current_stage_order && !wf.is_complete && !wf.is_rejected) {
        color = 'orange';
        label = 'Sırada';
      }
      const approvers = (s.approvers ?? []).map(userLabel).join(', ');
      return (
        <div key={s.order} className={classes.stage}>
          <Pill color={color}>{label}</Pill>
          <div>
            <span className={classes.stageName}>{s.name}</span>
            <span className={classes.sub}>
              ({s.approved_count}/{s.required_approvals}) · {approvers || '-'}
            </span>
            {(s.decisions ?? []).map((d, i) => (
              <div key={i} className={classes.decision}>
                <i
                  className={`fas ${d.decision === 'approve' ? 'fa-check' : 'fa-times'}`}
                  style={{ marginRight: 4, color: d.decision === 'approve' ? 'var(--mantine-color-green-7)' : 'var(--gk-danger)' }}
                  aria-hidden
                />
                {userLabel(d.approver_detail)} · {fmtDateTime(d.decided_at)}
                {d.comment ? <div className={classes.decisionComment}>“{d.comment}”</div> : null}
              </div>
            ))}
          </div>
        </div>
      );
    });
  }
  return (
    <div>
      <h3 className={classes.blockTitle}>
        Onay <ListStatusBadge status={data.status} label={data.status_label} />
      </h3>
      {stages}
      {metaNode}
    </div>
  );
}

function Notes({ data }: { data: PaymentList }) {
  const t = data.totals ?? {};
  const notes: { color: string; text: string }[] = [];
  if (data.status === 'rejected') notes.push({ color: 'red', text: 'Liste reddedildi. Düzenleyip yeniden onaya gönderebilirsiniz.' });
  if (data.status === 'submitted' && data.can_decide) {
    notes.push({
      color: 'blue',
      text: 'Bu listenin onayı sizde. Kalemleri çıkarabilir, havuzdan ekleyebilir, bütçeyi değiştirebilir ve onaylayabilirsiniz.',
    });
  }
  if (['approved', 'sent_to_finance'].includes(data.status) && t.proforma_missing) {
    notes.push({ color: 'gray', text: `${t.proforma_missing} siparişin proforması eksik.` });
  }
  if (data.notes) notes.push({ color: 'gray', text: `Not: ${data.notes}` });
  if (!notes.length) return null;
  return (
    <Stack gap="xs" mb="md">
      {notes.map((n, i) => (
        <Alert key={i} color={n.color} variant="light" py={8}>
          {n.text}
        </Alert>
      ))}
    </Stack>
  );
}

// ---- view ------------------------------------------------------------------------

interface DetailViewProps {
  listId: number;
  openModal: OpenModal;
}

/**
 * Port of detailView.js: budget / FX / approval strip, the toolbar driven by
 * `allowed_actions`, the Excel-like items table, the picker, export and print.
 */
export function DetailView({ listId, openModal }: DetailViewProps) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePayments();
  const go = usePaymentNavigate();
  const detail = useQuery(paymentListQueryOptions(listId));
  const data = detail.data;
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!detail.isError) return;
    notify.error(detail.error, { fallback: 'Ödeme listesi yüklenemedi' });
    if (isApiErrorStatus(detail.error, [404, 403])) go({ view: 'lists' }, { replace: true });
  }, [detail.isError, detail.error, detail.errorUpdatedAt, go]);

  const allowed = useMemo(() => new Set(data?.allowed_actions ?? []), [data?.allowed_actions]);
  const canEditNote = allowed.has('update_item');
  const columns = useMemo(() => itemColumns(canEditNote), [canEditNote]);

  /** Legacy run(): the action, a success toast, then a reload; errors become a toast. */
  const run = async (action: () => Promise<unknown>, successMessage?: string) => {
    try {
      await action();
      if (successMessage) notify.success(successMessage);
      await invalidate();
    } catch (error) {
      notify.error(error, { fallback: 'İşlem başarısız' });
    }
  };

  const items = data?.items ?? [];

  if (!data) {
    return (
      <>
        <PageHeader title="Ödeme Listesi" icon="money-check-dollar" backTo="/procurement/payment-lists" />
        <ViewSwitcher active="lists" />
        <Panel>{detail.isError ? 'Ödeme listesi yüklenemedi' : 'Yükleniyor…'}</Panel>
      </>
    );
  }

  const t = data.totals ?? {};

  const toolbar: Record<string, () => void> = {
    add_items: () => setPicking(true),
    edit: () => openModal({ kind: 'listForm', mode: 'edit', list: data }),
    budget: () => openModal({ kind: 'budget', list: data }),
    refresh_fx: () => void run(() => refreshPaymentListFx(listId), 'Kurlar güncellendi'),
    manual_fx: () => openModal({ kind: 'fx', list: data }),
    refresh_amounts: () => void run(() => refreshPaymentListAmounts(listId), 'Tutarlar yenilendi'),
    submit: async () => {
      const budget = num(data.budget_eur);
      const total = num(t.total_eur) || 0;
      const over = budget !== null && total > budget;
      const ok = await confirm({
        title: 'Onaya gönder',
        message: `${t.included_count ?? 0} kalem, toplam ${fmtEur(total)} onaya gönderilecek.`,
        details: over ? (
          <span className={classes.over}>
            Bütçe aşımı: {fmtEur(total)} / {fmtEur(budget)}
          </span>
        ) : budget !== null ? (
          `Bütçe: ${fmtEur(budget)}`
        ) : undefined,
        confirmLabel: 'Gönder',
      });
      if (ok) await run(() => submitPaymentList(listId), 'Liste onaya gönderildi');
    },
    approve: () =>
      openModal({
        kind: 'decide',
        approve: true,
        onSave: (comment) => run(() => decidePaymentList(listId, { approve: true, comment }), 'Liste onaylandı'),
      }),
    reject: () =>
      openModal({
        kind: 'decide',
        approve: false,
        onSave: (comment) => run(() => decidePaymentList(listId, { approve: false, comment }), 'Liste reddedildi'),
      }),
    send_to_finance: async () => {
      const missing = t.proforma_missing || 0;
      const ok = await confirm({
        title: 'Finansa gönder',
        message: missing
          ? `${missing} siparişte proforma yok. Yine de gönderilsin mi?`
          : 'Liste finans departmanına bildirim ve proformalı e-posta ile iletilecek.',
        details: `${t.included_count ?? 0} kalem · ${fmtEur(t.total_eur)}`,
        confirmLabel: 'Gönder',
      });
      if (ok) await run(() => sendPaymentListToFinance(listId), 'Liste finansa gönderildi');
    },
    resend: () => void run(() => resendFinanceEmail(listId), 'E-posta yeniden gönderildi'),
    complete: async () => {
      const unpaid = includedItems(items).filter((it) => !it.is_paid).length;
      const ok = await confirm({
        title: 'Listeyi tamamla',
        message: unpaid
          ? `${unpaid} kalem henüz ödenmedi; tamamlanınca havuza geri döner ve bir sonraki listeye aktarılabilir.`
          : 'Liste tamamlansın mı?',
        confirmLabel: 'Tamamla',
      });
      if (ok) await run(() => completePaymentList(listId), 'Liste tamamlandı');
    },
    carry_over: () =>
      openModal({ kind: 'listForm', mode: 'create', carryOverFrom: data, onSaved: (list) => go({ view: 'detail', listId: list.id }) }),
    cancel: () => openModal({ kind: 'cancel', list: data }),
    delete: async () => {
      const ok = await confirm({
        title: 'Listeyi sil',
        message: 'Taslak liste silinsin mi? Kalemler havuza geri döner.',
        confirmLabel: 'Sil',
        danger: true,
      });
      if (!ok) return;
      try {
        await deletePaymentList(listId);
        notify.success('Liste silindi');
        queryClient.removeQueries({ queryKey: paymentListKeys.detail(listId) });
        void invalidate();
        go({ view: 'lists' });
      } catch (error) {
        notify.error(error, { fallback: 'Liste silinemedi' });
      }
    },
    export: async () => {
      try {
        await exportPaymentList(data);
      } catch (error) {
        console.error(error);
        notify.error('Excel dosyası oluşturulamadı');
      }
    },
    print: () => window.print(),
  };

  const button = (id: string, label: string, icon: string, variant: 'filled' | 'outline' | 'default' = 'default', color?: string) => (
    <Button
      key={id}
      size="xs"
      variant={variant}
      color={color}
      title={label}
      leftSection={<FaIcon icon={`fas ${icon}`} />}
      onClick={() => void toolbar[id]?.()}
    >
      {label}
    </Button>
  );

  const parts: ReactNode[] = [];
  if (allowed.has('add_items')) parts.push(button('add_items', 'Havuzdan Ekle', 'fa-plus', 'filled'));
  if (allowed.has('update_header')) parts.push(button('edit', 'Düzenle', 'fa-pen'));
  if (allowed.has('update_budget')) parts.push(button('budget', 'Bütçeyi Düzenle', 'fa-sack-dollar'));
  if (allowed.has('refresh_fx')) {
    parts.push(button('refresh_fx', 'Kurları Güncelle', 'fa-rotate'));
    parts.push(button('manual_fx', 'Kur Gir', 'fa-pen-to-square'));
  }
  if (allowed.has('refresh_amounts')) parts.push(button('refresh_amounts', 'Tutarları Yenile', 'fa-calculator'));
  if (allowed.has('submit')) parts.push(button('submit', 'Onaya Gönder', 'fa-paper-plane', 'filled', 'green'));
  if (allowed.has('decide')) {
    parts.push(button('approve', 'Onayla', 'fa-check', 'filled', 'green'));
    parts.push(button('reject', 'Reddet', 'fa-times', 'outline', 'red'));
  }
  if (allowed.has('send_to_finance')) parts.push(button('send_to_finance', 'Finansa Gönder', 'fa-envelope', 'filled', 'green'));
  if (allowed.has('resend_finance_email')) parts.push(button('resend', 'E-postayı Yeniden Gönder', 'fa-envelope-open-text'));
  if (allowed.has('complete')) parts.push(button('complete', 'Tamamla', 'fa-flag-checkered', 'outline', 'green'));
  if (allowed.has('carry_over')) parts.push(button('carry_over', 'Yeni Listeye Aktar', 'fa-forward'));
  parts.push(<span key="spacer" className={classes.spacer} />);
  parts.push(button('export', "Excel'e Aktar", 'fa-file-excel'));
  parts.push(button('print', 'Yazdır', 'fa-print'));
  if (allowed.has('cancel')) parts.push(button('cancel', 'İptal Et', 'fa-ban', 'outline', 'red'));
  if (allowed.has('delete')) parts.push(button('delete', 'Sil', 'fa-trash', 'outline', 'red'));

  const live = (row: PaymentListItem) => !row.is_paid && !row.is_excluded && !row.po_cancelled;
  const rowActions = (row: PaymentListItem): RowAction<PaymentListItem>[] => [
    {
      key: 'paid',
      label: 'Ödendi İşaretle',
      icon: 'fas fa-check',
      color: 'success',
      hidden: !(allowed.has('mark_paid') && live(row)),
      onClick: (r) => openModal({ kind: 'markPaid', row: r, mode: 'item', listId, itemId: r.id }),
    },
    {
      key: 'unpaid',
      label: 'Ödemeyi Geri Al',
      icon: 'fas fa-rotate-left',
      hidden: !(allowed.has('unmark_paid') && row.is_paid),
      onClick: async (r) => {
        const ok = await confirm({
          title: 'Ödemeyi geri al',
          message: `${r.supplier?.name || ''} · ${fmtMoney(r.gross_amount, r.currency)} ödemesi geri alınsın mı?`,
          confirmLabel: 'Geri Al',
        });
        if (ok) await run(() => unmarkPaymentListItemPaid(listId, r.id), 'Ödeme geri alındı');
      },
    },
    {
      key: 'exclude',
      label: 'Listeden Çıkar',
      icon: 'fas fa-ban',
      hidden: !(allowed.has('exclude_item') && live(row)),
      onClick: (r) =>
        openModal({ kind: 'exclude', row: r, onSave: (reason) => run(() => excludePaymentListItem(listId, r.id, reason), 'Kalem çıkarıldı') }),
    },
    {
      key: 'include',
      label: 'Geri Al',
      icon: 'fas fa-undo',
      hidden: !(allowed.has('include_item') && row.is_excluded),
      onClick: (r) => void run(() => includePaymentListItem(listId, r.id), 'Kalem listeye geri alındı'),
    },
    { key: 'proforma', label: 'Proforma', icon: 'fas fa-paperclip', onClick: (r) => openModal({ kind: 'proforma', row: r }) },
    {
      key: 'urgent',
      label: 'Acil işaretle / kaldır',
      icon: 'fas fa-bolt',
      hidden: !(allowed.has('update_item') && live(row)),
      onClick: (r) => void run(() => updatePaymentListItem(listId, r.id, { is_urgent: !r.is_urgent })),
    },
    {
      key: 'split',
      label: 'Böl (taksitlendir)',
      icon: 'fas fa-scissors',
      hidden: !(allowed.has('split') && live(row)),
      onClick: (r) => openModal({ kind: 'split', row: r }),
    },
    {
      key: 'remove',
      label: 'Listeden sil',
      icon: 'fas fa-trash',
      color: 'danger',
      hidden: !allowed.has('remove_item'),
      onClick: async (r) => {
        const ok = await confirm({
          title: 'Kalemi sil',
          message: 'Kalem listeden silinsin mi? (Havuza geri döner)',
          confirmLabel: 'Sil',
          danger: true,
        });
        if (ok) await run(() => removePaymentListItem(listId, r.id), 'Kalem silindi');
      },
    },
    {
      key: 'po',
      label: 'Sipariş detayı',
      icon: 'fas fa-external-link-alt',
      onClick: (r) => window.open(`/finance/purchase-orders/?order=${r.po.id}`, '_blank', 'noopener'),
    },
  ];

  const included = includedItems(items);
  const excluded = items.filter((it) => it.is_excluded);
  const paid = included.filter((it) => it.is_paid);

  return (
    <>
      <PageHeader
        title={data.title}
        subtitle={`#${data.id} · ${fmtDate(data.list_date)} · ${data.status_label || ''}`}
        icon="money-check-dollar"
        backTo="/procurement/payment-lists"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            loading={detail.isFetching}
            onClick={() => void detail.refetch()}
          >
            Yenile
          </Button>
        }
      />
      <ViewSwitcher active="lists" />
      <Panel>
        <div className={classes.strip}>
          <BudgetBlock data={data} />
          <FxBlock data={data} />
          <ApprovalBlock data={data} />
        </div>
      </Panel>
      <div className={classes.noPrint} style={{ margin: '16px 0' }}>
        <Panel>
          <div className={classes.toolbar} data-testid="pl-toolbar">
            {parts}
          </div>
        </Panel>
      </div>
      <Notes data={data} />
      <DataTable
        data={items}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={detail.isFetching}
        rowActions={rowActions}
        extraData={allowed}
        stickyHeader
        verticalSpacing="xs"
        isRowEditable={(row) => allowed.has('update_item') && !row.is_paid && !row.is_excluded}
        onCellEdit={async ({ row, value }) => {
          const note = `${value ?? ''}`.trim();
          await updatePaymentListItem(listId, row.id, { note });
          queryClient.setQueryData<PaymentList>(paymentListKeys.detail(listId), (prev) =>
            prev ? { ...prev, items: (prev.items ?? []).map((it) => (it.id === row.id ? { ...it, note } : it)) } : prev,
          );
        }}
        rowStyle={itemRowStyle}
        emptyMessage='Listede kalem yok. "Havuzdan Ekle" ile başlayın.'
        footer={() => (
          <Table.Tr className={classes.footerRow}>
            <Table.Td colSpan={columns.length + 1}>
              Dahil: {fmtEur(sumRowsEur(included))} ({included.length} kalem) · Çıkarılan: {fmtEur(sumRowsEur(excluded))} (
              {excluded.length}) · Ödenen: {fmtEur(sumRowsEur(paid))} ({paid.length}) · Kalan:{' '}
              {fmtEur(sumRowsEur(included.filter((it) => !it.is_paid)))}
            </Table.Td>
          </Table.Tr>
        )}
      />
      {picking ? <PoolPicker listId={listId} onClose={() => setPicking(false)} /> : null}
    </>
  );
}
