import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    listEquipmentItems,
    createEquipmentItem,
    patchEquipmentItem,
    deleteEquipmentItem
} from '../../../apis/equipment/index.js';

let headerComponent;
let equipmentStats = null;
let equipmentFilters = null;
let equipmentTable = null;

let createEquipmentModal = null;
let editEquipmentModal = null;
let displayEquipmentModal = null;
let deleteEquipmentModal = null;

let items = [];
let currentPage = 1;
let totalItems = 0;
let isLoading = false;
let currentSortField = null;
let currentSortDirection = 'asc';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    initHeaderComponent();

    equipmentStats = new StatisticsCards('equipment-statistics', {
        cards: [
            { title: 'Toplam Ekipman', value: '0', icon: 'fas fa-toolbox', color: 'primary', id: 'total-equipment' },
            { title: 'Aktif', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-equipment' },
            { title: 'Tip', value: '0', icon: 'fas fa-tags', color: 'info', id: 'equipment-types' },
            { title: 'Bu Sayfa', value: '0', icon: 'fas fa-list', color: 'warning', id: 'page-items' }
        ],
        compact: true,
        animation: true
    });

    initializeModalComponents();
    initializeFiltersComponent();
    initializeTableComponent();
    setupEventListeners();

    await loadEquipmentData();
});

function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Ekipman Yönetimi',
        subtitle: 'Ekipman envanteri ve durum yönetimi',
        icon: 'toolbox',
        showBackButton: 'block',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Ekipman',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/planning/inventory/',
        onCreateClick: () => showCreateEquipmentModal(),
        onRefreshClick: async () => {
            currentPage = 1;
            await loadEquipmentData();
        }
    });
}

function initializeModalComponents() {
    createEquipmentModal = new EditModal('create-equipment-modal-container', {
        title: 'Yeni Ekipman Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Oluştur',
        size: 'lg'
    });

    editEquipmentModal = new EditModal('edit-equipment-modal-container', {
        title: 'Ekipman Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });

    displayEquipmentModal = new DisplayModal('display-equipment-modal-container', {
        title: 'Ekipman Detayı',
        icon: 'fas fa-toolbox',
        showEditButton: true,
        editButtonText: 'Düzenle',
        size: 'lg'
    });

    deleteEquipmentModal = new DisplayModal('delete-equipment-modal-container', {
        title: 'Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    createEquipmentModal.onSaveCallback(async (formData) => {
        await saveEquipment(formData);
    });

    editEquipmentModal.onSaveCallback(async (formData) => {
        await updateEquipment(formData);
    });

    displayEquipmentModal.onEditCallback(() => {
        displayEquipmentModal.hide();
        const id = window.currentDisplayedEquipmentId;
        if (id != null) window.editEquipment(id);
    });

    deleteEquipmentModal.onCloseCallback(() => {
        window.pendingDeleteEquipmentId = null;
    });
}

function initializeFiltersComponent() {
    equipmentFilters = new FiltersComponent('filters-placeholder', {
        title: 'Ekipman Filtreleri',
        onApply: () => {
            currentPage = 1;
            loadEquipmentData();
        },
        onClear: () => {
            currentPage = 1;
            loadEquipmentData();
        }
    });

    equipmentFilters.addTextFilter({
        id: 'name-filter',
        label: 'Ad',
        placeholder: 'Ekipman adı',
        colSize: 4
    });

    equipmentFilters.addTextFilter({
        id: 'asset-type-filter',
        label: 'Tip',
        placeholder: 'Örn: instrument',
        colSize: 4
    });

    equipmentFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 4
    });
}

