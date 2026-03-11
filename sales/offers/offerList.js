import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
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
    getConsultations,
    getOfferConsultationTask,
    patchOfferConsultationTask,
    getOfferItems,
    listOfferFiles,
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
import { listOfferTemplates, getOfferTemplate, getOfferTemplateNodes, getOfferTemplateNodeChildren } from '../../apis/sales/offerTemplates.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { authFetchUsers } from '../../apis/users.js';
import { FileViewer } from '../../components/file-viewer/file-viewer.js';

const CLOSED_STATUSES = ['cancelled']; // Only cancelled status prevents editing
const EDITABLE_STATUSES = ['draft', 'consultation', 'pricing'];

// INCOTERMS options
const INCOTERMS_OPTIONS = [
    { value: '', label: 'Seçiniz' },
    { value: 'EXW', label: 'EXW - Ex Works' },
    { value: 'FCA', label: 'FCA - Free Carrier' },
    { value: 'CPT', label: 'CPT - Carriage Paid To' },
    { value: 'CIP', label: 'CIP - Carriage and Insurance Paid To' },
    { value: 'DAP', label: 'DAP - Delivered At Place' },
    { value: 'DPU', label: 'DPU - Delivered at Place Unloaded' },
    { value: 'DDP', label: 'DDP - Delivered Duty Paid' },
    { value: 'FAS', label: 'FAS - Free Alongside Ship' },
    { value: 'FOB', label: 'FOB - Free On Board' },
    { value: 'CFR', label: 'CFR - Cost and Freight' },
    { value: 'CIF', label: 'CIF - Cost, Insurance and Freight' }
];

