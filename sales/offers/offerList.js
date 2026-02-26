import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../components/notification/notification.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import {
    listOffers,
    getOffer,
    createOffer,
    patchOffer,
    addOfferItems,
    patchOfferItem,
    deleteOfferItem,
    uploadOfferFile,
    deleteOfferFile,
    sendConsultations,
    proposePrice,
    getPriceHistory,
    submitApproval,
    getApprovalStatus,
    recordDecision,
    submitToCustomer,
    markWon,
    convertToJobOrder,
    markLost,
    cancelOffer,
    OFFER_STATUS_MAP,
    OFFER_STATUS_COLORS,
    CURRENCY_OPTIONS,
    CURRENCY_SYMBOLS,
    DEPARTMENT_CHOICES,
    FILE_TYPE_OPTIONS,
    REVISION_TYPE_MAP
} from '../../apis/sales/offers.js';
import { listOfferTemplates, getOfferTemplate } from '../../apis/sales/offerTemplates.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { authFetchUsers } from '../../apis/users.js';

const CLOSED_STATUSES = ['won', 'lost', 'cancelled'];
const EDITABLE_STATUSES = ['draft', 'consultation', 'pricing'];

let currentPage = 1;
let currentSortField = '-created_at';
let currentSortDirection = 'desc';
let offers = [];
let totalOffers = 0;
let isLoading = false;
let offersStats = null;
let offersFilters = null;
let offersTable = null;
let createOfferModal = null;
let viewOfferModal = null;
let customerOptions = [];
let offer = null;
let offerId = null;
let templates = [];
let selectedTemplate = null;
let users = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Satış Teklifleri',
        subtitle: 'Teklif listesi, oluşturma ve yönetimi',
        icon: 'file-invoice-dollar',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: '      Yeni Teklif',
        onBackClick: () => window.location.href = '/sales/',
        onCreateClick: () => showCreateOfferModal()
    });

    offersStats = new StatisticsCards('offers-statistics', {
        cards: [
            { title: 'Toplam Teklif', value: '0', icon: 'fas fa-file-invoice-dollar', color: 'primary', id: 'total-offers' },
            { title: 'Taslak', value: '0', icon: 'fas fa-pencil-alt', color: 'secondary', id: 'draft-offers' },
            { title: 'Devam Eden', value: '0', icon: 'fas fa-spinner', color: 'warning', id: 'active-offers' },
            { title: 'Kazanılan', value: '0', icon: 'fas fa-trophy', color: 'success', id: 'won-offers' }
        ],
        compact: true,
        animation: true
    });

    await loadCustomerOptions();
    initFilters();
    initTable();
    initModals();
    await loadOffers();
});

async function loadCustomerOptions() {
    try {
        const res = await listCustomers({ is_active: true, page: 1 });
        customerOptions = (res.results || []).map(c => ({ value: String(c.id), label: `${c.code} - ${c.name}` }));
    } catch (e) {
        console.error('Error loading customers:', e);
    }
}

function initFilters() {
    offersFilters = new FiltersComponent('filters-placeholder', {
        title: 'Teklif Filtreleri',
        onApply: () => { currentPage = 1; loadOffers(); },
        onClear: () => { currentPage = 1; loadOffers(); }
    });

    offersFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Teklif no, başlık, müşteri...',
        colSize: 3
    });

    offersFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            ...Object.entries(OFFER_STATUS_MAP).map(([v, l]) => ({ value: v, label: l }))
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    if (customerOptions.length > 0) {
        offersFilters.addDropdownFilter({
            id: 'customer-filter',
            label: 'Müşteri',
            options: [{ value: '', label: 'Tümü' }, ...customerOptions],
            placeholder: 'Tümü',
            colSize: 3
        });
    }
}

