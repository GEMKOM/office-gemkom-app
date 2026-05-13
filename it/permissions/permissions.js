import { guardRoute, getUser } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    fetchPermissionsMatrix,
    fetchUserPermissionsDetail,
    saveUserPermissionOverride,
    deleteUserPermissionOverride,
    fetchPermissionsUsersList,
    updateUser as updateUserAPI
} from '../../../apis/users.js';
import {
    fetchPositions,
    fetchPositionById,
    fetchPositionHolders,
    patchPositionPermissions,
    fetchPermissionsCatalog
} from '../../../apis/human_resources/organization.js';

const DEPT_CODE_MAP = new Map([
    ['machining',          'Talaşlı İmalat'],
    ['design',             'Dizayn'],
    ['logistics',          'Lojistik'],
    ['procurement',        'Satın Alma'],
    ['welding',            'Kaynaklı İmalat'],
    ['planning',           'Planlama'],
    ['manufacturing',      'İmalat'],
    ['maintenance',        'Bakım'],
    ['rollingmill',        'Haddehane'],
    ['qualitycontrol',     'Kalite Kontrol'],
    ['cutting',            'CNC Kesim'],
    ['warehouse',          'Ambar'],
    ['finance',            'Finans'],
    ['management',         'Yönetim'],
    ['external_workshops', 'Dış Atölyeler'],
    ['human_resources',    'İnsan Kaynakları'],
    ['sales',              'Proje Taahhüt'],
    ['accounting',         'Muhasebe'],
]);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let permissionsMatrix = null;
let usersTableRows = [];                  // cached rows for the users table — patched in place after overrides
let permissionsCatalog = null;            // [{codename, name, section}]
let positionsCache = [];                  // full positions list (with permission_codenames if backend provides)
let positionPermsCache = new Map();       // positionId -> Set(codename)
let positionHoldersCache = new Map();     // positionId -> [{id, full_name, username}]

let matrixTable = null;
let positionMatrixTable = null;
let permissionsListTable = null;
let overrideModal = null;

let currentUserDetail = null;

let currentPositionId = null;
let currentPositionPermsOriginal = new Set();
let currentPositionPermsDraft = new Set();
let currentPositionDirty = false;
let sectionCollapseState = new Map();     // section -> expanded bool

let usersTabLoaded = false;
let positionsTabLoaded = false;
let permsTabLoaded = false;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
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

function boolIcon(val) {
    if (val) return '<span class="status-badge status-green"><i class="fas fa-check"></i></span>';
    return '<span class="status-badge status-red"><i class="fas fa-times"></i></span>';
}

function safeId(value) {
    return (value || '').toString().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

function sectionLabel(section) {
    if (section === 'office') return 'Ofis';
    if (section === 'workshop') return 'Atölye';
    if (section === 'manufacturing') return 'Üretim';
    if (section === 'sales') return 'Satış';
    if (section === 'hr' || section === 'human_resources') return 'İK';
    if (section === 'it') return 'BT';
    if (section === 'finance') return 'Finans';
    if (section === 'other') return 'Diğer';
    return section || '-';
}

function sectionBadgeClass(section) {
    if (section === 'office') return 'bg-primary';
    if (section === 'workshop') return 'bg-dark';
    if (section === 'manufacturing') return 'bg-success';
    if (section === 'sales') return 'bg-info text-dark';
    if (section === 'hr' || section === 'human_resources') return 'bg-warning text-dark';
    return 'bg-secondary';
}

function userPositionDisplay(user) {
    if (!user) return '-';
    const title = user.position_title || user.position?.title || null;
    if (!title) return '<span class="text-muted">-</span>';
    const level = user.position_level || user.position?.level || null;
    const deptCode = user.position_department_code || user.position?.department_code || null;
    const deptLabel = deptCode ? (DEPT_CODE_MAP.get(deptCode) || deptCode) : null;
    const levelPill = level ? `<span class="perm-level-pill ms-1">L${escapeHtml(level)}</span>` : '';
    const deptText = deptLabel ? ` <span class="text-muted small">&middot; ${escapeHtml(deptLabel)}</span>` : '';
    return `${escapeHtml(title)}${levelPill}${deptText}`;
}

function getUserPositionId(user) {
    if (!user) return null;
    if (user.position_id != null) return Number(user.position_id);
    if (user.position && typeof user.position === 'object' && user.position.id != null) return Number(user.position.id);
    if (typeof user.position === 'number') return user.position;
    return null;
}

// ---------------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    const user = await getUser();
    const isAdmin = user && (user.is_superuser || user.is_admin);
    if (!isAdmin) {
        showNotification('Bu sayfaya erişim yetkiniz bulunmamaktadır.', 'error');
        window.location.href = '/it/';
        return;
    }

    new HeaderComponent({
        title: 'Yetki Yönetimi',
        subtitle: 'Pozisyonlara göre yetki dağılımını yönetin',
        icon: 'user-shield',
        showBackButton: 'block',
        backUrl: '/it/',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: async () => { await refreshActiveTab(); }
    });

    overrideModal = new EditModal('permission-override-modal-container', {
        title: 'Yetki Geçersiz Kılma',
        icon: 'fas fa-user-shield',
        size: 'lg'
    });

    initPermissionsListTable();
    setContainerPlaceholder('permissions-matrix-container', 'Yükleniyor...');
    setContainerPlaceholder('position-matrix-container', 'Yükleniyor...');

    attachTabLazyLoadHandlers();
    await ensureUsersTabLoaded();
});

