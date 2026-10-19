// Depo Çekme Talepleri — the office-side list of every warehouse pull request
// (pending, handed over, cancelled), with detail, cancel and a per-request
// Excel. The warehouse works the same requests on saha /warehouse/transfer-requests/.
import { guardRoute, getUser, isAdmin } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    getMaterialPullRequests,
    getMaterialPullRequest,
    cancelMaterialPullRequest
} from '../../../apis/warehouse/pullRequests.js';
import { extractResultsFromResponse } from '../../../apis/paginationHelper.js';
import { showNotification } from '../../../components/notification/notification.js';
import { renderDeliveryState, fmtQty } from '../../../utils/deliveryState.js';
import { escapeHtml } from '../../../utils/text.js';

const DEFAULT_ORDERING = '-requested_at';

let currentPage = 1;
let currentPageSize = 20;
let currentOrdering = DEFAULT_ORDERING;
let currentUser = null;

/** @type {import('../../../components/table/table.js').TableComponent | null} */
let table = null;
let filtersComponent = null;
let detailModal = null;
let cancelConfirmModal = null;
let requestToCancel = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    currentUser = await getUser().catch(() => null);

    new HeaderComponent({
        title: 'Depo Çekme Talepleri',
        subtitle: 'Taşeron ve kaynak ekiplerine depodan çekilen malzemeler: bekleyen, teslim edilen ve iptal edilen talepler',
        icon: 'dolly',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: () => {
            currentPage = 1;
            loadRequests();
        },
        backUrl: '/manufacturing/material-tracking/'
    });

    initFilters();
    initTable();
    initModals();
    applyUrlParams();

    await loadRequests();
});

// ---------------------------------------------------------------- helpers

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function renderStatusBadge(status, label) {
    const labels = { pending: 'Beklemede', transferred: 'Teslim Edildi', cancelled: 'İptal Edildi' };
    const classes = { pending: 'status-orange', transferred: 'status-green', cancelled: 'status-grey' };
    const text = label || labels[status] || status || '-';
    return `<span class="status-badge ${classes[status] || 'status-grey'}" style="min-width: auto;">${escapeHtml(text)}</span>`;
}

function renderDestinationCell(row) {
    const chip = row.destination_type === 'subcontractor'
        ? '<span class="status-badge status-purple" style="min-width: auto;">Taşeron</span>'
        : '<span class="status-badge status-blue" style="min-width: auto;">Ekip</span>';
    return `${escapeHtml(row.destination_name || '-')} ${chip}`;
}

function renderJobNos(jobNos) {
    if (!Array.isArray(jobNos) || jobNos.length === 0) return '-';
    return jobNos.map((j) => `<span class="status-badge status-grey" style="min-width: auto;">${escapeHtml(j)}</span>`).join(' ');
}

function renderNote(note) {
    if (!note) return '-';
    const short = note.length > 40 ? `${note.slice(0, 40)}…` : note;
    return `<span title="${escapeHtml(note)}">${escapeHtml(short)}</span>`;
}

function canCancel(row) {
    if (!row || row.status !== 'pending') return false;
    return isAdmin() || (currentUser && currentUser.id === row.requested_by);
}

// ---------------------------------------------------------------- filters

function initFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            currentPage = 1;
            loadRequests();
        },
        onClear: () => {
            currentPage = 1;
            currentOrdering = DEFAULT_ORDERING;
            loadRequests();
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    filtersComponent
        .addTextFilter({ id: 'search', label: 'Arama', placeholder: 'Talep no, hedef, iş no, ürün...', colSize: 3 })
        .addDropdownFilter({
            id: 'status',
            label: 'Durum',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'pending', label: 'Beklemede' },
                { value: 'transferred', label: 'Teslim Edildi' },
                { value: 'cancelled', label: 'İptal Edildi' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'destination_type',
            label: 'Hedef Türü',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'subcontractor', label: 'Taşeron' },
                { value: 'team', label: 'Kaynak Ekibi' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş no...', colSize: 2 })
        .addDateFilter({ id: 'requested_after', label: 'Talep Tarihi (başlangıç)', colSize: 2 })
        .addDateFilter({ id: 'requested_before', label: 'Talep Tarihi (bitiş)', colSize: 2 })
        .addCheckboxFilter({ id: 'mine', label: 'Sadece benim taleplerim', checked: false, colSize: 2 })
        .addDropdownFilter({
            id: 'ordering',
            label: 'Sıralama',
            options: [
                { value: '-requested_at', label: 'Talep: Yeni → Eski' },
                { value: 'requested_at', label: 'Talep: Eski → Yeni' },
                { value: '-confirmed_at', label: 'Teslim: Yeni → Eski' },
                { value: 'number', label: 'Talep No' }
            ],
            value: DEFAULT_ORDERING,
            placeholder: 'Talep: Yeni → Eski',
            colSize: 2
        });
}

// ?talep=MPR-2026-0012 (links from other pages) pre-fills the search box.
function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const values = {};
    const talep = params.get('talep');
    if (talep) values.search = talep;
    const status = params.get('status');
    if (status) values.status = status;
    if (Object.keys(values).length && filtersComponent?.setFilterValues) {
        filtersComponent.setFilterValues(values);
    }
}

// ------------------------------------------------------------------ table

function initTable() {
    table = new TableComponent('requests-table-container', {
        title: 'Talepler',
        icon: 'fas fa-dolly',
        exportable: true,
        exportFilename: () => `depo_cekme_talepleri_${new Date().toISOString().slice(0, 10)}.xlsx`,
        columns: [
            {
                field: 'number', label: 'Talep No', sortable: true,
                formatter: (v) => `<span class="status-badge status-blue" style="min-width: auto;">${escapeHtml(v || '-')}</span>`
            },
            { field: 'status', label: 'Durum', sortable: true, formatter: (v, row) => renderStatusBadge(v, row.status_label) },
            { field: 'destination_name', label: 'Hedef', sortable: false, formatter: (v, row) => renderDestinationCell(row) },
            { field: 'item_count', label: 'Kalem', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'job_nos', label: 'İş Emirleri', sortable: false, formatter: (v) => renderJobNos(v) },
            {
                field: 'requested_by_name', label: 'Talep Eden', sortable: false,
                formatter: (v, row) => escapeHtml(v || row.requested_by_username || '-')
            },
            { field: 'requested_at', label: 'Talep Tarihi', sortable: true, formatter: (v) => formatDateTime(v) },
            {
                field: 'confirmed_by_name', label: 'Teslim Eden', sortable: false,
                formatter: (v, row) => escapeHtml(v || row.confirmed_by_username || '-')
            },
            { field: 'confirmed_at', label: 'Teslim Tarihi', sortable: true, formatter: (v) => formatDateTime(v) },
            { field: 'note', label: 'Not', sortable: false, formatter: (v) => renderNote(v) }
        ],
        actions: [
            {
                key: 'detail',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => showDetail(row.id)
            },
            {
                key: 'excel',
                label: 'Excel',
                icon: 'fas fa-file-excel',
                class: 'btn-outline-success',
                onClick: (row) => exportRequestExcel(row)
            },
            {
                key: 'cancel',
                label: 'İptal',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                visible: (row) => canCancel(row),
                onClick: (row) => askCancel(row)
            }
        ],
        pagination: true,
        itemsPerPage: currentPageSize,
        serverSidePagination: true,
        refreshable: true,
        onRefresh: () => loadRequests(),
        onSort: (field, direction) => {
            const orderable = new Set(['number', 'status', 'requested_at', 'confirmed_at']);
            if (!orderable.has(field)) return;
            currentOrdering = `${direction === 'desc' ? '-' : ''}${field}`;
            if (filtersComponent?.setFilterValues) {
                filtersComponent.setFilterValues({ ordering: currentOrdering });
            }
            currentPage = 1;
            loadRequests();
        },
        onPageChange: (page) => {
            currentPage = page;
            loadRequests();
        },
        onPageSizeChange: (pageSize) => {
            currentPageSize = pageSize;
            currentPage = 1;
            loadRequests();
        },
        emptyMessage: 'Depo çekme talebi bulunamadı.',
        emptyIcon: 'fas fa-inbox'
    });
}

async function loadRequests() {
    if (!table) return;
    try {
        table.setLoading(true);
        const values = filtersComponent?.getFilterValues?.() || {};
        const orderingFromFilter = values.ordering ?? '';
        const mine = values.mine === true || values.mine === 'true';

        const filters = {
            search: values.search || undefined,
            status: values.status || undefined,
            destination_type: values.destination_type || undefined,
            job_no: values.job_no || undefined,
            requested_after: values.requested_after || undefined,
            requested_before: values.requested_before || undefined,
            requested_by: mine && currentUser ? currentUser.id : undefined,
            ordering: orderingFromFilter || currentOrdering,
            page: currentPage,
            page_size: currentPageSize
        };

        const response = await getMaterialPullRequests(filters);
        const results = extractResultsFromResponse(response);
        const total = typeof response?.count === 'number' ? response.count : results.length;
        table.updateData(results, total, currentPage);
    } catch (error) {
        console.error('Error loading pull requests:', error);
        table.updateData([], 0, 1);
        showNotification(error?.message || 'Depo çekme talepleri yüklenemedi', 'danger');
    } finally {
        table.setLoading(false);
    }
}

// ----------------------------------------------------------------- modals

function initModals() {
    detailModal = new DisplayModal('detail-modal-container', {
        title: 'Depo Çekme Talebi',
        icon: 'fas fa-dolly',
        size: 'lg',
        showEditButton: false
    });

    cancelConfirmModal = new ConfirmationModal('cancel-confirmation-container', {
        title: 'Depo Çekme Talebini İptal Et',
        icon: 'fas fa-ban',
        message: 'Bu depo çekme talebini iptal etmek istediğinize emin misiniz?',
        confirmText: 'Evet, İptal Et',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-danger'
    });
}

async function showDetail(requestId) {
    try {
        const request = await getMaterialPullRequest(requestId);

        detailModal.clearData();
        detailModal.setTitle(`Depo Çekme Talebi — ${request.number}`);
        detailModal.addSection({ title: 'Genel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
        detailModal.addField({ id: 'number', label: 'Talep No', type: 'text', value: request.number || '-', colSize: 4 });
        detailModal.addField({
            id: 'status', label: 'Durum', type: 'text', value: request.status,
            format: () => renderStatusBadge(request.status, request.status_label), colSize: 4
        });
        detailModal.addField({
            id: 'destination', label: 'Hedef', type: 'text', value: request.destination_name || '-',
            format: () => renderDestinationCell(request), colSize: 4
        });
        detailModal.addField({
            id: 'requested-by', label: 'Talep Eden', type: 'text',
            value: `${request.requested_by_name || request.requested_by_username || '-'} — ${formatDateTime(request.requested_at)}`, colSize: 6
        });
        if (request.confirmed_by) {
            detailModal.addField({
                id: 'confirmed-by', label: 'Teslim Eden', type: 'text',
                value: `${request.confirmed_by_name || request.confirmed_by_username || '-'} — ${formatDateTime(request.confirmed_at)}`, colSize: 6
            });
        }
        if (request.cancelled_by) {
            detailModal.addField({
                id: 'cancelled-by', label: 'İptal Eden', type: 'text',
                value: `${request.cancelled_by_name || '-'} — ${formatDateTime(request.cancelled_at)}`, colSize: 6
            });
        }
        detailModal.addField({ id: 'note', label: 'Not', type: 'text', value: request.note || '-', colSize: 12 });

        const items = request.items || [];
        const itemRows = items.map((item) => `
            <tr>
                <td>${escapeHtml(item.item_code || '-')}</td>
                <td>${escapeHtml(item.item_name || '-')}</td>
                <td>${escapeHtml(item.job_no || '-')}</td>
                <td class="text-end fw-bold">${fmtQty(item.quantity)} ${escapeHtml(item.item_unit || '')}</td>
                <td>${renderDeliveryState({
                    is_delivered: item.is_delivered,
                    delivered_quantity: item.delivered_quantity,
                    quantity: item.planning_quantity,
                    item_unit: item.item_unit
                })}</td>
                <td class="text-end">${item.delivered_quantity != null ? fmtQty(item.delivered_quantity) : '-'}</td>
                <td class="text-end">${item.pulled_quantity != null ? fmtQty(item.pulled_quantity) : '-'}</td>
                <td class="text-end ${Number(item.quantity_available_to_pull || 0) > 0 ? 'text-success' : 'text-muted'}">
                    ${item.quantity_available_to_pull != null ? fmtQty(item.quantity_available_to_pull) : '-'}
                </td>
            </tr>
        `).join('');
        detailModal.addCustomSection({
            title: `Kalemler (${items.length})`,
            icon: 'fas fa-list',
            iconColor: 'text-primary',
            customContent: `
                <div class="table-responsive">
                    <table class="table table-sm align-middle">
                        <thead>
                            <tr>
                                <th>Ürün Kodu</th>
                                <th>Ürün Adı</th>
                                <th>İş No</th>
                                <th class="text-end">Bu Talep</th>
                                <th>Teslim</th>
                                <th class="text-end" title="Planlama kalemi için depoya giren toplam">Teslim Alınan</th>
                                <th class="text-end" title="İptal edilmemiş tüm çekme talepleri (bu talep dahil)">Çekilen</th>
                                <th class="text-end" title="Depoda hâlâ çekilebilir miktar">Depoda Kalan</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="8" class="text-center text-muted">Kalem yok</td></tr>'}</tbody>
                    </table>
                </div>
            `
        });

        const buttons = [`
            <button type="button" id="detail-export-btn" class="btn btn-sm btn-outline-success">
                <i class="fas fa-file-excel me-1"></i>Excel'e Aktar
            </button>`];
        if (canCancel(request)) {
            buttons.push(`
            <button type="button" id="detail-cancel-btn" class="btn btn-sm btn-outline-danger">
                <i class="fas fa-ban me-1"></i>Talebi İptal Et
            </button>`);
        }
        detailModal.addCustomSection({
            customContent: `<div class="d-flex justify-content-end gap-2">${buttons.join('')}</div>`
        });

        detailModal.render();
        detailModal.show();
        document.getElementById('detail-export-btn')?.addEventListener('click', () => exportRequestExcel(request));
        document.getElementById('detail-cancel-btn')?.addEventListener('click', () => {
            detailModal.hide();
            askCancel(request);
        });
    } catch (error) {
        showNotification(error?.message || 'Talep detayı yüklenemedi', 'danger');
    }
}

function askCancel(row) {
    requestToCancel = row;
    cancelConfirmModal.show({
        message: `${row.number} numaralı depo çekme talebini iptal etmek istediğinize emin misiniz?`,
        onConfirm: async () => {
            if (!requestToCancel) return;
            try {
                await cancelMaterialPullRequest(requestToCancel.id);
                showNotification('Depo çekme talebi iptal edildi', 'success');
                requestToCancel = null;
                await loadRequests();
            } catch (error) {
                showNotification(error?.message || 'Talep iptal edilirken hata oluştu', 'danger');
                throw error;   // keep the dialog open
            }
        }
    });
}

// ------------------------------------------------------------------ excel

function destinationTypeLabel(type) {
    if (type === 'subcontractor') return 'Taşeron';
    if (type === 'team') return 'Kaynak Ekibi';
    return type || '';
}

function excelDate(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d;
}

/** One .xlsx per request: header block, then one row per line (same layout as the warehouse export). */
async function exportRequestExcel(requestOrId) {
    if (typeof XLSX === 'undefined') {
        showNotification('Excel kütüphanesi yüklenemedi. Sayfayı yenileyip tekrar deneyin.', 'danger');
        return;
    }
    let request = requestOrId;
    try {
        if (!request || !Array.isArray(request.items)) {
            request = await getMaterialPullRequest(typeof requestOrId === 'object' ? requestOrId.id : requestOrId);
        }
    } catch (error) {
        showNotification(error?.message || 'Talep yüklenemedi.', 'danger');
        return;
    }

    const header = [
        ['Talep No', request.number || ''],
        ['Durum', request.status_label || request.status || ''],
        ['Hedef', request.destination_name || ''],
        ['Hedef Türü', destinationTypeLabel(request.destination_type)],
        ['Talep Eden', request.requested_by_name || request.requested_by_username || ''],
        ['Talep Tarihi', excelDate(request.requested_at)],
        ['Teslim Eden', request.confirmed_by_name || request.confirmed_by_username || ''],
        ['Teslim Tarihi', excelDate(request.confirmed_at)],
    ];
    if (request.status === 'cancelled') {
        header.push(['İptal Eden', request.cancelled_by_name || '']);
        header.push(['İptal Tarihi', excelDate(request.cancelled_at)]);
    }
    header.push(['Not', request.note || '']);

    const tableHeader = ['#', 'İş Emri', 'Stok Kodu', 'Malzeme', 'Miktar', 'Birim', 'Teslim Alınan', 'Çekilen', 'Depoda Kalan'];
    const lines = (request.items || []).map((item, i) => [
        i + 1, item.job_no || '', item.item_code || '', item.item_name || '',
        Number(item.quantity ?? 0), item.item_unit || '',
        item.delivered_quantity != null ? Number(item.delivered_quantity) : '',
        item.pulled_quantity != null ? Number(item.pulled_quantity) : '',
        item.quantity_available_to_pull != null ? Number(item.quantity_available_to_pull) : ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([...header, [], tableHeader, ...lines], { cellDates: true });
    ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
    ws['!merges'] = header.map((_, r) => ({ s: { r, c: 1 }, e: { r, c: 5 } }));
    Object.keys(ws).forEach((addr) => {
        const cell = ws[addr];
        if (cell && cell.v instanceof Date) cell.z = 'dd.mm.yyyy hh:mm';
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Talep');
    const safeNumber = String(request.number || request.id).replace(/[^A-Za-z0-9_-]+/g, '_');
    XLSX.writeFile(wb, `depo-cekme_${safeNumber}.xlsx`);
}