function initializeTableComponent() {
    equipmentTable = new TableComponent('equipment-table-container', {
        title: 'Ekipman Listesi',
        columns: [
            { field: 'id', label: 'ID', sortable: true, type: 'number', skeletonWidth: 50, formatter: (v) => v ?? '-' },
            { field: 'code', label: 'Kod', sortable: true, formatter: (v) => v || '-' },
            { field: 'name', label: 'Ad', sortable: true, formatter: (v) => `<strong>${v || '-'}</strong>` },
            { field: 'asset_type', label: 'Tip', sortable: true, formatter: (v) => v || '-' },
            { field: 'category', label: 'Kategori', sortable: true, formatter: (v) => v || '-' },
            { field: 'location', label: 'Lokasyon', sortable: true, formatter: (v) => v || '-' },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                formatter: (v) => (v ?? '-')
            },
            {
                field: 'available_quantity',
                label: 'Uygun',
                sortable: true,
                formatter: (v) => (v ?? '-')
            },
            {
                field: 'checked_out_quantity',
                label: 'Zimmetli',
                sortable: true,
                formatter: (v) => (v ?? '-')
            },
            {
                field: 'is_active',
                label: 'Aktif',
                sortable: true,
                type: 'boolean',
                skeletonWidth: 60,
                formatter: (value) => (value ? '<span class="bool-indicator bool-yes">✓</span>' : '<span class="bool-indicator bool-no">✗</span>')
            },
            {
                field: 'detail',
                label: 'Detay',
                sortable: false,
                formatter: (_v, row) => `
                    <button class="btn btn-sm btn-outline-info" type="button" onclick="window.showEquipmentDetail(${row.id})">
                        <i class="fas fa-eye me-1"></i>Görüntüle
                    </button>
                `
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            currentPage = 1;
            await loadEquipmentData();
        },
        onSort: async (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            currentPage = 1;
            await loadEquipmentData();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadEquipmentData();
        },
        onPageSizeChange: async (newSize) => {
            if (equipmentTable) equipmentTable.options.itemsPerPage = newSize;
            currentPage = 1;
            await loadEquipmentData();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => window.editEquipment(row.id)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => window.deleteEquipment(row.id, row.name)
            }
        ],
        emptyMessage: 'Ekipman bulunamadı',
        emptyIcon: 'fas fa-toolbox'
    });
}

function collectFilterParams() {
    if (!equipmentFilters) return {};
    const v = equipmentFilters.getFilterValues();

    const params = {};
    if (v['name-filter']) params.name = v['name-filter'];
    if (v['asset-type-filter']) params.asset_type = v['asset-type-filter'];
    if (v['status-filter'] !== undefined && v['status-filter'] !== '') params.is_active = v['status-filter'];

    // Pagination
    const pageSize = equipmentTable ? equipmentTable.options.itemsPerPage : 20;
    params.page = currentPage;
    params.page_size = pageSize;

    // Ordering
    if (currentSortField) {
        params.ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
    }

    return params;
}

async function loadEquipmentData() {
    try {
        if (isLoading) return;
        isLoading = true;
        if (equipmentTable) equipmentTable.setLoading(true);

        const params = collectFilterParams();
        const resp = await listEquipmentItems(params);

        items = resp?.results || resp || [];
        totalItems = resp?.count || resp?.total || (Array.isArray(items) ? items.length : 0);

        if (equipmentTable) equipmentTable.updateData(items, totalItems, currentPage);

        updateStats(resp);
    } catch (e) {
        items = [];
        totalItems = 0;
        if (equipmentTable) equipmentTable.updateData([], 0, currentPage);
        updateStats(null);
        console.error('Error loading equipment:', e);
    } finally {
        isLoading = false;
        if (equipmentTable) equipmentTable.setLoading(false);
    }
}

function updateStats(resp) {
    try {
        const total = resp?.count ?? totalItems ?? 0;
        const active = Array.isArray(items) ? items.filter(i => i?.is_active === true).length : 0;
        const types = new Set((Array.isArray(items) ? items : []).map(i => i?.asset_type).filter(Boolean)).size;
        const pageCount = Array.isArray(items) ? items.length : 0;

        if (equipmentStats) {
            equipmentStats.updateValues({
                0: String(total),
                1: String(active),
                2: String(types),
                3: String(pageCount)
            });
        }
    } catch (_) {
        // ignore
    }
}