function setContainerPlaceholder(containerId, text) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div class="dashboard-card">
            <div class="card-body text-muted text-center py-5">
                <i class="fas fa-spinner fa-spin me-1"></i>${escapeHtml(text)}
            </div>
        </div>
    `;
}

function getActiveTabId() {
    const active = document.querySelector('#permissions-tabs .nav-link.active');
    return active ? active.getAttribute('data-bs-target') : null;
}

async function refreshActiveTab() {
    const active = getActiveTabId();
    if (active === '#tab-positions') {
        await ensurePositionsTabLoaded(true);
        return;
    }
    if (active === '#tab-perms') {
        await ensurePermsTabLoaded(true);
        return;
    }
    await ensureUsersTabLoaded(true);
}

function attachTabLazyLoadHandlers() {
    document.getElementById('tab-users-tab')?.addEventListener('shown.bs.tab', () => ensureUsersTabLoaded());
    document.getElementById('tab-positions-tab')?.addEventListener('shown.bs.tab', () => ensurePositionsTabLoaded());
    document.getElementById('tab-perms-tab')?.addEventListener('shown.bs.tab', () => ensurePermsTabLoaded());
}

async function ensureUsersTabLoaded(force = false) {
    if (!force && usersTabLoaded) return;
    await loadMatrix();
    usersTabLoaded = true;
}

async function ensurePositionsTabLoaded(force = false) {
    if (!force && positionsTabLoaded) return;
    if (!permissionsMatrix) {
        await ensureUsersTabLoaded();
    }
    await loadPositionMatrix();
    positionsTabLoaded = true;
}

async function ensurePermsTabLoaded(force = false) {
    if (!force && permsTabLoaded) return;
    if (!permissionsMatrix) {
        await ensureUsersTabLoaded();
    }
    // Ensure the lean positions list is loaded so positionsCache is available.
    // positionPermsCache is populated lazily on click; the Permissions tab shows
    // positions for any permissions that have already been loaded via detail clicks.
    await loadPositionsList();
    await loadPermissionsList();
    permsTabLoaded = true;
}

async function ensurePermissionsCatalogLoaded() {
    if (Array.isArray(permissionsCatalog) && permissionsCatalog.length) return;
    try {
        const perms = await fetchPermissionsCatalog();
        const rows = listFromResponse(perms);
        permissionsCatalog = rows
            .filter(p => p && p.codename)
            .map(p => ({
                codename: p.codename,
                name: p.name || p.codename,
                section: p.section || p.portal || 'other'
            }));
    } catch (e) {
        console.warn('Failed to load permissions catalog; falling back to matrix codenames', e);
        const codenames = permissionsMatrix?.codenames || [];
        permissionsCatalog = codenames.map(code => ({ codename: code, name: code, section: 'other' }));
    }
}

// ---------------------------------------------------------------------------
// USERS TAB
// ---------------------------------------------------------------------------
async function loadMatrix(params = {}) {
    try {
        if (matrixTable) matrixTable.setLoading(true);
        permissionsMatrix = await fetchPermissionsMatrix(params);
        const codenames = permissionsMatrix.codenames || [];
        const rows = (permissionsMatrix.users || []).map(u => {
            const permCount = u.is_superuser
                ? null  // superuser has all — display differently
                : codenames.filter(code => {
                    const perm = u.permissions ? u.permissions[code] : null;
                    return perm && perm.value === true;
                }).length;
            return {
                id: u.id,
                username: u.username,
                full_name: u.full_name || u.username,
                is_superuser: u.is_superuser,
                position_display: userPositionDisplay(u),
                permission_count: permCount,
                raw: u
            };
        });

        usersTableRows = rows;
        if (!matrixTable) initMatrixTable();
        matrixTable.updateData(usersTableRows, usersTableRows.length, 1);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Kullanıcı listesi yüklenirken hata oluştu', 'error');
        if (matrixTable) matrixTable.updateData([], 0, 1);
    } finally {
        if (matrixTable) matrixTable.setLoading(false);
    }
}

/**
 * Patch the single user row in the cached table list from the already-loaded
 * currentUserDetail — zero extra GET requests.
 */
function refreshUserTableRow() {
    if (!currentUserDetail || !matrixTable) return;
    const user = currentUserDetail.user || currentUserDetail;
    const effective = currentUserDetail.effective_permissions || {};
    const codenames = permissionsMatrix?.codenames || [];
    const newCount = user.is_superuser
        ? null
        : codenames.filter(code => {
            const p = effective[code];
            return p && p.value === true;
        }).length;

    const idx = usersTableRows.findIndex(r => Number(r.id) === Number(user.id));
    if (idx !== -1) {
        usersTableRows[idx] = {
            ...usersTableRows[idx],
            permission_count: newCount,
            position_display: userPositionDisplay(user)
        };
        matrixTable.updateData(usersTableRows, usersTableRows.length, 1);
    }
}

function initMatrixTable() {
    matrixTable = new TableComponent('permissions-matrix-container', {
        title: 'Kullanıcılar',
        icon: 'fas fa-users',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'username',
                label: 'Kullanıcı Adı',
                width: '160px',
                sortable: true,
                formatter: (v, row) => {
                    const badge = row.is_superuser
                        ? '<span class="badge bg-danger ms-1">Süper</span>'
                        : '';
                    return `<strong>${escapeHtml(v || '-')}</strong>${badge}`;
                }
            },
            {
                field: 'full_name',
                label: 'Ad Soyad',
                width: '200px',
                sortable: true,
                formatter: v => escapeHtml(v || '-')
            },
            {
                field: 'position_display',
                label: 'Pozisyon',
                sortable: false
            },
            {
                field: 'permission_count',
                label: 'Yetki',
                width: '80px',
                sortable: true,
                formatter: (v, row) => row.is_superuser
                    ? '<span class="badge bg-danger">Tümü</span>'
                    : String(v ?? 0)
            }
        ],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Kullanıcı bulunamadı.',
        onRowClick: (row) => {
            if (row && row.id) loadUserDetail(row.id);
        }
    });
}

async function loadUserDetail(userId) {
    try {
        currentUserDetail = await fetchUserPermissionsDetail(userId);
        await ensurePermissionsCatalogLoaded();
        await loadPositionsList();
        renderUserDetailPanel();
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Kullanıcı detayları yüklenirken hata oluştu', 'error');
    }
}

function formatPermSourceBadge(source, sourceDetail) {
    const detail = sourceDetail ? `<span class="text-muted ms-1">${escapeHtml(sourceDetail)}</span>` : '';
    switch (source) {
        case 'superuser':
            return `<span class="badge bg-danger">Süper kullanıcı</span>${detail}`;
        case 'override':
            return `<span class="badge bg-warning text-dark">Bireysel</span>${detail}`;
        case 'position':
        case 'group':
            return `<span class="badge bg-primary">Pozisyon</span>${detail}`;
        case 'legacy':
            return `<span class="badge bg-secondary">Eski sistem</span>${detail}`;
        case 'none':
        default:
            return `<span class="badge bg-secondary">Yok</span>`;
    }
}

function renderUserDetailPanel() {
    const panel = document.getElementById('user-permissions-panel');
    if (!panel || !currentUserDetail) return;

    const detail = currentUserDetail;
    const user = detail.user || detail;
    const effective = detail.effective_permissions || {};
    const overrides = Array.isArray(detail.overrides) ? detail.overrides : [];

    const catalog = Array.isArray(permissionsCatalog) ? permissionsCatalog : [];
    const catalogMap = new Map(catalog.map(p => [p.codename, p.name || p.codename]));
    const allCodenames = Array.from(new Set([
        ...catalog.map(p => p.codename),
        ...Object.keys(effective || {})
    ])).sort((a, b) => a.localeCompare(b, 'tr'));
    const codenames = allCodenames.length ? allCodenames : (permissionsMatrix?.codenames || Object.keys(effective || {}));
    const overridesMap = new Map(overrides.map(o => [o.codename, o]));

    const officePerm = effective.office_access || { value: false, source: 'none', source_detail: '' };
    const workshopPerm = effective.workshop_access || { value: false, source: 'none', source_detail: '' };
    const hasOfficeAccess = officePerm.value === true;
    const hasWorkshopAccess = workshopPerm.value === true;

    const currentPosId = getUserPositionId(user);
    const positionOptions = positionsCache.map(p => {
        const selected = currentPosId != null && Number(p.id) === currentPosId ? 'selected' : '';
        const dept = p.department_name ? ` — ${p.department_name}` : '';
        return `<option value="${p.id}" ${selected}>${escapeHtml(p.title)} (L${escapeHtml(p.level)})${escapeHtml(dept)}</option>`;
    }).join('');

    const permsRows = codenames.map(code => {
        const permObj = effective[code] || { value: false, source: 'none', source_detail: '' };
        const value = permObj.value === true;
        const permName = catalogMap.get(code) || code;
        const hasOverride = overridesMap.has(code);

        const sourceBadge = user.is_superuser
            ? formatPermSourceBadge('superuser', '')
            : formatPermSourceBadge(permObj.source, permObj.source_detail);

        return `
            <tr>
                <td>
                    <div class="fw-semibold">${escapeHtml(permName)}</div>
                    <div class="text-muted small"><code>${escapeHtml(code)}</code></div>
                </td>
                <td>${boolIcon(value)}</td>
                <td>${sourceBadge}</td>
                <td>
                    ${!user.is_superuser ? `
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-outline-success quick-perm-btn"
                                data-codename="${escapeHtml(code)}" data-action="grant"
                                title="Bu kullanıcı için izin ver">Ver</button>
                        <button type="button" class="btn btn-outline-warning quick-perm-btn"
                                data-codename="${escapeHtml(code)}" data-action="deny"
                                title="Bu kullanıcı için engelle">Engelle</button>
                        <button type="button" class="btn btn-outline-danger clear-perm-override-btn"
                                data-codename="${escapeHtml(code)}"
                                ${hasOverride ? '' : 'disabled'}
                                title="Bireysel ayarı kaldır">Sıfırla</button>
                    </div>
                    <button type="button" class="btn btn-sm btn-link text-decoration-none override-button ms-1"
                            data-codename="${escapeHtml(code)}">Detay</button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');

    const overridesRows = overrides.map(o => `
        <tr>
            <td><code>${escapeHtml(o.codename)}</code></td>
            <td>${o.granted ? '<span class="badge bg-success">İzin</span>' : '<span class="badge bg-danger">Yasak</span>'}</td>
            <td>${escapeHtml(o.reason || '-')}</td>
            <td>${o.created_at ? new Date(o.created_at).toLocaleString('tr-TR') : '-'}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-danger remove-override-btn" data-codename="${escapeHtml(o.codename)}">
                    Sil
                </button>
            </td>
        </tr>
    `).join('') || `
        <tr>
            <td colspan="5" class="text-muted">Bu kullanıcı için bireysel geçersiz kılma yok.</td>
        </tr>
    `;

    panel.innerHTML = `
        <div class="card shadow-sm h-100">
            <div class="card-body d-flex flex-column">
                <h5 class="card-title mb-1">
                    <i class="fas fa-user-shield me-2"></i>${escapeHtml(user.full_name || user.username)}
                </h5>
                <p class="text-muted mb-3">@${escapeHtml(user.username)}</p>

                <h6 class="mb-2">Pozisyon</h6>
                <div class="mb-3">${userPositionDisplay(user)}</div>
                <div class="d-flex mb-3">
                    <select class="form-select form-select-sm me-2" id="set-position-select">
                        <option value="">Pozisyonu Kaldır</option>
                        ${positionOptions}
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="set-position-btn">
                        Uygula
                    </button>
                </div>

                <h6 class="mt-1">Portal Erişimi</h6>
                <div class="d-flex flex-wrap gap-2 mb-3">
                    <button type="button"
                            class="btn btn-sm ${hasOfficeAccess ? 'btn-success' : 'btn-outline-secondary'} portal-toggle-btn"
                            data-codename="office_access"
                            data-current="${hasOfficeAccess ? 'true' : 'false'}">
                        <i class="fas fa-building me-1"></i>
                        Ofis: ${hasOfficeAccess ? 'Açık' : 'Kapalı'}
                    </button>
                    <button type="button"
                            class="btn btn-sm ${hasWorkshopAccess ? 'btn-success' : 'btn-outline-secondary'} portal-toggle-btn"
                            data-codename="workshop_access"
                            data-current="${hasWorkshopAccess ? 'true' : 'false'}">
                        <i class="fas fa-industry me-1"></i>
                        Atölye: ${hasWorkshopAccess ? 'Açık' : 'Kapalı'}
                    </button>
                </div>

                <h6 class="mt-1">Etkin Yetkiler</h6>
                <div class="table-responsive flex-grow-1" style="overflow-y: auto;">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Yetki</th>
                                <th>Durum</th>
                                <th>Kaynak</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${permsRows}</tbody>
                    </table>
                </div>

                <h6 class="mt-3">Bireysel Geçersiz Kılmalar</h6>
                <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Kod</th>
                                <th>Durum</th>
                                <th>Neden</th>
                                <th>Tarih</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${overridesRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    attachUserPanelHandlers();
}

function attachUserPanelHandlers() {
    const panel = document.getElementById('user-permissions-panel');
    if (!panel || !currentUserDetail) return;

    const user = currentUserDetail.user || currentUserDetail;
    const userId = user.id;

    const setPositionBtn = panel.querySelector('#set-position-btn');
    const setPositionSelect = panel.querySelector('#set-position-select');
    if (setPositionBtn && setPositionSelect) {
        setPositionBtn.addEventListener('click', async () => {
            const raw = setPositionSelect.value;
            const positionId = raw ? Number(raw) : null;
            try {
                const resp = await updateUserAPI(userId, { position: positionId });
                if (!resp.ok) {
                    const body = await resp.json().catch(() => ({}));
                    throw new Error(body?.detail || body?.message || 'Pozisyon güncellenemedi.');
                }
                showNotification(positionId ? 'Kullanıcının pozisyonu güncellendi.' : 'Kullanıcının pozisyonu kaldırıldı.', 'success');
                await loadUserDetail(userId);
                refreshUserTableRow();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Pozisyon güncellenirken hata oluştu', 'error');
            }
        });
    }

    panel.querySelectorAll('.override-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const codename = btn.getAttribute('data-codename');
            if (codename) openOverrideModal(userId, codename);
        });
    });

    panel.querySelectorAll('.quick-perm-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            const action = btn.getAttribute('data-action');
            if (!codename || !action) return;
            try {
                await saveUserPermissionOverride(userId, {
                    codename,
                    granted: action === 'grant',
                    reason: ''
                });
                showNotification(
                    action === 'grant'
                        ? `${codename} izni kullanıcıya verildi`
                        : `${codename} izni kullanıcı için engellendi`,
                    'success'
                );
                await loadUserDetail(userId);
                refreshUserTableRow();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Yetki güncellenirken hata oluştu', 'error');
            }
        });
    });

    panel.querySelectorAll('.clear-perm-override-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            if (!codename) return;
            try {
                await deleteUserPermissionOverride(userId, codename);
                showNotification(`${codename} için bireysel ayar kaldırıldı`, 'success');
                await loadUserDetail(userId);
                refreshUserTableRow();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Bireysel ayar kaldırılırken hata oluştu', 'error');
            }
        });
    });

    panel.querySelectorAll('.portal-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            if (!codename) return;
            const current = btn.getAttribute('data-current') === 'true';
            const nextGranted = !current;
            try {
                await saveUserPermissionOverride(userId, {
                    codename,
                    granted: nextGranted,
                    reason: ''
                });
                const label = codename === 'office_access' ? 'Ofis erişimi' : 'Atölye erişimi';
                showNotification(`${label} ${nextGranted ? 'açıldı' : 'kapatıldı'}`, 'success');
                await loadUserDetail(userId);
                refreshUserTableRow();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Portal erişimi güncellenirken hata oluştu', 'error');
            }
        });
    });

    panel.querySelectorAll('.remove-override-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            if (!codename) return;
            try {
                await deleteUserPermissionOverride(userId, codename);
                showNotification('Geçersiz kılma kaldırıldı', 'success');
                await loadUserDetail(userId);
                refreshUserTableRow();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Geçersiz kılma silinirken hata oluştu', 'error');
            }
        });
    });
}

