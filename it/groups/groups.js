import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { TableComponent } from '../../components/table/table.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import {
    fetchOrganizationGroups,
    fetchOrganizationGroupById,
    createOrganizationGroup,
    patchOrganizationGroup,
    patchOrganizationGroupPositions,
    deleteOrganizationGroup,
    fetchPositions
} from '../../apis/human_resources/organization.js';
import { showNotification } from '../../components/notification/notification.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';

let groups = [];
let positionsCatalog = [];
let groupsTable = null;
let editModal = null;
let confirmModal = null;
let editingId = null;
let currentDetailId = null;
let currentGroupDetail = null;
let addPositionsDropdown = null;

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

function positionsFromDetail(detail) {
    if (!detail || typeof detail !== 'object') return [];
    const raw = detail.positions ?? detail.position_list ?? [];
    return Array.isArray(raw) ? raw : [];
}

function membersFromDetail(detail) {
    if (!detail || typeof detail !== 'object') return [];
    const raw = detail.members ?? detail.resolved_members ?? [];
    return Array.isArray(raw) ? raw : [];
}

function positionIdsFromDetail(detail) {
    return positionsFromDetail(detail)
        .map(p => Number(p?.id ?? p?.position_id))
        .filter(id => Number.isInteger(id) && id > 0);
}

function positionLabel(p) {
    if (!p) return '-';
    const title = p.title || p.name || '-';
    const lvl = p.level != null ? ` (L${p.level})` : '';
    return `${title}${lvl}`;
}

function setStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

function updateStats() {
    const total = groups.length;
    const active = groups.filter(g => g.is_active !== false).length;
    const posSum = groups.reduce((s, g) => s + Number(g.position_count || 0), 0);
    const memSum = groups.reduce((s, g) => s + Number(g.member_count || 0), 0);
    setStat('stat-total', total);
    setStat('stat-active', active);
    setStat('stat-positions', posSum);
    setStat('stat-members', memSum);
}

