import { guardRoute, getUser, isAdmin } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { fetchMachineFaults, createMaintenanceRequest, deleteMaintenanceRequest } from '../../../apis/maintenance.js';
import { fetchStaffActivityReport } from '../../../apis/maintenance/reports.js';
import { fetchMachinesDropdown } from '../../../apis/machines.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';

let allFaults = [];
let filteredFaults = [];
let headerComponent, statisticsCards, filtersComponent, tableComponent, createFaultModal, deleteFaultModal;
let viewFaultModal;
let currentPage = 1;
let itemsPerPage = 20;
let totalItems = 0;
let currentFilters = {};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();
    initializeComponents();
    // Load machines and resolvers in parallel for filter dropdowns
    await Promise.all([loadMachinesForFilter(), loadResolversForFilter()]);
    await loadFaultRequests();
});

function initializeComponents() {
    headerComponent = new HeaderComponent({
        title: 'Arıza Talepleri',
        subtitle: 'Tüm arıza taleplerini görüntüleyin ve yönetin',
        icon: 'exclamation-triangle',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Arıza Talebi',
        backUrl: '/manufacturing/maintenance',
        onCreateClick: () => {
            createFaultModal.show();
            setTimeout(resetCreateFaultFormState, 150);
        }
    });

    statisticsCards = new StatisticsCards('statistics-container', {
        cards: [
            { title: 'Toplam',        value: 0, icon: 'exclamation-triangle', color: 'primary', trend: null },
            { title: 'Bekleyen',      value: 0, icon: 'clock',               color: 'warning', trend: null },
            { title: 'Makine Duruşu', value: 0, icon: 'stop-circle',         color: 'danger',  trend: null },
            { title: 'Çözüldü',       value: 0, icon: 'check-circle',        color: 'success', trend: null }
        ]
    });

    filtersComponent = new FiltersComponent('filters-container', {
        title: 'Filtreler',
        onApply: applyFilters,
        onClear: clearFilters
    });

    // Status
    filtersComponent.addSelectFilter({
        id: 'statusFilter',
        label: 'Durum',
        options: [
            { value: '',      label: 'Tümü' },
            { value: 'false', label: 'Çözülmemiş' },
            { value: 'true',  label: 'Çözüldü' }
        ],
        value: 'false',
        colSize: 2
    });

    // Type (breaking / maintenance / all)
    filtersComponent.addSelectFilter({
        id: 'typeFilter',
        label: 'Tür',
        options: [
            { value: '',            label: 'Tümü' },
            { value: 'breaking',    label: 'Makine Duruşu' },
            { value: 'maintenance', label: 'Bakım' },
            { value: 'fault',       label: 'Arıza (Duruşsuz)' }
        ],
        colSize: 2
    });

    // Machine (populated async)
    filtersComponent.addSelectFilter({
        id: 'machineFilter',
        label: 'Ekipman',
        options: [{ value: '', label: 'Tümü' }],
        colSize: 2
    });

    // Resolved by (populated async)
    filtersComponent.addSelectFilter({
        id: 'resolvedByFilter',
        label: 'Çözen Kişi',
        options: [{ value: '', label: 'Tümü' }],
        colSize: 2
    });

    // Date from
    filtersComponent.addTextFilter({
        id: 'dateFrom',
        label: 'Başlangıç Tarihi',
        type: 'date',
        placeholder: '',
        colSize: 2
    });

    // Date to
    filtersComponent.addTextFilter({
        id: 'dateTo',
        label: 'Bitiş Tarihi',
        type: 'date',
        placeholder: '',
        colSize: 2
    });

    // Default filter: unresolved
    currentFilters = { unresolved: true };

    tableComponent = new TableComponent('table-container', {
        title: 'Arıza Talepleri',
        columns: [
            {
                field: 'id',
                label: 'ID',
                sortable: true,
                formatter: (v) => `<span style="font-weight:700;color:#0d6efd;font-family:'Courier New',monospace;font-size:.95rem;
                    background:rgba(13,110,253,.1);padding:.2rem .5rem;border-radius:4px;border:1px solid rgba(13,110,253,.2);">${v ? escapeHtml(v) : '-'}</span>`
            },
            {
                field: 'machine_name',
                label: 'Ekipman',
                sortable: true,
                formatter: (v, row) => {
                    const name = v?.trim() || (row.asset_name
                        ? (row.location ? `${row.asset_name} — ${row.location}` : row.asset_name)
                        : '-');
                    return `<span style="font-weight:500;color:#495057;">${escapeHtml(name)}</span>`;
                }
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: false,
                formatter: (v) => {
                    if (!v?.trim()) return '-';
                    const t = v.length > 80 ? v.substring(0, 80) + '…' : v;
                    return `<span title="${escapeHtml(v)}">${escapeHtml(t)}</span>`;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (v, row) => getStatusBadge(row)
            },
            {
                field: 'is_breaking',
                label: 'Tür',
                sortable: true,
                formatter: (v, row) => getTypeBadge(row)
            },
            {
                field: 'reported_by_full_name',
                label: 'Bildiren',
                sortable: true,
                formatter: (v, row) => `
                    <div style="font-weight:500;color:#495057;">
                        <i class="fas fa-user-circle me-1 text-muted"></i>
                        ${escapeHtml(v || row.reported_by_username || 'Bilinmiyor')}
                    </div>`
            },
            {
                field: 'reported_at',
                label: 'Bildirilme',
                sortable: true,
                type: 'date'
            },
            {
                field: 'open_duration_seconds',
                label: 'Açık Süre',
                sortable: true,
                formatter: (v, row) => formatOpenDuration(row)
            },
            {
                field: 'resolved_by_full_name',
                label: 'Çözen',
                sortable: true,
                formatter: (v, row) => {
                    const name = v || row.resolved_by_username;
                    if (!name) return '<span class="text-muted">—</span>';
                    return `<span style="font-weight:500;"><i class="fas fa-user-check me-1 text-success"></i>${escapeHtml(name)}</span>`;
                }
            },
            {
                field: 'resolved_at',
                label: 'Çözüm Tarihi',
                sortable: true,
                type: 'date'
            },
            {
                field: 'actions',
                label: 'İşlemler',
                sortable: false,
                formatter: (v, row) => getActionButtons(row)
            }
        ],
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        refreshable: true,
        exportable: true,
        onRefresh: loadFaultRequests,
        onPageChange: (page) => { currentPage = page; loadFaultRequests(); },
        onPageSizeChange: (size) => {
            itemsPerPage = size;
            if (tableComponent) tableComponent.options.itemsPerPage = size;
            currentPage = 1;
            loadFaultRequests();
        },
        emptyMessage: 'Arıza talebi bulunamadı',
        emptyIcon: 'fas fa-exclamation-triangle',
        skeleton: true,
        loading: true
    });

    initializeCreateFaultModal();
    initializeDeleteFaultModal();
    initializeViewFaultModal();
}

// ── Filter data loaders ───────────────────────────────────────────────────────

async function loadMachinesForFilter() {
    try {
        const machines = await fetchMachinesDropdown();
        const opts = [{ value: '', label: 'Tümü' }, ...machines.map(m => ({ value: String(m.id), label: m.name }))];
        filtersComponent.updateFilterOptions('machineFilter', opts);
    } catch (e) {
        console.error('Machine filter load error:', e);
    }
}

async function loadResolversForFilter() {
    try {
        const staff = await fetchStaffActivityReport();
        // Only show staff who actually resolved at least one fault
        const resolvers = staff.filter(s => s.faults_resolved_count > 0);
        const opts = [
            { value: '', label: 'Tümü' },
            ...resolvers.map(s => ({ value: String(s.user_id), label: s.full_name || s.username }))
        ];
        filtersComponent.updateFilterOptions('resolvedByFilter', opts);
    } catch (e) {
        console.error('Resolver filter load error:', e);
    }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadFaultRequests() {
    try {
        tableComponent.setLoading(true);
        const pageSize = tableComponent ? tableComponent.options.itemsPerPage : itemsPerPage;
        const apiFilters = { page: currentPage, page_size: pageSize, ...currentFilters };
        const response = await fetchMachineFaults(apiFilters);

        if (response.results) {
            allFaults = response.results;
            totalItems = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            allFaults = response;
            totalItems = response.length;
        } else {
            allFaults = [];
            totalItems = 0;
        }

        filteredFaults = [...allFaults];
        updateStatistics();
        updateTableData();
    } catch (error) {
        console.error('Error loading fault requests:', error);
        showAlert('Arıza talepleri yüklenirken hata oluştu.', 'danger');
        allFaults = [];
        totalItems = 0;
        updateTableData();
    } finally {
        tableComponent.setLoading(false);
    }
}

function updateStatistics() {
    const total      = allFaults.length;
    const pending    = allFaults.filter(f => !f.resolved_at && !f.is_breaking).length;
    const breaking   = allFaults.filter(f => f.is_breaking && !f.resolved_at).length;
    const resolved   = allFaults.filter(f => f.resolved_at).length;
    statisticsCards.updateValues({ 0: total, 1: pending, 2: breaking, 3: resolved });
}

function updateTableData() {
    tableComponent.updateData(filteredFaults, totalItems, currentPage);
}

// ── Filters ───────────────────────────────────────────────────────────────────

function applyFilters() {
    const v = filtersComponent.getFilterValues();
    currentFilters = {};

    // Status
    if (v.statusFilter === 'true' || v.statusFilter === 'false') {
        currentFilters.unresolved = v.statusFilter === 'false';
    }

    // Type
    if (v.typeFilter === 'breaking') {
        currentFilters.is_breaking = true;
    } else if (v.typeFilter === 'maintenance') {
        currentFilters.is_maintenance = true;
    } else if (v.typeFilter === 'fault') {
        currentFilters.is_breaking = false;
        currentFilters.is_maintenance = false;
    }

    // Machine (numeric id)
    if (v.machineFilter) {
        currentFilters.machine_id = v.machineFilter;
    }

    // Resolved by (user id)
    if (v.resolvedByFilter) {
        currentFilters.resolved_by = v.resolvedByFilter;
    }

    // Date range
    if (v.dateFrom) currentFilters.reported_after = v.dateFrom;
    if (v.dateTo)   currentFilters.reported_before = v.dateTo;

    currentPage = 1;
    loadFaultRequests();
}

function clearFilters() {
    filtersComponent.clearFilters();
    currentFilters = {};
    currentPage = 1;
    loadFaultRequests();
}

// ── Badge / formatter helpers ─────────────────────────────────────────────────

function getStatusBadge(fault) {
    if (fault.resolved_at)  return '<span class="status-badge status-green">Çözüldü</span>';
    if (fault.is_breaking)  return '<span class="status-badge status-red">Makine Duruşta</span>';
    return '<span class="status-badge status-yellow">Bekleyen</span>';
}

function getTypeBadge(fault) {
    if (fault.is_breaking)   return '<span class="badge bg-danger">Duruş</span>';
    if (fault.is_maintenance) return '<span class="badge bg-warning text-dark">Bakım</span>';
    return '<span class="badge bg-secondary">Arıza</span>';
}

function formatOpenDuration(fault) {
    if (!fault.reported_at) return '-';

    const startMs = new Date(fault.reported_at).getTime();
    const endMs   = fault.resolved_at ? new Date(fault.resolved_at).getTime() : Date.now();
    const totalSec = Math.floor((endMs - startMs) / 1000);

    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);

    const parts = [];
    if (d) parts.push(`${d}g`);
    if (h) parts.push(`${h}s`);
    if (m || parts.length === 0) parts.push(`${m}d`);
    const duration = parts.join(' ');

    if (fault.resolved_at) {
        return `<span class="text-muted" title="Açıkken geçen süre">${duration}</span>`;
    }
    // Still open — colour-code by urgency
    const hours = totalSec / 3600;
    const color  = hours > 24 ? '#dc3545' : hours > 8 ? '#fd7e14' : '#198754';
    return `<span style="color:${color};font-weight:600;" title="Hâlâ açık">${duration} <i class="fas fa-circle" style="font-size:.45rem;vertical-align:middle;"></i></span>`;
}

// ── Action buttons ────────────────────────────────────────────────────────────

function getActionButtons(row) {
    const btns = [];
    btns.push(`
        <button class="btn btn-outline-primary btn-sm" onclick="showFaultDetails(${row.id})" title="Detayları görüntüle">
            <i class="fas fa-eye"></i>
        </button>`);
    if (canDeleteRequest(row)) {
        btns.push(`
            <button class="btn btn-outline-danger btn-sm" onclick="showDeleteFaultModal(${row.id})" title="Arıza talebini sil">
                <i class="fas fa-trash"></i>
            </button>`);
    }
    if (!btns.length) return '-';
    return `<div class="d-inline-flex align-items-center gap-1">${btns.join('')}</div>`;
}

function canDeleteRequest(row) {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.is_superuser || user.is_admin) return true;
        return row.reported_by === user.id && !row.resolved_at;
    } catch {
        return false;
    }
}