function openOverrideModal(userId, codename) {
    if (!overrideModal) return;

    overrideModal.clearAll();
    overrideModal.setTitle(`${codename} — Yetki Geçersiz Kılma`);

    overrideModal.addSection({
        title: 'Yetki Geçersiz Kılma',
        icon: 'fas fa-user-shield',
        iconColor: 'text-primary'
    });

    overrideModal.addField({
        id: 'codename', name: 'codename', label: 'Yetki Kodu', type: 'text',
        value: codename, readonly: true, colSize: 12
    });
    overrideModal.addField({
        id: 'granted', name: 'granted', label: 'Durum', type: 'dropdown',
        value: 'true',
        options: [
            { value: 'true', label: 'Erişim Ver' },
            { value: 'false', label: 'Erişimi Engelle' }
        ],
        colSize: 12
    });
    overrideModal.addField({
        id: 'reason', name: 'reason', label: 'Sebep (opsiyonel)', type: 'textarea',
        value: '', rows: 3, colSize: 12
    });

    overrideModal.onSaveCallback(async (formData) => {
        try {
            await saveUserPermissionOverride(userId, {
                codename,
                granted: String(formData.granted) === 'true',
                reason: formData.reason || ''
            });
            overrideModal.hide();
            showNotification('Geçersiz kılma kaydedildi', 'success');
            await loadUserDetail(userId);
            refreshUserTableRow();
        } catch (e) {
            console.error(e);
            showNotification(e.message || 'Geçersiz kılma kaydedilirken hata oluştu', 'error');
        }
    });

    overrideModal.render();
    overrideModal.show();
}

