import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    fetchPositions,
    fetchPositionById,
    createPosition,
    patchPosition,
    fetchPositionHolders
} from '../../../apis/human_resources/organization.js';
import { fetchAllUsers, updateUser as updateUserAPI } from '../../../apis/users.js';
import { showNotification } from '../../../components/notification/notification.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';

const LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6];

const DEPARTMENT_CODES = [
    { value: 'machining',          label: 'Talaşlı İmalat' },
    { value: 'design',             label: 'Dizayn' },
    { value: 'logistics',          label: 'Lojistik' },
    { value: 'procurement',        label: 'Satın Alma' },
    { value: 'welding',            label: 'Kaynaklı İmalat' },
    { value: 'planning',           label: 'Planlama' },
    { value: 'manufacturing',      label: 'İmalat' },
    { value: 'maintenance',        label: 'Bakım' },
    { value: 'rollingmill',        label: 'Haddehane' },
    { value: 'qualitycontrol',     label: 'Kalite Kontrol' },
    { value: 'cutting',            label: 'CNC Kesim' },
    { value: 'warehouse',          label: 'Ambar' },
    { value: 'finance',            label: 'Finans' },
    { value: 'management',         label: 'Yönetim' },
    { value: 'external_workshops', label: 'Dış Atölyeler' },
    { value: 'human_resources',    label: 'İnsan Kaynakları' },
    { value: 'sales',              label: 'Proje Taahhüt' },
    { value: 'accounting',         label: 'Muhasebe' },
];

const DEPT_CODE_MAP = new Map(DEPARTMENT_CODES.map(d => [d.value, d.label]));

let positions = [];
let users = [];
let positionsTable = null;
let filtersComp = null;
let editModal = null;
let confirmModal = null;
let editingId = null;
let currentDetailId = null;
let currentPosition = null;
let currentHolders = [];
let assignDropdown = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function listFromResponse(data) {
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.results) ? data.results : [];
}

function setStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

function updateStats() {
    const total = positions.length;
    const active = positions.filter(p => p.is_active !== false).length;
    const holders = positions.reduce((sum, p) => sum + Number(p.holder_count || 0), 0);
    const vacant = positions.filter(p => p.is_active !== false && Number(p.holder_count || 0) === 0).length;
    setStat('stat-total', total);
    setStat('stat-active', active);
    setStat('stat-holders', holders);
    setStat('stat-vacant', vacant);
}

function getUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    return {
        department: params.get('department') || '',
        level: params.get('level') || ''
    };
}

function getFiltersFromUI() {
    const values = filtersComp?.getFilterValues?.() || {};
    const filters = {};
    if (values.department) filters.department = values.department;
    if (values.level) filters.level = String(values.level);
    return filters;
}

function getUserDisplayName(u) {
    return ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.username || '-';
}