// Map Bootstrap color names to components/badges CSS classes
const BADGE_CLASS_MAP = {
    secondary: 'status-grey',
    info: 'status-blue',
    warning: 'status-yellow',
    primary: 'status-blue',
    success: 'status-green',
    dark: 'status-grey',
    danger: 'status-red'
};

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
let approvalConfirmModal = null;
let submitCustomerConfirmModal = null;
let actionConfirmModal = null;
let customerOptions = [];
let offer = null;
let offerId = null;
/** Per-tab loaded state: only one request per tab while modal is open */
let offerTabLoaded = { items: false, files: false, consultations: false, pricing: false, approval: false };
let templates = [];
const refreshList = async () => { await loadOffers(); };
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

    // Customer: remote search via /projects/customers/?search=...&is_active=true (same behavior as cost-table)
    offersFilters.addDropdownFilter({
        id: 'customer-filter',
        label: 'Müşteri',
        options: [],
        placeholder: 'Müşteri ara (en az 3 karakter)',
        colSize: 3,
        searchable: true,
        minSearchLength: 3,
        remoteSearchPlaceholder: 'En az 3 karakter yazın',
        remoteSearch: async (term) => {
            if (!term || term.length < 3) return [];
            const res = await listCustomers({ search: term.trim(), is_active: true, page_size: 50 });
            const list = res.results || [];
            return list.map(c => ({ value: String(c.id), text: c.name || c.code || `#${c.id}` }));
        }
    });
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
                field: 'status_display',
                label: 'Durum',
                sortable: true,
                formatter: (v, row) => {
                    // Prefer backend-provided status_display when available
                    const display = v || row.status_display;
                    if (display) {
                        const color = OFFER_STATUS_COLORS[row.status] || 'secondary';
                        const badgeClass = BADGE_CLASS_MAP[color] || 'status-grey';
                        return `<span class="status-badge ${badgeClass}">${display}</span>`;
                    }
                    // Fallback to local mapping by status code
                    const label = OFFER_STATUS_MAP[row.status] || row.status;
                    const color = OFFER_STATUS_COLORS[row.status] || 'secondary';
                    const badgeClass = BADGE_CLASS_MAP[color] || 'status-grey';
                    return `<span class="status-badge ${badgeClass}">${label}</span>`;
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
                title: 'Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewOffer(row.id)
            },
            {
                key: 'submit_approval',
                label: 'Onaya Gönder',
                title: 'Onaya gönder (fiyat gerekli)',
                icon: 'fas fa-gavel',
                class: 'btn-outline-primary',
                visible: (row) => row.status === 'pricing' && row.total_price && parseFloat(row.total_price) > 0,
                onClick: async (row) => {
                    offerId = row.id;
                    showSubmitApprovalConfirm(refreshList);
                }
            },
            {
                key: 'record_decision',
                label: 'Karar Ver',
                title: 'Onay kararı ver',
                icon: 'fas fa-check-double',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'pending_approval',
                onClick: async (row) => {
                    offerId = row.id;
                    offer = await getOffer(row.id);
                    showDecisionModal(refreshList);
                }
            },
            {
                key: 'submit_to_customer',
                label: 'Müşteriye Gönder',
                title: 'Müşteriye gönder',
                icon: 'fas fa-paper-plane',
                class: 'btn-dark',
                visible: (row) => row.status === 'approved',
                onClick: (row) => {
                    offerId = row.id;
                    showSubmitCustomerConfirm(refreshList);
                }
            },
            {
                key: 'mark_won',
                label: 'Kazanıldı',
                title: 'Kazanıldı olarak işaretle',
                icon: 'fas fa-trophy',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'submitted_customer',
                onClick: (row) => {
                    offerId = row.id;
                    showActionConfirm({
                        message: 'Teklifi kazanıldı olarak işaretlemek istediğinize emin misiniz?',
                        onConfirm: async () => {
                            try {
                                await markWon(offerId);
                                showNotification('Kazanıldı olarak işaretlendi', 'success');
                                await loadOffers();
                            } catch (e) {
                                showNotification(parseError(e, 'İşlem hatası'), 'error');
                            }
                        }
                    });
                }
            },
            {
                key: 'mark_lost',
                label: 'Kaybedildi',
                title: 'Kaybedildi olarak işaretle',
                icon: 'fas fa-thumbs-down',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'submitted_customer',
                onClick: (row) => {
                    offerId = row.id;
                    showActionConfirm({
                        message: 'Teklifi kaybedildi olarak işaretlemek istediğinize emin misiniz?',
                        onConfirm: async () => {
                            try {
                                await markLost(offerId);
                                showNotification('Kaybedildi olarak işaretlendi', 'success');
                                await loadOffers();
                            } catch (e) {
                                showNotification(parseError(e, 'İşlem hatası'), 'error');
                            }
                        }
                    });
                }
            },
            {
                key: 'convert',
                label: 'İş Emrine Dönüştür',
                title: 'İş emrine dönüştür',
                icon: 'fas fa-exchange-alt',
                class: 'btn-success',
                visible: (row) => row.status === 'won',
                onClick: (row) => {
                    offerId = row.id;
                    showActionConfirm({
                        message: 'Teklifi iş emrine dönüştürmek istediğinize emin misiniz?',
                        onConfirm: async () => {
                            try {
                                const result = await convertToJobOrder(offerId);
                                showNotification(`İş emrine dönüştürüldü: ${result.job_no}`, 'success');
                                await loadOffers();
                            } catch (e) {
                                showNotification(parseError(e, 'Dönüşüm hatası'), 'error');
                            }
                        }
                    });
                }
            },
            {
                key: 'cancel',
                label: 'İptal',
                title: 'Teklifi iptal et',
                icon: 'fas fa-ban',
                class: 'btn-outline-dark',
                visible: (row) => !['won', 'cancelled'].includes(row.status),
                onClick: (row) => {
                    offerId = row.id;
                    showActionConfirm({
                        message: 'Teklifi iptal etmek istediğinize emin misiniz?',
                        onConfirm: async () => {
                            try {
                                await cancelOffer(offerId);
                                showNotification('Teklif iptal edildi', 'success');
                                await loadOffers();
                            } catch (e) {
                                showNotification(parseError(e, 'İptal hatası'), 'error');
                            }
                        }
                    });
                }
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

    approvalConfirmModal = new ConfirmationModal('approval-confirm-modal-container', {
        title: 'Onaya Gönder',
        icon: 'fas fa-gavel',
        message: 'Teklifi onaya göndermek istediğinize emin misiniz?',
        confirmText: 'Gönder',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    submitCustomerConfirmModal = new ConfirmationModal('submit-customer-confirm-modal-container', {
        title: 'Müşteriye Gönder',
        icon: 'fas fa-paper-plane',
        message: 'Teklifi müşteriye göndermek istediğinize emin misiniz?',
        confirmText: 'Gönder',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    actionConfirmModal = new ConfirmationModal('action-confirm-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        message: 'Bu işlemi yapmak istediğinize emin misiniz?',
        confirmText: 'Evet',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    // Single delegation for tab-specific footer buttons (offer/offerId set when modal is opened)
    const footer = viewOfferModal.container?.querySelector('.modal-footer');
    if (footer) {
        footer.addEventListener('click', async (e) => {
            if (!offerId || !offer) return;
            const refreshOffer = () => viewOffer(offerId);
            if (e.target.closest('#edit-offer-btn')) { showEditModal(refreshOffer); return; }
            if (e.target.closest('#add-items-btn')) { showAddItemsModal(refreshOffer); return; }
            if (e.target.closest('#upload-file-btn')) { showFileUploadModal(refreshOffer); return; }
            if (e.target.closest('#send-consultations-btn')) { showConsultationModal(refreshOffer); return; }
            if (e.target.closest('#save-prices-btn')) { await saveAllPrices(); await refreshOffer(); return; }
            if (e.target.closest('#submit-approval-from-pricing-btn')) { showSubmitApprovalConfirm(refreshOffer); return; }
            if (e.target.closest('#submit-approval-btn')) { showSubmitApprovalConfirm(refreshOffer); return; }
            if (e.target.closest('#decide-btn')) { showDecisionModal(refreshOffer); return; }
            if (e.target.closest('#refresh-approval-btn')) { loadApprovalStatus(); return; }
        });
    }
}

// ─── View Offer Modal (tabs like project-tracking) ─────────────────────

const TAB_LOADING_HTML = '<div class="offer-tab-content"><div class="text-muted py-4 text-center"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div></div>';

window.viewOffer = async function (id) {
    try {
        offer = await getOffer(id);
        offerId = offer.id;
        offerTabLoaded = { items: false, files: false, consultations: false, pricing: false, approval: false };
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
            customContent: TAB_LOADING_HTML
        });

        viewOfferModal.addTab({
            id: 'dosyalar',
            label: 'Dosyalar',
            icon: 'fas fa-paperclip',
            iconColor: 'text-primary',
            customContent: TAB_LOADING_HTML
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
            customContent: TAB_LOADING_HTML
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

async function loadTabDataIfNeeded(tabId) {
    if (!offerId || !offer) return;
    const pane = viewOfferModal?.container?.querySelector(`#tab-${tabId}-pane`);
    if (!pane) return;

    if (tabId === 'genel') return;

    if (tabId === 'kalemler' && !offerTabLoaded.items) {
        try {
            const data = await getOfferItems(offerId);
            offer.items = Array.isArray(data) ? data : (data.results || []);
            offerTabLoaded.items = true;
            pane.innerHTML = `<div class="offer-tab-content">${buildItemsTab()}</div>`;
            renderOfferItemsTable();
        } catch (e) {
            pane.innerHTML = `<div class="offer-tab-content"><div class="text-danger text-center py-4">Kalemler yüklenemedi.</div></div>`;
        }
        return;
    }

    if (tabId === 'dosyalar' && !offerTabLoaded.files) {
        try {
            const data = await listOfferFiles(offerId);
            offer.files = Array.isArray(data) ? data : (data.results || []);
            offerTabLoaded.files = true;
            pane.innerHTML = `<div class="offer-tab-content">${buildFilesTab()}</div>`;
        } catch (e) {
            pane.innerHTML = `<div class="offer-tab-content"><div class="text-danger text-center py-4">Dosyalar yüklenemedi.</div></div>`;
        }
        return;
    }

    if (tabId === 'consultations' && !offerTabLoaded.consultations) {
        try {
            const data = await getConsultations(offerId);
            offer.consultations = Array.isArray(data) ? data : (data.results || data);
            offerTabLoaded.consultations = true;
            pane.innerHTML = `<div class="offer-tab-content">${buildConsultationsTab()}</div>`;
            renderConsultationsTable();
        } catch (e) {
            pane.innerHTML = `<div class="offer-tab-content"><div class="text-danger text-center py-4">Departman görüşleri yüklenemedi.</div></div>`;
        }
        return;
    }

    if (tabId === 'pricing' && !offerTabLoaded.pricing) {
        try {
            const [priceHistoryData, itemsData] = await Promise.all([
                getPriceHistory(offerId),
                getOfferItems(offerId)
            ]);
            offer.price_revisions = Array.isArray(priceHistoryData) ? priceHistoryData : (priceHistoryData.results || []);
            offer.items = Array.isArray(itemsData) ? itemsData : (itemsData.results || []);
            offerTabLoaded.pricing = true;
            pane.innerHTML = `<div class="offer-tab-content">${buildPricingTab()}</div>`;
            attachPricingTabListeners();
        } catch (e) {
            pane.innerHTML = `<div class="offer-tab-content"><div class="text-danger text-center py-4">Fiyatlandırma verileri yüklenemedi.</div></div>`;
        }
        return;
    }

    if (tabId === 'approval' && !offerTabLoaded.approval) {
        offerTabLoaded.approval = true;
        if (offer.approval_round > 0) loadApprovalStatus();
    }
}

function setupApprovalTabHandler() {
    const modal = viewOfferModal.modal;
    if (!modal) return;
    const tabButtons = modal.querySelectorAll('[data-bs-toggle="tab"]');
    tabButtons.forEach(btn => {
        btn.addEventListener('shown.bs.tab', (e) => {
            const target = e.target.getAttribute('data-bs-target');
            if (!target) return;
            const match = target.match(/#tab-(.+)-pane/);
            const tabId = match ? match[1] : 'genel';
            updateOfferModalFooter(tabId);
            loadTabDataIfNeeded(tabId);
        });
    });
}

async function loadApprovalStatus() {
    const container = document.getElementById('approval-workflow-content');
    if (!container) return;
    try {
        const workflow = await getApprovalStatus(offerId);
        if (!workflow || !workflow.stage_instances) {
            container.innerHTML = '<div class="text-muted">Aktif onay süreci bulunamadı.</div>';
            return;
        }
        container.innerHTML = renderApprovalWorkflow(workflow);
    } catch (e) {
        container.innerHTML = '<div class="text-danger">Onay durumu yüklenemedi.</div>';
    }
}

function renderApprovalWorkflow(approval) {
    if (!approval || !approval.stage_instances || !approval.stage_instances.length) {
        return '<p class="text-muted">Onay bilgisi bulunamadı.</p>';
    }
    const { stage_instances, current_stage_order, is_complete, is_rejected } = approval;

    let html = '<div class="approval-workflow">';

    // Section title (matches procurement detail modal)
    html += `<h6 class="mb-3 d-flex align-items-center">
        <i class="fas fa-clipboard-check me-2 text-success"></i>Onay Süreci
    </h6>`;

    stage_instances.forEach((stage) => {
        const isCurrentStage = stage.order === current_stage_order && !is_complete && !is_rejected;
        const isCompleted = stage.is_complete;
        const isRejected = stage.is_rejected;
        const isPending = !isCompleted && !isRejected && !isCurrentStage && stage.order > current_stage_order;

        let stageClass = 'border-secondary';
        let stageBadge = '';
        let stageIcon = 'fas fa-circle';

        if (isRejected) {
            stageClass = 'border-danger';
            stageBadge = '<span class="badge bg-danger">Reddedildi</span>';
            stageIcon = 'fas fa-times-circle text-danger';
        } else if (isCompleted) {
            stageClass = 'border-success';
            stageBadge = '<span class="badge bg-success">Tamamlandı</span>';
            stageIcon = 'fas fa-check-circle text-success';
        } else if (isCurrentStage) {
            stageClass = 'border-warning';
            stageBadge = '<span class="badge bg-warning text-dark">Mevcut Aşama</span>';
            stageIcon = 'fas fa-hourglass-half text-warning';
        } else if (isPending) {
            stageClass = 'border-secondary';
            stageBadge = '<span class="badge bg-secondary">Beklemede</span>';
            stageIcon = 'fas fa-circle text-secondary';
        }

        html += `
            <div class="card mb-3 ${stageClass}" style="border-width: 2px;">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">
                            <i class="${stageIcon} me-2"></i>
                            ${stage.order}. ${stage.name}
                        </h6>
                        ${stageBadge}
                    </div>
                    <div class="row mb-2">
                        <div class="col-md-6">
                            <small class="text-muted">Gerekli Onay Sayısı:</small>
                            <strong class="ms-2">${stage.required_approvals ?? 0}</strong>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted">Onaylanan:</small>
                            <strong class="ms-2 ${(stage.approved_count ?? 0) >= (stage.required_approvals ?? 0) ? 'text-success' : 'text-warning'}">${stage.approved_count ?? 0}</strong>
                        </div>
                    </div>
                    <div class="mb-2">
                        <small class="text-muted d-block mb-1">Onaylayıcılar:</small>
                        <div class="d-flex flex-wrap gap-1">
        `;

        if (stage.approvers && stage.approvers.length > 0) {
            stage.approvers.forEach((approver) => {
                const decision = stage.decisions?.find(d => d.approver === approver.id);
                let approverBadge = 'bg-light text-dark';
                let approverIcon = 'fas fa-user';
                if (decision) {
                    if (decision.decision === 'approve') {
                        approverBadge = 'bg-success text-white';
                        approverIcon = 'fas fa-check';
                    } else if (decision.decision === 'reject') {
                        approverBadge = 'bg-danger text-white';
                        approverIcon = 'fas fa-times';
                    }
                }
                const name = approver.full_name || [approver.first_name, approver.last_name].filter(Boolean).join(' ') || approver.username;
                html += `<span class="badge ${approverBadge}" style="font-size: 0.85rem;"><i class="${approverIcon} me-1"></i>${name}</span>`;
            });
        } else {
            html += '<span class="text-muted">Onaylayıcı atanmamış</span>';
        }

        html += `</div></div>`;

        if (stage.decisions && stage.decisions.length > 0) {
            html += `<div class="mt-3"><small class="text-muted d-block mb-2"><strong>Kararlar:</strong></small>`;
            stage.decisions.forEach((decision) => {
                const decisionIcon = decision.decision === 'approve' ? 'fas fa-check-circle text-success' : 'fas fa-times-circle text-danger';
                const decisionText = decision.decision === 'approve' ? 'Onayladı' : 'Reddetti';
                const detail = decision.approver_detail || {};
                const approverName = detail.full_name || [detail.first_name, detail.last_name].filter(Boolean).join(' ') || detail.username || 'Bilinmeyen';
                const decisionDate = decision.decided_at ? formatDateTime(decision.decided_at) : '-';
                html += `
                    <div class="card mb-2" style="background-color: #f8f9fa;">
                        <div class="card-body p-2">
                            <div class="d-flex align-items-center flex-wrap mb-1">
                                <i class="${decisionIcon} me-2"></i>
                                <strong>${approverName}</strong>
                                <span class="ms-2 text-muted" style="font-size: 0.85rem;">${decisionText}</span>
                                <small class="ms-auto text-muted">${decisionDate}</small>
                            </div>`;
                if (decision.comment) {
                    html += `<div class="mt-1"><small class="text-muted">Yorum:</small><p class="mb-0" style="font-size: 0.9rem;">${decision.comment}</p></div>`;
                }
                html += `</div></div>`;
            });
            html += `</div>`;
        }

        html += `</div></div>`;
    });

    html += '</div>';
    return html;
}

// Genel tab: structured data + edit & outcome actions only
function buildGenelTab(statusLabel, statusColor) {
    const totalPrice = offer.total_price ? parseFloat(offer.total_price) : 0;
    const totalWeight = offer.total_weight_kg ? parseFloat(offer.total_weight_kg) : 0;
    const priceText = totalPrice > 0 
        ? `€ ${totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
        : '-';

    let html = `
        <div style="padding: 20px;">
            <!-- Genel Bilgiler Section -->
            <div class="mb-4">
                <h6 class="mb-3 d-flex align-items-center text-primary" style="font-weight: 600; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">
                    <i class="fas fa-info-circle me-2"></i>
                    Genel Bilgiler
                </h6>
                <div class="field-list">
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-barcode me-1"></i>Teklif No
                        </div>
                        <div class="field-value fw-medium flex-grow-1">${offer.offer_no || '-'}</div>
                    </div>
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-tasks me-1"></i>Durum
                        </div>
                        <div class="field-value flex-grow-1"><span class="status-badge ${BADGE_CLASS_MAP[statusColor] || 'status-grey'}">${statusLabel}</span></div>
                    </div>
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-heading me-1"></i>Başlık
                        </div>
                        <div class="field-value flex-grow-1">${offer.title || '-'}</div>
                    </div>
                    ${offer.description ? `
                    <div class="field-row d-flex align-items-start py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-align-left me-1"></i>Açıklama
                        </div>
                        <div class="field-value flex-grow-1">${offer.description}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Müşteri Bilgileri Section -->
            <div class="mb-4">
                <h6 class="mb-3 d-flex align-items-center text-primary" style="font-weight: 600; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">
                    <i class="fas fa-building me-2"></i>
                    Müşteri Bilgileri
                </h6>
                <div class="field-list">
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-building me-1"></i>Müşteri
                        </div>
                        <div class="field-value flex-grow-1">${offer.customer_name || '-'}${offer.customer_code ? ` <span class="text-muted">(${offer.customer_code})</span>` : ''}</div>
                    </div>
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-hashtag me-1"></i>Müşteri Referansı
                        </div>
                        <div class="field-value flex-grow-1">${offer.customer_inquiry_ref || '-'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Teklif Detayları Section -->
            <div class="mb-4">
                <h6 class="mb-3 d-flex align-items-center text-primary" style="font-weight: 600; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">
                    <i class="fas fa-clipboard-list me-2"></i>
                    Teklif Detayları
                </h6>
                <div class="field-list">
                    ${offer.incoterms ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-shipping-fast me-1"></i>Incoterms
                        </div>
                        <div class="field-value flex-grow-1">${offer.incoterms}</div>
                    </div>
                    ` : ''}
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-calendar-alt me-1"></i>İstenen Termin Tarihi
                        </div>
                        <div class="field-value flex-grow-1">${offer.delivery_date_requested ? formatDate(offer.delivery_date_requested) : '-'}</div>
                    </div>
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-calendar-check me-1"></i>Teklif Sunumu için Son Tarih
                        </div>
                        <div class="field-value flex-grow-1">${offer.offer_expiry_date ? formatDate(offer.offer_expiry_date) : '-'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Fiyat ve Ağırlık Bilgileri Section -->
            <div class="mb-4">
                <h6 class="mb-3 d-flex align-items-center text-primary" style="font-weight: 600; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">
                    <i class="fas fa-money-bill-wave me-2"></i>
                    Fiyat ve Ağırlık Bilgileri
                </h6>
                <div class="field-list">
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-money-bill-wave me-1"></i>Toplam Fiyat
                        </div>
                        <div class="field-value fw-bold text-primary flex-grow-1">${priceText}</div>
                    </div>
                    ${totalWeight > 0 ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-weight me-1"></i>Toplam Ağırlık
                        </div>
                        <div class="field-value flex-grow-1">${totalWeight.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} kg</div>
                    </div>
                    ` : ''}
                    ${offer.approval_round > 0 ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-sync-alt me-1"></i>Onay Turu
                        </div>
                        <div class="field-value flex-grow-1">${offer.approval_round}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Sistem Bilgileri Section -->
            <div class="mb-4">
                <h6 class="mb-3 d-flex align-items-center text-secondary" style="font-weight: 600; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">
                    <i class="fas fa-info-circle me-2"></i>
                    Sistem Bilgileri
                </h6>
                <div class="field-list">
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-user me-1"></i>Oluşturan
                        </div>
                        <div class="field-value flex-grow-1">${offer.created_by_name || '-'}</div>
                    </div>
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-calendar-plus me-1"></i>Oluşturulma Tarihi
                        </div>
                        <div class="field-value flex-grow-1">${formatDateTime(offer.created_at)}</div>
                    </div>
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-calendar-edit me-1"></i>Güncellenme Tarihi
                        </div>
                        <div class="field-value flex-grow-1">${formatDateTime(offer.updated_at)}</div>
                    </div>
                    ${offer.submitted_to_customer_at ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-paper-plane me-1"></i>Müşteriye Gönderilme
                        </div>
                        <div class="field-value flex-grow-1">${formatDateTime(offer.submitted_to_customer_at)}</div>
                    </div>
                    ` : ''}
                    ${offer.won_at ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-trophy me-1"></i>Kazanılma
                        </div>
                        <div class="field-value flex-grow-1">${formatDateTime(offer.won_at)}</div>
                    </div>
                    ` : ''}
                    ${offer.lost_at ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-times-circle me-1"></i>Kaybedilme
                        </div>
                        <div class="field-value flex-grow-1">${formatDateTime(offer.lost_at)}</div>
                    </div>
                    ` : ''}
                    ${offer.cancelled_at ? `
                    <div class="field-row d-flex align-items-center py-2 border-bottom">
                        <div class="field-label small text-muted" style="min-width: 180px; flex-shrink: 0;">
                            <i class="fas fa-ban me-1"></i>İptal
                        </div>
                        <div class="field-value flex-grow-1">${formatDateTime(offer.cancelled_at)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    return html;
}

let offerItemsTableInstance = null;
let offerItemsExpanded = new Set();
let offerItemsRoots = [];
let offerItemsChildrenCache = new Map();

function getOfferItemsForTable(items) {
    const roots = [];
    const childrenByParent = new Map();
    function walk(nodes, parentId) {
        (nodes || []).forEach((node) => {
            const item = {
                id: node.id,
                title: node.resolved_title || node.title_override || '-',
                quantity: node.quantity ?? 1,
                notes: node.notes || '',
                has_children: !!(node.children && node.children.length > 0),
                children: node.children
            };
            if (parentId == null) {
                roots.push(item);
            } else {
                if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
                childrenByParent.get(parentId).push(item);
            }
            if (item.children && item.children.length) walk(item.children, node.id);
        });
    }
    walk(items, null);
    return { roots, childrenByParent };
}

function mergeExpandedOfferItems(roots, level = 0) {
    const merged = [];
    if (!Array.isArray(roots)) return merged;
    roots.forEach((row) => {
        const node = { ...row, hierarchy_level: level };
        merged.push(node);
        if (offerItemsExpanded.has(row.id)) {
            const children = offerItemsChildrenCache.get(row.id) || [];
            merged.push(...mergeExpandedOfferItems(children, level + 1));
        }
    });
    return merged;
}

function updateOfferItemsTableData() {
    if (!offerItemsTableInstance) return;
    const displayData = mergeExpandedOfferItems(offerItemsRoots);
    offerItemsTableInstance.updateData(displayData);
    setTimeout(() => setupOfferItemsExpandListeners(), 50);
}

let offerItemsExpandHandler = null;
function setupOfferItemsExpandListeners() {
    if (!offerItemsTableInstance?.container) return;
    if (offerItemsExpandHandler) {
        offerItemsTableInstance.container.removeEventListener('click', offerItemsExpandHandler);
    }
    offerItemsExpandHandler = (e) => {
        const btn = e.target.closest('.offer-item-expand-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const itemId = btn.getAttribute('data-item-id');
        if (!itemId) return;
        const id = parseInt(itemId, 10);
        if (offerItemsExpanded.has(id)) {
            offerItemsExpanded.delete(id);
        } else {
            const row = offerItemsRoots.find(r => r.id === id) || [...offerItemsChildrenCache.values()].flat().find(r => r.id === id);
            if (row?.children?.length) {
                offerItemsChildrenCache.set(id, row.children);
                offerItemsExpanded.add(id);
            }
        }
        updateOfferItemsTableData();
    };
    offerItemsTableInstance.container.addEventListener('click', offerItemsExpandHandler);
}

function buildItemsTab() {
    return '<div id="offer-items-table-container"></div>';
}

function renderOfferItemsTable() {
    const container = document.getElementById('offer-items-table-container');
    if (!container) return;
    const items = offer.items || [];
    const { roots, childrenByParent } = getOfferItemsForTable(items);
    offerItemsRoots = roots;
    offerItemsChildrenCache.clear();
    roots.forEach(r => {
        if (r.children?.length) offerItemsChildrenCache.set(r.id, r.children);
    });
    offerItemsExpanded.clear();
    const displayData = mergeExpandedOfferItems(offerItemsRoots);
    const editable = !CLOSED_STATUSES.includes(offer?.status || '');
    const LEVEL_WIDTH = 20;
    const LINE_THICKNESS = 2;
    const LINE_COLOR = '#cbd5e0';
    const BUTTON_SIZE = 24;
    offerItemsTableInstance = new TableComponent('offer-items-table-container', {
        title: 'Kalemler',
        icon: 'fas fa-list',
        iconColor: 'text-primary',
        columns: [
            {
                field: '_expand',
                label: '',
                sortable: false,
                width: '56px',
                formatter: (value, row) => {
                    const hasChildren = row.has_children === true || (offerItemsChildrenCache.get(row.id) || []).length > 0;
                    const isExpanded = offerItemsExpanded.has(row.id);
                    const level = row.hierarchy_level ?? 0;
                    const buttonLeft = level * LEVEL_WIDTH;
                    let treeLinesHtml = '';
                    if (level > 0) {
                        for (let i = 0; i < level; i++) {
                            const isLast = i === level - 1;
                            const lineLeft = i * LEVEL_WIDTH + (LEVEL_WIDTH / 2) - (LINE_THICKNESS / 2);
                            if (!isLast) {
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;bottom:0;width:${LINE_THICKNESS}px;background:${LINE_COLOR};"></div>`;
                            } else {
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;height:50%;width:${LINE_THICKNESS}px;background:${LINE_COLOR};"></div>`;
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:50%;width:${LEVEL_WIDTH/2}px;height:${LINE_THICKNESS}px;background:${LINE_COLOR};transform:translateY(-50%);"></div>`;
                            }
                        }
                    }
                    let expandBtn = '';
                    if (hasChildren) {
                        const icon = isExpanded ? 'fa-minus' : 'fa-plus';
                        expandBtn = `<button type="button" class="btn btn-sm offer-item-expand-btn" data-item-id="${row.id}" style="position:absolute;left:${buttonLeft}px;top:50%;transform:translateY(-50%);width:${BUTTON_SIZE}px;height:${BUTTON_SIZE}px;padding:0;border-radius:4px;border:1.5px solid #0d6efd;background:${isExpanded ? '#0d6efd' : '#fff'};color:${isExpanded ? '#fff' : '#0d6efd'};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:1;"><i class="fas ${icon}" style="font-size:10px;"></i></button>`;
                    }
                    return `<div style="position:relative;width:100%;height:40px;min-height:40px;">${treeLinesHtml}${expandBtn}</div>`;
                }
            },
            { field: 'title', label: 'Başlık', sortable: false, formatter: (v, row) => (v || '-') + (row.notes ? `<br><small class="text-muted">${escapeHtml(row.notes)}</small>` : '') },
            { field: 'quantity', label: 'Adet', sortable: false, width: '80px', formatter: (v) => `<span class="badge bg-primary">×${v ?? 1}</span>` }
        ],
        data: displayData,
        pagination: false,
        sortable: false,
        emptyMessage: 'Henüz kalem eklenmemiş.',
        emptyIcon: 'fas fa-inbox',
        actions: editable ? [{
            key: 'delete_item',
            title: 'Kalemi sil',
            icon: 'fas fa-trash',
            class: 'btn-outline-danger',
            onClick: (row) => {
                showActionConfirm({
                    message: 'Bu kalemi silmek istediğinize emin misiniz?',
                    onConfirm: async () => {
                        try {
                            await deleteOfferItem(offerId, row.id);
                            showNotification('Kalem silindi', 'success');
                            const data = await getOffer(offerId);
                            offer.items = data.items || [];
                            const { roots } = getOfferItemsForTable(offer.items);
                            offerItemsRoots = roots;
                            offerItemsChildrenCache.clear();
                            roots.forEach(r => { if (r.children?.length) offerItemsChildrenCache.set(r.id, r.children); });
                            offerItemsExpanded.clear();
                            updateOfferItemsTableData();
                        } catch (e) { showNotification('Kalem silinirken hata oluştu', 'error'); }
                    }
                });
            }
        }] : []
    });
    setupOfferItemsExpandListeners();
}

function buildFilesTab() {
    const files = offer.files || [];
    let html = '';
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
    return `<div id="consultations-table-container"></div>`;
}

function getConsultationsTableRows() {
    const consultations = offer.consultations || [];
    const rows = [];
    consultations.forEach(c => {
        const deptLabel = c.department_display || (DEPARTMENT_CHOICES.find(d => d.value === c.department)?.label || c.department);
        (c.tasks || []).forEach(t => {
            const deadlineVal = t.target_completion_date ?? t.deadline ?? t.due_date;
            const deadlineStr = deadlineVal ? formatDate(deadlineVal) : null;
            const sharedFiles = t.shared_files || [];
            const completionFiles = t.completion_files || [];
            const descText = (t.notes ?? t.description ?? '').toString();
            rows.push({
                task_id: t.id,
                department: deptLabel,
                title: t.title || 'Görev',
                status: t.status,
                status_display: getTaskStatusBadge(t.status),
                assigned_to_name: t.assigned_to_name || '',
                deadline: deadlineStr || '',
                notes: descText.substring(0, 80) + (descText.length > 80 ? '…' : ''),
                shared_files_count: sharedFiles.length,
                shared_files: sharedFiles,
                completion_files: completionFiles
            });
        });
    });
    return rows;
}

let consultationsTableInstance = null;

function renderConsultationsTable() {
    const container = document.getElementById('consultations-table-container');
    if (!container) return;
    const canSendConsultations = !['won', 'lost', 'cancelled'].includes(offer?.status || '');
    const rows = getConsultationsTableRows();
    const refreshOffer = () => viewOffer(offerId);
    consultationsTableInstance = new TableComponent('consultations-table-container', {
        title: 'Departman Görüşleri',
        icon: 'fas fa-comments',
        iconColor: 'text-info',
        columns: [
            { field: 'department', label: 'Departman', sortable: true, formatter: (v) => v || '-' },
            { field: 'title', label: 'Başlık', sortable: true, formatter: (v) => (v || '-').replace(/</g, '&lt;') },
            { field: 'status_display', label: 'Durum', sortable: false, formatter: (v) => v || '-' },
            { field: 'assigned_to_name', label: 'Atanan', sortable: true, formatter: (v) => v || '-' },
            { field: 'deadline', label: 'Hedef Tarih', sortable: true, formatter: (v) => v || '-' },
            { field: 'notes', label: 'Not', sortable: false, formatter: (v) => (v || '-').replace(/</g, '&lt;') },
            {
                field: 'shared_files',
                label: 'Paylaşılan dosyalar',
                sortable: false,
                formatter: (v, row) => {
                    const files = row.shared_files || [];
                    if (files.length === 0) return '-';
                    return files.map(f => {
                        const name = (f.filename || f.name || 'Dosya').replace(/</g, '&lt;');
                        return `<a href="${f.file_url}" target="_blank" class="btn btn-sm btn-outline-secondary me-1 mb-1" title="${name}">${name}</a>`;
                    }).join('');
                }
            },
            {
                field: 'completion_files',
                label: 'Yanıt dosyaları',
                sortable: false,
                formatter: (v, row) => {
                    const files = row.completion_files || [];
                    if (files.length === 0) return '-';
                    return files.map(f => `<a href="${f.file_url}" target="_blank" class="btn btn-sm btn-outline-secondary me-1 mb-1">${f.filename || f.name || 'Dosya'}</a>`).join('');
                }
            }
        ],
        data: rows,
        sortable: true,
        pagination: false,
        emptyMessage: 'Henüz departman görüşü gönderilmemiş. "Departman Görüşü Gönder" ile departmana danışma talebi oluşturabilirsiniz.',
        emptyIcon: 'fas fa-comments',
        actions: [
            {
                key: 'edit_consultation',
                label: 'Düzenle',
                title: 'Danışma görevini düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                visible: () => canSendConsultations,
                onClick: (row) => showEditConsultationModal(row.task_id, refreshOffer)
            }
        ]
    });
}

// Flatten items tree for pricing display (show all items)
function flattenItemsForPricing(items) {
    const flattened = [];
    function walk(nodes) {
        (nodes || []).forEach(node => {
            flattened.push(node);
            if (node.children && node.children.length > 0) {
                walk(node.children);
            }
        });
    }
    walk(items);
    return flattened;
}

function buildPricingTab() {
    const allItems = offer.items || [];
    // Flatten items to show all priceable items
    const items = flattenItemsForPricing(allItems);
    const revisions = offer.price_revisions || [];
    const totalPrice = offer.total_price ? parseFloat(offer.total_price) : 0;
    const totalWeight = offer.total_weight_kg ? parseFloat(offer.total_weight_kg) : 0;
    
    let html = `
        <div class="mb-4">
            <h6 class="mb-3 d-flex align-items-center">
                <i class="fas fa-tag me-2 text-primary"></i>Kalem Fiyatlandırması
            </h6>
            ${items.length === 0 ? `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
                    Henüz kalem eklenmemiş. Önce kalemler sekmesinden kalem ekleyin.
                </div>
            ` : `
                <div class="table-responsive">
                    <table class="table table-bordered">
                        <thead class="table-light">
                            <tr>
                                <th style="width: 40%;">Kalem</th>
                                <th style="width: 10%;" class="text-center">Adet</th>
                                <th style="width: 20%;">Birim Fiyat (€)</th>
                                <th style="width: 15%;">Ağırlık (kg)</th>
                                <th style="width: 15%;" class="text-end">Ara Toplam (€)</th>
                            </tr>
                        </thead>
                        <tbody id="pricing-items-tbody">
                            ${items.map(item => {
                                const unitPrice = item.unit_price ? parseFloat(item.unit_price) : '';
                                const weightKg = item.weight_kg ? parseFloat(item.weight_kg) : '';
                                const subtotal = item.subtotal ? parseFloat(item.subtotal) : '';
                                const quantity = item.quantity || 1;
                                const title = item.resolved_title || item.title_override || item.title || '-';
                                return `
                                    <tr class="pricing-item-row" data-item-id="${item.id}">
                                        <td>${escapeHtml(title)}</td>
                                        <td class="text-center">${quantity}</td>
                                        <td>
                                            <input type="number" 
                                                   class="form-control form-control-sm pricing-unit-price" 
                                                   data-item-id="${item.id}"
                                                   value="${unitPrice}" 
                                                   placeholder="0.00" 
                                                   step="0.01" 
                                                   min="0">
                                        </td>
                                        <td>
                                            <input type="number" 
                                                   class="form-control form-control-sm pricing-weight-kg" 
                                                   data-item-id="${item.id}"
                                                   value="${weightKg}" 
                                                   placeholder="0.00" 
                                                   step="0.01" 
                                                   min="0">
                                        </td>
                                        <td class="text-end">
                                            <span class="pricing-subtotal" data-item-id="${item.id}">
                                                ${subtotal ? subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                        <tfoot class="table-light">
                            <tr>
                                <th colspan="4" class="text-end">Toplam:</th>
                                <th class="text-end">
                                    <span id="pricing-total-price">${totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> €
                                </th>
                            </tr>
                            <tr>
                                <th colspan="4" class="text-end">Toplam Ağırlık:</th>
                                <th class="text-end">
                                    <span id="pricing-total-weight">${totalWeight.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> kg
                                </th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `}
        </div>
    `;

    if (revisions.length > 0) {
        html += `
            <div class="mt-4">
                <h6 class="mb-3 d-flex align-items-center">
                    <i class="fas fa-history me-2 text-primary"></i>Fiyatlandırma Geçmişi
                </h6>`;
        revisions.forEach((r) => {
            const sym = CURRENCY_SYMBOLS[r.currency] || r.currency;
            const counterSym = CURRENCY_SYMBOLS[r.counter_currency] || r.counter_currency || '';
            const isCurrent = r.is_current;
            const revisionLabel = r.revision_type_display || REVISION_TYPE_MAP[r.revision_type] || '';
            const borderClass = isCurrent ? 'border-primary border-2' : 'border-secondary';
            html += `
            <div class="card mb-3 ${borderClass}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                        <div class="d-flex align-items-center flex-wrap gap-2">
                            <span class="badge bg-light text-dark">${revisionLabel}</span>
                            ${isCurrent ? '<span class="badge bg-success">Güncel</span>' : ''}
                        </div>
                        <small class="text-muted">${formatDateTime(r.created_at)} · ${r.created_by_name || '—'}</small>
                    </div>
                    <div class="d-flex align-items-baseline flex-wrap gap-2 mb-1">
                        <span class="fs-5 fw-bold ${isCurrent ? 'text-primary' : ''}">${sym} ${parseFloat(r.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    </div>`;
            if (r.counter_amount != null && parseFloat(r.counter_amount) > 0) {
                html += `
                    <div class="mt-2 pt-2 border-top border-light">
                        <small class="text-muted">Karşı teklif:</small>
                        <span class="ms-2 text-warning fw-medium">${counterSym} ${parseFloat(r.counter_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    </div>`;
            }
            if (r.notes) {
                html += `
                    <div class="mt-2 pt-2 border-top border-light">
                        <small class="text-muted d-block mb-1">Yorum</small>
                        <p class="mb-0 small">${r.notes}</p>
                    </div>`;
            }
            html += `
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    return html;
}

function attachPricingTabListeners() {
    const tbody = document.getElementById('pricing-items-tbody');
    if (!tbody) return;

    // Only update subtotal display on input (no auto-save)
    tbody.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.classList.contains('pricing-unit-price') && !input.classList.contains('pricing-weight-kg')) return;
        
        const row = input.closest('tr');
        const quantity = parseInt(row.querySelector('td:nth-child(2)').textContent.trim(), 10) || 1;
        
        const unitPriceInput = row.querySelector('.pricing-unit-price');
        const subtotalEl = row.querySelector('.pricing-subtotal');
        
        const unitPrice = unitPriceInput.value ? parseFloat(unitPriceInput.value) : null;
        
        // Update subtotal display immediately (for UI feedback only)
        if (unitPrice !== null && !isNaN(unitPrice)) {
            const subtotal = unitPrice * quantity;
            if (subtotalEl) {
                subtotalEl.textContent = subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
            }
        } else if (subtotalEl) {
            subtotalEl.textContent = '-';
        }
    });
}

async function saveAllPrices() {
    const tbody = document.getElementById('pricing-items-tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('.pricing-item-row');
    const savePromises = [];

    for (const row of rows) {
        const itemId = parseInt(row.dataset.itemId, 10);
        const unitPriceInput = row.querySelector('.pricing-unit-price');
        const weightInput = row.querySelector('.pricing-weight-kg');
        
        const unitPrice = unitPriceInput.value ? parseFloat(unitPriceInput.value) : null;
        const weightKg = weightInput.value ? parseFloat(weightInput.value) : null;
        
        // Prepare data for API (only send fields that have values)
        const data = {};
        if (unitPrice !== null && !isNaN(unitPrice) && unitPrice >= 0) {
            data.unit_price = unitPrice.toFixed(2);
        }
        if (weightKg !== null && !isNaN(weightKg) && weightKg >= 0) {
            data.weight_kg = weightKg.toFixed(2);
        }
        
        // Only save if there's data to send
        if (Object.keys(data).length > 0) {
            savePromises.push(patchOfferItem(offerId, itemId, data));
        }
    }

    if (savePromises.length === 0) {
        showNotification('Kaydedilecek fiyat bulunamadı', 'info');
        return;
    }

    try {
        await Promise.all(savePromises);
        // Refresh offer to get updated totals and items
        const updatedOffer = await getOffer(offerId);
        offer.total_price = updatedOffer.total_price;
        offer.total_weight_kg = updatedOffer.total_weight_kg;
        offer.items = updatedOffer.items || [];
        
        // Update totals display in pricing tab
        const totalPriceEl = document.getElementById('pricing-total-price');
        const totalWeightEl = document.getElementById('pricing-total-weight');
        if (totalPriceEl) {
            totalPriceEl.textContent = (offer.total_price ? parseFloat(offer.total_price) : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
        }
        if (totalWeightEl) {
            totalWeightEl.textContent = (offer.total_weight_kg ? parseFloat(offer.total_weight_kg) : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
        }
        
        // Update all subtotals and input values to match server response
        const allItems = flattenItemsForPricing(offer.items);
        allItems.forEach(item => {
            const subtotalEl = document.querySelector(`.pricing-subtotal[data-item-id="${item.id}"]`);
            if (subtotalEl) {
                subtotalEl.textContent = item.subtotal ? parseFloat(item.subtotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-';
            }
            const unitPriceInput = document.querySelector(`.pricing-unit-price[data-item-id="${item.id}"]`);
            const weightInput = document.querySelector(`.pricing-weight-kg[data-item-id="${item.id}"]`);
            if (unitPriceInput) {
                unitPriceInput.value = item.unit_price ? parseFloat(item.unit_price).toFixed(2) : '';
            }
            if (weightInput) {
                weightInput.value = item.weight_kg ? parseFloat(item.weight_kg).toFixed(2) : '';
            }
        });
        
        showNotification('Fiyatlar kaydedildi', 'success');
    } catch (e) {
        showNotification(parseError(e, 'Fiyatlar kaydedilirken hata oluştu'), 'error');
    }
}

function buildApprovalTab() {
    const hasRound = offer.approval_round > 0;
    const emptyState = `
        <h6 class="mb-3 d-flex align-items-center">
            <i class="fas fa-clipboard-check me-2 text-success"></i>Onay Süreci
        </h6>
        <div class="text-center text-muted py-4">
            <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
            Henüz onay süreci başlatılmamış. Teklif fiyatlandırıldıktan sonra "Onaya Gönder" ile süreci başlatabilirsiniz.
        </div>`;
    const loadingState = `
        <h6 class="mb-3 d-flex align-items-center">
            <i class="fas fa-clipboard-check me-2 text-success"></i>Onay Süreci
        </h6>
        <div class="text-muted py-2"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>`;
    return `<div id="approval-workflow-content" class="mt-2">${hasRound ? loadingState : emptyState}</div>`;
}

// Footer HTML for the offer modal; changes by active tab. Uses global offer.
function getOfferModalFooterHtml(tabId) {
    if (!offer) return '';
    const s = offer.status || '';
    // Allow editing in any status except closed ones (won, lost, cancelled)
    const editable = !CLOSED_STATUSES.includes(s);
    const closed = CLOSED_STATUSES.includes(s);
    const canPropose = !['won', 'cancelled'].includes(s);
    const canSendConsultations = !['won', 'lost', 'cancelled'].includes(s);
    const canSubmitApproval = s === 'pricing' && offer.total_price && parseFloat(offer.total_price) > 0;
    const canDecide = s === 'pending_approval';
    const hasRound = offer.approval_round > 0;

    const closeBtn = `<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>`;
    const parts = [];

    const actionClass = 'btn btn-sm btn-danger';
    if (tabId === 'genel') {
        if (editable) parts.push(`<button type="button" class="${actionClass}" id="edit-offer-btn"><i class="fas fa-edit me-1"></i>Düzenle</button>`);
    } else if (tabId === 'kalemler') {
        if (editable) parts.push(`<button type="button" class="${actionClass}" id="add-items-btn"><i class="fas fa-plus me-1"></i>Kalem Ekle</button>`);
    } else if (tabId === 'dosyalar') {
        if (!closed) parts.push(`<button type="button" class="${actionClass}" id="upload-file-btn"><i class="fas fa-upload me-1"></i>Dosya Yükle</button>`);
    } else if (tabId === 'consultations') {
        if (canSendConsultations) parts.push(`<button type="button" class="${actionClass}" id="send-consultations-btn"><i class="fas fa-paper-plane me-1"></i>Departman Görüşü Gönder</button>`);
    } else if (tabId === 'pricing') {
        if (editable) parts.push(`<button type="button" class="${actionClass}" id="save-prices-btn"><i class="fas fa-save me-1"></i>Fiyatları Kaydet</button>`);
        if (canSubmitApproval) parts.push(`<button type="button" class="${actionClass}" id="submit-approval-from-pricing-btn"><i class="fas fa-gavel me-1"></i>Onaya Gönder</button>`);
    } else if (tabId === 'approval') {
        if (canSubmitApproval) parts.push(`<button type="button" class="${actionClass}" id="submit-approval-btn"><i class="fas fa-gavel me-1"></i>Onaya Gönder</button>`);
        if (canDecide) parts.push(`<button type="button" class="${actionClass}" id="decide-btn"><i class="fas fa-check me-1"></i>Karar Ver</button>`);
        if (hasRound) parts.push(`<button type="button" class="${actionClass}" id="refresh-approval-btn"><i class="fas fa-sync-alt me-1"></i>Onay Durumunu Yenile</button>`);
    }

    return `<div class="d-flex gap-2 flex-wrap align-items-center justify-content-end ms-auto">${parts.join('')}${closeBtn}</div>`;
}

function updateOfferModalFooter(tabId) {
    viewOfferModal.setFooterContent(getOfferModalFooterHtml(tabId));
}

function attachOfferModalListeners() {
    const container = viewOfferModal.container;
    if (!container) return;

    const refreshOffer = () => viewOffer(offerId);
    updateOfferModalFooter('genel');

    container.querySelectorAll('.delete-item-btn').forEach(btn => {
        const itemId = btn.dataset.itemId;
        btn.onclick = () => {
            showActionConfirm({
                message: 'Bu kalemi silmek istediğinize emin misiniz?',
                onConfirm: async () => {
                    try {
                        await deleteOfferItem(offerId, itemId);
                        showNotification('Kalem silindi', 'success');
                        await refreshOffer();
                    } catch (e) { showNotification('Kalem silinirken hata oluştu', 'error'); }
                }
            });
        };
    });
    container.querySelectorAll('.delete-file-btn').forEach(btn => {
        const fileId = btn.dataset.fileId;
        btn.onclick = () => {
            showActionConfirm({
                message: 'Bu dosyayı silmek istediğinize emin misiniz?',
                onConfirm: async () => {
                    try {
                        await deleteOfferFile(offerId, fileId);
                        showNotification('Dosya silindi', 'success');
                        await refreshOffer();
                    } catch (e) { showNotification('Dosya silinirken hata oluştu', 'error'); }
                }
            });
        };
    });
}

// ─── Sub-modals (edit, add items, file upload, etc.) ──────────────────

function showEditModal(onSuccess) {
    const modal = new EditModal('edit-offer-modal-container', { title: 'Teklifi Düzenle', icon: 'fas fa-edit', size: 'lg', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Teklif Bilgileri', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    
    // Customer: remote search (same behavior as cost-table filter)
    // Preselect current customer (ensure it shows even before searching)
    const currentCustomerId = offer?.customer || offer?.customer_id || offer?.customerId || '';
    const currentCustomerLabel = offer?.customer_name || offer?.customerName || '';
    modal.addField({
        id: 'customer',
        name: 'customer',
        label: 'Müşteri',
        type: 'dropdown',
        required: true,
        icon: 'fas fa-building',
        colSize: 6,
        searchable: true,
        options: (currentCustomerId && currentCustomerLabel) ? [{ value: String(currentCustomerId), label: currentCustomerLabel }] : [],
        value: currentCustomerId ? String(currentCustomerId) : '',
        placeholder: 'Müşteri ara (en az 3 karakter)',
        minSearchLength: 3,
        remoteSearchPlaceholder: 'En az 3 karakter yazın',
        remoteSearch: async (term) => {
            if (!term || term.length < 3) return [];
            const res = await listCustomers({ search: term.trim(), is_active: true, page_size: 50 });
            const list = res.results || [];
            return list.map(c => ({ value: String(c.id), text: c.name || c.code || `#${c.id}` }));
        }
    });

    modal.addField({ id: 'title', name: 'title', label: 'Başlık', type: 'text', value: offer.title || '', required: true, icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', value: offer.description || '', icon: 'fas fa-align-left', colSize: 12 });
    modal.addField({ id: 'customer_inquiry_ref', name: 'customer_inquiry_ref', label: 'Müşteri Referansı', type: 'text', value: offer.customer_inquiry_ref || '', icon: 'fas fa-hashtag', colSize: 6 });
    modal.addField({ id: 'incoterms', name: 'incoterms', label: 'Incoterms', type: 'dropdown', value: offer.incoterms || '', options: INCOTERMS_OPTIONS, icon: 'fas fa-shipping-fast', colSize: 6 });
    modal.addField({ id: 'delivery_date_requested', name: 'delivery_date_requested', label: 'İstenen Termin Tarihi', type: 'date', value: offer.delivery_date_requested || '', icon: 'fas fa-calendar-alt', colSize: 6 });
    modal.addField({ id: 'offer_expiry_date', name: 'offer_expiry_date', label: 'Teklif Sunumu için Son Tarih', type: 'date', value: offer.offer_expiry_date || '', icon: 'fas fa-calendar-check', colSize: 6 });
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
            templates = Array.isArray(data) ? data : (data.results || data.data || []);
        } catch (e) {
            console.warn('Offer templates list failed:', e);
        }
    }
    const offerNo = offer?.offer_no || offerId || '';
    const modal = new EditModal('add-items-modal-container', {
        title: offerNo ? `Teklif ${offerNo} için Kalem Ekle` : 'Kalem Ekle',
        icon: 'fas fa-plus',
        size: 'xl',
        showEditButton: false,
        saveButtonText: 'Seçilen Kalemleri Ekle'
    });
    modal.clearAll();
    modal.onSaveCallback(async () => {
        // Read current selections from DOM before processing
        readCatalogSelectionFromDom();
        
        const baseSequence = (offer.items || []).length;
        const sequenceRef = { next: baseSequence + 1 };
        const items = [];
        const selectedByTemplate = new Map();
        
        // Use catalogSelectionState instead of reading from DOM (handles collapsed nodes)
        catalogSelectionState.forEach((info, key) => {
            const [templateId, nodeIdStr] = key.split('::');
            const nodeId = parseInt(nodeIdStr, 10);
            if (!templateId || isNaN(nodeId)) return;
            if (!selectedByTemplate.has(templateId)) selectedByTemplate.set(templateId, new Map());
            selectedByTemplate.get(templateId).set(nodeId, info.quantity || 1);
        });
        
        // Process each template sequentially to ensure all nodes are loaded
        for (const [templateId, nodeQuantityMap] of selectedByTemplate) {
            const selectedSet = new Set(nodeQuantityMap.keys());
            // Ensure we have root nodes loaded
            if (!catalogChildrenCache.has(templateId)) {
                try {
                    const nodes = await getOfferTemplateNodes(templateId);
                    const nodeList = Array.isArray(nodes) ? nodes : (nodes.results || nodes.children || []);
                    catalogChildrenCache.set(templateId, nodeList);
                } catch (err) {
                    showNotification(parseError(err, 'Katalog yüklenemedi'), 'error');
                    return;
                }
            }
            
            // Build tree from cached nodes - recursively fetch children from cache
            const rootNodes = catalogChildrenCache.get(templateId) || [];
            if (!rootNodes || rootNodes.length === 0) return;
            
            // Ensure we have all ancestors of selected nodes loaded
            // This function will load missing nodes on-demand
            await ensureSelectedNodesLoaded(templateId, rootNodes, selectedSet);
            
            // Reconstruct tree structure by adding children from cache
            const fullTree = rootNodes.map(node => addChildrenFromCache(templateId, node));
            const nested = buildNestedOfferItems(fullTree, selectedSet, sequenceRef, nodeQuantityMap);
            items.push(...nested);
        }
        const customTitle = document.getElementById('add-items-custom-title')?.value?.trim();
        const customNotes = document.getElementById('add-items-custom-notes')?.value?.trim() || '';
        const customQty = parseInt(document.getElementById('add-items-custom-quantity')?.value, 10) || 1;
        if (customTitle) {
            items.push({
                template_node: null,
                title_override: customTitle,
                quantity: customQty,
                notes: customNotes,
                sequence: sequenceRef.next++
            });
        }
        if (items.length === 0) {
            showNotification('En az bir kalem seçin (katalogdan işaretleyin veya özel kalem girin)', 'warning');
            return;
        }
        try {
            await addOfferItems(offerId, items);
            modal.hide();
            const totalCount = countOfferItemsNested(items);
            showNotification(`${totalCount} kalem eklendi`, 'success');
            await onSuccess();
        } catch (e) {
            showNotification(parseError(e, 'Kalemler eklenirken hata oluştu'), 'error');
        }
    });
    modal.render();
    const form = document.querySelector('#add-items-modal-container #edit-modal-form');
    if (form) {
        form.innerHTML = `
            <div class="display-modal-tabs-container">
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="add-items-tab-catalog-nav" data-bs-toggle="tab" data-bs-target="#add-items-pane-catalog" type="button" role="tab" aria-controls="add-items-pane-catalog" aria-selected="true"><i class="fas fa-sitemap me-2"></i>Katalogdan</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="add-items-tab-custom-nav" data-bs-toggle="tab" data-bs-target="#add-items-pane-custom" type="button" role="tab" aria-controls="add-items-pane-custom" aria-selected="false"><i class="fas fa-edit me-2"></i>Özel Kalem</button>
                    </li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane fade show active" id="add-items-pane-catalog" role="tabpanel" aria-labelledby="add-items-tab-catalog-nav">
                        <p class="text-muted small mb-2">Ürün ailesini genişleterek kalemleri seçin, adet girin ve ekleyin.</p>
                        <div class="row g-3">
                            <div class="col-lg-7">
                                <div id="add-items-catalog-table-container"></div>
                            </div>
                            <div class="col-lg-5">
                                <div id="add-items-selection-table-container"></div>
                            </div>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="add-items-pane-custom" role="tabpanel" aria-labelledby="add-items-tab-custom-nav">
                        <div class="row g-2">
                            <div class="col-12">
                                <label class="form-label" for="add-items-custom-title">Başlık</label>
                                <input type="text" class="form-control" id="add-items-custom-title" placeholder="Örn: Özel Konveyör Bant">
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="add-items-custom-notes">Notlar</label>
                                <textarea class="form-control" id="add-items-custom-notes" rows="2" placeholder="İsteğe bağlı"></textarea>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label" for="add-items-custom-quantity">Adet</label>
                                <input type="number" class="form-control" id="add-items-custom-quantity" min="1" value="1">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    const loadedTemplatesMap = new Map();
    const catalogExpanded = new Set();
    const catalogChildrenCache = new Map();
    const catalogSelectionState = new Map();
    const templateList = templates.filter(t => (t.id ?? t.pk) != null);
    const catalogRoots = templateList.map(t => ({
        template_id: String(t.id ?? t.pk),
        name: t.name || t.title || `Şablon ${t.id ?? t.pk}`,
        is_template: true,
        has_children: true
    }));

    async function ensureSelectedNodesLoaded(templateId, nodes, selectedSet) {
        // Check if all selected nodes are already in cache
        const allSelectedFound = Array.from(selectedSet).every(nodeId => {
            // Check if this node is in any cached children
            for (const [key, cachedNodes] of catalogChildrenCache) {
                if (key === templateId || key.startsWith(`${templateId}-`)) {
                    if (cachedNodes.some(n => n.id === nodeId)) {
                        return true;
                    }
                }
            }
            return false;
        });
        
        // If all selected nodes are found, no need to load more
        if (allSelectedFound) return;
        
        // Recursively ensure all ancestors of selected nodes are loaded
        for (const node of nodes) {
            const nodeKey = `${templateId}-${node.id}`;
            const isSelected = selectedSet.has(node.id);
            
            // If this node is selected or might have selected descendants, load its children
            if ((isSelected || (node.children_count > 0)) && !catalogChildrenCache.has(nodeKey)) {
                try {
                    const children = await getOfferTemplateNodeChildren(templateId, node.id);
                    const childList = Array.isArray(children) ? children : (children.results || children.children || []);
                    catalogChildrenCache.set(nodeKey, childList);
                    // Recursively load children of children
                    if (childList.length > 0) {
                        await ensureSelectedNodesLoaded(templateId, childList, selectedSet);
                    }
                } catch (err) {
                    console.warn(`Failed to load children for node ${node.id}:`, err);
                }
            } else if (catalogChildrenCache.has(nodeKey)) {
                // If already loaded, recursively check children
                const cachedChildren = catalogChildrenCache.get(nodeKey);
                if (cachedChildren && cachedChildren.length > 0) {
                    await ensureSelectedNodesLoaded(templateId, cachedChildren, selectedSet);
                }
            }
        }
    }

    function addChildrenFromCache(templateId, node) {
        const nodeKey = `${templateId}-${node.id}`;
        const cachedChildren = catalogChildrenCache.get(nodeKey);
        if (cachedChildren && cachedChildren.length > 0) {
            return {
                ...node,
                children: cachedChildren.map(child => addChildrenFromCache(templateId, child))
            };
        }
        return { ...node, children: [] };
    }

    function nodeToRow(node, templateId) {
        return {
            template_id: templateId,
            node_id: node.id,
            title: node.title || '',
            is_template: false,
            has_children: node.has_children === true || (node.children_count != null && node.children_count > 0) || !!(node.children && node.children.length)
        };
    }

    function mergeCatalogRows(roots, level = 0) {
        const out = [];
        for (const r of roots) {
            const row = { ...r, hierarchy_level: level };
            out.push(row);
            if (r.is_template && catalogExpanded.has(r.template_id)) {
                const childNodes = catalogChildrenCache.get(r.template_id) || [];
                const childRows = childNodes.map(n => nodeToRow(n, r.template_id));
                out.push(...mergeCatalogRows(childRows, level + 1));
            }
            if (!r.is_template && r.node_id != null) {
                const nodeKey = `${r.template_id}-${r.node_id}`;
                if (catalogExpanded.has(nodeKey)) {
                    const childNodes = catalogChildrenCache.get(nodeKey) || [];
                    const childRows = childNodes.map(n => nodeToRow(n, r.template_id));
                    out.push(...mergeCatalogRows(childRows, level + 1));
                }
            }
        }
        return out;
    }

    let addItemsCatalogTable = null;
    const catalogSelectionKey = (tid, nid) => `${tid}::${nid}`;
    function readCatalogSelectionFromDom() {
        const container = addItemsCatalogTable?.container;
        if (!container) return;
        // Only update/add selections from visible DOM elements, don't delete entries for collapsed nodes
        container.querySelectorAll('input.catalog-node-checkbox').forEach((cb) => {
            const templateId = cb.dataset?.templateId || cb.getAttribute('data-template-id');
            const nodeId = cb.value;
            if (!templateId || !nodeId) return;
            const key = catalogSelectionKey(templateId, nodeId);
            const row = cb.closest('tr');
            const qtyInput = row?.querySelector('input.catalog-node-qty');
            const qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
            if (cb.checked) {
                catalogSelectionState.set(key, { quantity: qty });
            } else {
                // Only delete if explicitly unchecked (user unchecks a visible checkbox)
                // Don't delete entries for nodes that are just collapsed (not in DOM)
                catalogSelectionState.delete(key);
            }
        });
    }
    let addItemsSelectionTable = null;
    const selectionExpanded = new Set();
    const selectionChildrenCache = new Map();

    /** Returns a flat list of only selected nodes in tree order, with hierarchy_level = depth (selected-ancestor count). */
    function getSelectedRowsOnly(nodes, templateId, selectedSet, depth) {
        const out = [];
        (nodes || []).forEach((node) => {
            if (node.is_active === false) return;
            const isSelected = selectedSet.has(node.id);
            if (isSelected) {
                const key = catalogSelectionKey(templateId, node.id);
                const qty = catalogSelectionState.get(key)?.quantity ?? 1;
                out.push({
                    template_id: templateId,
                    node_id: node.id,
                    title: node.title || '',
                    quantity: qty,
                    is_template: false,
                    hierarchy_level: depth
                });
            }
            const nextDepth = isSelected ? depth + 1 : depth;
            // Get children from cache if available
            const nodeKey = `${templateId}-${node.id}`;
            const cachedChildren = catalogChildrenCache.get(nodeKey) || [];
            out.push(...getSelectedRowsOnly(cachedChildren, templateId, selectedSet, nextDepth));
        });
        return out;
    }

    function buildSelectionTreeRoots() {
        const byTemplate = new Map();
        catalogSelectionState.forEach((info, key) => {
            const [templateId, nodeIdStr] = key.split('::');
            const nodeId = parseInt(nodeIdStr, 10);
            if (isNaN(nodeId)) return;
            if (!byTemplate.has(templateId)) byTemplate.set(templateId, []);
            byTemplate.get(templateId).push({ nodeId, quantity: info?.quantity ?? 1 });
        });
        const roots = [];
        byTemplate.forEach((selectedNodes, templateId) => {
            const template = loadedTemplatesMap.get(templateId);
            const templateName = template?.name || catalogRoots.find(r => r.template_id === templateId)?.name || `Şablon ${templateId}`;
            const rootNodes = catalogChildrenCache.get(templateId) || template?.root_nodes || [];
            const selectedSet = new Set(selectedNodes.map((n) => n.nodeId));
            const selectedRows = getSelectedRowsOnly(rootNodes, templateId, selectedSet, 0);
            if (selectedRows.length === 0) return;
            selectionChildrenCache.set(templateId, selectedRows);
            selectionExpanded.add(templateId);
            roots.push({ is_template: true, template_id: templateId, name: templateName, has_children: true });
        });
        return roots;
    }

    function mergeSelectionRows(roots) {
        const out = [];
        for (const r of roots) {
            out.push({ ...r, hierarchy_level: 0 });
            if (r.is_template && selectionExpanded.has(r.template_id)) {
                const children = selectionChildrenCache.get(r.template_id) || [];
                out.push(...children);
            }
        }
        return out;
    }

    function updateSelectionTableData() {
        if (!addItemsSelectionTable) return;
        const roots = buildSelectionTreeRoots();
        const displayData = mergeSelectionRows(roots);
        addItemsSelectionTable.updateData(displayData);
        setTimeout(() => setupSelectionTableExpandListeners(), 50);
    }

    let selectionExpandHandler = null;
    function setupSelectionTableExpandListeners() {
        if (!addItemsSelectionTable?.container) return;
        if (selectionExpandHandler) {
            addItemsSelectionTable.container.removeEventListener('click', selectionExpandHandler);
        }
        selectionExpandHandler = (e) => {
            const btn = e.target.closest('.selection-expand-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const key = btn.getAttribute('data-expand-key');
            if (!key) return;
            if (selectionExpanded.has(key)) selectionExpanded.delete(key);
            else selectionExpanded.add(key);
            updateSelectionTableData();
        };
        addItemsSelectionTable.container.addEventListener('click', selectionExpandHandler);
    }

    const SEL_LEVEL_WIDTH = 20;
    const SEL_LINE_THICKNESS = 2;
    const SEL_LINE_COLOR = '#cbd5e0';
    const SEL_BUTTON_SIZE = 24;

    function renderAddItemsSelectionSidebar() {
        const container = document.getElementById('add-items-selection-table-container');
        if (!container) return;
        const roots = buildSelectionTreeRoots();
        const displayData = mergeSelectionRows(roots);
        if (!addItemsSelectionTable) {
            addItemsSelectionTable = new TableComponent('add-items-selection-table-container', {
                title: 'Seçilen kalemler',
                icon: 'fas fa-check-double',
                iconColor: 'text-success',
                columns: [
                    {
                        field: '_expand',
                        label: '',
                        sortable: false,
                        width: '56px',
                        formatter: (value, row) => {
                            const isTemplate = row.is_template === true;
                            const hasChildren = isTemplate && (selectionChildrenCache.get(row.template_id) || []).length > 0;
                            const expandKey = row.template_id;
                            const isExpanded = selectionExpanded.has(expandKey);
                            const level = row.hierarchy_level ?? 0;
                            const buttonLeft = level * SEL_LEVEL_WIDTH;
                            let treeLinesHtml = '';
                            if (level > 0) {
                                for (let i = 0; i < level; i++) {
                                    const isLast = i === level - 1;
                                    const lineLeft = i * SEL_LEVEL_WIDTH + (SEL_LEVEL_WIDTH / 2) - (SEL_LINE_THICKNESS / 2);
                                    if (!isLast) {
                                        treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;bottom:0;width:${SEL_LINE_THICKNESS}px;background:${SEL_LINE_COLOR};"></div>`;
                                    } else {
                                        treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;height:50%;width:${SEL_LINE_THICKNESS}px;background:${SEL_LINE_COLOR};"></div>`;
                                        treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:50%;width:${SEL_LEVEL_WIDTH/2}px;height:${SEL_LINE_THICKNESS}px;background:${SEL_LINE_COLOR};transform:translateY(-50%);"></div>`;
                                    }
                                }
                            }
                            let expandBtn = '';
                            if (isTemplate && hasChildren) {
                                const icon = isExpanded ? 'fa-minus' : 'fa-plus';
                                expandBtn = `<button type="button" class="btn btn-sm selection-expand-btn" data-expand-key="${expandKey}" style="position:absolute;left:${buttonLeft}px;top:50%;transform:translateY(-50%);width:${SEL_BUTTON_SIZE}px;height:${SEL_BUTTON_SIZE}px;padding:0;border-radius:4px;border:1.5px solid #0d6efd;background:${isExpanded ? '#0d6efd' : '#fff'};color:${isExpanded ? '#fff' : '#0d6efd'};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:1;"><i class="fas ${icon}" style="font-size:10px;"></i></button>`;
                            }
                            return `<div style="position:relative;width:100%;height:40px;min-height:40px;">${treeLinesHtml}${expandBtn}</div>`;
                        }
                    },
                    {
                        field: 'title',
                        label: 'Başlık',
                        sortable: false,
                        formatter: (v, row) => {
                            const title = row.is_template ? (row.name || '') : (row.title || '');
                            return escapeHtml(title || '-');
                        }
                    },
                    {
                        field: 'quantity',
                        label: 'Adet',
                        sortable: false,
                        width: '80px',
                        formatter: (v, row) => {
                            if (row.is_template) return '';
                            const qty = row.quantity ?? 0;
                            return qty ? `<span class="badge bg-primary">×${qty}</span>` : '';
                        }
                    }
                ],
                data: displayData,
                pagination: false,
                sortable: false,
                emptyMessage: 'Seçim yapıldıkça burada görünecek.',
                emptyIcon: 'fas fa-inbox'
            });
            setupSelectionTableExpandListeners();
        } else {
            updateSelectionTableData();
        }
    }
    function updateAddItemsCatalogTable() {
        if (!addItemsCatalogTable) return;
        readCatalogSelectionFromDom();
        const displayData = mergeCatalogRows(catalogRoots);
        addItemsCatalogTable.updateData(displayData);
        setTimeout(() => {
            setupAddItemsCatalogExpandListeners();
            setupAddItemsCatalogSelectionListeners();
            renderAddItemsSelectionSidebar();
        }, 50);
    }

    let addItemsCatalogSelectionHandler = null;
    function setupAddItemsCatalogSelectionListeners() {
        if (!addItemsCatalogTable?.container) return;
        if (addItemsCatalogSelectionHandler) {
            addItemsCatalogTable.container.removeEventListener('change', addItemsCatalogSelectionHandler);
            addItemsCatalogTable.container.removeEventListener('input', addItemsCatalogSelectionHandler);
        }
        addItemsCatalogSelectionHandler = () => {
            readCatalogSelectionFromDom();
            renderAddItemsSelectionSidebar();
        };
        addItemsCatalogTable.container.addEventListener('change', addItemsCatalogSelectionHandler);
        addItemsCatalogTable.container.addEventListener('input', addItemsCatalogSelectionHandler);
    }
    let addItemsCatalogExpandHandler = null;
    function setupAddItemsCatalogExpandListeners() {
        if (!addItemsCatalogTable?.container) return;
        if (addItemsCatalogExpandHandler) {
            addItemsCatalogTable.container.removeEventListener('click', addItemsCatalogExpandHandler);
        }
        addItemsCatalogExpandHandler = async (e) => {
            const btn = e.target.closest('.add-items-catalog-expand-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const key = btn.getAttribute('data-expand-key');
            const templateId = btn.getAttribute('data-template-id');
            if (!key) return;
            if (catalogExpanded.has(key)) {
                catalogExpanded.delete(key);
                updateAddItemsCatalogTable();
                return;
            }
            
            // Check if we need to load children
            const isTemplateRoot = templateId && key === templateId;
            const needsLoad = isTemplateRoot 
                ? !catalogChildrenCache.has(templateId)
                : !catalogChildrenCache.has(key);
            
            if (needsLoad) {
                btn.disabled = true;
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fas fa-spinner fa-spin';
                try {
                    if (isTemplateRoot) {
                        // Load root nodes for template (flat, no recursion)
                        const nodes = await getOfferTemplateNodes(templateId);
                        const nodeList = Array.isArray(nodes) ? nodes : (nodes.results || nodes.children || []);
                        catalogChildrenCache.set(templateId, nodeList);
                        // Store template info if not already stored
                        if (!loadedTemplatesMap.has(templateId)) {
                            const templateInfo = await getOfferTemplate(templateId);
                            loadedTemplatesMap.set(templateId, templateInfo);
                        }
                    } else {
                        // Load direct children of a specific node
                        const nodeId = btn.getAttribute('data-node-id');
                        if (!nodeId || !templateId) {
                            showNotification('Node bilgisi bulunamadı', 'error');
                            btn.disabled = false;
                            if (icon) icon.className = 'fas fa-plus';
                            return;
                        }
                        const children = await getOfferTemplateNodeChildren(templateId, nodeId);
                        const childList = Array.isArray(children) ? children : (children.results || children.children || []);
                        catalogChildrenCache.set(key, childList);
                    }
                } catch (err) {
                    showNotification(parseError(err, 'Katalog yüklenemedi'), 'error');
                    btn.disabled = false;
                    if (icon) icon.className = 'fas fa-plus';
                    return;
                }
                btn.disabled = false;
                if (icon) icon.className = 'fas fa-plus';
            }
            catalogExpanded.add(key);
            updateAddItemsCatalogTable();
        };
        addItemsCatalogTable.container.addEventListener('click', addItemsCatalogExpandHandler);
    }

    const LEVEL_WIDTH = 20;
    const LINE_THICKNESS = 2;
    const LINE_COLOR = '#cbd5e0';
    const BUTTON_SIZE = 24;

    addItemsCatalogTable = new TableComponent('add-items-catalog-table-container', {
        title: 'Katalog – genişletin, seçin, adet girin',
        icon: 'fas fa-sitemap',
        iconColor: 'text-primary',
        columns: [
            {
                field: '_expand',
                label: '',
                sortable: false,
                width: '80px',
                formatter: (value, row) => {
                    const hasChildren = row.has_children === true;
                    const expandKey = row.is_template ? row.template_id : `${row.template_id}-${row.node_id}`;
                    const isExpanded = catalogExpanded.has(expandKey);
                    const level = row.hierarchy_level ?? 0;
                    const buttonLeft = level * LEVEL_WIDTH;
                    let treeLinesHtml = '';
                    if (level > 0) {
                        for (let i = 0; i < level; i++) {
                            const isLast = i === level - 1;
                            const lineLeft = i * LEVEL_WIDTH + (LEVEL_WIDTH / 2) - (LINE_THICKNESS / 2);
                            if (!isLast) {
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;bottom:0;width:${LINE_THICKNESS}px;background:${LINE_COLOR};"></div>`;
                            } else {
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;height:50%;width:${LINE_THICKNESS}px;background:${LINE_COLOR};"></div>`;
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:50%;width:${LEVEL_WIDTH/2}px;height:${LINE_THICKNESS}px;background:${LINE_COLOR};transform:translateY(-50%);"></div>`;
                            }
                        }
                    }
                    let expandBtn = '';
                    if (hasChildren) {
                        const icon = isExpanded ? 'fa-minus' : 'fa-plus';
                        const nodeIdAttr = row.is_template ? '' : `data-node-id="${row.node_id}"`;
                        expandBtn = `<button type="button" class="btn btn-sm add-items-catalog-expand-btn" data-expand-key="${expandKey}" data-template-id="${row.is_template ? row.template_id : row.template_id}" ${nodeIdAttr} style="position:absolute;left:${buttonLeft}px;top:50%;transform:translateY(-50%);width:${BUTTON_SIZE}px;height:${BUTTON_SIZE}px;padding:0;border-radius:4px;border:1.5px solid #0d6efd;background:${isExpanded ? '#0d6efd' : '#fff'};color:${isExpanded ? '#fff' : '#0d6efd'};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:1;" title="${isExpanded ? 'Daralt' : 'Genişlet'}"><i class="fas ${icon}" style="font-size:10px;"></i></button>`;
                    }
                    return `<div style="position:relative;width:100%;height:40px;min-height:40px;">${treeLinesHtml}${expandBtn}</div>`;
                }
            },
            {
                field: '_select',
                label: 'Seç',
                sortable: false,
                width: '48px',
                formatter: (value, row) => {
                    if (row.is_template) return '';
                    const key = catalogSelectionKey(row.template_id, row.node_id);
                    const state = catalogSelectionState.get(key);
                    const checked = state ? 'checked' : '';
                    return `<input type="checkbox" class="form-check-input catalog-node-checkbox" value="${row.node_id}" data-node-id="${row.node_id}" data-template-id="${row.template_id}" ${checked}>`;
                }
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: false,
                formatter: (v, row) => {
                    const title = row.is_template ? (row.name || '') : (row.title || '');
                    return escapeHtml(title || '-');
                }
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: false,
                width: '100px',
                formatter: (value, row) => {
                    if (row.is_template) return '';
                    const key = catalogSelectionKey(row.template_id, row.node_id);
                    const state = catalogSelectionState.get(key);
                    const qty = (state?.quantity ?? 1);
                    return `<input type="number" class="form-control form-control-sm catalog-node-qty" data-node-id="${row.node_id}" data-template-id="${row.template_id}" min="1" value="${qty}" style="width:70px">`;
                }
            }
        ],
        data: mergeCatalogRows(catalogRoots),
        pagination: false,
        sortable: false,
        emptyMessage: 'Henüz şablon yok.',
        emptyIcon: 'fas fa-inbox'
    });
    setTimeout(() => {
        setupAddItemsCatalogExpandListeners();
        setupAddItemsCatalogSelectionListeners();
        renderAddItemsSelectionSidebar();
    }, 50);
    modal.show();
}

function flattenCatalogTreeToRows(nodes, level, templateId) {
    const rows = [];
    (nodes || []).forEach((node) => {
        if (node.is_active === false) return;
        rows.push({
            id: node.id,
            title: node.title || '',
            hierarchy_level: level,
            template_id: templateId
        });
        rows.push(...flattenCatalogTreeToRows(node.children || [], level + 1, templateId));
    });
    return rows;
}

function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function buildTreeFromFlatNodes(flatNodes) {
    if (!flatNodes || !flatNodes.length) return [];
    const byId = new Map();
    flatNodes.forEach(n => {
        const id = n.id ?? n.pk;
        if (id == null) return;
        byId.set(id, { ...n, id, children: [] });
    });
    const roots = [];
    flatNodes.forEach(n => {
        const id = n.id ?? n.pk;
        const parentId = n.parent ?? n.parent_id ?? null;
        const node = byId.get(id);
        if (!node) return;
        if (parentId == null || parentId === '') {
            roots.push(node);
        } else {
            const parent = byId.get(parentId);
            if (parent) parent.children.push(node);
            else roots.push(node);
        }
    });
    roots.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return roots;
}

function renderAddItemsTreeNode(node, parentEl) {
    if (node.is_active === false) return;
    const div = document.createElement('div');
    div.className = 'ms-2';
    div.innerHTML = `
        <div class="form-check">
            <input class="form-check-input catalog-node-checkbox" type="checkbox" value="${node.id}" id="add-items-node-${node.id}">
            <label class="form-check-label" for="add-items-node-${node.id}">${node.title || ''}</label>
        </div>
    `;
    parentEl.appendChild(div);
    (node.children || []).forEach(child => renderAddItemsTreeNode(child, div));
}

function hasSelectedDescendant(node, selectedSet) {
    if (selectedSet.has(node.id)) return true;
    return (node.children || []).some(c => hasSelectedDescendant(c, selectedSet));
}

function buildNestedOfferItems(nodes, selectedSet, sequenceRef, nodeQuantityMap = null) {
    const result = [];
    for (const node of nodes) {
        const isSelected = selectedSet.has(node.id);
        const childSelected = (node.children || []).some(c => hasSelectedDescendant(c, selectedSet));
        if (!isSelected && !childSelected) continue;
        if (isSelected) {
            const qty = (nodeQuantityMap && nodeQuantityMap.get(node.id)) ?? 1;
            const item = {
                template_node: node.id,
                quantity: qty,
                title_override: '',
                notes: '',
                sequence: sequenceRef.next++
            };
            const childItems = buildNestedOfferItems(node.children || [], selectedSet, sequenceRef, nodeQuantityMap);
            if (childItems.length) item.children = childItems;
            result.push(item);
        } else {
            result.push(...buildNestedOfferItems(node.children || [], selectedSet, sequenceRef, nodeQuantityMap));
        }
    }
    return result;
}

function countOfferItemsNested(items) {
    return items.reduce((sum, item) => sum + 1 + (item.children ? countOfferItemsNested(item.children) : 0), 0);
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

const consultationFileViewer = new FileViewer();

function getFileExtension(fileName) {
    if (!fileName) return '';
    return fileName.split('.').pop().toLowerCase();
}

/** Normalize API date to YYYY-MM-DD for <input type="date"> */
function toDateInputValue(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.split('T')[0].substring(0, 10);
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return '';
    }
    if (typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? '' : val.toISOString().split('T')[0];
    return '';
}

async function showConsultationModal(onSuccess) {
    const modal = new EditModal('consultation-modal-container', { title: 'Departman Görüşü Gönder', icon: 'fas fa-paper-plane', size: 'lg', showEditButton: false });
    modal.clearAll();
    const deptOptions = [{ value: '', label: 'Departman seçin' }, ...DEPARTMENT_CHOICES.map(d => ({ value: d.value, label: d.label }))];
    modal.addSection({ title: 'Görüş Talebi', icon: 'fas fa-building', iconColor: 'text-info' });
    modal.addField({ id: 'department', name: 'department', label: 'Departman', type: 'dropdown', required: true, options: deptOptions, icon: 'fas fa-sitemap', colSize: 12 });
    modal.addField({ id: 'notes', name: 'notes', label: 'Notlar', type: 'textarea', placeholder: 'Departmana iletmek istediğiniz notlar (isteğe bağlı)', icon: 'fas fa-sticky-note', colSize: 12 });
    modal.onSaveCallback(async (formData) => {
        const department = formData.department;
        if (!department) { showNotification('Departman seçin', 'warning'); return; }
        const container = document.getElementById('consultation-modal-container');
        const checked = container.querySelectorAll('.consultation-file-cb:checked');
        const file_ids = Array.from(checked).map(el => parseInt(el.value, 10)).filter(id => !isNaN(id));
        const departments = [{
            department,
            title: offer.title || '',
            task_type: 'sales_consult',
            deadline: offer.offer_expiry_date || null,
            assigned_to: null,
            notes: formData.notes || '',
            file_ids
        }];
        try {
            await sendConsultations(offerId, departments);
            modal.hide();
            showNotification('Departman görüşü gönderildi', 'success');
            await onSuccess();
        } catch (e) {
            const msg = e.message || parseError(e, 'Görüş gönderilirken hata oluştu');
            showNotification(msg, 'error');
        }
    });
    modal.render();
    const container = document.getElementById('consultation-modal-container');
    const form = container.querySelector('#edit-modal-form');
    const notesInput = form?.querySelector('[name="notes"]');
    if (notesInput) {
        const notesCol = notesInput.closest('.col-md-12');
        if (notesCol) notesCol.style.display = 'none';
        const dropdownContainer = container.querySelector('#dropdown-department');
        const toggleNotes = (hasValue) => { if (notesCol) notesCol.style.display = hasValue ? '' : 'none'; };
        if (dropdownContainer) {
            dropdownContainer.addEventListener('dropdown:select', (e) => {
                const v = e.detail?.value;
                toggleNotes(v !== undefined && v !== null && v !== '');
            });
        }
    }
    // Append selectable offer files section
    const offerFiles = offer.files || [];
    const filesSection = document.createElement('div');
    filesSection.className = 'form-section compact mb-3';
    filesSection.dataset.sectionId = 'consultation-files';
    if (offerFiles.length > 0) {
        const title = document.createElement('h6');
        title.className = 'section-subtitle compact text-info';
        title.innerHTML = '<i class="fas fa-paperclip me-2"></i>Departmanla paylaşılacak dosyalar';
        filesSection.appendChild(title);
        const filesContainer = document.createElement('div');
        filesContainer.className = 'consultation-files-selection';
        filesContainer.innerHTML = '<p class="text-muted small mb-2">Departmanın görmesini istediğiniz dosyaları işaretleyin.</p>';
        const listDiv = document.createElement('div');
        listDiv.className = 'row g-2';
        offerFiles.forEach(f => {
            const fileName = f.name || f.filename || 'Dosya';
            const ext = getFileExtension(fileName);
            const col = document.createElement('div');
            col.className = 'col-12';
            col.innerHTML = `
                <div class="file-attachment-item d-flex align-items-center gap-3 p-2 border rounded mb-2 consultation-file-row">
                    <div class="form-check mb-0 flex-shrink-0">
                        <input class="form-check-input consultation-file-cb" type="checkbox" value="${f.id}" id="consultation-file-${f.id}">
                        <label class="form-check-label visually-hidden" for="consultation-file-${f.id}">${fileName}</label>
                    </div>
                    <i class="fas fa-file text-primary flex-shrink-0"></i>
                    <div class="flex-grow-1 min-width-0">
                        <div class="fw-medium text-truncate">${fileName}</div>
                        ${f.file_type_display || f.file_type ? `<small class="text-muted">${f.file_type_display || f.file_type}</small>` : ''}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary preview-consultation-file flex-shrink-0" data-file-url="${f.file_url}" data-file-name="${fileName}" data-file-ext="${ext}">
                        <i class="fas fa-eye me-1"></i>Önizle
                    </button>
                </div>
            `;
            listDiv.appendChild(col);
        });
        filesContainer.appendChild(listDiv);
        filesSection.appendChild(filesContainer);
        form.appendChild(filesSection);
        filesSection.querySelectorAll('.preview-consultation-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const url = e.currentTarget.dataset.fileUrl;
                const name = e.currentTarget.dataset.fileName;
                const ext = e.currentTarget.dataset.fileExt || '';
                consultationFileViewer.openFile(url, name, ext);
            });
        });
    } else {
        const title = document.createElement('h6');
        title.className = 'section-subtitle compact text-muted';
        title.innerHTML = '<i class="fas fa-paperclip me-2"></i>Paylaşılacak dosya yok';
        filesSection.appendChild(title);
        const p = document.createElement('p');
        p.className = 'text-muted small mb-0';
        p.textContent = 'Teklifte henüz dosya yok. İstediğiniz dosyaları teklife ekledikten sonra görüş gönderebilirsiniz.';
        filesSection.appendChild(p);
        form.appendChild(filesSection);
    }
    modal.show();
}

async function showEditConsultationModal(taskId, onSuccess) {
    let task;
    try {
        task = await getOfferConsultationTask(offerId, taskId);
    } catch (e) {
        showNotification(e.message || 'Görüş görevi yüklenemedi', 'error');
        return;
    }
    const sharedFileIds = new Set((task.shared_files || []).map(f => f.id));
    const titleVal = task.title ?? task.request_title ?? '';
    const notesVal = task.notes ?? task.request_description ?? task.description ?? '';
    const deadlineRaw = task.target_completion_date ?? task.deadline ?? task.due_date ?? task.target_date ?? task.hedef_tarih;
    const deadlineVal = toDateInputValue(deadlineRaw);
    const modal = new EditModal('edit-consultation-modal-container', { title: 'Danışma Görevini Düzenle', icon: 'fas fa-edit', size: 'lg', showEditButton: false });
    modal.clearAll();
    modal.addSection({ title: 'Görev Bilgileri', icon: 'fas fa-info-circle', iconColor: 'text-info' });
    modal.addField({ id: 'title', name: 'title', label: 'Başlık', type: 'text', value: titleVal, icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'notes', name: 'notes', label: 'Notlar', type: 'textarea', value: notesVal, placeholder: 'İsteğe bağlı', icon: 'fas fa-sticky-note', colSize: 12 });
    modal.addField({ id: 'deadline', name: 'deadline', label: 'Hedef Tarih', type: 'date', value: deadlineVal, icon: 'fas fa-calendar', colSize: 6 });
    modal.onSaveCallback(async (formData) => {
        const payload = {};
        if (formData.title !== undefined) payload.title = formData.title;
        if (formData.notes !== undefined) payload.notes = formData.notes;
        if (formData.deadline !== undefined) payload.deadline = formData.deadline || null;
        const container = document.getElementById('edit-consultation-modal-container');
        const checked = container.querySelectorAll('.edit-consultation-file-cb:checked');
        payload.file_ids = Array.from(checked).map(el => parseInt(el.value, 10)).filter(id => !isNaN(id));
        try {
            await patchOfferConsultationTask(offerId, taskId, payload);
            modal.hide();
            showNotification('Danışma görevi güncellendi', 'success');
            await onSuccess();
        } catch (e) {
            showNotification(e.message || parseError(e, 'Güncelleme hatası'), 'error');
        }
    });
    modal.render();
    modal.setFieldValue('title', titleVal);
    modal.setFieldValue('notes', notesVal);
    modal.setFieldValue('deadline', deadlineVal);
    const container = document.getElementById('edit-consultation-modal-container');
    const form = container.querySelector('#edit-modal-form');
    if (!form) { modal.show(); return; }

    const offerFiles = offer.files || [];
    if (offerFiles.length > 0) {
        const filesSection = document.createElement('div');
        filesSection.className = 'form-section compact mb-3';
        filesSection.dataset.sectionId = 'edit-consultation-files';
        const title = document.createElement('h6');
        title.className = 'section-subtitle compact text-info';
        title.innerHTML = '<i class="fas fa-paperclip me-2"></i>Paylaşılacak dosyalar';
        filesSection.appendChild(title);
        const p = document.createElement('p');
        p.className = 'text-muted small mb-2';
        p.textContent = 'Departmanın görmesini istediğiniz dosyaları işaretleyin. Mevcut setin yerine seçtiğiniz set geçer.';
        filesSection.appendChild(p);
        const listDiv = document.createElement('div');
        listDiv.className = 'row g-2';
        offerFiles.forEach(f => {
            const fileName = f.name || f.filename || 'Dosya';
            const ext = getFileExtension(fileName);
            const checkedAttr = sharedFileIds.has(f.id) ? ' checked' : '';
            const col = document.createElement('div');
            col.className = 'col-12';
            col.innerHTML = `
                <div class="file-attachment-item d-flex align-items-center gap-3 p-2 border rounded mb-2">
                    <div class="form-check mb-0 flex-shrink-0">
                        <input class="form-check-input edit-consultation-file-cb" type="checkbox" value="${f.id}" id="edit-consultation-file-${f.id}"${checkedAttr}>
                        <label class="form-check-label visually-hidden" for="edit-consultation-file-${f.id}">${(fileName || '').replace(/</g, '&lt;')}</label>
                    </div>
                    <i class="fas fa-file text-primary flex-shrink-0"></i>
                    <div class="flex-grow-1 min-width-0">
                        <div class="fw-medium text-truncate">${(fileName || '').replace(/</g, '&lt;')}</div>
                        ${f.file_type_display || f.file_type ? `<small class="text-muted">${(f.file_type_display || f.file_type || '').replace(/</g, '&lt;')}</small>` : ''}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary preview-edit-consultation-file flex-shrink-0" data-file-url="${f.file_url}" data-file-name="${fileName}" data-file-ext="${ext}">
                        <i class="fas fa-eye me-1"></i>Önizle
                    </button>
                </div>
            `;
            listDiv.appendChild(col);
        });
        filesSection.appendChild(listDiv);
        form.appendChild(filesSection);
        filesSection.querySelectorAll('.preview-edit-consultation-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                consultationFileViewer.openFile(e.currentTarget.dataset.fileUrl, e.currentTarget.dataset.fileName, e.currentTarget.dataset.fileExt || '');
            });
        });
    }
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

