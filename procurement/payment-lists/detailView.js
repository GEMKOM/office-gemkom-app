/**
 * One payment list: budget / FX / approval strip, status-driven toolbar, the
 * Excel-like items table, the "Havuzdan Ekle" picker, Excel export and print.
 * Buttons and row actions follow `allowed_actions` from the backend, which
 * already combines status, page permission and approver membership.
 */
import { TableComponent } from '../../components/table/table.js';
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import {
    addPaymentListItems, completePaymentList, deletePaymentList, excludePaymentListItem, getPaymentList,
    includePaymentListItem, refreshPaymentListAmounts, refreshPaymentListFx, removePaymentListItem,
    resendFinanceEmail, sendPaymentListToFinance, submitPaymentList, unmarkPaymentListItemPaid,
    updatePaymentListItem,
} from '../../apis/procurement/paymentLists.js';
import {
    badge, currencyBreakdown, customersOf, fmtDate, fmtDateTime, fmtEur, fmtMoney, fmtRate, jobNosOf,
    listStatusBadge, num, rowEur, userLabel,
} from './format.js';
import {
    applyPage, buildPoolFilters, excelColumns, fetchPoolPage, poolParams, reconcileSelection, createPoolTable,
} from './poolView.js';

export function createDetailView(ctx) {
    let listId = null;
    let data = null;
    let table = null;
    let tableListId = null;
    let loading = false;

    const root = () => document.getElementById('pl-view-detail');
    const allowed = () => new Set(data?.allowed_actions || []);

    // ----------------------------------------------------------------------
    // loading
    // ----------------------------------------------------------------------

    async function load(id = listId) {
        if (!id || loading) return;
        listId = id;
        loading = true;
        try {
            data = await getPaymentList(id);
            render();
        } catch (error) {
            console.error('list load failed', error);
            showNotification(error.message || 'Ödeme listesi yüklenemedi', 'error');
            if (error.status === 404 || error.status === 403) ctx.navigate({ view: 'lists' }, { replace: true });
        } finally {
            loading = false;
        }
    }

    async function run(action, successMessage) {
        try {
            await action();
            if (successMessage) showNotification(successMessage, 'success');
            await load();
        } catch (error) {
            console.error(error);
            showNotification(error.message || 'İşlem başarısız', 'error');
        }
    }

    // ----------------------------------------------------------------------
    // render
    // ----------------------------------------------------------------------

    function render() {
        if (!data) return;
        ctx.setHeader({
            title: data.title,
            subtitle: `#${data.id} · ${fmtDate(data.list_date)} · ${data.status_label || ''}`,
            icon: 'money-check-dollar',
            showBackButton: 'block',
            showCreateButton: 'none',
            showRefreshButton: 'block',
            onRefreshClick: () => load(),
            onBackClick: () => ctx.navigate({ view: 'lists' }),
        });
        renderStrip();
        renderToolbar();
        renderAlert();
        renderItems();
    }

    function renderStrip() {
        const t = data.totals || {};
        const budget = num(data.budget_eur);
        const total = num(t.total_eur) || 0;
        const paid = num(t.paid_eur) || 0;
        const pct = budget ? Math.min(100, Math.round((total / budget) * 100)) : 0;
        const over = budget !== null && total > budget;
        const fx = data.fx || {};

        const budgetHtml = `
            <div class="pl-info-block">
                <h6>Bütçe</h6>
                <div class="pl-big pl-tabular">${fmtEur(total)} <span class="text-muted">/ ${budget === null ? 'bütçe yok' : fmtEur(budget)}</span></div>
                ${budget !== null ? `<div class="pl-budget-bar ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div>` : ''}
                <div class="pl-sub">
                    ${over ? `<span class="pl-budget-over">Bütçe aşımı: +${fmtEur(total - budget)}</span> · ` : (budget !== null ? `Kalan bütçe: ${fmtEur(budget - total)} · ` : '')}
                    Dahil ${t.included_count ?? 0} kalem · Çıkarılan ${t.excluded_count ?? 0} · Ödenen ${fmtEur(paid)}
                    ${t.missing_rate_count ? ` · <span class="text-danger">${t.missing_rate_count} kalemde kur yok</span>` : ''}
                    ${t.cancelled_po_count ? ` · <span class="text-danger">${t.cancelled_po_count} iptal sipariş</span>` : ''}
                </div>
                <div class="pl-sub">${escapeHtml(currencyBreakdown(includedItems()))}</div>
            </div>`;

        const fxHtml = `
            <div class="pl-info-block">
                <h6>Kur ${fx.source === 'manual' ? badge('status-purple', 'Manuel') : badge('status-grey', 'Kur tablosu')}</h6>
                <div class="pl-fx">1 € = <strong>${fmtRate(fx.eur_try)}</strong> TL · 1 $ = <strong>${fmtRate(fx.usd_try)}</strong> TL</div>
                <div class="pl-sub">${fx.date ? fmtDate(fx.date) : 'Kur alınmadı'}</div>
            </div>`;

        document.getElementById('pl-detail-strip').innerHTML = `
            <div class="pl-info-strip">
                ${budgetHtml}
                ${fxHtml}
                <div class="pl-info-block">
                    <h6>Onay ${listStatusBadge(data.status, data.status_label)}</h6>
                    ${renderApproval()}
                </div>
            </div>`;
    }

    function renderApproval() {
        const wf = data.approval;
        const meta = [];
        if (data.submitted_at) meta.push(`Gönderildi: ${fmtDateTime(data.submitted_at)}${data.submitted_by_name ? ' · ' + escapeHtml(data.submitted_by_name) : ''}`);
        if (data.approved_at) meta.push(`Onaylandı: ${fmtDateTime(data.approved_at)}`);
        if (data.sent_to_finance_at) meta.push(`Finansa iletildi: ${fmtDateTime(data.sent_to_finance_at)}${data.sent_to_finance_by_name ? ' · ' + escapeHtml(data.sent_to_finance_by_name) : ''}`);
        if (data.completed_at) meta.push(`Tamamlandı: ${fmtDateTime(data.completed_at)}`);
        if (data.cancelled_at) meta.push(`İptal: ${fmtDateTime(data.cancelled_at)}${data.cancellation_reason ? ' · ' + escapeHtml(data.cancellation_reason) : ''}`);
        if (data.status === 'sent_to_finance' || data.status === 'completed') {
            if (data.finance_email_error) meta.push(`<span class="text-danger">E-posta hatası: ${escapeHtml(data.finance_email_error)}</span>`);
            else if (data.finance_email_sent_at) meta.push(`E-posta gönderildi: ${fmtDateTime(data.finance_email_sent_at)}`);
        }
        const metaHtml = meta.length ? `<div class="pl-sub">${meta.join('<br>')}</div>` : '';
        if (!wf || !wf.stage_instances?.length) {
            return `<div class="pl-sub">${data.status === 'draft' ? 'Henüz onaya gönderilmedi.' : '—'}</div>${metaHtml}`;
        }
        const stages = wf.stage_instances.map((s) => {
            let cls = 'status-grey';
            let label = 'Bekliyor';
            if (s.is_rejected) { cls = 'status-red'; label = 'Reddedildi'; }
            else if (s.is_complete) { cls = 'status-green'; label = 'Onaylandı'; }
            else if (s.order === wf.current_stage_order && !wf.is_complete && !wf.is_rejected) { cls = 'status-orange'; label = 'Sırada'; }
            const approvers = (s.approvers || []).map((u) => escapeHtml(userLabel(u))).join(', ');
            const decisions = (s.decisions || []).map((d) => `
                <div class="pl-decision">
                    <i class="fas ${d.decision === 'approve' ? 'fa-check text-success' : 'fa-times text-danger'} me-1"></i>
                    ${escapeHtml(userLabel(d.approver_detail))} · ${fmtDateTime(d.decided_at)}
                    ${d.comment ? `<div class="pl-decision-comment">“${escapeHtml(d.comment)}”</div>` : ''}
                </div>`).join('');
            return `
                <div class="pl-stage">
                    ${badge(cls, label)}
                    <div>
                        <span class="pl-stage-name">${escapeHtml(s.name)}</span>
                        <span class="pl-sub">(${s.approved_count}/${s.required_approvals}) · ${approvers || '-'}</span>
                        ${decisions}
                    </div>
                </div>`;
        }).join('');
        return stages + metaHtml;
    }

    function renderAlert() {
        const el = document.getElementById('pl-detail-alert');
        const t = data.totals || {};
        const notes = [];
        if (data.status === 'rejected') notes.push({ cls: 'alert-danger', text: 'Liste reddedildi. Düzenleyip yeniden onaya gönderebilirsiniz.' });
        if (data.status === 'submitted' && data.can_decide) notes.push({ cls: 'alert-info', text: 'Bu listenin onayı sizde. Kalemleri çıkarabilir, havuzdan ekleyebilir, bütçeyi değiştirebilir ve onaylayabilirsiniz.' });
        if (['approved', 'sent_to_finance'].includes(data.status) && t.proforma_missing) notes.push({ cls: 'alert-secondary', text: `${t.proforma_missing} siparişin proforması eksik.` });
        if (data.notes) notes.push({ cls: 'alert-light', text: `Not: ${data.notes}` });
        el.innerHTML = notes.map((n) => `<div class="alert ${n.cls} py-2 small mb-3">${escapeHtml(n.text)}</div>`).join('');
    }

    function button(id, label, icon, cls = 'btn-outline-secondary', title = '') {
        return `<button type="button" class="btn btn-sm ${cls}" data-pl-action="${id}" title="${escapeHtml(title || label)}"><i class="fas ${icon} me-1"></i>${escapeHtml(label)}</button>`;
    }

    function renderToolbar() {
        const a = allowed();
        const parts = [];
        if (a.has('add_items')) parts.push(button('add_items', 'Havuzdan Ekle', 'fa-plus', 'btn-primary'));
        if (a.has('update_header')) parts.push(button('edit', 'Düzenle', 'fa-pen'));
        if (a.has('update_budget')) parts.push(button('budget', 'Bütçeyi Düzenle', 'fa-sack-dollar'));
        if (a.has('refresh_fx')) {
            parts.push(button('refresh_fx', 'Kurları Güncelle', 'fa-rotate'));
            parts.push(button('manual_fx', 'Kur Gir', 'fa-pen-to-square'));
        }
        if (a.has('refresh_amounts')) parts.push(button('refresh_amounts', 'Tutarları Yenile', 'fa-calculator'));
        if (a.has('submit')) parts.push(button('submit', 'Onaya Gönder', 'fa-paper-plane', 'btn-success'));
        if (a.has('decide')) {
            parts.push(button('approve', 'Onayla', 'fa-check', 'btn-success'));
            parts.push(button('reject', 'Reddet', 'fa-times', 'btn-outline-danger'));
        }
        if (a.has('send_to_finance')) parts.push(button('send_to_finance', 'Finansa Gönder', 'fa-envelope', 'btn-success'));
        if (a.has('resend_finance_email')) parts.push(button('resend', 'E-postayı Yeniden Gönder', 'fa-envelope-open-text'));
        if (a.has('complete')) parts.push(button('complete', 'Tamamla', 'fa-flag-checkered', 'btn-outline-success'));
        if (a.has('carry_over')) parts.push(button('carry_over', 'Yeni Listeye Aktar', 'fa-forward'));
        parts.push('<span class="pl-toolbar-spacer"></span>');
        parts.push(button('export', "Excel'e Aktar", 'fa-file-excel'));
        parts.push(button('print', 'Yazdır', 'fa-print'));
        if (a.has('cancel')) parts.push(button('cancel', 'İptal Et', 'fa-ban', 'btn-outline-danger'));
        if (a.has('delete')) parts.push(button('delete', 'Sil', 'fa-trash', 'btn-outline-danger'));

        const bar = document.getElementById('pl-detail-toolbar');
        bar.innerHTML = `<div class="pl-toolbar">${parts.join('')}</div>`;
        bar.querySelectorAll('[data-pl-action]').forEach((btn) => {
            btn.addEventListener('click', () => onToolbar(btn.dataset.plAction));
        });
    }

    function includedItems() {
        return (data?.items || []).filter((it) => !it.is_excluded && !it.po_cancelled);
    }

    function itemState(row) {
        if (row.po_cancelled) return badge('status-red', 'Sipariş iptal');
        if (row.is_paid) return badge('status-green', 'Ödendi', `${fmtDateTime(row.paid_at)}${row.paid_by_name ? ' · ' + row.paid_by_name : ''}`);
        if (row.is_excluded) return badge('status-grey', 'Çıkarıldı', `${row.exclusion_reason || ''}${row.excluded_by_name ? ' — ' + row.excluded_by_name : ''}`);
        return badge('status-blue', 'Bekliyor');
    }

    function itemColumns() {
        const a = allowed();
        const canEditNote = a.has('update_item');
        const cols = [
            { field: 'sequence', label: '#', width: '44px', sortable: false, formatter: (v, row) => `${row.is_urgent ? '<span class="pl-urgent-dot" title="Acil"></span>' : ''}${v ?? ''}` },
            ...excelColumns({ withListed: false }),
            {
                field: 'note', label: 'Açıklama', width: '180px', sortable: false, editable: canEditNote, type: 'text',
                formatter: (v, row) => {
                    const changed = row.amount_changed ? `<div class="pl-sub text-danger" title="Taksit tutarı listeye eklendiğinden beri değişti">Güncel: ${fmtMoney(row.live?.gross, row.currency)}</div>` : '';
                    return `${v ? escapeHtml(v) : '<span class="text-muted">—</span>'}${changed}`;
                },
            },
            { field: 'state', label: 'Durum', width: '110px', sortable: false, formatter: (_v, row) => itemState(row) },
        ];
        return cols;
    }

    function itemActions() {
        const a = allowed();
        const live = (row) => !row.is_paid && !row.is_excluded && !row.po_cancelled;
        return [
            {
                key: 'paid', label: 'Ödendi İşaretle', icon: 'fas fa-check', class: 'btn-outline-success',
                visible: (row) => a.has('mark_paid') && live(row),
                onClick: (row) => ctx.modals.openMarkPaid({ row, mode: 'item', listId, itemId: row.id, onDone: () => load() }),
            },
            {
                key: 'unpaid', label: 'Ödemeyi Geri Al', icon: 'fas fa-rotate-left', class: 'btn-outline-secondary',
                visible: (row) => a.has('unmark_paid') && row.is_paid,
                onClick: (row) => ctx.confirm.show({
                    title: 'Ödemeyi geri al', message: `${row.supplier?.name || ''} · ${fmtMoney(row.gross_amount, row.currency)} ödemesi geri alınsın mı?`,
                    confirmText: 'Geri Al',
                    onConfirm: () => run(() => unmarkPaymentListItemPaid(listId, row.id), 'Ödeme geri alındı'),
                }),
            },
            {
                key: 'exclude', label: 'Listeden Çıkar', icon: 'fas fa-ban', class: 'btn-outline-secondary',
                visible: (row) => a.has('exclude_item') && live(row),
                onClick: (row) => ctx.modals.openExclude({ row, onSave: (reason) => run(() => excludePaymentListItem(listId, row.id, reason), 'Kalem çıkarıldı') }),
            },
            {
                key: 'include', label: 'Geri Al', icon: 'fas fa-undo', class: 'btn-outline-secondary',
                visible: (row) => a.has('include_item') && row.is_excluded,
                onClick: (row) => run(() => includePaymentListItem(listId, row.id), 'Kalem listeye geri alındı'),
            },
            {
                key: 'proforma', label: 'Proforma', icon: 'fas fa-paperclip', class: 'btn-outline-secondary',
                onClick: (row) => ctx.modals.openProforma({ row, onDone: () => load() }),
            },
            {
                type: 'dropdown', key: 'more', icon: 'fas fa-ellipsis-v', label: 'Diğer',
                subActions: [
                    {
                        key: 'urgent', label: 'Acil işaretle / kaldır', icon: 'fas fa-bolt',
                        visible: (row) => a.has('update_item') && live(row),
                        onClick: (row) => run(() => updatePaymentListItem(listId, row.id, { is_urgent: !row.is_urgent })),
                    },
                    {
                        key: 'split', label: 'Böl (taksitlendir)', icon: 'fas fa-scissors',
                        visible: (row) => a.has('split') && live(row),
                        onClick: (row) => ctx.modals.openSplit({ row, onDone: () => load() }),
                    },
                    {
                        key: 'remove', label: 'Listeden sil', icon: 'fas fa-trash', class: 'text-danger',
                        visible: () => a.has('remove_item'),
                        onClick: (row) => ctx.confirm.show({
                            title: 'Kalemi sil', message: 'Kalem listeden silinsin mi? (Havuza geri döner)', confirmText: 'Sil',
                            onConfirm: () => run(() => removePaymentListItem(listId, row.id), 'Kalem silindi'),
                        }),
                    },
                    { key: 'po', label: 'Sipariş detayı', icon: 'fas fa-external-link-alt', onClick: (row) => window.open(`/finance/purchase-orders/?order=${row.po.id}`, '_blank', 'noopener') },
                ],
            },
        ];
    }

    function footerRow({ columns, hasActions }) {
        const items = data.items || [];
        const included = includedItems();
        const excluded = items.filter((it) => it.is_excluded);
        const paid = included.filter((it) => it.is_paid);
        const total = fmtEur(included.reduce((s, it) => s + (rowEur(it) || 0), 0));
        const span = columns.length + (hasActions ? 1 : 0);
        return `<tr class="pl-footer-row"><td colspan="${span}">
            Dahil: ${total} (${included.length} kalem) ·
            Çıkarılan: ${fmtEur(excluded.reduce((s, it) => s + (rowEur(it) || 0), 0))} (${excluded.length}) ·
            Ödenen: ${fmtEur(paid.reduce((s, it) => s + (rowEur(it) || 0), 0))} (${paid.length}) ·
            Kalan: ${fmtEur(included.filter((it) => !it.is_paid).reduce((s, it) => s + (rowEur(it) || 0), 0))}
        </td></tr>`;
    }

    function renderItems() {
        const rows = (data.items || []).map((it) => ({ ...it, key: it.id }));
        if (table && tableListId !== listId) {
            table.destroy();
            table = null;
        }
        if (!table) {
            tableListId = listId;
            table = new TableComponent('pl-items-table', {
                showHeader: false,
                columns: itemColumns(),
                actions: itemActions(),
                data: [],
                sortable: false,
                pagination: false,
                small: true,
                stickyHeader: true,
                editable: true,
                editableColumns: ['note'],
                isRowEditable: (row) => allowed().has('update_item') && !row.is_paid && !row.is_excluded,
                onEdit: async (row, field, newValue) => {
                    const note = `${newValue ?? ''}`.trim();
                    await updatePaymentListItem(listId, row.id, { note });
                    row.note = note;
                },
                rowAttributes: (row) => ({
                    class: [
                        row.is_excluded ? 'pl-row-excluded' : '',
                        row.is_paid ? 'pl-row-paid' : '',
                        row.po_cancelled ? 'pl-row-cancelled' : '',
                    ].filter(Boolean).join(' '),
                }),
                footer: footerRow,
                emptyMessage: 'Listede kalem yok. "Havuzdan Ekle" ile başlayın.',
                emptyIcon: 'fas fa-water',
            });
        } else {
            // permissions may change with the status (e.g. after submit/approve)
            table.options.columns = itemColumns();
            table.options.actions = itemActions();
        }
        table.updateData(rows, rows.length, 1);
    }

    // ----------------------------------------------------------------------
    // toolbar actions
    // ----------------------------------------------------------------------

    function onToolbar(action) {
        const t = data.totals || {};
        switch (action) {
            case 'add_items':
                openPicker();
                break;
            case 'edit':
                ctx.modals.openListForm({ mode: 'edit', list: data, onSaved: () => load() });
                break;
            case 'budget':
                ctx.modals.openBudget({ list: data, onDone: () => load() });
                break;
            case 'refresh_fx':
                run(() => refreshPaymentListFx(listId), 'Kurlar güncellendi');
                break;
            case 'manual_fx':
                ctx.modals.openManualFx({ list: data, onDone: () => load() });
                break;
            case 'refresh_amounts':
                run(() => refreshPaymentListAmounts(listId), 'Tutarlar yenilendi');
                break;
            case 'submit': {
                const budget = num(data.budget_eur);
                const total = num(t.total_eur) || 0;
                const over = budget !== null && total > budget;
                ctx.confirm.show({
                    title: 'Onaya gönder',
                    message: `${t.included_count ?? 0} kalem, toplam ${fmtEur(total)} onaya gönderilecek.`,
                    details: over ? `<span class="pl-budget-over">Bütçe aşımı: ${fmtEur(total)} / ${fmtEur(budget)}</span>` : (budget !== null ? `Bütçe: ${fmtEur(budget)}` : ''),
                    confirmText: 'Gönder',
                    onConfirm: () => run(() => submitPaymentList(listId), 'Liste onaya gönderildi'),
                });
                break;
            }
            case 'approve':
                ctx.modals.openDecide({ approve: true, onSave: (comment) => run(() => ctx.decide(listId, true, comment), 'Liste onaylandı') });
                break;
            case 'reject':
                ctx.modals.openDecide({ approve: false, onSave: (comment) => run(() => ctx.decide(listId, false, comment), 'Liste reddedildi') });
                break;
            case 'send_to_finance': {
                const missing = t.proforma_missing || 0;
                ctx.confirm.show({
                    title: 'Finansa gönder',
                    message: missing
                        ? `${missing} siparişte proforma yok. Yine de gönderilsin mi?`
                        : 'Liste finans departmanına bildirim ve proformalı e-posta ile iletilecek.',
                    details: `${t.included_count ?? 0} kalem · ${fmtEur(t.total_eur)}`,
                    confirmText: 'Gönder',
                    onConfirm: () => run(() => sendPaymentListToFinance(listId), 'Liste finansa gönderildi'),
                });
                break;
            }
            case 'resend':
                run(() => resendFinanceEmail(listId), 'E-posta yeniden gönderildi');
                break;
            case 'complete': {
                const unpaid = includedItems().filter((it) => !it.is_paid).length;
                ctx.confirm.show({
                    title: 'Listeyi tamamla',
                    message: unpaid ? `${unpaid} kalem henüz ödenmedi; tamamlanınca havuza geri döner ve bir sonraki listeye aktarılabilir.` : 'Liste tamamlansın mı?',
                    confirmText: 'Tamamla',
                    onConfirm: () => run(() => completePaymentList(listId), 'Liste tamamlandı'),
                });
                break;
            }
            case 'carry_over':
                ctx.modals.openListForm({ mode: 'create', carryOverFrom: data, onSaved: (list) => ctx.navigate({ view: 'detail', listId: list.id }) });
                break;
            case 'cancel':
                ctx.modals.openCancel({ list: data, onDone: () => load() });
                break;
            case 'delete':
                ctx.confirm.show({
                    title: 'Listeyi sil', message: 'Taslak liste silinsin mi? Kalemler havuza geri döner.', confirmText: 'Sil',
                    onConfirm: async () => {
                        try {
                            await deletePaymentList(listId);
                            showNotification('Liste silindi', 'success');
                            ctx.navigate({ view: 'lists' });
                        } catch (error) {
                            showNotification(error.message || 'Liste silinemedi', 'error');
                            throw error;
                        }
                    },
                });
                break;
            case 'export':
                exportToXlsx();
                break;
            case 'print':
                window.print();
                break;
            default:
                break;
        }
    }

    // ----------------------------------------------------------------------
    // picker (static fullscreen modal)
    // ----------------------------------------------------------------------

    const picker = { filters: null, table: null, page: 1, pageSize: 50, loading: false };
    const PICK = 'pl_pick';

    function openPicker() {
        const selection = ctx.state.picker.selection;
        selection.clear();
        if (!picker.table) {
            picker.filters = buildPoolFilters('pl-picker-filters', PICK, {
                onApply: () => { picker.page = 1; loadPicker(); },
                onClear: () => { picker.page = 1; loadPicker(); },
                forceHideListed: true,
            });
            picker.table = createPoolTable('pl-picker-table', {
                picker: true,
                onSelectionChange: () => { reconcileSelection(picker.table, selection); renderPickerFooter(); },
                onPageChange: (p) => { picker.page = p; loadPicker(); },
                onPageSizeChange: (size) => { picker.pageSize = size; picker.page = 1; loadPicker(); },
                itemsPerPage: picker.pageSize,
            });
            document.getElementById('pl-picker-add').addEventListener('click', addSelectedFromPicker);
            document.getElementById('plPoolPickerModal').addEventListener('hidden.bs.modal', () => {
                selection.clear();
                picker.table.clearSelection();
                renderPickerFooter();
            });
        }
        renderPickerFooter();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('plPoolPickerModal')).show();
        picker.page = 1;
        loadPicker();
    }

    async function loadPicker() {
        if (picker.loading) return;
        picker.loading = true;
        picker.table.setLoading(true);
        try {
            const params = poolParams(picker.filters, PICK, { page: picker.page, pageSize: picker.pageSize, forceHideListed: true });
            const { rows, total } = await fetchPoolPage(params);
            applyPage(picker.table, ctx.state.picker.selection, rows, total, picker.page);
        } catch (error) {
            picker.table.options.loading = false;
            picker.table.updateData([], 0, 1);
            showNotification(error.message || 'Havuz yüklenemedi', 'error');
        } finally {
            picker.loading = false;
        }
    }

    function renderPickerFooter() {
        const rows = [...ctx.state.picker.selection.values()];
        const count = document.getElementById('pl-picker-count');
        const btn = document.getElementById('pl-picker-add');
        if (count) count.textContent = rows.length ? `${rows.length} kalem seçildi · toplam ${fmtEur(rows.reduce((s, r) => s + (rowEur(r) || 0), 0))}` : '0 kalem seçildi';
        if (btn) btn.disabled = rows.length === 0;
    }

    async function addSelectedFromPicker() {
        const ids = [...ctx.state.picker.selection.values()].map((r) => r.schedule_id);
        if (!ids.length) return;
        const btn = document.getElementById('pl-picker-add');
        btn.disabled = true;
        try {
            await addPaymentListItems(listId, ids);
            showNotification(`${ids.length} kalem eklendi`, 'success');
            bootstrap.Modal.getOrCreateInstance(document.getElementById('plPoolPickerModal')).hide();
            await load();
        } catch (error) {
            showNotification(error.message || 'Kalemler eklenemedi', 'error');
            btn.disabled = false;
        }
    }

    // ----------------------------------------------------------------------
    // Excel export (same layout as the old sheet)
    // ----------------------------------------------------------------------

    async function exportToXlsx() {
        try {
            await (table || new TableComponent('pl-items-table', { columns: [] })).loadXLSXLibrary();
            const fx = data.fx || {};
            const header = ['#', 'MÜŞTERİ', 'İŞ NO', 'GS NO', 'MALZEME', 'TEDARİKÇİ', 'TOPLAM TUTAR (KDV DAHİL)', 'PARA BİRİMİ',
                'BU ÖDEME', 'EUR', 'ÖDEME ŞEKLİ', 'SİPARİŞ TARİHİ', 'VADE', 'PROFORMA', 'AÇIKLAMA', 'DURUM'];
            const rows = (data.items || []).map((it) => [
                it.sequence,
                customersOf(it).join(', '),
                jobNosOf(it).join(', '),
                (it.gs_numbers || []).join(', '),
                it.items_summary || '',
                it.supplier?.name || '',
                num(it.po?.gross_total),
                it.currency,
                num(it.gross_amount),
                rowEur(it),
                `${it.schedule_sequence ?? it.sequence}/${it.schedule_count} ${it.label || it.basis_label || ''} (${it.terms?.name || it.basis_label || ''})`.trim(),
                it.po?.created_at ? fmtDate(it.po.created_at) : '',
                it.due_date ? fmtDate(it.due_date) : '',
                it.po?.proforma_count || 0,
                [(it.is_urgent ? 'ACİL' : ''), it.note].filter(Boolean).join(' · '),
                it.po_cancelled ? 'SİPARİŞ İPTAL' : (it.is_paid ? 'ÖDENDİ' : (it.is_excluded ? `ÇIKARILDI — ${it.exclusion_reason || ''}` : 'BEKLİYOR')),
            ]);
            const t = data.totals || {};
            const aoa = [
                [data.title],
                ['Tarih', fmtDate(data.list_date), '1 € =', num(fx.eur_try), 'TL', '1 $ =', num(fx.usd_try), 'TL', 'Bütçe (EUR)', num(data.budget_eur)],
                [],
                header,
                ...rows,
                [],
                ['TOPLAM (EUR)', '', '', '', '', '', '', '', '', num(t.total_eur)],
                ['ÖDENEN (EUR)', '', '', '', '', '', '', '', '', num(t.paid_eur)],
                ['KALAN (EUR)', '', '', '', '', '', '', '', '', num(t.remaining_eur)],
            ];
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            const numericCols = [6, 8, 9];
            for (let r = 4; r < 4 + rows.length; r++) {
                numericCols.forEach((c) => {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    if (ws[addr] && typeof ws[addr].v === 'number') { ws[addr].t = 'n'; ws[addr].z = '#,##0.00'; }
                });
            }
            ws['!cols'] = header.map((h, i) => ({ wch: i === 4 ? 40 : Math.max(12, h.length + 2) }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, (fmtDate(data.list_date) || 'Liste').replace(/[\\/?*[\]:]/g, '-').slice(0, 30));
            XLSX.writeFile(wb, `odeme_listesi_${data.list_date || data.id}.xlsx`);
        } catch (error) {
            console.error(error);
            showNotification('Excel dosyası oluşturulamadı', 'error');
        }
    }

    return {
        show(id) {
            root().classList.remove('d-none');
            if (id && id !== listId) data = null;
            load(id);
        },
        hide() {
            root().classList.add('d-none');
        },
        load: () => load(),
    };
}