// ---------------------------------------------------------------------------
// POSITIONS TAB
// ---------------------------------------------------------------------------

/** Load the lean positions list — one request, no N+1. */
async function loadPositionsList(force = false) {
    if (!force && positionsCache.length) return;
    const resp = await fetchPositions();
    positionsCache = listFromResponse(resp);
    // positionPermsCache is populated lazily in loadPositionDetail (on click).
}

async function loadPositionMatrix(force = true) {
    try {
        if (positionMatrixTable) positionMatrixTable.setLoading(true);

        await loadPositionsList(force);

        const rows = positionsCache
            .map(p => ({
                id: p.id,
                title: p.title || '-',
                level: p.level,
                department_name: p.department_name || p.department_code || '-',
                parent_title: p.parent_title || '-',
                holder_count: Number(p.holder_count || 0),
                // Use list-level count; detail fills positionPermsCache on click.
                permission_count: Number(p.permission_count || 0),
                is_active: p.is_active !== false
            }))
            .sort((a, b) => {
                const diff = Number(a.level || 0) - Number(b.level || 0);
                return diff !== 0 ? diff : (a.title || '').localeCompare(b.title || '', 'tr');
            });

        if (!positionMatrixTable) initPositionMatrixTable();
        positionMatrixTable.updateData(rows, rows.length, 1);

        if (currentPositionId) {
            await loadPositionDetail(currentPositionId);
        }
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Pozisyon listesi yüklenirken hata oluştu', 'error');
        if (positionMatrixTable) positionMatrixTable.updateData([], 0, 1);
    } finally {
        if (positionMatrixTable) positionMatrixTable.setLoading(false);
    }
}