async function handleSubmitApproval(onSuccess) {
    try {
        await submitApproval(offerId);
        showNotification('Onaya gönderildi', 'success');
        await onSuccess();
    } catch (e) {
        showNotification(parseError(e, 'Onaya gönderilirken hata oluştu'), 'error');
    }
}

function showSubmitApprovalConfirm(onSuccess) {
    if (!approvalConfirmModal) return;
    approvalConfirmModal.show({
        message: 'Teklifi onaya göndermek istediğinize emin misiniz?',
        onConfirm: () => handleSubmitApproval(onSuccess)
    });
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
    try {
        await submitToCustomer(offerId);
        showNotification('Müşteriye gönderildi', 'success');
        await onSuccess();
    } catch (e) {
        showNotification(parseError(e, 'Gönderim hatası'), 'error');
    }
}

function showSubmitCustomerConfirm(onSuccess) {
    if (!submitCustomerConfirmModal) return;
    submitCustomerConfirmModal.show({
        message: 'Teklifi müşteriye göndermek istediğinize emin misiniz?',
        onConfirm: () => handleSubmitCustomer(onSuccess)
    });
}

function showActionConfirm(options) {
    if (!actionConfirmModal) return;
    actionConfirmModal.show({
        title: options.title || 'Onay',
        message: options.message || 'Bu işlemi yapmak istediğinize emin misiniz?',
        onConfirm: options.onConfirm
    });
}

