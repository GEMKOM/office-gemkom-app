/**
 * Ödeme Listeleri overview: stat cards + filterable table of lists.
 */
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { showNotification } from '../../components/notification/notification.js';
import { extractResultsFromResponse } from '../../apis/paginationHelper.js';
import { escapeHtml } from '../../utils/text.js';
import { getPaymentLists } from '../../apis/finance/paymentLists.js';
import { LIST_STATUS_OPTIONS, badge, fmtDate, fmtEur, listStatusBadge, num } from './format.js';

export function createListsView(ctx) {
    let filters = null;
    let table = null;
    let stats = null;
    let page = 1;
    let pageSize = 20;
    let loading = false;

    const root = () => document.getElementById('pl-view-lists');

    function init() {
        if (table) return;
        stats = new StatisticsCards('pl-lists-stats', { cards: [], compact: true, animation: false });
        filters = new FiltersComponent('pl-lists-filters', {
            title: 'Filtreler',
            onApply: () => { page = 1; load(); },
            onClear: () => { page = 1; load(); },
        });
        filters
            .addSelectFilter({ id: 'pl_list_status', label: 'Durum', options: LIST_STATUS_OPTIONS, value: 'open', placeholder: 'Tümü', colSize: 4 })
            .addTextFilter({ id: 'pl_list_q', label: 'Başlık', placeholder: 'Liste başlığı…', colSize: 3 });

        table = new TableComponent('pl-lists-table', {
            title: 'Ödeme Listeleri',
            icon: 'fas fa-list-check',
            columns: [
                {
                    field: 'title', label: 'Başlık', sortable: false,
                    formatter: (v, row) => `<strong>${escapeHtml(v)}</strong><div class="pl-sub">#${row.id}${row.created_by_name ? ' · ' + escapeHtml(row.created_by_name) : ''}</div>`,
                },
                { field: 'list_date', label: 'Tarih', width: '100px', sortable: false, formatter: (v) => fmtDate(v) },
                { field: 'status', label: 'Durum', width: '110px', sortable: false, formatter: (v, row) => listStatusBadge(v, row.status_label) },
                { field: 'budget_eur', label: 'Bütçe', width: '120px', cellClass: 'pl-money', sortable: false, formatter: (v) => (num(v) === null ? '-' : fmtEur(v)) },
                {
                    field: 'totals.total_eur', label: 'Dahil Toplam', width: '130px', cellClass: 'pl-money', sortable: false,
                    formatter: (v, row) => (row.totals?.over_budget ? `<span class="pl-budget-over">${fmtEur(v)}</span>` : fmtEur(v)),
                },
                { field: 'totals.paid_eur', label: 'Ödenen', width: '120px', cellClass: 'pl-money', sortable: false, formatter: (v) => fmtEur(v) },
                {
                    field: 'totals.included_count', label: 'Kalem', width: '90px', sortable: false,
                    formatter: (_v, row) => {
                        const t = row.totals || {};
                        const excluded = t.excluded_count ? `<div class="pl-sub">${t.excluded_count} çıkarıldı</div>` : '';
                        return `${t.paid_count ?? 0}/${t.included_count ?? 0}${excluded}`;
                    },
                },
                {
                    field: 'totals.proforma_missing', label: 'Proforma', width: '90px', sortable: false,
                    formatter: (v) => (v > 0 ? badge('status-orange', `${v} eksik`) : '<i class="fas fa-check text-success" title="Tamam"></i>'),
                },
                {
                    field: 'current_stage_name', label: 'Onay', sortable: false,
                    formatter: (v, row) => {
                        if (row.status === 'submitted') {
                            const names = (row.pending_approver_names || []).map(escapeHtml).join(', ');
                            return `${escapeHtml(v || 'Onay')}<div class="pl-sub">Bekleyen: ${names || '-'}</div>`;
                        }
                        if (row.status === 'sent_to_finance') {
                            return row.finance_email_error
                                ? badge('status-red', 'E-posta hatası', row.finance_email_error)
                                : (row.finance_email_sent_at ? badge('status-green', 'E-posta gönderildi') : badge('status-grey', 'E-posta bekleniyor'));
                        }
                        return '<span class="text-muted">—</span>';
                    },
                },
            ],
            data: [],
            sortable: false,
            pagination: true,
            itemsPerPage: pageSize,
            serverSidePagination: true,
            refreshable: true,
            onRefresh: () => load(),
            onPageChange: (p) => { page = p; load(); },
            onPageSizeChange: (size) => { pageSize = size; page = 1; load(); },
            onRowClick: (row) => ctx.navigate({ view: 'detail', listId: row.id }),
            rowBackgroundColor: (row) => (row.status === 'submitted' ? '#fff7ed' : null),
            actions: [
                { key: 'open', label: 'Aç', icon: 'fas fa-folder-open', class: 'btn-outline-primary', onClick: (row) => ctx.navigate({ view: 'detail', listId: row.id }) },
                {
                    type: 'dropdown', key: 'more', icon: 'fas fa-ellipsis-v', label: 'Diğer',
                    subActions: [
                        {
                            key: 'carry', label: 'Yeni listeye aktar', icon: 'fas fa-forward',
                            visible: (row) => ['completed', 'cancelled'].includes(row.status),
                            onClick: (row) => ctx.modals.openListForm({ mode: 'create', carryOverFrom: row, onSaved: (list) => ctx.navigate({ view: 'detail', listId: list.id }) }),
                        },
                        {
                            key: 'cancel', label: 'İptal et', icon: 'fas fa-ban', class: 'text-danger',
                            visible: (row) => ['draft', 'submitted', 'rejected', 'approved'].includes(row.status),
                            onClick: (row) => ctx.modals.openCancel({ list: row, onDone: load }),
                        },
                    ],
                },
            ],
            emptyMessage: 'Ödeme listesi yok. "Yeni Liste" ile başlayın.',
            emptyIcon: 'fas fa-list-check',
        });
    }

    async function loadStats() {
        try {
            const response = await getPaymentLists({ status: 'open', page_size: 200 });
            const rows = extractResultsFromResponse(response);
            const open = rows.length;
            const submitted = rows.filter((r) => r.status === 'submitted').length;
            const inFinance = rows.filter((r) => r.status === 'sent_to_finance')
                .reduce((acc, r) => acc + ((num(r.totals?.total_eur) || 0) - (num(r.totals?.paid_eur) || 0)), 0);
            const missing = rows.reduce((acc, r) => acc + (num(r.totals?.proforma_missing) || 0), 0);
            stats.setCards([
                { title: 'Açık Liste', value: String(open), icon: 'fas fa-list-check', color: 'primary' },
                { title: 'Onay Bekleyen', value: String(submitted), icon: 'fas fa-hourglass-half', color: 'info' },
                { title: 'Finansta Bekleyen (EUR)', value: fmtEur(inFinance), icon: 'fas fa-coins', color: 'success' },
                { title: 'Proforma Eksik Kalem', value: String(missing), icon: 'fas fa-paperclip', color: 'secondary' },
            ]);
        } catch (error) {
            console.error('stats failed', error);
        }
    }

    async function load() {
        if (!table || loading) return;
        loading = true;
        table.setLoading(true);
        try {
            const v = filters.getFilterValues();
            const response = await getPaymentLists({
                status: v.pl_list_status || undefined,
                q: (v.pl_list_q || '').trim() || undefined,
                page,
                page_size: pageSize,
            });
            const rows = extractResultsFromResponse(response).map((r) => ({ ...r, key: r.id }));
            const total = typeof response?.count === 'number' ? response.count : rows.length;
            table.options.loading = false;
            table.updateData(rows, total, page);
        } catch (error) {
            console.error('lists load failed', error);
            table.options.loading = false;
            table.updateData([], 0, 1);
            showNotification(error.message || 'Ödeme listeleri yüklenemedi', 'error');
        } finally {
            loading = false;
        }
        loadStats();
    }

    return {
        show() {
            init();
            root().classList.remove('d-none');
            load();
        },
        hide() {
            root().classList.add('d-none');
        },
        load,
    };
}