function initPositionMatrixTable() {
    positionMatrixTable = new TableComponent('position-matrix-container', {
        title: 'Pozisyon Listesi',
        icon: 'fas fa-sitemap',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'title',
                label: 'Pozisyon',
                sortable: true,
                formatter: (v, row) => {
                    const level = row.level
                        ? `<span class="perm-level-pill ms-1">L${escapeHtml(row.level)}</span>`
                        : '';
                    return `<strong>${escapeHtml(v || '-')}</strong>${level}`;
                }
            },
            { field: 'department_name', label: 'Departman', width: '180px', sortable: true, formatter: v => escapeHtml(v || '-') },
            { field: 'parent_title', label: 'Bağlı Olduğu', width: '180px', sortable: true, formatter: v => escapeHtml(v || '-') },
            { field: 'holder_count', label: 'Kişi', width: '70px', sortable: true, type: 'number' },
            { field: 'permission_count', label: 'Yetki', width: '70px', sortable: true, type: 'number' },
            {
                field: 'is_active', label: 'Durum', width: '90px', sortable: true,
                formatter: v => v
                    ? '<span class="status-badge status-green">Aktif</span>'
                    : '<span class="status-badge status-grey">Pasif</span>'
            }
        ],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Pozisyon bulunamadı.',
        onRowClick: (row) => {
            if (row && row.id) loadPositionDetail(row.id);
        }
    });
}