function clearDetail() {
    currentDetailId = null;
    currentGroupDetail = null;
    if (addPositionsDropdown) {
        addPositionsDropdown.destroy();
        addPositionsDropdown = null;
    }
    const panel = document.getElementById('group-detail-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div class="text-muted text-center py-4">
            <i class="fas fa-mouse-pointer d-block mb-2 fs-3 text-secondary"></i>
            Detay görmek için listeden bir grup seçin.
        </div>
    `;
}

function renderPositionsListHTML(posList) {
    if (!posList.length) {
        return '<div class="text-muted small py-1">Bu grupta pozisyon yok.</div>';
    }
    return `<ul class="ps-0 mb-0 list-unstyled">
        ${posList.map(p => {
            const pid = Number(p?.id ?? p?.position_id);
            return `
            <li class="d-flex align-items-center justify-content-between py-1 border-bottom border-light">
                <span class="small">${escapeHtml(positionLabel(p))}</span>
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger ms-2 py-0 px-2 remove-position-btn"
                    data-position-id="${pid}"
                    title="Gruptan çıkar"
                    style="font-size:0.7rem;line-height:1.4;"
                ><i class="fas fa-times"></i></button>
            </li>`;
        }).join('')}
    </ul>`;
}

function renderMembersListHTML(members) {
    if (!members.length) {
        return '<div class="text-muted small py-1">Üye listesi boş.</div>';
    }
    return `<ul class="ps-0 mb-0 list-unstyled">
        ${members.map(m => `
            <li class="py-1 border-bottom border-light small">
                ${escapeHtml(m.full_name || m.name || m.username || '-')}
                ${m.username ? `<span class="text-muted"> (${escapeHtml(m.username)})</span>` : ''}
            </li>
        `).join('')}
    </ul>`;
}

async function loadGroups() {
    if (groupsTable) groupsTable.setLoading(true);
    try {
        const data = await fetchOrganizationGroups();
        groups = listFromResponse(data);
        if (groupsTable) {
            groupsTable.setLoading(false);
            groupsTable.updateData(groups, groups.length, 1);
        }
        updateStats();
        if (currentDetailId && !groups.some(g => Number(g.id) === Number(currentDetailId))) {
            clearDetail();
        }
    } catch (error) {
        if (groupsTable) {
            groupsTable.setLoading(false);
            groupsTable.updateData([], 0, 1);
        }
        showNotification(error?.message || 'Gruplar yüklenemedi.', 'error');
    }
}

async function applyPositionIds(groupId, positionIds) {
    const unique = [...new Set(positionIds.map(Number).filter(Boolean))];
    const updated = await patchOrganizationGroupPositions(groupId, unique);
    return updated;
}

function bindRemovePositionButtons(panel) {
    panel.querySelectorAll('.remove-position-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const positionId = Number(btn.dataset.positionId);
            const posList = positionsFromDetail(currentGroupDetail);
            const target = posList.find(p => Number(p?.id ?? p?.position_id) === positionId);
            confirmModal.show({
                title: 'Pozisyonu Gruptan Çıkar',
                message: `"${escapeHtml(positionLabel(target) || '')}" pozisyonu bu gruptan kaldırılacak.`,
                description: 'Devam edilsin mi?',
                confirmText: 'Kaldır',
                confirmButtonClass: 'btn-danger',
                onConfirm: async () => {
                    try {
                        const ids = positionIdsFromDetail(currentGroupDetail).filter(id => id !== positionId);
                        await applyPositionIds(currentGroupDetail.id, ids);
                        await loadGroups();
                        await showGroupDetail(currentGroupDetail.id, true);
                        showNotification('Pozisyon gruptan kaldırıldı.', 'success');
                    } catch (error) {
                        showNotification(error?.message || 'Pozisyon kaldırılamadı.', 'error');
                        throw error;
                    }
                }
            });
        });
    });
}

async function showGroupDetail(groupId, silent = false) {
    currentDetailId = groupId;
    const panel = document.getElementById('group-detail-panel');
    if (!panel) return;

    if (addPositionsDropdown) {
        addPositionsDropdown.destroy();
        addPositionsDropdown = null;
    }

    if (!silent) {
        panel.innerHTML = '<div class="text-muted py-3 text-center"><i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...</div>';
    }

    try {
        const detail = await fetchOrganizationGroupById(groupId);
        currentGroupDetail = detail;

        const posList = positionsFromDetail(detail);
        const memList = membersFromDetail(detail);
        const assignedIds = positionIdsFromDetail(detail);

        panel.innerHTML = `
            <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                <div>
                    <div class="org-detail__title">${escapeHtml(detail.name || '-')}</div>
                    <div class="org-detail__meta">
                        ${detail.description ? escapeHtml(detail.description) : '<span class="text-muted">Açıklama yok</span>'}
                    </div>
                </div>
                <span class="badge ${detail.is_active !== false ? 'text-bg-success' : 'text-bg-secondary'} fs-6">
                    ${detail.is_active !== false ? 'Aktif' : 'Pasif'}
                </span>
            </div>

            <div class="row g-2 mb-3">
                <div class="col-6">
                    <div class="org-stat">
                        <div class="org-stat__label">Pozisyon</div>
                        <div class="org-stat__value">${posList.length}</div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="org-stat">
                        <div class="org-stat__label">Üye</div>
                        <div class="org-stat__value">${memList.length}</div>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <div class="org-detail__section-title">Gruptaki Pozisyonlar</div>
                <div class="detail-positions-list">
                    ${renderPositionsListHTML(posList)}
                </div>
            </div>

            <div class="mb-3">
                <div class="org-detail__section-title">Çözümlenmiş Üyeler</div>
                <div class="detail-members-list">
                    ${renderMembersListHTML(memList)}
                </div>
            </div>

            <div class="mb-3">
                <div class="org-detail__section-title">Pozisyon ekle (çoklu)</div>
                <div id="add-positions-dropdown-container" class="mb-2"></div>
                <div class="d-grid">
                    <button type="button" class="btn btn-sm btn-primary" id="add-positions-btn">
                        <i class="fas fa-layer-group me-1"></i>Seçilenleri gruba ekle
                    </button>
                </div>
            </div>
        `;

        const dropdownContainer = document.getElementById('add-positions-dropdown-container');
        addPositionsDropdown = new ModernDropdown(dropdownContainer, {
            placeholder: 'Eklenecek pozisyonları seçin...',
            multiple: true,
            searchable: true
        });
        addPositionsDropdown.setItems(
            positionsCatalog
                .filter(p => p.is_active !== false && !assignedIds.includes(Number(p.id)))
                .map(p => ({ value: String(p.id), text: positionLabel(p) }))
        );

        bindRemovePositionButtons(panel);

        document.getElementById('add-positions-btn')?.addEventListener('click', async () => {
            const selected = (addPositionsDropdown.getValue() || []).map(Number).filter(Boolean);
            if (!selected.length) {
                showNotification('Önce en az bir pozisyon seçin.', 'warning');
                return;
            }
            const btn = document.getElementById('add-positions-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Ekleniyor...';
            }
            try {
                const merged = [...new Set([...assignedIds, ...selected])];
                await applyPositionIds(detail.id, merged);
                await loadGroups();
                await showGroupDetail(detail.id, true);
                showNotification(
                    selected.length === 1 ? 'Pozisyon gruba eklendi.' : `${selected.length} pozisyon gruba eklendi.`,
                    'success'
                );
            } catch (error) {
                showNotification(error?.message || 'Pozisyonlar eklenemedi.', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-layer-group me-1"></i>Seçilenleri gruba ekle';
                }
            }
        });
    } catch (error) {
        panel.innerHTML = '<div class="text-danger py-3 text-center">Detay yüklenemedi.</div>';
        if (!silent) {
            showNotification(error?.message || 'Grup detayı yüklenemedi.', 'error');
        }
    }
}

function positionOptionsForModal() {
    return positionsCatalog
        .filter(p => p.is_active !== false)
        .map(p => ({ value: String(p.id), label: positionLabel(p) }));
}

function buildGroupFormFields(group = null) {
    editModal.clearAll();
    editModal.setTitle(group ? 'Grup Düzenle' : 'Yeni Grup');

    editModal.addSection({ title: 'Temel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    editModal.addField({
        id: 'name',
        name: 'name',
        label: 'Grup adı',
        type: 'text',
        value: group?.name || '',
        required: true,
        colSize: 12
    });
    editModal.addField({
        id: 'description',
        name: 'description',
        label: 'Açıklama',
        type: 'textarea',
        value: group?.description || '',
        required: false,
        colSize: 12,
        rows: 3
    });

    editModal.addSection({ title: 'Durum', icon: 'fas fa-toggle-on', iconColor: 'text-success' });
    editModal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        value: group ? group.is_active !== false : true,
        colSize: 12
    });

    if (!group) {
        editModal.addSection({ title: 'Pozisyonlar', icon: 'fas fa-id-badge', iconColor: 'text-info' });
        editModal.addField({
            id: 'position_ids',
            name: 'position_ids',
            label: 'Başlangıç pozisyonları (isteğe bağlı)',
            type: 'select',
            value: [],
            options: positionOptionsForModal(),
            placeholder: 'Pozisyon seçin...',
            searchable: true,
            multiple: true,
            required: false,
            colSize: 12
        });
    }

    editModal.render();
}

function showCreateModal() {
    editingId = null;
    buildGroupFormFields(null);
    editModal.show();
}

function showEditModal(group) {
    editingId = group.id;
    buildGroupFormFields(group);
    editModal.show();
}

async function saveGroup(formData) {
    const name = String(formData?.name ?? '').trim();
    const description = String(formData?.description ?? '').trim();
    const isActive = formData?.is_active !== false;
    const rawPos = formData?.position_ids;
    const positionIds = Array.isArray(rawPos)
        ? rawPos.map(Number).filter(Boolean)
        : rawPos
            ? [Number(rawPos)].filter(Boolean)
            : [];

    if (!name) {
        showNotification('Grup adı zorunludur.', 'warning');
        throw new Error('Validation');
    }

    const wasEditing = editingId;
    try {
        let saved;
        if (wasEditing) {
            saved = await patchOrganizationGroup(wasEditing, {
                name,
                description,
                is_active: isActive
            });
            showNotification('Grup güncellendi.', 'success');
        } else {
            saved = await createOrganizationGroup({
                name,
                description: description || undefined,
                position_ids: positionIds.length ? positionIds : undefined
            });
            showNotification('Grup oluşturuldu.', 'success');
        }

        editModal.hide();
        editingId = null;
        const refreshId = wasEditing ? wasEditing : saved?.id;
        await loadGroups();
        if (refreshId) await showGroupDetail(refreshId, true);
    } catch (error) {
        if (error?.message !== 'Validation') {
            showNotification(error?.message || 'Grup kaydedilemedi.', 'error');
        }
        throw error;
    }
}

function confirmToggle(group) {
    const action = group.is_active !== false ? 'pasifleştirilecek' : 'aktifleştirilecek';
    confirmModal.show({
        title: group.is_active !== false ? 'Grubu Pasifleştir' : 'Grubu Aktifleştir',
        message: `"${escapeHtml(String(group.name || ''))}" ${action}.`,
        description: 'Devam etmek istediğinize emin misiniz?',
        confirmText: group.is_active !== false ? 'Pasifleştir' : 'Aktifleştir',
        confirmButtonClass: group.is_active !== false ? 'btn-warning' : 'btn-success',
        onConfirm: async () => {
            try {
                await patchOrganizationGroup(group.id, { is_active: group.is_active === false });
                showNotification('Grup durumu güncellendi.', 'success');
                await loadGroups();
                if (currentDetailId && Number(currentDetailId) === Number(group.id)) {
                    await showGroupDetail(currentDetailId, true);
                }
            } catch (error) {
                showNotification(error?.message || 'Grup güncellenemedi.', 'error');
                throw error;
            }
        }
    });
}

function confirmDelete(group) {
    confirmModal.show({
        title: 'Grubu Sil',
        message: `"${escapeHtml(group.name)}" kalıcı olarak silinecek.`,
        description: 'Bu işlem geri alınamaz. Devam edilsin mi?',
        confirmText: 'Sil',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await deleteOrganizationGroup(group.id);
                showNotification('Grup silindi.', 'success');
                if (currentDetailId && Number(currentDetailId) === Number(group.id)) {
                    clearDetail();
                }
                await loadGroups();
            } catch (error) {
                showNotification(error?.message || 'Grup silinemedi.', 'error');
                throw error;
            }
        }
    });
}

function initTable() {
    groupsTable = new TableComponent('groups-table-container', {
        title: 'Organizasyon Grupları',
        icon: 'fas fa-object-group',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'name',
                label: 'Ad',
                sortable: true,
                formatter: v => `<strong>${escapeHtml(v || '-')}</strong>`
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: true,
                formatter: v => {
                    const t = String(v || '').trim();
                    if (!t) return '<span class="text-muted">-</span>';
                    const short = t.length > 48 ? `${escapeHtml(t.slice(0, 48))}…` : escapeHtml(t);
                    return short;
                }
            },
            {
                field: 'position_count',
                label: 'Pozisyon',
                sortable: true,
                type: 'number',
                formatter: v => Number(v || 0)
            },
            {
                field: 'member_count',
                label: 'Üye',
                sortable: true,
                type: 'number',
                formatter: v => Number(v || 0)
            },
            {
                field: 'is_active',
                label: 'Durum',
                sortable: true,
                formatter: v =>
                    v !== false
                        ? '<span class="status-badge status-green">Aktif</span>'
                        : '<span class="status-badge status-grey">Pasif</span>'
            }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-info', onClick: row => showGroupDetail(row.id) },
            { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', class: 'btn-outline-primary', onClick: row => showEditModal(row) },
            {
                key: 'toggle',
                label: 'Durum',
                icon: 'fas fa-power-off',
                class: 'btn-outline-warning',
                onClick: row => confirmToggle(row)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: row => confirmDelete(row)
            }
        ],
        pagination: false,
        refreshable: true,
        onRefresh: () => loadGroups(),
        emptyMessage: 'Grup bulunamadı.',
        emptyIcon: 'fas fa-inbox',
        onRowClick: row => showGroupDetail(row.id)
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Organizasyon Grupları',
        subtitle: 'Grupları yönetin, pozisyonları toplu atayın',
        icon: 'object-group',
        showBackButton: 'block',
        backUrl: '/it/',
        showCreateButton: 'block',
        createButtonText: 'Yeni Grup',
        onBackClick: () => {
            window.location.href = '/it/';
        },
        onCreateClick: () => showCreateModal()
    });

    editModal = new EditModal('group-edit-modal-container', {
        title: 'Grup',
        icon: 'fas fa-object-group',
        size: 'lg',
        saveButtonText: 'Kaydet'
    });
    editModal.onSaveCallback(async formData => {
        await saveGroup(formData);
    });

    confirmModal = new ConfirmationModal('group-confirm-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        confirmText: 'Onayla',
        cancelText: 'İptal'
    });

    try {
        const posData = await fetchPositions({});
        positionsCatalog = listFromResponse(posData);
    } catch (error) {
        showNotification(error?.message || 'Pozisyon listesi yüklenemedi.', 'error');
    }

    initTable();
    clearDetail();
    await loadGroups();
});