// ── Create fault modal ────────────────────────────────────────────────────────

function initializeCreateFaultModal() {
    createFaultModal = new EditModal('create-fault-modal-container', {
        title: 'Yeni Arıza Talebi',
        icon: 'fas fa-exclamation-triangle',
        saveButtonText: 'Gönder',
        size: 'lg'
    });

    createFaultModal
        .addSection({
            title: 'Ekipman Seçimi',
            icon: 'fas fa-cog',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'use_custom_equipment', name: 'use_custom_equipment',
                    label: 'Özel Ekipman Bilgisi Gir', type: 'checkbox', required: false, colSize: 12,
                    helpText: 'Kayıtlı olmayan ekipman için özel bilgi girmek istiyorsanız işaretleyin'
                },
                {
                    id: 'machine', name: 'machine', label: 'Kayıtlı Ekipman', type: 'dropdown',
                    placeholder: 'Ekipman seçin...', required: true, icon: 'fas fa-cog', colSize: 12,
                    searchable: true, options: []
                },
                {
                    id: 'asset_name', name: 'asset_name', label: 'Ekipman Adı', type: 'text',
                    placeholder: 'Ekipman adını girin...', required: false, icon: 'fas fa-tag', colSize: 6,
                    style: 'display: none;'
                },
                {
                    id: 'location', name: 'location', label: 'Konum', type: 'text',
                    placeholder: 'Ekipman konumunu girin...', required: false, icon: 'fas fa-map-marker-alt',
                    colSize: 6, style: 'display: none;'
                }
            ]
        })
        .addSection({
            title: 'Arıza Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'description', name: 'description', label: 'Açıklama', type: 'textarea',
                    placeholder: 'Arıza veya bakım detaylarını açıklayın', required: true,
                    icon: 'fas fa-align-left', colSize: 12, rows: 4
                },
                {
                    id: 'type', name: 'type', label: 'Tür', type: 'dropdown',
                    placeholder: 'Tür seçin...', required: true, icon: 'fas fa-tools', colSize: 12,
                    searchable: false,
                    options: [
                        { value: 'fault', label: 'Arıza' },
                        { value: 'maintenance', label: 'Bakım' }
                    ]
                },
                {
                    id: 'is_breaking', name: 'is_breaking', label: 'Makine durdu', type: 'checkbox',
                    required: false, colSize: 12, helpText: 'Ekipman arıza nedeniyle çalışmıyorsa işaretleyin'
                }
            ]
        })
        .render();

    createFaultModal
        .onSaveCallback(handleCreateFaultSubmit)
        .onCancelCallback(handleCreateFaultCancel);

    loadMachinesForModal();
    setupTypeBreakingInteraction();
    createFaultModal.modal.addEventListener('shown.bs.modal', () => resetCreateFaultFormState());
    setupEquipmentTypeInteraction();
}