async function loadPositionDetail(positionId) {
    const prevPositionId = currentPositionId;
    currentPositionId = Number(positionId);
    const panel = document.getElementById('position-permissions-panel');
    if (!panel) return;

    const positionInfo = positionsCache.find(p => Number(p.id) === currentPositionId) || { title: '-' };
    panel.innerHTML = `
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h5 class="card-title mb-1">
                    <i class="fas fa-sitemap me-2"></i>${escapeHtml(positionInfo.title || '-')}
                </h5>
                <div class="text-muted">Yükleniyor...</div>
            </div>
        </div>
    `;

    try {
        const isSamePosition =
            prevPositionId === currentPositionId &&
            currentPositionPermsDraft instanceof Set &&
            currentPositionPermsOriginal instanceof Set;

        // One request: detail returns permission_codenames + holders array.
        const detail = await fetchPositionById(currentPositionId);
        // Accept holders from the detail payload; fall back to a separate call
        // if the backend doesn't embed them yet.
        let holders = Array.isArray(detail.holders) ? detail.holders : null;
        if (holders === null) {
            const holdersResp = await fetchPositionHolders(currentPositionId);
            holders = listFromResponse(holdersResp);
        }
        positionHoldersCache.set(currentPositionId, holders);

        // Backend may return selected permission list as either `permission_codenames` (newer)
        // or `codenames` (older / different serializer). Support both.
        const codes = Array.isArray(detail.permission_codenames)
            ? detail.permission_codenames
            : (Array.isArray(detail.codenames) ? detail.codenames : []);
        const fetchedSet = new Set(codes);

        if (!isSamePosition || !currentPositionDirty) {
            positionPermsCache.set(currentPositionId, fetchedSet);
        }
        if (!isSamePosition) {
            currentPositionPermsOriginal = new Set(codes);
            currentPositionPermsDraft = new Set(codes);
            currentPositionDirty = false;
        }

        await ensurePermissionsCatalogLoaded();
        const catalog = Array.isArray(permissionsCatalog) ? permissionsCatalog : [];
        const bySection = new Map();
        for (const p of catalog) {
            const section = p.section || 'other';
            if (!bySection.has(section)) bySection.set(section, []);
            bySection.get(section).push({ codename: p.codename, name: p.name || p.codename, section });
        }
        const sections = Array.from(bySection.keys()).sort((a, b) => a.localeCompare(b, 'tr'));
        for (const section of sections) {
            bySection.get(section).sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'tr'));
        }

        const sectionCards = sections.map(section => {
            const items = bySection.get(section) || [];
            const total = items.length;
            const selectedCount = items.reduce((acc, it) => acc + (currentPositionPermsDraft.has(it.codename) ? 1 : 0), 0);
            const allSelected = total > 0 && selectedCount === total;

            const sectionId = safeId(section);
            const collapseId = `pos-section-collapse-${currentPositionId}-${sectionId}`;
            const headerId = `pos-section-header-${currentPositionId}-${sectionId}`;
            const expanded = sectionCollapseState.has(section) ? sectionCollapseState.get(section) : false;

            const children = items.map(it => {
                const checked = currentPositionPermsDraft.has(it.codename) ? 'checked' : '';
                return `
                    <div class="d-flex align-items-start justify-content-between py-1 border-bottom">
                        <div class="me-2">
                            <div class="text-body">${escapeHtml(it.name || '-')}</div>
                            <div class="text-muted small"><code>${escapeHtml(it.codename)}</code></div>
                        </div>
                        <div class="form-check m-0 pt-1">
                            <input class="form-check-input position-panel-checkbox"
                                   type="checkbox"
                                   ${checked}
                                   data-codename="${escapeHtml(it.codename)}"
                                   data-section="${escapeHtml(section)}">
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="${headerId}">
                        <div class="d-flex align-items-stretch">
                            <button class="accordion-button ${expanded ? '' : 'collapsed'} flex-grow-1" type="button"
                                    data-bs-toggle="collapse"
                                    data-bs-target="#${collapseId}"
                                    aria-expanded="${expanded ? 'true' : 'false'}"
                                    aria-controls="${collapseId}">
                                <div class="d-flex align-items-center gap-2 w-100">
                                    <span class="badge ${sectionBadgeClass(section)}">${escapeHtml(sectionLabel(section))}</span>
                                    <span class="text-muted small position-section-count" data-section="${escapeHtml(section)}">${selectedCount}/${total}</span>
                                </div>
                            </button>
                            <div class="px-3 d-flex align-items-center border-start">
                                <div class="form-check m-0">
                                    <input class="form-check-input section-parent-checkbox"
                                           type="checkbox"
                                           ${allSelected ? 'checked' : ''}
                                           data-section="${escapeHtml(section)}"
                                           onclick="event.stopPropagation();">
                                </div>
                            </div>
                        </div>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse ${expanded ? 'show' : ''}"
                         aria-labelledby="${headerId}">
                        <div class="accordion-body py-2">
                            ${children || '<div class="text-muted">-</div>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const permsList = `
            <div class="accordion" id="position-section-accordion">
                ${sectionCards || '<div class="text-muted">-</div>'}
            </div>
        `;

        panel.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title mb-1">
                        <i class="fas fa-sitemap me-2"></i>${escapeHtml(detail.title || '-')}
                        <span class="perm-level-pill ms-2">L${escapeHtml(detail.level || '-')}</span>
                    </h5>
                    <p class="text-muted mb-2">
                        ${detail.department_name ? escapeHtml(detail.department_name) : ''}
                        ${detail.parent_title ? ` &middot; Bağlı: <strong>${escapeHtml(detail.parent_title)}</strong>` : ''}
                    </p>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                        <span class="badge bg-secondary">Kişi: ${holders.length}</span>
                        <span class="badge bg-secondary" id="position-perm-count-badge">Yetki: ${currentPositionPermsDraft.size}</span>
                        <span class="badge ${detail.is_active ? 'bg-success' : 'bg-secondary'}">${detail.is_active ? 'Aktif' : 'Pasif'}</span>
                    </div>

                    <div class="d-flex gap-2 mb-3">
                        <button type="button" class="btn btn-sm btn-success" id="position-save-btn" ${currentPositionDirty ? '' : 'disabled'}>
                            <i class="fas fa-save me-1"></i>Kaydet
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="position-discard-btn" ${currentPositionDirty ? '' : 'disabled'}>
                            <i class="fas fa-undo me-1"></i>Vazgeç
                        </button>
                        <div class="ms-auto text-muted small" id="position-dirty-indicator">
                            ${currentPositionDirty ? 'Kaydedilmemiş değişiklikler' : ''}
                        </div>
                    </div>

                    <h6>Mevcut Kullanıcılar</h6>
                    <div class="mb-3" style="max-height: 120px; overflow-y: auto;">
                        ${holders.length
                            ? holders.map(h => `<div class="text-body">${escapeHtml(h.full_name || h.username || '-')}</div>`).join('')
                            : '<span class="text-muted">Bu pozisyonda kullanıcı yok.</span>'}
                    </div>

                    <h6>Yetkiler</h6>
                    <div class="flex-grow-1" style="overflow-y: auto;">
                        ${permsList}
                    </div>
                </div>
            </div>
        `;

        attachPositionPanelHandlers();
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Pozisyon detayları yüklenirken hata oluştu', 'error');
        panel.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body">
                    <h5 class="card-title mb-1">
                        <i class="fas fa-sitemap me-2"></i>${escapeHtml(positionInfo.title || '-')}
                    </h5>
                    <div class="text-muted">Detaylar yüklenemedi.</div>
                </div>
            </div>
        `;
    }
}

function captureSectionCollapseState(panelEl) {
    if (!panelEl) return;
    panelEl.querySelectorAll('.accordion-collapse').forEach(el => {
        const section = el.querySelector('.position-panel-checkbox')?.getAttribute('data-section');
        if (!section) return;
        sectionCollapseState.set(section, el.classList.contains('show'));
    });
}

/** Update panel DOM from `currentPositionPermsDraft` without refetching the position. */
function syncPositionPanelUiFromDraft(panel) {
    if (!panel) return;
    const badge = panel.querySelector('#position-perm-count-badge');
    if (badge) badge.textContent = `Yetki: ${currentPositionPermsDraft.size}`;

    panel.querySelectorAll('.position-panel-checkbox').forEach(ch => {
        const codename = ch.getAttribute('data-codename');
        if (codename) ch.checked = currentPositionPermsDraft.has(codename);
    });

    panel.querySelectorAll('.accordion-item').forEach(item => {
        const sectionCb = item.querySelector('.section-parent-checkbox');
        const section = sectionCb?.getAttribute('data-section');
        if (!section) return;

        let total = 0;
        let selected = 0;
        item.querySelectorAll('.position-panel-checkbox').forEach(ch => {
            if (ch.getAttribute('data-section') !== section) return;
            total += 1;
            const codename = ch.getAttribute('data-codename');
            if (codename && currentPositionPermsDraft.has(codename)) selected += 1;
        });

        item.querySelectorAll('.position-section-count').forEach(el => {
            if (el.getAttribute('data-section') === section) {
                el.textContent = `${selected}/${total}`;
            }
        });

        if (sectionCb) {
            sectionCb.checked = total > 0 && selected === total;
            sectionCb.indeterminate = selected > 0 && selected < total;
        }
    });
}

function attachPositionPanelHandlers() {
    const panel = document.getElementById('position-permissions-panel');
    if (!panel) return;

    const saveBtn = panel.querySelector('#position-save-btn');
    const discardBtn = panel.querySelector('#position-discard-btn');
    const dirtyIndicator = panel.querySelector('#position-dirty-indicator');

    function setDirty(isDirty) {
        currentPositionDirty = isDirty;
        if (saveBtn) saveBtn.disabled = !isDirty;
        if (discardBtn) discardBtn.disabled = !isDirty;
        if (dirtyIndicator) dirtyIndicator.textContent = isDirty ? 'Kaydedilmemiş değişiklikler' : '';
    }

    setDirty(currentPositionDirty === true);

    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            currentPositionPermsDraft = new Set(currentPositionPermsOriginal);
            setDirty(false);
            syncPositionPanelUiFromDraft(panel);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!currentPositionId) return;
            if (setsEqual(currentPositionPermsDraft, currentPositionPermsOriginal)) {
                setDirty(false);
                return;
            }
            saveBtn.disabled = true;
            if (discardBtn) discardBtn.disabled = true;
            if (dirtyIndicator) dirtyIndicator.textContent = 'Kaydediliyor...';

            try {
                const payload = Array.from(currentPositionPermsDraft);
                await patchPositionPermissions(currentPositionId, payload);

                currentPositionPermsOriginal = new Set(currentPositionPermsDraft);
                positionPermsCache.set(currentPositionId, new Set(currentPositionPermsDraft));

                // Update the list-level permission_count in the cache so the
                // table row reflects the new count without a re-fetch.
                const cachedRow = positionsCache.find(p => Number(p.id) === currentPositionId);
                if (cachedRow) cachedRow.permission_count = currentPositionPermsDraft.size;

                showNotification('Pozisyon yetkileri kaydedildi', 'success');

                await loadMatrix({});
                await loadPositionMatrix(false); // rebuilds from updated cache, no network
                await loadPermissionsList();
                setDirty(false);
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Kaydetme sırasında hata oluştu', 'error');
                setDirty(true);
            }
        });
    }

    panel.querySelectorAll('.position-panel-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const codename = cb.getAttribute('data-codename');
            const checked = cb.checked === true;
            if (!codename) return;

            if (checked) currentPositionPermsDraft.add(codename);
            else currentPositionPermsDraft.delete(codename);

            const isDirty = !setsEqual(currentPositionPermsDraft, currentPositionPermsOriginal);
            setDirty(isDirty);

            captureSectionCollapseState(panel);
            syncPositionPanelUiFromDraft(panel);
        });
    });

    panel.querySelectorAll('.section-parent-checkbox').forEach(pcb => {
        const section = pcb.getAttribute('data-section');
        if (section) {
            const children = panel.querySelectorAll(`.position-panel-checkbox[data-section="${section}"]`);
            let total = 0;
            let selected = 0;
            children.forEach(ch => {
                total += 1;
                if (ch.checked) selected += 1;
            });
            pcb.indeterminate = selected > 0 && selected < total;
        }

        pcb.addEventListener('change', () => {
            const section = pcb.getAttribute('data-section');
            if (!section) return;
            const wantChecked = pcb.checked === true;

            captureSectionCollapseState(panel);

            panel.querySelectorAll(`.position-panel-checkbox[data-section="${section}"]`).forEach(ch => {
                const codename = ch.getAttribute('data-codename');
                if (!codename) return;
                ch.checked = wantChecked;
                if (wantChecked) currentPositionPermsDraft.add(codename);
                else currentPositionPermsDraft.delete(codename);
            });

            const isDirty = !setsEqual(currentPositionPermsDraft, currentPositionPermsOriginal);
            setDirty(isDirty);
            syncPositionPanelUiFromDraft(panel);
        });
    });

    panel.querySelectorAll('.accordion-collapse').forEach(el => {
        el.addEventListener('shown.bs.collapse', () => {
            const section = el.querySelector('.position-panel-checkbox')?.getAttribute('data-section');
            if (section) sectionCollapseState.set(section, true);
        });
        el.addEventListener('hidden.bs.collapse', () => {
            const section = el.querySelector('.position-panel-checkbox')?.getAttribute('data-section');
            if (section) sectionCollapseState.set(section, false);
        });
    });
}

// ---------------------------------------------------------------------------
// PERMISSIONS TAB
// ---------------------------------------------------------------------------
async function loadPermissionsList() {
    try {
        if (!permissionsListTable) return;
        permissionsListTable.setLoading(true);

        await ensurePermissionsCatalogLoaded();

        // Fetch per-permission user list (with overrides) when available.
        let perms = [];
        try {
            perms = await fetchPermissionsUsersList();
        } catch (e) {
            console.warn('Failed to load /users/permissions/; falling back to matrix-derived list', e);
            perms = [];
        }

        const catalogMap = new Map((permissionsCatalog || []).map(p => [p.codename, p]));

        // Build positions-with-permission map from positionPermsCache
        const positionsByPerm = new Map();
        positionPermsCache.forEach((permSet, posId) => {
            const positionInfo = positionsCache.find(p => Number(p.id) === Number(posId));
            if (!positionInfo) return;
            permSet.forEach(code => {
                if (!positionsByPerm.has(code)) positionsByPerm.set(code, []);
                positionsByPerm.get(code).push(positionInfo);
            });
        });

        let rows = [];
        if (Array.isArray(perms) && perms.length) {
            rows = perms.map(p => {
                const meta = catalogMap.get(p.codename) || { name: p.codename, section: p.section || p.portal || 'other' };
                const users = Array.isArray(p.users) ? p.users : [];
                const overrides = Array.isArray(p.overrides) ? p.overrides : [];
                const positionsWith = positionsByPerm.get(p.codename) || [];

                const positionsDisplay = positionsWith.length
                    ? positionsWith.map(pos => `${pos.title} (L${pos.level})`).join(', ')
                    : '-';

                const overridesDisplay = overrides.length
                    ? overrides.map(o => `${o.username}(${o.granted ? '+' : '-'})`).join(', ')
                    : '-';

                return {
                    id: p.codename,
                    codename: p.codename,
                    name: meta.name || p.codename,
                    section: meta.section || 'other',
                    position_count: positionsWith.length,
                    user_count: users.length,
                    positions_display: positionsDisplay,
                    users_display: users.length ? users.map(u => u.username).join(', ') : '-',
                    overrides_display: overridesDisplay
                };
            });
        } else if (permissionsMatrix) {
            const codenames = permissionsMatrix.codenames || [];
            rows = codenames.map(code => {
                const meta = catalogMap.get(code) || { name: code, section: 'other' };
                const usersWith = (permissionsMatrix.users || []).filter(u => {
                    const perm = u.permissions ? u.permissions[code] : null;
                    return perm && perm.value === true;
                });
                const positionsWith = positionsByPerm.get(code) || [];
                return {
                    id: code,
                    codename: code,
                    name: meta.name || code,
                    section: meta.section || 'other',
                    position_count: positionsWith.length,
                    user_count: usersWith.length,
                    positions_display: positionsWith.length
                        ? positionsWith.map(pos => `${pos.title} (L${pos.level})`).join(', ')
                        : '-',
                    users_display: usersWith.map(u => u.username).join(', ') || '-',
                    overrides_display: '-'
                };
            });
        }

        rows.sort((a, b) => (a.section || '').localeCompare(b.section || '', 'tr') || (a.name || '').localeCompare(b.name || '', 'tr'));

        permissionsListTable.updateData(rows, rows.length, 1);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Yetki listesi yüklenirken hata oluştu', 'error');
        if (permissionsListTable) permissionsListTable.updateData([], 0, 1);
    } finally {
        if (permissionsListTable) permissionsListTable.setLoading(false);
    }
}

function initPermissionsListTable() {
    permissionsListTable = new TableComponent('permissions-list-container', {
        title: 'Yetkiler',
        icon: 'fas fa-key',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'section',
                label: 'Bölüm',
                width: '120px',
                sortable: true,
                formatter: v => `<span class="badge ${sectionBadgeClass(v)}">${escapeHtml(sectionLabel(v))}</span>`
            },
            {
                field: 'name',
                label: 'Yetki',
                width: '240px',
                sortable: true,
                formatter: (v, row) => `
                    <div class="fw-semibold">${escapeHtml(v || row.codename)}</div>
                    <div class="text-muted small"><code>${escapeHtml(row.codename)}</code></div>
                `
            },
            { field: 'position_count', label: 'Pozisyon', width: '90px', sortable: true, type: 'number' },
            { field: 'user_count', label: 'Kullanıcı', width: '90px', sortable: true, type: 'number' },
            { field: 'positions_display', label: 'Pozisyonlar', sortable: false, formatter: v => escapeHtml(v || '-') },
            { field: 'users_display', label: 'Kullanıcılar', sortable: false, formatter: v => escapeHtml(v || '-') },
            {
                field: 'overrides_display', label: 'Bireysel', sortable: false,
                formatter: v => v && v !== '-' ? `<span class="text-warning">${escapeHtml(v)}</span>` : '-'
            }
        ],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Yetki bulunamadı.'
    });
}