function clearDetail() {
    currentDetailId = null;
    currentPosition = null;
    currentHolders = [];
    if (assignDropdown) {
        assignDropdown.destroy();
        assignDropdown = null;
    }
    const panel = document.getElementById('position-detail-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div class="text-muted text-center py-4">
            <i class="fas fa-mouse-pointer d-block mb-2 fs-3 text-secondary"></i>
            Detay görmek için listeden bir pozisyon seçin.
        </div>
    `;
}

function renderHoldersHTML(holders, positionId) {
    if (!holders.length) {
        return '<div class="text-muted small py-1">Bu pozisyonda kullanıcı yok.</div>';
    }
    return `<ul class="ps-0 mb-0 list-unstyled">
        ${holders.map(h => `
            <li class="d-flex align-items-center justify-content-between py-1 border-bottom border-light">
                <span class="small">${escapeHtml(h.full_name || h.username || '-')}</span>
                <button
                    class="btn btn-sm btn-outline-danger ms-2 py-0 px-2 remove-holder-btn"
                    data-user-id="${h.id}"
                    title="Pozisyonu Kaldır"
                    style="font-size:0.7rem;line-height:1.4;"
                ><i class="fas fa-times"></i></button>
            </li>
        `).join('')}
    </ul>`;
}

function refreshDetailHolders() {
    const panel = document.getElementById('position-detail-panel');
    if (!panel || !currentPosition) return;

    const statEl = panel.querySelector('.detail-holders-stat');
    if (statEl) statEl.textContent = currentHolders.length;

    const listEl = panel.querySelector('.detail-holders-list');
    if (listEl) {
        listEl.innerHTML = renderHoldersHTML(currentHolders, currentPosition.id);
        bindHolderRemoveButtons(panel);
    }

    // Refresh dropdown items to exclude already-assigned and inactive users
    if (assignDropdown) {
        const selectedIds = assignDropdown.getValue() || [];
        assignDropdown.setItems(
            users
                .filter(u => u.is_active !== false && !currentHolders.some(h => Number(h.id) === Number(u.id)))
                .map(u => ({ value: String(u.id), text: getUserDisplayName(u) }))
        );
        // Restore selection (minus any now-assigned)
        const validSelected = selectedIds.filter(
            sid => !currentHolders.some(h => String(h.id) === sid)
        );
        if (validSelected.length) assignDropdown.setValue(validSelected);
    }

    // Sync positions array and top-level stats
    const posIdx = positions.findIndex(p => Number(p.id) === Number(currentPosition.id));
    if (posIdx !== -1) {
        positions[posIdx] = { ...positions[posIdx], holder_count: currentHolders.length };
        positionsTable?.updateData(positions, positions.length, 1);
        updateStats();
    }
}

function bindHolderRemoveButtons(panel) {
    panel.querySelectorAll('.remove-holder-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = Number(btn.dataset.userId);
            const holder = currentHolders.find(h => Number(h.id) === userId);
            confirmModal.show({
                title: 'Pozisyonu Kaldır',
                message: `"${escapeHtml(holder?.full_name || holder?.username || '')}" kullanıcısının pozisyonu kaldırılacak.`,
                description: 'Bu işlem pozisyon bazlı yetkilerini de temizler. Devam edilsin mi?',
                confirmText: 'Kaldır',
                confirmButtonClass: 'btn-danger',
                onConfirm: async () => {
                    try {
                        await assignUserToPosition(userId, null);
                        currentHolders = currentHolders.filter(h => Number(h.id) !== userId);
                        refreshDetailHolders();
                        showNotification('Kullanıcının pozisyonu kaldırıldı.', 'success');
                    } catch (error) {
                        showNotification(error?.message || 'Pozisyon kaldırılamadı.', 'error');
                        throw error;
                    }
                }
            });
        });
    });
}

async function loadPositions(filters) {
    if (positionsTable) positionsTable.setLoading(true);
    try {
        const data = await fetchPositions(filters || {});
        positions = listFromResponse(data);
        if (positionsTable) {
            positionsTable.setLoading(false);
            positionsTable.updateData(positions, positions.length, 1);
        }
        updateStats();
        if (currentDetailId && !positions.some(p => Number(p.id) === Number(currentDetailId))) {
            clearDetail();
        }
    } catch (error) {
        if (positionsTable) {
            positionsTable.setLoading(false);
            positionsTable.updateData([], 0, 1);
        }
        showNotification(error?.message || 'Pozisyonlar yüklenemedi.', 'error');
    }
}

function fillParentOptionsForEdit(excludeId = null) {
    return positions
        .filter(p => Number(p.id) !== Number(excludeId))
        .map(p => ({ value: String(p.id), label: `${p.title} (L${p.level})` }));
}

function buildPositionFormFields(position = null) {
    editModal.clearAll();
    editModal.setTitle(position ? 'Pozisyon Düzenle' : 'Yeni Pozisyon');

    editModal.addSection({ title: 'Temel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    editModal.addField({
        id: 'title', name: 'title', label: 'Başlık', type: 'text',
        value: position?.title || '', required: true, colSize: 8
    });
    editModal.addField({
        id: 'level', name: 'level', label: 'Seviye', type: 'select',
        value: position ? String(position.level || 5) : '5',
        options: LEVEL_OPTIONS.map(l => ({ value: String(l), label: `Seviye ${l}` })),
        required: true, colSize: 4, searchable: false
    });

    editModal.addSection({ title: 'Hiyerarşi', icon: 'fas fa-sitemap', iconColor: 'text-info' });
    editModal.addField({
        id: 'parent', name: 'parent', label: 'Bağlı Olduğu Pozisyon', type: 'select',
        value: position?.parent ? String(position.parent) : '',
        options: fillParentOptionsForEdit(position?.id),
        placeholder: 'Yok',
        searchable: true, colSize: 6
    });
    editModal.addField({
        id: 'department_code', name: 'department_code', label: 'Departman', type: 'select',
        value: position?.department_code || '',
        options: DEPARTMENT_CODES,
        placeholder: 'Seçiniz',
        searchable: true, colSize: 6
    });

    editModal.addSection({ title: 'Durum', icon: 'fas fa-toggle-on', iconColor: 'text-success' });
    editModal.addField({
        id: 'is_active', name: 'is_active', label: 'Aktif',
        type: 'checkbox',
        value: position ? position.is_active !== false : true,
        colSize: 12
    });

    editModal.render();
}

function showCreateModal() {
    editingId = null;
    buildPositionFormFields(null);
    editModal.show();
}

function showEditModal(position) {
    editingId = position.id;
    buildPositionFormFields(position);
    editModal.show();
}

async function savePosition(formData) {
    const title = String(formData?.title ?? '').trim();
    const level = Number(formData?.level);
    const parent = formData?.parent ? Number(formData.parent) : null;
    const departmentCode = formData?.department_code ? String(formData.department_code) : '';
    const isActive = formData?.is_active !== false;

    if (!title) {
        showNotification('Pozisyon başlığı zorunludur.', 'warning');
        throw new Error('Validation');
    }
    if (!Number.isInteger(level) || level < 1 || level > 6) {
        showNotification('Pozisyon seviyesi 1 ile 6 arasında olmalıdır.', 'warning');
        throw new Error('Validation');
    }

    const parentLevel = parent ? (positions.find(p => Number(p.id) === parent)?.level || null) : null;
    if (parentLevel && level < Number(parentLevel)) {
        const accepted = window.confirm(
            `Uyarı: Çocuk seviye (${level}), parent seviyesinden (${parentLevel}) düşük. Bu olağandışı bir hiyerarşi. Yine de kaydedilsin mi?`
        );
        if (!accepted) {
            throw new Error('Validation');
        }
    }

    const payload = { title, level, parent, department_code: departmentCode, is_active: isActive };
    const wasEditingId = editingId;
    try {
        let saved;
        if (wasEditingId) {
            saved = await patchPosition(wasEditingId, payload);
            showNotification('Pozisyon güncellendi.', 'success');
            // Update the single row in memory — no full list reload.
            const idx = positions.findIndex(p => Number(p.id) === Number(wasEditingId));
            if (idx !== -1) positions[idx] = { ...positions[idx], ...saved };
        } else {
            saved = await createPosition(payload);
            showNotification('Pozisyon oluşturuldu.', 'success');
            positions.push(saved);
        }

        editModal.hide();
        editingId = null;

        positionsTable.updateData(positions, positions.length, 1);
        updateStats();

        // Re-render the detail panel for the affected position only.
        const refreshId = wasEditingId ? wasEditingId : saved?.id;
        if (refreshId) await showPositionDetail(refreshId, true);
    } catch (error) {
        if (error?.message !== 'Validation') {
            showNotification(error?.message || 'Pozisyon kaydedilemedi.', 'error');
        }
        throw error;
    }
}

function confirmToggle(position) {
    const action = position.is_active ? 'pasifleştirilecek' : 'aktifleştirilecek';
    confirmModal.show({
        title: position.is_active ? 'Pozisyonu Pasifleştir' : 'Pozisyonu Aktifleştir',
        message: `"${position.title}" pozisyonu ${action}.`,
        description: 'Devam etmek istediğinize emin misiniz?',
        confirmText: position.is_active ? 'Pasifleştir' : 'Aktifleştir',
        confirmButtonClass: position.is_active ? 'btn-warning' : 'btn-success',
        onConfirm: async () => {
            try {
                const patched = await patchPosition(position.id, { is_active: !position.is_active });
                showNotification('Pozisyon durumu güncellendi.', 'success');
                const idx = positions.findIndex(p => Number(p.id) === Number(position.id));
                if (idx !== -1) positions[idx] = { ...positions[idx], ...patched };
                positionsTable.updateData(positions, positions.length, 1);
                updateStats();
                if (currentDetailId && Number(currentDetailId) === Number(position.id)) {
                    await showPositionDetail(currentDetailId, true);
                }
            } catch (error) {
                showNotification(error?.message || 'Pozisyon güncellenemedi.', 'error');
                throw error;
            }
        }
    });
}

async function assignUserToPosition(userId, positionId) {
    if (!userId) return;
    const resp = await updateUserAPI(userId, { position: positionId });
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail || body?.message || 'Kullanıcı pozisyonu güncellenemedi.');
    }
}

async function showPositionDetail(positionId, silent = false) {
    currentDetailId = positionId;
    const panel = document.getElementById('position-detail-panel');
    if (!panel) return;
    if (!silent) {
        panel.innerHTML = '<div class="text-muted py-3 text-center"><i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...</div>';
    }

    if (assignDropdown) {
        assignDropdown.destroy();
        assignDropdown = null;
    }

    try {
        const [position, holdersResp] = await Promise.all([
            fetchPositionById(positionId),
            fetchPositionHolders(positionId)
        ]);
        currentPosition = position;
        currentHolders = listFromResponse(holdersResp);

        panel.innerHTML = `
            <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                <div>
                    <div class="org-detail__title">${escapeHtml(position.title || '-')}</div>
                    <div class="org-detail__meta">
                        <span class="org-level-pill me-1">L${escapeHtml(position.level || '-')}</span>
                        ${position.department_code ? ` &middot; ${escapeHtml(DEPT_CODE_MAP.get(position.department_code) || position.department_code)}` : ''}
                        ${position.parent_title ? ` &middot; Bağlı: <strong>${escapeHtml(position.parent_title)}</strong>` : ''}
                    </div>
                </div>
                <span class="badge ${position.is_active ? 'text-bg-success' : 'text-bg-secondary'} fs-6">
                    ${position.is_active ? 'Aktif' : 'Pasif'}
                </span>
            </div>

            <div class="row g-2 mb-3">
                <div class="col-12">
                    <div class="org-stat">
                        <div class="org-stat__label">Atanmış Kullanıcı</div>
                        <div class="org-stat__value detail-holders-stat">${currentHolders.length}</div>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <div class="org-detail__section-title">Mevcut Kullanıcılar</div>
                <div class="detail-holders-list">
                    ${renderHoldersHTML(currentHolders, position.id)}
                </div>
            </div>

            <div class="mb-3">
                <div class="org-detail__section-title">Kullanıcı Atama</div>
                <div id="assign-user-dropdown-container" class="mb-2"></div>
                <div class="d-grid">
                    <button class="btn btn-sm btn-primary" id="assign-user-btn">
                        <i class="fas fa-user-plus me-1"></i>Ata
                    </button>
                </div>
            </div>

            <div>
                <div class="org-detail__section-title mb-1">Yetkiler</div>
                <div class="text-muted small mb-2">
                    Bu pozisyonun yetkileri Yetki Yönetimi sayfasından düzenlenir.
                </div>
                <a href="/it/permissions/" class="btn btn-sm btn-outline-secondary w-100">
                    <i class="fas fa-user-shield me-1"></i>Yetki Yönetimine Git
                </a>
            </div>
        `;

        // Initialize multi-select dropdown (exclude already-assigned users)
        const dropdownContainer = document.getElementById('assign-user-dropdown-container');
        assignDropdown = new ModernDropdown(dropdownContainer, {
            placeholder: 'Kullanıcı seçin...',
            multiple: true,
            searchable: true
        });
        assignDropdown.setItems(
            users
                .filter(u => u.is_active !== false && !currentHolders.some(h => Number(h.id) === Number(u.id)))
                .map(u => ({ value: String(u.id), text: getUserDisplayName(u) }))
        );

        bindHolderRemoveButtons(panel);

        document.getElementById('assign-user-btn')?.addEventListener('click', async () => {
            const selectedIds = (assignDropdown.getValue() || []).map(Number).filter(Boolean);
            if (!selectedIds.length) {
                showNotification('Önce en az bir kullanıcı seçin.', 'warning');
                return;
            }
            const btn = document.getElementById('assign-user-btn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atanıyor...'; }
            try {
                await Promise.all(selectedIds.map(uid => assignUserToPosition(uid, position.id)));
                const newHolders = selectedIds.map(uid => {
                    const u = users.find(u => Number(u.id) === uid);
                    if (!u) return null;
                    return { id: u.id, full_name: getUserDisplayName(u), username: u.username };
                }).filter(Boolean);
                currentHolders = [...currentHolders, ...newHolders];
                assignDropdown.setValue([]);
                refreshDetailHolders();
                showNotification(
                    newHolders.length === 1
                        ? 'Kullanıcı pozisyona atandı.'
                        : `${newHolders.length} kullanıcı pozisyona atandı.`,
                    'success'
                );
            } catch (error) {
                showNotification(error?.message || 'Kullanıcı atanamadı.', 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus me-1"></i>Ata'; }
            }
        });

    } catch (error) {
        panel.innerHTML = '<div class="text-danger py-3 text-center">Detay yüklenemedi.</div>';
        if (!silent) {
            showNotification(error?.message || 'Pozisyon detayı yüklenemedi.', 'error');
        }
    }
}

function initFilters(initial) {
    filtersComp = new FiltersComponent('position-filters', {
        title: 'Filtreler',
        showApplyButton: true,
        showClearButton: true,
        applyButtonText: 'Filtrele',
        clearButtonText: 'Temizle',
        onApply: () => loadPositions(getFiltersFromUI()),
        onClear: () => loadPositions({})
    });

    filtersComp.addDropdownFilter({
        id: 'department_code',
        label: 'Departman',
        placeholder: 'Tüm departmanlar',
        searchable: true,
        colSize: 5,
        value: initial?.department_code || '',
        options: DEPARTMENT_CODES
    });
    filtersComp.addDropdownFilter({
        id: 'level',
        label: 'Seviye',
        placeholder: 'Tüm seviyeler',
        searchable: false,
        colSize: 3,
        value: initial?.level || '',
        options: LEVEL_OPTIONS.map(l => ({ value: String(l), label: `Seviye ${l}` }))
    });
}

function initTable() {
    positionsTable = new TableComponent('positions-table-container', {
        title: 'Pozisyon Listesi',
        icon: 'fas fa-sitemap',
        iconColor: 'text-primary',
        columns: [
            { field: 'title', label: 'Başlık', sortable: true, formatter: v => `<strong>${escapeHtml(v || '-')}</strong>` },
            {
                field: 'level', label: 'Seviye', sortable: true, type: 'number',
                formatter: v => v ? `<span class="org-level-pill">L${escapeHtml(v)}</span>` : '-'
            },
            { field: 'parent_title', label: 'Bağlı Olduğu', sortable: true, formatter: v => v ? escapeHtml(v) : '-' },
            {
                field: 'department_code', label: 'Departman', sortable: true,
                formatter: v => v ? escapeHtml(DEPT_CODE_MAP.get(v) || v) : '<span class="text-muted">-</span>'
            },
            { field: 'holder_count', label: 'Kişi', sortable: true, type: 'number', formatter: v => Number(v || 0) },
            { field: 'permission_count', label: 'Yetki', sortable: true, type: 'number', formatter: v => Number(v || 0) },
            {
                field: 'is_active', label: 'Durum', sortable: true,
                formatter: v => v
                    ? '<span class="status-badge status-green">Aktif</span>'
                    : '<span class="status-badge status-grey">Pasif</span>'
            }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-info', onClick: row => showPositionDetail(row.id) },
            { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', class: 'btn-outline-primary', onClick: row => showEditModal(row) },
            {
                key: 'toggle',
                label: 'Durumu Değiştir',
                icon: 'fas fa-power-off',
                class: 'btn-outline-warning',
                onClick: row => confirmToggle(row)
            }
        ],
        pagination: false,
        refreshable: true,
        onRefresh: () => loadPositions(getFiltersFromUI()),
        emptyMessage: 'Pozisyon bulunamadı.',
        emptyIcon: 'fas fa-inbox',
        onRowClick: row => showPositionDetail(row.id)
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Pozisyon Yönetimi',
        subtitle: 'Pozisyonları filtreleyin, hiyerarşiyi ve yetki setlerini yönetin',
        icon: 'sitemap',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Pozisyon',
        onBackClick: () => { window.location.href = '/human_resources/org'; },
        onCreateClick: () => showCreateModal()
    });

    editModal = new EditModal('position-edit-modal-container', {
        title: 'Pozisyon',
        icon: 'fas fa-sitemap',
        size: 'lg',
        saveButtonText: 'Kaydet'
    });
    editModal.onSaveCallback(async (formData) => {
        await savePosition(formData);
    });

    confirmModal = new ConfirmationModal('position-confirm-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        confirmText: 'Onayla',
        cancelText: 'İptal'
    });

    try {
        const usersResp = await fetchAllUsers();
        users = Array.isArray(usersResp) ? usersResp : [];
    } catch (error) {
        showNotification(error?.message || 'Kullanıcılar yüklenemedi.', 'error');
    }

    const initial = getUrlFilters();
    initFilters(initial);
    initTable();
    clearDetail();
    await loadPositions(initial);
});