function initializeDeleteFaultModal() {
    deleteFaultModal = new DisplayModal('delete-fault-modal-container', {
        title: 'Arıza Talebi Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });
}

function initializeViewFaultModal() {
    viewFaultModal = new DisplayModal('view-fault-modal-container', {
        title: 'Arıza Talebi',
        icon: 'fas fa-eye',
        size: 'lg',
        showEditButton: false
    });
}

async function loadMachinesForModal() {
    try {
        const machines = await fetchMachinesDropdown();
        const opts = machines.map(m => ({ value: m.id.toString(), text: m.name }));
        setTimeout(() => {
            const dd = createFaultModal.dropdowns.get('machine');
            if (dd) dd.setItems(opts);
        }, 300);
    } catch (e) {
        console.error('Error loading machines for modal:', e);
    }
}

async function handleCreateFaultSubmit(formData) {
    try {
        if (!formData.description?.trim()) { showAlert('Açıklama zorunludur', 'warning'); return; }
        if (!formData.type)                { showAlert('Tür seçimi zorunludur', 'warning'); return; }

        const useCustom = formData.use_custom_equipment === 'on' || formData.use_custom_equipment === true;
        if (!useCustom) {
            if (!formData.machine) { showAlert('Kayıtlı ekipman seçimi zorunludur', 'warning'); return; }
        } else {
            if (!formData.asset_name?.trim()) { showAlert('Ekipman adı zorunludur', 'warning'); return; }
            if (!formData.location?.trim())   { showAlert('Konum bilgisi zorunludur', 'warning'); return; }
        }

        const submitData = {
            description: formData.description.trim(),
            is_maintenance: formData.type === 'maintenance',
            is_breaking: formData.type !== 'maintenance' && !!formData.is_breaking
        };
        if (useCustom) {
            submitData.asset_name = formData.asset_name.trim();
            submitData.location   = formData.location.trim();
        } else {
            submitData.machine = parseInt(formData.machine);
        }

        await createMaintenanceRequest(submitData);
        showAlert('Arıza talebi başarıyla oluşturuldu!', 'success');
        createFaultModal.hide();
        resetCreateFaultFormState();
        await loadFaultRequests();
    } catch (error) {
        showAlert('Arıza talebi oluşturulurken hata oluştu: ' + error.message, 'danger');
    }
}

function handleCreateFaultCancel() {
    createFaultModal.clearForm();
    setTimeout(resetCreateFaultFormState, 100);
}

function setCreateFaultFieldRequired(fieldId, required) {
    const f = createFaultModal.fields.get(fieldId);
    if (f) { f.required = required; createFaultModal.fields.set(fieldId, f); }
}

function syncCreateFaultFieldRequirements() {
    const container = createFaultModal.container;
    const useCustom = container.querySelector('input[name="use_custom_equipment"]')?.checked;
    const typeValue = createFaultModal.getFieldValue('type');
    setCreateFaultFieldRequired('machine',    !useCustom);
    setCreateFaultFieldRequired('asset_name',  !!useCustom);
    setCreateFaultFieldRequired('location',    !!useCustom);
    toggleBreakingCheckbox(typeValue !== 'maintenance');
}

function resetCreateFaultFormState() {
    const cb = createFaultModal.container.querySelector('input[name="use_custom_equipment"]');
    if (cb) cb.checked = false;
    toggleCustomEquipmentFields(false);
    syncCreateFaultFieldRequirements();
}

function setupTypeBreakingInteraction() {
    setTimeout(() => {
        const tc = createFaultModal.container.querySelector('#dropdown-type');
        if (tc) {
            tc.addEventListener('dropdown:select', (e) => toggleBreakingCheckbox(e.detail.value !== 'maintenance'));
        }
        syncCreateFaultFieldRequirements();
    }, 500);
}

function toggleBreakingCheckbox(show) {
    const container = createFaultModal.container;
    const field = container.querySelector('[data-field-id="is_breaking"]');
    const cb    = container.querySelector('input[name="is_breaking"]');
    if (field) field.style.display = show ? '' : 'none';
    if (!show && cb) cb.checked = false;
}

function setupEquipmentTypeInteraction() {
    setTimeout(() => {
        const cb = createFaultModal.container.querySelector('input[name="use_custom_equipment"]');
        if (cb) {
            cb.removeEventListener('change', handleCheckboxChange);
            cb.addEventListener('change', handleCheckboxChange);
            toggleCustomEquipmentFields(cb.checked);
        }
    }, 1000);
}

function handleCheckboxChange(e) { toggleCustomEquipmentFields(e.target.checked); }

function toggleCustomEquipmentFields(showCustom) {
    const c = createFaultModal.container;
    const machineField    = c.querySelector('[data-field-id="machine"]');
    const assetNameField  = c.querySelector('[data-field-id="asset_name"]');
    const locationField   = c.querySelector('[data-field-id="location"]');

    if (showCustom) {
        if (machineField)   { machineField.style.display = 'none'; const inp = machineField.querySelector('input,select'); if (inp) { inp.required = false; inp.value = ''; } }
        if (assetNameField) { assetNameField.style.display = 'block'; const inp = assetNameField.querySelector('input'); if (inp) inp.required = true; }
        if (locationField)  { locationField.style.display = 'block';  const inp = locationField.querySelector('input');  if (inp) inp.required = true; }
    } else {
        if (machineField)   { machineField.style.display = 'block';  const inp = machineField.querySelector('input,select'); if (inp) inp.required = true; }
        if (assetNameField) { assetNameField.style.display = 'none'; const inp = assetNameField.querySelector('input'); if (inp) { inp.required = false; inp.value = ''; } }
        if (locationField)  { locationField.style.display = 'none';  const inp = locationField.querySelector('input');  if (inp) { inp.required = false; inp.value = ''; } }
    }
    syncCreateFaultFieldRequirements();
}

// ── View fault details modal ──────────────────────────────────────────────────

function showFaultDetails(faultId) {
    const fault = allFaults.find(f => f.id === faultId);
    if (!fault) { showAlert('Kayıt bulunamadı', 'danger'); return; }

    const machineDisplay = fault.machine_name
        || (fault.asset_name && fault.location ? `${fault.asset_name} - ${fault.location}` : fault.asset_name)
        || '-';

    // Compute open duration
    const openDurationHtml = buildOpenDurationText(fault);

    viewFaultModal.clearData();
    viewFaultModal.setTitle(`Arıza Talebi #${fault.id}`);

    viewFaultModal.addSection({ title: 'Genel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    viewFaultModal.addField({ id: 'vf-id',       label: 'ID',          type: 'text', value: fault.id,   icon: 'fas fa-hashtag',    colSize: 3, layout: 'horizontal' });
    viewFaultModal.addField({ id: 'vf-status',   label: 'Durum',       type: 'text', value: fault.resolved_at ? 'Çözüldü' : (fault.is_breaking ? 'Makine Duruşta' : 'Bekleyen'), icon: 'fas fa-flag', colSize: 4, layout: 'horizontal' });
    viewFaultModal.addField({ id: 'vf-type',     label: 'Tür',         type: 'text', value: fault.is_breaking ? 'Duruş' : (fault.is_maintenance ? 'Bakım' : 'Arıza'), icon: 'fas fa-tools', colSize: 5, layout: 'horizontal' });

    viewFaultModal.addSection({ title: 'Ekipman', icon: 'fas fa-cogs', iconColor: 'text-primary' });
    viewFaultModal.addField({ id: 'vf-machine',  label: 'Ekipman',     type: 'text', value: machineDisplay, icon: 'fas fa-cog', colSize: 12 });

    viewFaultModal.addSection({ title: 'Açıklamalar', icon: 'fas fa-align-left', iconColor: 'text-primary' });
    viewFaultModal.addField({ id: 'vf-desc',     label: 'Açıklama',    type: 'text', value: fault.description || '-', icon: 'fas fa-file-alt', colSize: 12 });
    if (fault.resolution_description) {
        viewFaultModal.addField({ id: 'vf-res', label: 'Çözüm Açıklaması', type: 'text', value: fault.resolution_description, icon: 'fas fa-check-circle', colSize: 12 });
    }

    viewFaultModal.addSection({ title: 'Zaman & Kullanıcı', icon: 'fas fa-user-clock', iconColor: 'text-primary' });
    viewFaultModal.addField({ id: 'vf-rep-by', label: 'Bildiren',          type: 'text',     value: fault.reported_by_full_name || fault.reported_by_username || '-',  icon: 'fas fa-user',       colSize: 6, layout: 'horizontal' });
    viewFaultModal.addField({ id: 'vf-rep-at', label: 'Bildirilme Tarihi', type: 'datetime', value: fault.reported_at || '-',                                           icon: 'fas fa-calendar-plus', colSize: 6, layout: 'horizontal' });
    viewFaultModal.addField({ id: 'vf-res-by', label: 'Çözen',             type: 'text',     value: fault.resolved_by_full_name || fault.resolved_by_username || '-',  icon: 'fas fa-user-check', colSize: 6, layout: 'horizontal' });
    viewFaultModal.addField({ id: 'vf-res-at', label: 'Çözüm Tarihi',     type: 'datetime', value: fault.resolved_at || '-',                                           icon: 'fas fa-calendar-check', colSize: 6, layout: 'horizontal' });
    viewFaultModal.addField({ id: 'vf-dur',    label: 'Açık Süre',         type: 'text',     value: openDurationHtml,                                                   icon: 'fas fa-hourglass-half', colSize: 12, layout: 'horizontal' });

    viewFaultModal.render();
    viewFaultModal.show();
}

function buildOpenDurationText(fault) {
    if (!fault.reported_at) return '-';
    const startMs   = new Date(fault.reported_at).getTime();
    const endMs     = fault.resolved_at ? new Date(fault.resolved_at).getTime() : Date.now();
    const totalSec  = Math.floor((endMs - startMs) / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d} gün`);
    if (h) parts.push(`${h} saat`);
    if (m || parts.length === 0) parts.push(`${m} dakika`);
    const label = parts.join(' ');
    return fault.resolved_at ? label : `${label} (hâlâ açık)`;
}

// ── Delete modal ──────────────────────────────────────────────────────────────

function showDeleteFaultModal(requestId) {
    const request = allFaults.find(f => f.id === requestId);
    if (!request) { showAlert('Arıza talebi bulunamadı', 'danger'); return; }
    window.pendingDeleteRequestId = requestId;

    deleteFaultModal.clearData();
    deleteFaultModal.addSection({ title: 'Silme Onayı', icon: 'fas fa-exclamation-triangle', iconColor: 'text-danger' });
    deleteFaultModal.addField({ id: 'del-warn', name: 'warning', label: 'Uyarı', type: 'text', value: 'Bu arıza talebini silmek istediğinize emin misiniz?', icon: 'fas fa-exclamation-triangle', colSize: 12 });
    deleteFaultModal.addField({ id: 'del-eq',   name: 'eq',      label: 'Ekipman', type: 'text', value: request.machine_name || request.asset_name || 'Bilinmeyen Ekipman', icon: 'fas fa-cogs', colSize: 12 });
    if (request.description) {
        deleteFaultModal.addField({ id: 'del-desc', name: 'desc', label: 'Açıklama', type: 'text', value: request.description.length > 100 ? request.description.substring(0, 100) + '...' : request.description, icon: 'fas fa-align-left', colSize: 12 });
    }
    deleteFaultModal.addField({ id: 'del-perm', name: 'perm', label: 'Dikkat', type: 'text', value: 'Bu işlem geri alınamaz.', icon: 'fas fa-trash', colSize: 12 });

    deleteFaultModal.render();

    const footer = deleteFaultModal.container.querySelector('.modal-footer');
    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>İptal</button>
            <button type="button" class="btn btn-sm btn-danger" id="confirm-delete-fault-btn"><i class="fas fa-trash me-1"></i>Evet, Sil</button>
        `;
        footer.querySelector('#confirm-delete-fault-btn').addEventListener('click', () => deleteRequest(requestId));
    }

    deleteFaultModal.show();
}

async function deleteRequest(requestId) {
    try {
        await deleteMaintenanceRequest(requestId);
        showAlert('Arıza talebi başarıyla silindi!', 'success');
        deleteFaultModal.hide();
        await loadFaultRequests();
    } catch (error) {
        showAlert('Arıza talebi silinirken hata oluştu: ' + error.message, 'danger');
    }
}

// ── Alert helper ──────────────────────────────────────────────────────────────

function showAlert(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    div.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:300px;';
    div.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 5000);
}

// ── Global onclick handlers ───────────────────────────────────────────────────
window.showFaultDetails    = showFaultDetails;
window.showDeleteFaultModal = showDeleteFaultModal;