function initTable() {
    offersTable = new TableComponent('offers-table-container', {
        columns: [
            {
                field: 'offer_no',
                label: 'Teklif No',
                sortable: true,
                formatter: (v) => `<strong>${v || '-'}</strong>`
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (v) => v || '-'
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: false,
                formatter: (v, row) => {
                    const code = row.customer_code ? `<small class="text-muted">(${row.customer_code})</small>` : '';
                    return `${v || '-'} ${code}`;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (v) => {
                    const label = OFFER_STATUS_MAP[v] || v;
                    const color = OFFER_STATUS_COLORS[v] || 'secondary';
                    return `<span class="badge bg-${color}">${label}</span>`;
                }
            },
            {
                field: 'current_price',
                label: 'Güncel Fiyat',
                sortable: false,
                formatter: (v) => {
                    if (!v || !v.amount) return '<span class="text-muted">-</span>';
                    const sym = CURRENCY_SYMBOLS[v.currency] || v.currency;
                    return `<strong>${sym} ${parseFloat(v.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>`;
                }
            },
            {
                field: 'item_count',
                label: 'Kalem',
                sortable: false,
                formatter: (v) => v ?? '-'
            },
            {
                field: 'delivery_date_requested',
                label: 'Termin',
                sortable: true,
                formatter: (v) => {
                    if (!v) return '-';
                    return new Date(v).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
                }
            },
            {
                field: 'created_by_name',
                label: 'Oluşturan',
                sortable: false,
                formatter: (v) => v || '-'
            },
            {
                field: 'created_at',
                label: 'Tarih',
                sortable: true,
                type: 'date',
                formatter: (v) => {
                    if (!v) return '-';
                    return new Date(v).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: async () => { currentPage = 1; await loadOffers(); },
        onSort: async (field, dir) => {
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = dir;
            await loadOffers();
        },
        onPageChange: async (page) => { currentPage = page; await loadOffers(); },
        onPageSizeChange: async (size) => {
            if (offersTable) offersTable.options.itemsPerPage = size;
            currentPage = 1;
            await loadOffers();
        },
        actions: [
            {
                key: 'view',
                label: 'Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewOffer(row.id)
            }
        ],
        emptyMessage: 'Teklif bulunamadı',
        emptyIcon: 'fas fa-file-invoice-dollar'
    });
}

function initModals() {
    createOfferModal = new EditModal('create-offer-modal-container', {
        title: 'Yeni Teklif Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    createOfferModal.onSaveCallback(async (formData) => {
        try {
            const res = await createOffer(formData);
            if (res && res.id) {
                showNotification('Teklif başarıyla oluşturuldu', 'success');
                createOfferModal.hide();
                await viewOffer(res.id);
            }
        } catch (error) {
            console.error('Error creating offer:', error);
            showNotification(parseError(error, 'Teklif oluşturulurken hata oluştu'), 'error');
        }
    });

    viewOfferModal = new DisplayModal('view-offer-modal-container', {
        title: 'Teklif Detayı',
        icon: 'fas fa-file-invoice-dollar',
        size: 'xl',
        showEditButton: false
    });
}

// ─── View Offer Modal (tabs like project-tracking) ─────────────────────

window.viewOffer = async function (id) {
    try {
        offer = await getOffer(id);
        offerId = offer.id;
        viewOfferModal.clearData();
        viewOfferModal.setTitle(`${offer.offer_no} — ${offer.title || 'Teklif'}`);

        const statusLabel = OFFER_STATUS_MAP[offer.status] || offer.status;
        const statusColor = OFFER_STATUS_COLORS[offer.status] || 'secondary';

        viewOfferModal.addTab({
            id: 'genel',
            label: 'Genel',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            customContent: buildGenelTab(statusLabel, statusColor),
            active: true
        });

        viewOfferModal.addTab({
            id: 'kalemler',
            label: 'Kalemler',
            icon: 'fas fa-list',
            iconColor: 'text-primary',
            customContent: `<div class="offer-tab-content">${buildItemsTab()}</div>`
        });

        viewOfferModal.addTab({
            id: 'dosyalar',
            label: 'Dosyalar',
            icon: 'fas fa-paperclip',
            iconColor: 'text-primary',
            customContent: `<div class="offer-tab-content">${buildFilesTab()}</div>`
        });

        viewOfferModal.addTab({
            id: 'consultations',
            label: 'Departman Görüşleri',
            icon: 'fas fa-comments',
            iconColor: 'text-primary',
            customContent: `<div class="offer-tab-content">${buildConsultationsTab()}</div>`
        });

        viewOfferModal.addTab({
            id: 'pricing',
            label: 'Fiyatlandırma',
            icon: 'fas fa-coins',
            iconColor: 'text-primary',
            customContent: `<div class="offer-tab-content">${buildPricingTab()}</div>`
        });

        viewOfferModal.addTab({
            id: 'approval',
            label: 'Onay',
            icon: 'fas fa-check-double',
            iconColor: 'text-primary',
            customContent: `<div class="offer-tab-content">${buildApprovalTab()}</div>`
        });

        viewOfferModal.render();
        attachOfferModalListeners();
        setupApprovalTabHandler();
        viewOfferModal.show();
    } catch (error) {
        console.error('Error loading offer:', error);
        showNotification('Teklif yüklenirken hata oluştu', 'error');
    }
};

function setupApprovalTabHandler() {
    const modal = viewOfferModal.modal;
    if (!modal) return;
    const tabButtons = modal.querySelectorAll('[data-bs-toggle="tab"]');
    tabButtons.forEach(btn => {
        btn.addEventListener('shown.bs.tab', (e) => {
            const target = e.target.getAttribute('data-bs-target');
            if (target && target.includes('approval') && offerId && offer && offer.approval_round > 0) loadApprovalStatus();
        });
    });
}

async function loadApprovalStatus() {
    const container = document.getElementById('approval-workflow-content');
    if (!container) return;
    try {
        const workflow = await getApprovalStatus(offerId);
        if (!workflow) {
            container.innerHTML = '<div class="text-muted">Aktif onay süreci bulunamadı.</div>';
            return;
        }
        const statusBadge = workflow.status === 'approved' ? '<span class="badge bg-success">Onaylandı</span>'
            : workflow.status === 'rejected' ? '<span class="badge bg-danger">Reddedildi</span>'
            : '<span class="badge bg-warning">Bekliyor</span>';
        const stagesHtml = (workflow.stages || []).map(stage => {
            const decisions = (stage.decisions || []).map(d => {
                const icon = d.decision === 'approved' ? 'check-circle text-success' : d.decision === 'rejected' ? 'times-circle text-danger' : 'clock text-warning';
                return `<div class="d-flex align-items-center gap-2 mb-1"><i class="fas fa-${icon}"></i><span>${d.approver_name || 'Onaylayıcı'}</span>${d.comment ? `<small class="text-muted">— ${d.comment}</small>` : ''}${d.decided_at ? `<small class="text-muted ms-auto">${formatDateTime(d.decided_at)}</small>` : ''}</div>`;
            }).join('');
            return `<div class="approval-stage mb-2"><strong>Aşama ${stage.stage_order}</strong> ${decisions}</div>`;
        }).join('');
        container.innerHTML = `<div class="mb-2"><strong>Politika:</strong> ${workflow.policy_name || '-'} ${statusBadge}</div>
            ${workflow.snapshot ? `<div class="mb-2 text-muted">Teklif: ${CURRENCY_SYMBOLS[workflow.snapshot.currency] || ''} ${parseFloat(workflow.snapshot.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} (Tur ${workflow.snapshot.round || '-'})</div>` : ''}
            ${stagesHtml}`;
    } catch (e) {
        container.innerHTML = '<div class="text-danger">Onay durumu yüklenemedi.</div>';
    }
}

// Genel tab: structured data + edit & outcome actions only
function buildGenelTab(statusLabel, statusColor) {
    const priceText = offer.current_price
        ? `${CURRENCY_SYMBOLS[offer.current_price.currency] || offer.current_price.currency} ${parseFloat(offer.current_price.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
        : '—';
    const priceSub = offer.current_price ? (REVISION_TYPE_MAP[offer.current_price.revision_type] || '') : '';

    let html = `
        <div class="px-2">
            <h6 class="mb-3 d-flex align-items-center">
                <i class="fas fa-info-circle me-2 text-primary"></i>Teklif Bilgileri
            </h6>
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-barcode me-1"></i>Teklif No</label>
                    <div class="field-value fw-medium">${offer.offer_no || '—'}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-tasks me-1"></i>Durum</label>
                    <div class="field-value"><span class="badge bg-${statusColor}">${statusLabel}</span></div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-heading me-1"></i>Başlık</label>
                    <div class="field-value">${offer.title || '—'}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-building me-1"></i>Müşteri</label>
                    <div class="field-value">${offer.customer_name || '—'}${offer.customer_code ? ` <span class="text-muted">(${offer.customer_code})</span>` : ''}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-hashtag me-1"></i>Müşteri Referansı</label>
                    <div class="field-value">${offer.customer_inquiry_ref || '—'}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-calendar-alt me-1"></i>İstenen Termin</label>
                    <div class="field-value">${offer.delivery_date_requested ? formatDate(offer.delivery_date_requested) : '—'}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-money-bill-wave me-1"></i>Güncel Fiyat</label>
                    <div class="field-value fw-bold text-primary">${priceText}</div>
                    ${priceSub ? `<small class="text-muted">${priceSub}</small>` : ''}
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-list me-1"></i>Kalem Sayısı</label>
                    <div class="field-value">${(offer.items || []).length}</div>
                </div>
                ${offer.approval_round > 0 ? `
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-sync-alt me-1"></i>Onay Turu</label>
                    <div class="field-value">${offer.approval_round}</div>
                </div>
                ` : ''}
            </div>
            ${offer.description ? `
            <h6 class="mb-2 mt-4 d-flex align-items-center">
                <i class="fas fa-align-left me-2 text-secondary"></i>Açıklama
            </h6>
            <div class="field-value text-break">${offer.description}</div>
            ` : ''}
            <h6 class="mb-2 mt-4 d-flex align-items-center">
                <i class="fas fa-info me-2 text-secondary"></i>Sistem Bilgileri
            </h6>
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-user me-1"></i>Oluşturan</label>
                    <div class="field-value">${offer.created_by_name || '—'}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-calendar-plus me-1"></i>Oluşturulma</label>
                    <div class="field-value">${formatDateTime(offer.created_at)}</div>
                </div>
                <div class="col-md-6">
                    <label class="field-label small text-muted mb-1"><i class="fas fa-calendar-edit me-1"></i>Güncellenme</label>
                    <div class="field-value">${formatDateTime(offer.updated_at)}</div>
                </div>
                ${offer.submitted_to_customer_at ? `<div class="col-md-6"><label class="field-label small text-muted mb-1">Müşteriye Gönderilme</label><div class="field-value">${formatDateTime(offer.submitted_to_customer_at)}</div></div>` : ''}
                ${offer.won_at ? `<div class="col-md-6"><label class="field-label small text-muted mb-1">Kazanılma</label><div class="field-value">${formatDateTime(offer.won_at)}</div></div>` : ''}
                ${offer.lost_at ? `<div class="col-md-6"><label class="field-label small text-muted mb-1">Kaybedilme</label><div class="field-value">${formatDateTime(offer.lost_at)}</div></div>` : ''}
                ${offer.cancelled_at ? `<div class="col-md-6"><label class="field-label small text-muted mb-1">İptal</label><div class="field-value">${formatDateTime(offer.cancelled_at)}</div></div>` : ''}
            </div>
            <div class="action-bar mt-4 pt-3 border-top">${buildGenelActionsBar()}</div>
        </div>
    `;
    return html;
}

function buildGenelActionsBar() {
    const s = offer.status;
    const closed = CLOSED_STATUSES.includes(s);
    const editable = EDITABLE_STATUSES.includes(s);
    const btns = [];
    if (editable) btns.push(`<button class="btn btn-outline-primary btn-sm" id="edit-offer-btn"><i class="fas fa-edit me-1"></i>Düzenle</button>`);
    if (s === 'approved') btns.push(`<button class="btn btn-dark btn-sm" id="submit-customer-btn"><i class="fas fa-paper-plane me-1"></i>Müşteriye Gönder</button>`);
    if (['approved', 'submitted_customer'].includes(s)) btns.push(`<button class="btn btn-success btn-sm" id="convert-btn"><i class="fas fa-exchange-alt me-1"></i>İş Emrine Dönüştür</button>`);
    if (!closed) {
        btns.push(`<button class="btn btn-outline-success btn-sm" id="mark-won-btn"><i class="fas fa-trophy me-1"></i>Kazanıldı</button>`);
        btns.push(`<button class="btn btn-outline-danger btn-sm" id="mark-lost-btn"><i class="fas fa-thumbs-down me-1"></i>Kaybedildi</button>`);
        btns.push(`<button class="btn btn-outline-dark btn-sm" id="cancel-btn"><i class="fas fa-ban me-1"></i>İptal</button>`);
    }
    return btns.join(' ');
}

function buildItemsTab() {
    const items = offer.items || [];
    const editable = EDITABLE_STATUSES.includes(offer.status);
    let html = '';
    if (editable) html += `<button class="btn btn-sm btn-success mb-3" id="add-items-btn"><i class="fas fa-plus me-1"></i>Kalem Ekle</button>`;
    if (items.length === 0) return html + '<div class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>Henüz kalem eklenmemiş.</div>';
    html += items.map((item, i) => `
        <div class="item-row d-flex align-items-center gap-2 py-2 border-bottom">
            <span class="badge bg-light text-dark">${i + 1}</span>
            <div class="flex-grow-1"><strong>${item.resolved_title || item.title_override || '-'}</strong>${item.notes ? `<br><small class="text-muted">${item.notes}</small>` : ''}</div>
            <span class="badge bg-primary">x${item.quantity}</span>
            ${!CLOSED_STATUSES.includes(offer.status) ? `<button class="btn btn-sm btn-outline-danger delete-item-btn" data-item-id="${item.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
    `).join('');
    return html;
}

function buildFilesTab() {
    const files = offer.files || [];
    let html = '';
    if (!CLOSED_STATUSES.includes(offer.status)) html += `<button class="btn btn-sm btn-primary mb-3" id="upload-file-btn"><i class="fas fa-upload me-1"></i>Dosya Yükle</button>`;
    if (files.length === 0) return html + '<div class="text-center text-muted py-4"><i class="fas fa-folder-open fa-2x mb-2 d-block"></i>Henüz dosya yüklenmemiş.</div>';
    html += files.map(f => `
        <div class="file-card d-flex align-items-center gap-3 p-2 border rounded mb-2">
            <i class="fas fa-file text-primary"></i>
            <div class="flex-grow-1"><strong>${f.name || f.filename}</strong><br><small class="text-muted">${f.file_type_display || f.file_type} · ${formatFileSize(f.file_size)} · ${formatDate(f.uploaded_at)}</small></div>
            <a href="${f.file_url}" target="_blank" class="btn btn-sm btn-outline-secondary"><i class="fas fa-download"></i></a>
            ${!CLOSED_STATUSES.includes(offer.status) ? `<button class="btn btn-sm btn-outline-danger delete-file-btn" data-file-id="${f.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
    `).join('');
    return html;
}

function buildConsultationsTab() {
    const consultations = offer.consultations || [];
    const editable = EDITABLE_STATUSES.includes(offer.status);
    let html = '';
    if (editable) html += `<button class="btn btn-sm btn-info text-white mb-3" id="send-consultations-btn"><i class="fas fa-paper-plane me-1"></i>Departman Görüşü Gönder</button>`;
    if (consultations.length === 0) return html + '<div class="text-center text-muted py-4"><i class="fas fa-comments fa-2x mb-2 d-block"></i>Henüz departman görüşü gönderilmemiş.</div>';
    html += consultations.map(c => {
        const tasks = (c.tasks || []).map(t => {
            const statusBadge = getTaskStatusBadge(t.status);
            const files = (t.completion_files || []).map(f => `<a href="${f.file_url}" target="_blank" class="btn btn-sm btn-outline-secondary me-1 mb-1">${f.filename}</a>`).join('');
            return `<div class="task-card border rounded p-2 mb-2"><strong>${t.title || 'Görev'}</strong> ${statusBadge}${t.assigned_to_name ? `<br><small class="text-muted">${t.assigned_to_name}</small>` : ''}${t.notes ? `<p class="mb-1 mt-2">${t.notes}</p>` : ''}${files ? `<div class="mt-2">${files}</div>` : ''}</div>`;
        }).join('');
        return `<div class="consultation-dept mb-3"><h6 class="border-bottom pb-1">${c.department_display || c.department}</h6>${tasks || '<p class="text-muted">Görev yok</p>'}</div>`;
    }).join('');
    return html;
}

function buildPricingTab() {
    const revisions = offer.price_revisions || [];
    const canPropose = ['draft', 'consultation', 'pricing', 'pending_approval'].includes(offer.status);
    let html = '';
    if (canPropose) html += `<button class="btn btn-sm btn-warning mb-3" id="propose-price-btn"><i class="fas fa-tag me-1"></i>Fiyat Teklif Et</button>`;
    if (revisions.length === 0) return html + '<div class="text-center text-muted py-4"><i class="fas fa-coins fa-2x mb-2 d-block"></i>Henüz fiyat teklifi yapılmamış.</div>';
    html += revisions.map(r => {
        const sym = CURRENCY_SYMBOLS[r.currency] || r.currency;
        const isCurrent = r.is_current;
        return `<div class="price-entry mb-3 ${isCurrent ? 'text-success fw-bold' : ''}">
            <div class="d-flex justify-content-between"><div>${sym} ${parseFloat(r.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} <span class="badge bg-light text-dark">${r.revision_type_display || REVISION_TYPE_MAP[r.revision_type] || ''}</span>${isCurrent ? ' <span class="badge bg-success">Güncel</span>' : ''}${r.counter_amount ? `<br><small class="text-warning">Karşı: ${CURRENCY_SYMBOLS[r.counter_currency] || ''} ${parseFloat(r.counter_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</small>` : ''}</div><div class="text-end small text-muted">${formatDateTime(r.created_at)}<br>${r.created_by_name || ''}</div></div>
            ${r.notes ? `<p class="small text-muted mb-0">${r.notes}</p>` : ''}
        </div>`;
    }).join('');
    return html;
}

function buildApprovalTab() {
    const s = offer.status;
    const hasRound = offer.approval_round > 0;
    const canSubmit = s === 'pricing' && offer.current_price;
    const canDecide = s === 'pending_approval';
    let html = '';
    if (canSubmit) html += `<button class="btn btn-sm btn-primary me-2 mb-2" id="submit-approval-btn"><i class="fas fa-gavel me-1"></i>Onaya Gönder</button>`;
    if (canDecide) html += `<button class="btn btn-sm btn-success me-2 mb-2" id="decide-btn"><i class="fas fa-check me-1"></i>Karar Ver</button>`;
    if (hasRound) html += `<button class="btn btn-sm btn-outline-info mb-2" id="refresh-approval-btn"><i class="fas fa-sync-alt me-1"></i>Onay Durumunu Yenile</button>`;
    html += `<div id="approval-workflow-content" class="mt-3">${hasRound ? '<div class="text-muted">Yükleniyor...</div>' : '<div class="text-muted">Henüz onay süreci başlatılmamış.</div>'}</div>`;
    return html;
}

function attachOfferModalListeners() {
    const container = viewOfferModal.container;
    if (!container) return;

    const refreshOffer = () => viewOffer(offerId);
    const refreshOfferAndList = async () => { await viewOffer(offerId); await loadOffers(); };

    container.querySelector('#edit-offer-btn')?.addEventListener('click', () => showEditModal(refreshOffer));
    container.querySelector('#add-items-btn')?.addEventListener('click', () => showAddItemsModal(refreshOffer));
    container.querySelector('#upload-file-btn')?.addEventListener('click', () => showFileUploadModal(refreshOffer));
    container.querySelector('#send-consultations-btn')?.addEventListener('click', () => showConsultationModal(refreshOffer));
    container.querySelector('#propose-price-btn')?.addEventListener('click', () => showPriceModal(refreshOffer));
    container.querySelector('#submit-approval-btn')?.addEventListener('click', () => showApprovalModal(refreshOffer));
    container.querySelector('#decide-btn')?.addEventListener('click', () => showDecisionModal(refreshOffer));
    container.querySelector('#refresh-approval-btn')?.addEventListener('click', () => loadApprovalStatus());
    container.querySelector('#submit-customer-btn')?.addEventListener('click', () => handleSubmitCustomer(refreshOfferAndList));
    container.querySelector('#convert-btn')?.addEventListener('click', () => handleConvert(refreshOfferAndList));
    container.querySelector('#mark-won-btn')?.addEventListener('click', () => handleStatusAction(markWon, 'Kazanıldı olarak işaretlendi', refreshOfferAndList));
    container.querySelector('#mark-lost-btn')?.addEventListener('click', () => handleStatusAction(markLost, 'Kaybedildi olarak işaretlendi', refreshOfferAndList));
    container.querySelector('#cancel-btn')?.addEventListener('click', () => handleStatusAction(cancelOffer, 'Teklif iptal edildi', refreshOfferAndList));

    container.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('Bu kalemi silmek istediğinize emin misiniz?')) return;
            try {
                await deleteOfferItem(offerId, btn.dataset.itemId);
                showNotification('Kalem silindi', 'success');
                await refreshOffer();
            } catch (e) { showNotification('Kalem silinirken hata oluştu', 'error'); }
        };
    });
    container.querySelectorAll('.delete-file-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;
            try {
                await deleteOfferFile(offerId, btn.dataset.fileId);
                showNotification('Dosya silindi', 'success');
                await refreshOffer();
            } catch (e) { showNotification('Dosya silinirken hata oluştu', 'error'); }
        };
    });
}

// ─── Sub-modals (edit, add items, file upload, etc.) ──────────────────

function showEditModal(onSuccess) {
    const modal = new EditModal('edit-offer-modal-container', { title: 'Teklifi Düzenle', icon: 'fas fa-edit', size: 'lg', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Teklif Bilgileri', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    modal.addField({ id: 'title', name: 'title', label: 'Başlık', type: 'text', value: offer.title || '', required: true, icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', value: offer.description || '', icon: 'fas fa-align-left', colSize: 12 });
    modal.addField({ id: 'customer_inquiry_ref', name: 'customer_inquiry_ref', label: 'Müşteri Referansı', type: 'text', value: offer.customer_inquiry_ref || '', icon: 'fas fa-hashtag', colSize: 6 });
    modal.addField({ id: 'delivery_date_requested', name: 'delivery_date_requested', label: 'Termin Tarihi', type: 'date', value: offer.delivery_date_requested || '', icon: 'fas fa-calendar-alt', colSize: 6 });
    modal.onSaveCallback(async (formData) => {
        try {
            await patchOffer(offerId, formData);
            modal.hide();
            showNotification('Teklif güncellendi', 'success');
            await onSuccess();
        } catch (e) { showNotification('Güncelleme hatası', 'error'); }
    });
    modal.render();
    modal.show();
}

async function showAddItemsModal(onSuccess) {
    if (templates.length === 0) {
        try {
            const data = await listOfferTemplates();
            templates = Array.isArray(data) ? data : (data.results || []);
        } catch (_) {}
    }
    const modal = new EditModal('add-items-modal-container', { title: 'Kalem Ekle', icon: 'fas fa-plus', size: 'xl', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Katalogdan Seçin', icon: 'fas fa-book', iconColor: 'text-primary' });
    modal.addField({ id: 'template_select', name: 'template_select', label: 'Ürün Kataloğu', type: 'dropdown', options: templates.map(t => ({ value: String(t.id), label: t.name })), icon: 'fas fa-book', colSize: 12 });
    modal.addSection({ title: 'Veya Özel Kalem', icon: 'fas fa-edit', iconColor: 'text-success' });
    modal.addField({ id: 'custom_title', name: 'custom_title', label: 'Özel Kalem Adı', type: 'text', placeholder: 'Ör: Special Conveyor', icon: 'fas fa-tag', colSize: 8 });
    modal.addField({ id: 'custom_quantity', name: 'custom_quantity', label: 'Adet', type: 'number', value: '1', icon: 'fas fa-sort-numeric-up', colSize: 4 });
    modal.onSaveCallback(async (formData) => {
        const items = [];
        if (formData.custom_title) items.push({ template_node: null, title_override: formData.custom_title, quantity: parseInt(formData.custom_quantity) || 1, sequence: (offer.items || []).length + 1 });
        const checked = document.querySelectorAll('#template-tree-container input[type="checkbox"]:checked');
        checked.forEach(cb => items.push({ template_node: parseInt(cb.value), quantity: 1, sequence: (offer.items || []).length + items.length + 1 }));
        if (items.length === 0) { showNotification('En az bir kalem seçin', 'warning'); return; }
        await addOfferItems(offerId, items);
        modal.hide();
        showNotification(`${items.length} kalem eklendi`, 'success');
        await onSuccess();
    });
    modal.render();
    modal.show();
    const body = document.querySelector('#add-items-modal-container .modal-body');
    if (body) {
        const treeDiv = document.createElement('div');
        treeDiv.id = 'template-tree-container';
        treeDiv.className = 'mt-3';
        body.querySelector('.card')?.appendChild(treeDiv);
    }
    document.getElementById('template_select')?.addEventListener('change', async function () {
        const tId = this.value;
        if (!tId) return;
        try {
            selectedTemplate = await getOfferTemplate(tId);
            const target = document.getElementById('template-tree-container');
            if (!target) return;
            target.innerHTML = '<p class="text-muted small mb-2">Eklemek istediğiniz kalemleri işaretleyin:</p>';
            (selectedTemplate.root_nodes || []).forEach(node => renderTreeNode(node, target));
        } catch (_) { showNotification('Katalog yüklenemedi', 'error'); }
    });
}

function renderTreeNode(node, parentEl) {
    const div = document.createElement('div');
    div.className = 'ms-2';
    div.innerHTML = `<div class="form-check"><input class="form-check-input" type="checkbox" value="${node.id}" id="node-${node.id}"><label class="form-check-label" for="node-${node.id}">${node.title}</label></div>`;
    parentEl.appendChild(div);
    (node.children || []).forEach(child => renderTreeNode(child, div));
}

function showFileUploadModal(onSuccess) {
    const modal = new EditModal('file-upload-modal-container', { title: 'Dosya Yükle', icon: 'fas fa-upload', size: 'md', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Dosya Bilgileri', icon: 'fas fa-file', iconColor: 'text-primary' });
    modal.addField({ id: 'file_type', name: 'file_type', label: 'Dosya Türü', type: 'dropdown', required: true, options: FILE_TYPE_OPTIONS, icon: 'fas fa-tag', colSize: 6 });
    modal.addField({ id: 'name', name: 'name', label: 'Dosya Adı', type: 'text', placeholder: 'Opsiyonel', icon: 'fas fa-heading', colSize: 6 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', icon: 'fas fa-align-left', colSize: 12 });
    modal.onSaveCallback(async (formData) => {
        const fileInput = document.getElementById('file-input-field');
        if (!fileInput?.files[0]) { showNotification('Lütfen dosya seçin', 'warning'); return; }
        await uploadOfferFile(offerId, fileInput.files[0], formData.file_type, formData.name, formData.description);
        modal.hide();
        showNotification('Dosya yüklendi', 'success');
        await onSuccess();
    });
    modal.render();
    const body = modal.container?.querySelector('.modal-body');
    if (body) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'mb-3 px-3';
        fileDiv.innerHTML = '<label class="form-label">Dosya</label><input type="file" class="form-control" id="file-input-field">';
        body.insertBefore(fileDiv, body.firstChild);
    }
    modal.show();
}

async function showConsultationModal(onSuccess) {
    if (users.length === 0) {
        try {
            const data = await authFetchUsers(1, 500);
            users = data.results || [];
        } catch (_) {}
    }
    const modal = new EditModal('consultation-modal-container', { title: 'Departman Görüşü Gönder', icon: 'fas fa-paper-plane', size: 'xl', showEditButton: false });
    modal.clearAll();
    const userOpts = users.map(u => ({ value: String(u.id), label: `${(u.first_name || '')} ${(u.last_name || '')}`.trim() || u.username }));
    DEPARTMENT_CHOICES.forEach(dept => {
        modal.addSection({ title: dept.label, icon: 'fas fa-building', iconColor: 'text-info' });
        modal.addField({ id: `dept_enabled_${dept.value}`, name: `dept_enabled_${dept.value}`, label: `${dept.label} departmanına gönder`, type: 'checkbox', value: false, icon: 'fas fa-check', colSize: 12 });
        modal.addField({ id: `dept_title_${dept.value}`, name: `dept_title_${dept.value}`, label: 'Görev Başlığı', type: 'text', placeholder: '', icon: 'fas fa-heading', colSize: 6 });
        modal.addField({ id: `dept_assigned_${dept.value}`, name: `dept_assigned_${dept.value}`, label: 'Atanan', type: 'dropdown', options: [{ value: '', label: 'Seçilmedi' }, ...userOpts], icon: 'fas fa-user', colSize: 6 });
        modal.addField({ id: `dept_notes_${dept.value}`, name: `dept_notes_${dept.value}`, label: 'Notlar', type: 'textarea', icon: 'fas fa-sticky-note', colSize: 8 });
        modal.addField({ id: `dept_deadline_${dept.value}`, name: `dept_deadline_${dept.value}`, label: 'Hedef Tarih', type: 'date', icon: 'fas fa-calendar', colSize: 4 });
    });
    modal.onSaveCallback(async (formData) => {
        const departments = [];
        DEPARTMENT_CHOICES.forEach(dept => {
            if (formData[`dept_enabled_${dept.value}`]) departments.push({
                department: dept.value,
                title: formData[`dept_title_${dept.value}`] || '',
                assigned_to: formData[`dept_assigned_${dept.value}`] ? parseInt(formData[`dept_assigned_${dept.value}`]) : null,
                notes: formData[`dept_notes_${dept.value}`] || '',
                deadline: formData[`dept_deadline_${dept.value}`] || null,
                file_ids: []
            });
        });
        if (departments.length === 0) { showNotification('En az bir departman seçin', 'warning'); return; }
        await sendConsultations(offerId, departments);
        modal.hide();
        showNotification('Departman görüşleri gönderildi', 'success');
        await onSuccess();
    });
    modal.render();
    modal.show();
}

function showPriceModal(onSuccess) {
    const modal = new EditModal('price-modal-container', { title: 'Fiyat Teklif Et', icon: 'fas fa-tag', size: 'md', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Fiyat Bilgisi', icon: 'fas fa-coins', iconColor: 'text-warning' });
    modal.addField({ id: 'amount', name: 'amount', label: 'Tutar', type: 'number', required: true, placeholder: '0.00', icon: 'fas fa-money-bill', colSize: 6 });
    modal.addField({ id: 'currency', name: 'currency', label: 'Para Birimi', type: 'dropdown', required: true, options: CURRENCY_OPTIONS, value: offer.current_price?.currency || 'EUR', icon: 'fas fa-coins', colSize: 6 });
    modal.addField({ id: 'notes', name: 'notes', label: 'Notlar', type: 'textarea', icon: 'fas fa-sticky-note', colSize: 12 });
    modal.onSaveCallback(async (formData) => {
        await proposePrice(offerId, formData);
        modal.hide();
        showNotification('Fiyat teklifi kaydedildi', 'success');
        await onSuccess();
    });
    modal.render();
    modal.show();
}

function showApprovalModal(onSuccess) {
    const modal = new EditModal('approval-modal-container', { title: 'Onaya Gönder', icon: 'fas fa-gavel', size: 'md', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Onay Politikası', icon: 'fas fa-shield-alt', iconColor: 'text-primary' });
    modal.addField({ id: 'policy', name: 'policy', label: 'Politika ID', type: 'number', required: true, placeholder: 'Onay politikası ID', icon: 'fas fa-id-badge', colSize: 12 });
    modal.onSaveCallback(async (formData) => {
        await submitApproval(offerId, parseInt(formData.policy));
        modal.hide();
        showNotification('Onaya gönderildi', 'success');
        await onSuccess();
    });
    modal.render();
    modal.show();
}

function showDecisionModal(onSuccess) {
    const modal = new EditModal('decision-modal-container', { title: 'Onay Kararı', icon: 'fas fa-check', size: 'md', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Karar', icon: 'fas fa-balance-scale', iconColor: 'text-primary' });
    modal.addField({ id: 'approve', name: 'approve', label: 'Onayla', type: 'checkbox', value: true, icon: 'fas fa-check', colSize: 12 });
    modal.addField({ id: 'comment', name: 'comment', label: 'Yorum', type: 'textarea', icon: 'fas fa-comment', colSize: 12 });
    modal.addSection({ title: 'Karşı Teklif (Ret)', icon: 'fas fa-exchange-alt', iconColor: 'text-warning' });
    modal.addField({ id: 'counter_amount', name: 'counter_amount', label: 'Karşı Tutar', type: 'number', icon: 'fas fa-money-bill', colSize: 6 });
    modal.addField({ id: 'counter_currency', name: 'counter_currency', label: 'Para Birimi', type: 'dropdown', options: [{ value: '', label: 'Seçilmedi' }, ...CURRENCY_OPTIONS], icon: 'fas fa-coins', colSize: 6 });
    modal.onSaveCallback(async (formData) => {
        const payload = { approve: !!formData.approve, comment: formData.comment || '' };
        if (!formData.approve && formData.counter_amount) { payload.counter_amount = formData.counter_amount; payload.counter_currency = formData.counter_currency || 'EUR'; }
        await recordDecision(offerId, payload);
        modal.hide();
        showNotification('Karar kaydedildi', 'success');
        await onSuccess();
    });
    modal.render();
    modal.show();
}

async function handleSubmitCustomer(onSuccess) {
    if (!confirm('Teklifi müşteriye göndermek istediğinize emin misiniz?')) return;
    await submitToCustomer(offerId);
    showNotification('Müşteriye gönderildi', 'success');
    await onSuccess();
}

async function handleConvert(onSuccess) {
    if (!confirm('Teklifi iş emrine dönüştürmek istediğinize emin misiniz?')) return;
    const result = await convertToJobOrder(offerId);
    showNotification(`İş emrine dönüştürüldü: ${result.job_no}`, 'success');
    await onSuccess();
}

async function handleStatusAction(action, successMessage, onSuccess) {
    if (!confirm('Bu işlemi gerçekleştirmek istediğinize emin misiniz?')) return;
    await action(offerId);
    showNotification(successMessage, 'success');
    await onSuccess();
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function getTaskStatusBadge(status) {
    const map = { pending: 'secondary', in_progress: 'primary', completed: 'success', cancelled: 'danger' };
    const c = map[status] || 'light';
    return `<span class="badge bg-${c}">${status === 'pending' ? 'Bekliyor' : status === 'in_progress' ? 'Devam Ediyor' : status === 'completed' ? 'Tamamlandı' : status === 'cancelled' ? 'İptal' : status}</span>`;
}

function parseError(error, fallback) {
    try {
        if (error.message) {
            const data = JSON.parse(error.message);
            if (typeof data === 'object') { const msgs = Object.values(data).flat(); return msgs.join(', ') || fallback; }
        }
    } catch (_) {}
    return error.message || fallback;
}

// ─── Load offers & create modal ──────────────────────────────────────

async function loadOffers() {
    if (isLoading) return;
    isLoading = true;
    if (offersTable) offersTable.setLoading(true);

    try {
        const fv = offersFilters ? offersFilters.getFilterValues() : {};
        const ordering = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        const opts = { page: currentPage, ordering };
        if (fv['search-filter']) opts.search = fv['search-filter'];
        if (fv['status-filter']) opts.status = fv['status-filter'];
        if (fv['customer-filter']) opts.customer = fv['customer-filter'];

        const data = await listOffers(opts);
        offers = data.results || [];
        totalOffers = data.count || 0;

        if (offersTable) offersTable.updateData(offers, totalOffers, currentPage);
        updateStats();
    } catch (error) {
        console.error('Error loading offers:', error);
        showNotification('Teklifler yüklenirken hata oluştu', 'error');
        offers = [];
        totalOffers = 0;
        if (offersTable) offersTable.updateData([], 0, currentPage);
    } finally {
        isLoading = false;
        if (offersTable) offersTable.setLoading(false);
    }
}

function updateStats() {
    if (!offersStats) return;
    const draft = offers.filter(o => o.status === 'draft').length;
    const active = offers.filter(o => ['consultation', 'pricing', 'pending_approval', 'approved', 'submitted_customer'].includes(o.status)).length;
    const won = offers.filter(o => o.status === 'won').length;
    offersStats.updateValues({
        0: totalOffers.toString(),
        1: draft.toString(),
        2: active.toString(),
        3: won.toString()
    });
}

function showCreateOfferModal() {
    createOfferModal.clearAll();
    createOfferModal.addSection({ title: 'Teklif Bilgileri', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    createOfferModal.addField({ id: 'customer', name: 'customer', label: 'Müşteri', type: 'dropdown', required: true, icon: 'fas fa-building', colSize: 6, options: customerOptions });
    createOfferModal.addField({ id: 'title', name: 'title', label: 'Teklif Başlığı', type: 'text', required: true, placeholder: 'Ör: Meltshop Equipment for ABC Steel', icon: 'fas fa-heading', colSize: 6 });
    createOfferModal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', placeholder: 'Teklif kapsamı...', icon: 'fas fa-align-left', colSize: 12 });
    createOfferModal.addSection({ title: 'Ek Bilgiler', icon: 'fas fa-calendar', iconColor: 'text-success' });
    createOfferModal.addField({ id: 'customer_inquiry_ref', name: 'customer_inquiry_ref', label: 'Müşteri Referansı', type: 'text', placeholder: 'Ör: ABC-RFQ-2026-003', icon: 'fas fa-hashtag', colSize: 6 });
    createOfferModal.addField({ id: 'delivery_date_requested', name: 'delivery_date_requested', label: 'İstenen Termin Tarihi', type: 'date', icon: 'fas fa-calendar-alt', colSize: 6 });
    createOfferModal.render();
    createOfferModal.show();
}