function handleConvert(onSuccess) {
    showActionConfirm({
        message: 'Teklifi iş emrine dönüştürmek istediğinize emin misiniz?',
        onConfirm: async () => {
            try {
                const result = await convertToJobOrder(offerId);
                showNotification(`İş emrine dönüştürüldü: ${result.job_no}`, 'success');
                await onSuccess();
            } catch (e) {
                showNotification(parseError(e, 'Dönüşüm hatası'), 'error');
            }
        }
    });
}

function handleStatusAction(action, successMessage, onSuccess) {
    showActionConfirm({
        message: 'Bu işlemi gerçekleştirmek istediğinize emin misiniz?',
        onConfirm: async () => {
            try {
                await action(offerId);
                showNotification(successMessage, 'success');
                await onSuccess();
            } catch (e) {
                showNotification(parseError(e, 'İşlem hatası'), 'error');
            }
        }
    });
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
    createOfferModal.addField({ id: 'incoterms', name: 'incoterms', label: 'Incoterms', type: 'dropdown', options: INCOTERMS_OPTIONS, icon: 'fas fa-shipping-fast', colSize: 6 });
    createOfferModal.addField({ id: 'delivery_date_requested', name: 'delivery_date_requested', label: 'İstenen Termin Tarihi', type: 'date', icon: 'fas fa-calendar-alt', colSize: 6 });
    createOfferModal.addField({ id: 'offer_expiry_date', name: 'offer_expiry_date', label: 'Teklif Sunumu için Son Tarih', type: 'date', icon: 'fas fa-calendar-check', colSize: 6 });
    createOfferModal.render();
    createOfferModal.show();
}