function showCreateEquipmentModal() {
    createEquipmentModal.clearAll();

    createEquipmentModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    createEquipmentModal.addField({
        id: 'eq-code',
        name: 'code',
        label: 'Kod',
        type: 'text',
        placeholder: 'Örn: CALIPER-01',
        icon: 'fas fa-barcode',
        colSize: 6
    });

    createEquipmentModal.addField({
        id: 'eq-name',
        name: 'name',
        label: 'Ad',
        type: 'text',
        placeholder: 'Ekipman adı',
        required: true,
        icon: 'fas fa-toolbox',
        colSize: 6
    });

    createEquipmentModal.addField({
        id: 'eq-asset-type',
        name: 'asset_type',
        label: 'Tip',
        type: 'text',
        placeholder: 'Örn: instrument',
        icon: 'fas fa-tags',
        colSize: 6
    });

    createEquipmentModal.addField({
        id: 'eq-category',
        name: 'category',
        label: 'Kategori',
        type: 'text',
        placeholder: 'Örn: Measuring',
        icon: 'fas fa-layer-group',
        colSize: 6
    });

    createEquipmentModal.addField({
        id: 'eq-location',
        name: 'location',
        label: 'Lokasyon',
        type: 'text',
        placeholder: 'Örn: Ambar',
        icon: 'fas fa-location-dot',
        colSize: 6
    });

    createEquipmentModal.addField({
        id: 'eq-quantity',
        name: 'quantity',
        label: 'Adet',
        type: 'number',
        placeholder: 'Örn: 1',
        icon: 'fas fa-hashtag',
        colSize: 6
    });

    createEquipmentModal.addField({
        id: 'eq-status',
        name: 'is_active',
        label: 'Durum',
        type: 'select',
        icon: 'fas fa-info-circle',
        colSize: 6,
        options: [
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        value: 'true'
    });

    createEquipmentModal.addSection({
        title: 'Gelişmiş (Opsiyonel)',
        icon: 'fas fa-code',
        iconColor: 'text-info'
    });

    createEquipmentModal.addField({
        id: 'eq-extra-json',
        name: 'extra_json',
        label: 'Ek Alanlar (JSON)',
        type: 'textarea',
        placeholder: '{"serial":"123","notes":"..."}',
        icon: 'fas fa-code',
        colSize: 12,
        rows: 4,
        help: 'Backend alanları değişebileceği için ek payload alanlarını JSON olarak girebilirsiniz.'
    });

    createEquipmentModal.render();
    createEquipmentModal.show();
}

function showEditEquipmentModal(id) {
    const item = items.find(i => String(i.id) === String(id));
    if (!item) return;

    window.editingEquipmentId = id;

    editEquipmentModal.clearAll();

    editEquipmentModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    editEquipmentModal.addField({
        id: 'edit-eq-code',
        name: 'code',
        label: 'Kod',
        type: 'text',
        icon: 'fas fa-barcode',
        colSize: 6,
        value: item.code || ''
    });

    editEquipmentModal.addField({
        id: 'edit-eq-name',
        name: 'name',
        label: 'Ad',
        type: 'text',
        required: true,
        icon: 'fas fa-toolbox',
        colSize: 6,
        value: item.name || ''
    });

    editEquipmentModal.addField({
        id: 'edit-eq-asset-type',
        name: 'asset_type',
        label: 'Tip',
        type: 'text',
        icon: 'fas fa-tags',
        colSize: 6,
        value: item.asset_type || ''
    });

    editEquipmentModal.addField({
        id: 'edit-eq-category',
        name: 'category',
        label: 'Kategori',
        type: 'text',
        icon: 'fas fa-layer-group',
        colSize: 6,
        value: item.category || ''
    });

    editEquipmentModal.addField({
        id: 'edit-eq-location',
        name: 'location',
        label: 'Lokasyon',
        type: 'text',
        icon: 'fas fa-location-dot',
        colSize: 6,
        value: item.location || ''
    });

    editEquipmentModal.addField({
        id: 'edit-eq-quantity',
        name: 'quantity',
        label: 'Adet',
        type: 'number',
        icon: 'fas fa-hashtag',
        colSize: 6,
        value: item.quantity ?? ''
    });

    editEquipmentModal.addField({
        id: 'edit-eq-status',
        name: 'is_active',
        label: 'Durum',
        type: 'select',
        icon: 'fas fa-info-circle',
        colSize: 6,
        options: [
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        value: item.is_active ? 'true' : 'false'
    });

    editEquipmentModal.addSection({
        title: 'Gelişmiş (Opsiyonel)',
        icon: 'fas fa-code',
        iconColor: 'text-info'
    });

    editEquipmentModal.addField({
        id: 'edit-eq-extra-json',
        name: 'extra_json',
        label: 'Ek Alanlar (JSON)',
        type: 'textarea',
        placeholder: '{"serial":"123"}',
        icon: 'fas fa-code',
        colSize: 12,
        rows: 4,
        value: '',
        help: 'Bu alan doldurulursa PATCH payloadına eklenir.'
    });

    editEquipmentModal.render();
    editEquipmentModal.show();
}

function showEquipmentDetailModal(id) {
    const item = items.find(i => String(i.id) === String(id));
    if (!item) return;

    window.currentDisplayedEquipmentId = id;

    displayEquipmentModal.clearData();
    displayEquipmentModal.addSection({
        title: 'Detay',
        icon: 'fas fa-list',
        iconColor: 'text-primary'
    });

    const entries = Object.entries(item || {});
    if (entries.length === 0) {
        displayEquipmentModal.addField({
            id: 'empty',
            name: 'empty',
            label: 'Bilgi',
            type: 'text',
            value: 'Detay bulunamadı',
            icon: 'fas fa-info-circle',
            colSize: 12
        });
    } else {
        for (const [k, v] of entries) {
            displayEquipmentModal.addField({
                id: `f-${k}`,
                name: k,
                label: k,
                type: 'text',
                value: formatAny(v),
                icon: 'fas fa-tag',
                colSize: 6
            });
        }
    }

    displayEquipmentModal.render();
    displayEquipmentModal.show();
}

function showDeleteEquipmentModal(id, name) {
    window.pendingDeleteEquipmentId = id;

    deleteEquipmentModal.clearData();
    deleteEquipmentModal.addSection({
        title: 'Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-danger'
    });

    deleteEquipmentModal.addField({
        id: 'delete-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu ekipmanı silmek istediğinize emin misiniz?',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });

    deleteEquipmentModal.addField({
        id: 'delete-name',
        name: 'name',
        label: 'Ekipman',
        type: 'text',
        value: name || String(id),
        icon: 'fas fa-toolbox',
        colSize: 12
    });

    deleteEquipmentModal.render();

    const modalFooter = deleteEquipmentModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>İptal
                </button>
                <button type="button" class="btn btn-danger" id="confirm-delete-equipment-btn">
                    <i class="fas fa-trash me-1"></i>Evet, Sil
                </button>
            </div>
        `;
    }

    deleteEquipmentModal.show();
}

function setupEventListeners() {
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'confirm-delete-equipment-btn') {
            const id = window.pendingDeleteEquipmentId;
            if (id == null) return;
            try {
                await deleteEquipmentItem(id);
                deleteEquipmentModal.hide();
                window.pendingDeleteEquipmentId = null;
                await loadEquipmentData();
            } catch (err) {
                console.error('Error deleting equipment:', err);
            }
        }
    });
}

async function saveEquipment(formData) {
    try {
        const payload = buildPayloadFromForm(formData);
        await createEquipmentItem(payload);
        createEquipmentModal.hide();
        await loadEquipmentData();
    } catch (e) {
        console.error('Error creating equipment:', e);
    }
}

async function updateEquipment(formData) {
    const id = window.editingEquipmentId;
    if (id == null) return;
    try {
        const payload = buildPayloadFromForm(formData);
        await patchEquipmentItem(id, payload);
        editEquipmentModal.hide();
        window.editingEquipmentId = null;
        await loadEquipmentData();
    } catch (e) {
        console.error('Error updating equipment:', e);
    }
}

function buildPayloadFromForm(formData) {
    const base = {
        code: formData.code || null,
        name: formData.name,
        asset_type: formData.asset_type || null,
        category: formData.category || null,
        location: formData.location || null,
        is_active: formData.is_active === 'true'
    };

    if (formData.quantity !== undefined && formData.quantity !== '' && formData.quantity !== null) {
        const n = Number(formData.quantity);
        if (!Number.isNaN(n)) base.quantity = n;
    }

    const extraRaw = formData.extra_json;
    if (extraRaw && typeof extraRaw === 'string') {
        try {
            const extra = JSON.parse(extraRaw);
            if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
                return { ...base, ...extra };
            }
        } catch (_) {
            // ignore invalid extra_json
        }
    }
    return base;
}

function formatAny(v) {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
        return JSON.stringify(v, null, 2);
    } catch (_) {
        return String(v);
    }
}

function pickFirstNumber(obj, keys) {
    for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
}

// Global actions
window.editEquipment = function(id) {
    showEditEquipmentModal(id);
};

window.deleteEquipment = function(id, name) {
    showDeleteEquipmentModal(id, name);
};

window.showEquipmentDetail = function(id) {
    showEquipmentDetailModal(id);
};

