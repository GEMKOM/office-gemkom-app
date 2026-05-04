import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { authFetchUsers } from '../../../../apis/users.js';
import { fetchTeams, createTeam, updateTeam, deleteTeam } from '../../../../apis/welding/teams.js';

let teamsStats = null;
let teamsFilters = null;
let teamsTable = null;
let createTeamModal = null;
let editTeamModal = null;
let deleteTeamModal = null;

let currentPage = 1;
let currentSortField = 'name';
let currentSortDirection = 'asc';
let teams = [];
let isLoading = false;
let users = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    initializeHeader();
    initializeStatistics();
    initializeModalComponents();
    await loadUsers();
    initializeFilters();
    initializeTable();
    await loadTeams();
    updateStats();
});

function initializeHeader() {
    new HeaderComponent({
        title: 'Kaynak Ekipleri',
        subtitle: 'Ekip, ustabaşı ve üye atamalarını yönetin',
        icon: 'users',
        showBackButton: 'block',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Ekip',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/welding/',
        onCreateClick: () => showCreateTeamModal(),
        onRefreshClick: async () => {
            currentPage = 1;
            await loadTeams();
        }
    });
}

function initializeStatistics() {
    teamsStats = new StatisticsCards('teams-statistics', {
        cards: [
            { title: 'Toplam Ekip', value: '0', icon: 'fas fa-users', color: 'primary' },
            { title: 'Aktif Ekip', value: '0', icon: 'fas fa-check-circle', color: 'success' },
            { title: 'Ustabaşı Atanmış', value: '0', icon: 'fas fa-user-tie', color: 'info' }
        ],
        compact: true,
        animation: true
    });
}

function initializeFilters() {
    teamsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Ekip Filtreleri',
        onApply: async () => {
            currentPage = 1;
            await loadTeams();
        },
        onClear: async () => {
            currentPage = 1;
            await loadTeams();
        }
    });

    teamsFilters.addTextFilter({
        id: 'name-filter',
        label: 'Ekip Adı',
        placeholder: 'Ekip adı ara...',
        colSize: 4
    });

    teamsFilters.addTextFilter({
        id: 'foreman-filter',
        label: 'Ustabaşı',
        placeholder: 'Ustabaşı adı ara...',
        colSize: 4
    });

    teamsFilters.addDropdownFilter({
        id: 'is-active-filter',
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

function initializeTable() {
    teamsTable = new TableComponent('teams-table-container', {
        title: 'Ekip Listesi',
        columns: [
            {
                field: 'name',
                label: 'Ekip Adı',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'foreman',
                label: 'Ustabaşı',
                sortable: false,
                formatter: (_, row) => getForemanName(row)
            },
            {
                field: 'members',
                label: 'Üyeler',
                sortable: false,
                formatter: (_, row) => formatMembers(row)
            },
            {
                field: 'members_count',
                label: 'Üye Sayısı',
                sortable: true,
                formatter: (_, row) => String(getMembersCount(row))
            },
            {
                field: 'is_active',
                label: 'Durum',
                sortable: true,
                formatter: (value) => value
                    ? '<span class="status-badge status-green">Aktif</span>'
                    : '<span class="status-badge status-grey">Pasif</span>'
            },
            {
                field: 'updated_at',
                label: 'Güncelleme',
                sortable: true,
                formatter: (value) => formatDateTime(value)
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
            await loadTeams();
        },
        onExport: async (format) => {
            await exportTeams(format);
        },
        onSort: async (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            currentPage = 1;
            await loadTeams();
        },
        onPageSizeChange: async (newPageSize) => {
            teamsTable.options.itemsPerPage = newPageSize;
            currentPage = 1;
            await loadTeams();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadTeams();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => editTeam(row.id)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => showDeleteTeamModal(row.id, row.name)
            }
        ],
        emptyMessage: 'Ekip bulunamadı',
        emptyIcon: 'fas fa-users'
    });
}

function initializeModalComponents() {
    createTeamModal = new EditModal('create-team-modal-container', {
        title: 'Yeni Ekip Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Ekip Oluştur'
    });

    editTeamModal = new EditModal('edit-team-modal-container', {
        title: 'Ekibi Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Değişiklikleri Kaydet'
    });

    deleteTeamModal = new DisplayModal('delete-team-modal-container', {
        title: 'Ekip Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    createTeamModal.onSaveCallback(async (formData) => createTeamHandler(formData));
    editTeamModal.onSaveCallback(async (formData) => updateTeamHandler(formData));
}

async function loadUsers() {
    try {
        const response = await authFetchUsers(1, 10000, { ordering: 'full_name' });
        users = response.results || [];
    } catch (error) {
        console.error('Error loading users:', error);
        users = [];
        showNotification('Kullanıcı listesi yüklenemedi', 'warning');
    }
}

function getFilterPayload() {
    const values = teamsFilters ? teamsFilters.getFilterValues() : {};
    const payload = {
        page: currentPage,
        page_size: teamsTable ? teamsTable.options.itemsPerPage : 20,
        ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
    };

    const searchTokens = [values['name-filter'], values['foreman-filter']]
        .map(v => (v || '').trim())
        .filter(Boolean);
    if (searchTokens.length > 0) {
        payload.search = searchTokens.join(' ');
    }

    if (values['is-active-filter']) {
        payload.is_active = values['is-active-filter'] === 'true';
    }

    return payload;
}

async function loadTeams() {
    if (isLoading) return;
    isLoading = true;
    if (teamsTable) teamsTable.setLoading(true);

    try {
        const response = await fetchTeams(getFilterPayload());
        teams = response.results || response || [];
        const total = response.count || response.total || teams.length;

        if (teamsTable) {
            teamsTable.updateData(teams, total, currentPage);
        }
        updateStats();
    } catch (error) {
        console.error('Error loading teams:', error);
        showNotification(error.message || 'Ekipler yüklenirken hata oluştu', 'error');
        teams = [];
        if (teamsTable) {
            teamsTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (teamsTable) teamsTable.setLoading(false);
    }
}

function updateStats() {
    if (!teamsStats) return;
    const total = teams.length;
    const active = teams.filter(team => team.is_active).length;
    const withForeman = teams.filter(team => !!normalizeId(team?.foreman ?? team?.foreman_id ?? team?.foreman?.id)).length;

    teamsStats.updateValues({
        0: String(total),
        1: String(active),
        2: String(withForeman)
    });
}

function showCreateTeamModal() {
    buildTeamModal(createTeamModal, null);
    createTeamModal.show();
}

function editTeam(teamId) {
    const team = teams.find(item => item.id === teamId);
    if (!team) {
        showNotification('Ekip bulunamadı', 'error');
        return;
    }
    buildTeamModal(editTeamModal, team);
    window.editingTeamId = teamId;
    editTeamModal.show();
}

function buildTeamModal(modal, team) {
    modal.clearAll();
    const userOptions = users.map(user => ({
        value: String(user.id),
        label: getUserLabel(user)
    }));
    const selectedMembers = getMemberIds(team);
    const selectedForeman = normalizeId(team?.foreman ?? team?.foreman_id ?? team?.foreman?.id);

    modal.addSection({
        title: 'Ekip Bilgileri',
        icon: 'fas fa-users',
        iconColor: 'text-primary'
    });

    modal.addField({
        id: team ? 'edit-name' : 'name',
        name: 'name',
        label: 'Ekip Adı',
        type: 'text',
        required: true,
        icon: 'fas fa-layer-group',
        colSize: 12,
        value: team?.name || ''
    });

    modal.addSection({
        title: 'Atamalar',
        icon: 'fas fa-user-check',
        iconColor: 'text-info'
    });

    modal.addField({
        id: team ? 'edit-foreman' : 'foreman',
        name: 'foreman',
        label: 'Ustabaşı',
        type: 'dropdown',
        icon: 'fas fa-user-tie',
        colSize: 6,
        searchable: true,
        value: selectedForeman ? String(selectedForeman) : '',
        options: [{ value: '', label: 'Ustabaşı seçilmedi' }, ...userOptions]
    });

    modal.addField({
        id: team ? 'edit-members' : 'members',
        name: 'members',
        label: 'Üyeler',
        type: 'dropdown',
        icon: 'fas fa-users',
        colSize: 6,
        searchable: true,
        multiple: true,
        value: selectedMembers.map(id => String(id)),
        options: userOptions
    });

    modal.addSection({
        title: 'Durum',
        icon: 'fas fa-toggle-on',
        iconColor: 'text-warning'
    });

    modal.addField({
        id: team ? 'edit-is-active' : 'is-active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        icon: 'fas fa-check-circle',
        value: team?.is_active !== undefined ? !!team.is_active : true,
        colSize: 12
    });
}

async function createTeamHandler(formData) {
    try {
        const payload = buildSavePayload(formData);
        await createTeam(payload);
        showNotification('Ekip başarıyla oluşturuldu', 'success');
        createTeamModal.hide();
        currentPage = 1;
        await loadTeams();
    } catch (error) {
        console.error('Error creating team:', error);
        showNotification(error.message || 'Ekip oluşturulurken hata oluştu', 'error');
    }
}

async function updateTeamHandler(formData) {
    try {
        if (!window.editingTeamId) {
            showNotification('Düzenlenecek ekip bulunamadı', 'error');
            return;
        }
        const payload = buildSavePayload(formData);
        await updateTeam(window.editingTeamId, payload);
        showNotification('Ekip başarıyla güncellendi', 'success');
        editTeamModal.hide();
        window.editingTeamId = null;
        await loadTeams();
    } catch (error) {
        console.error('Error updating team:', error);
        showNotification(error.message || 'Ekip güncellenirken hata oluştu', 'error');
    }
}

function buildSavePayload(formData) {
    const name = (formData.name || '').trim();
    if (!name) {
        throw new Error('Ekip adı zorunludur');
    }

    return {
        name,
        foreman: normalizeId(formData.foreman),
        members: normalizeIdArray(formData.members),
        is_active: formData.is_active !== undefined ? !!formData.is_active : true
    };
}

async function showDeleteTeamModal(teamId, teamName) {
    deleteTeamModal.clearData();
    deleteTeamModal.setTitle('Ekip Silme Onayı');
    deleteTeamModal.setFooterContent(`
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
            <i class="fas fa-times me-1"></i>Kapat
        </button>
        <button type="button" class="btn btn-sm btn-danger" id="confirm-delete-team-btn">
            <i class="fas fa-trash me-1"></i>Sil
        </button>
    `);

    deleteTeamModal.addSection({
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-danger'
    });

    deleteTeamModal.addField({
        id: 'delete-message',
        name: 'message',
        label: 'Mesaj',
        type: 'text',
        readonly: true,
        value: `"${teamName}" adlı ekip pasif duruma alınacaktır. Devam etmek istiyor musunuz?`,
        colSize: 12
    });

    deleteTeamModal.render();
    deleteTeamModal.show();
    window.pendingDeleteTeamId = teamId;

    const deleteBtn = deleteTeamModal.container.querySelector('#confirm-delete-team-btn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            try {
                await deleteTeam(window.pendingDeleteTeamId);
                showNotification('Ekip başarıyla silindi', 'success');
                deleteTeamModal.hide();
                window.pendingDeleteTeamId = null;
                currentPage = 1;
                await loadTeams();
            } catch (error) {
                console.error('Error deleting team:', error);
                showNotification(error.message || 'Ekip silinirken hata oluştu', 'error');
            }
        };
    }
}

async function exportTeams(format) {
    if (format !== 'csv') return;
    try {
        const filters = getFilterPayload();
        filters.page = 1;
        filters.page_size = 10000;
        const response = await fetchTeams(filters);
        const rows = response.results || response || [];

        const headers = ['Ekip Adı', 'Ustabaşı', 'Üye Sayısı', 'Üyeler', 'Durum'];
        const csvRows = rows.map(row => [
            row.name || '',
            getForemanName(row),
            getMembersCount(row),
            getMembersList(row).join(', '),
            row.is_active ? 'Aktif' : 'Pasif'
        ]);

        const csvContent = [headers, ...csvRows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `kaynak_ekipleri_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showNotification('Dışa aktarma başarılı', 'success');
    } catch (error) {
        console.error('Error exporting teams:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    }
}

function normalizeId(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizeIdArray(value) {
    if (Array.isArray(value)) {
        return value.map(v => normalizeId(v)).filter(v => v !== null);
    }
    const single = normalizeId(value);
    return single !== null ? [single] : [];
}

function getUserLabel(user) {
    if (!user) return '-';
    if (user.full_name) return `${user.full_name} (${user.username || ''})`.trim();
    if (user.first_name || user.last_name) {
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return user.username ? `${fullName} (${user.username})` : fullName;
    }
    return user.username || `Kullanıcı #${user.id}`;
}

function getUserNameById(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return `#${userId}`;
    return user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || `#${userId}`;
}

function getForemanName(row) {
    if (!row) return '-';
    if (row.foreman_full_name) return row.foreman_full_name;
    if (row.foreman_name) return row.foreman_name;
    if (row.foreman && typeof row.foreman === 'object') {
        return row.foreman.full_name || `${row.foreman.first_name || ''} ${row.foreman.last_name || ''}`.trim() || row.foreman.username || '-';
    }
    const foremanId = normalizeId(row.foreman ?? row.foreman_id);
    return foremanId ? getUserNameById(foremanId) : '-';
}

function getMemberIds(row) {
    if (!row) return [];
    if (Array.isArray(row.member_ids)) return normalizeIdArray(row.member_ids);
    if (Array.isArray(row.members)) {
        if (row.members.length > 0 && typeof row.members[0] === 'object') {
            return normalizeIdArray(row.members.map(member => member.id));
        }
        return normalizeIdArray(row.members);
    }
    if (Array.isArray(row.members_detail)) {
        return normalizeIdArray(row.members_detail.map(member => member.id));
    }
    return [];
}

function getMembersList(row) {
    if (!row) return [];
    const objectList = Array.isArray(row.members_detail) ? row.members_detail
        : Array.isArray(row.members) && row.members.length > 0 && typeof row.members[0] === 'object'
            ? row.members
            : [];

    if (objectList.length > 0) {
        return objectList.map(member =>
            member.full_name ||
            `${member.first_name || ''} ${member.last_name || ''}`.trim() ||
            member.username ||
            `#${member.id}`
        );
    }
    return getMemberIds(row).map(userId => getUserNameById(userId));
}

function getMembersCount(row) {
    if (typeof row?.members_count === 'number') return row.members_count;
    return getMembersList(row).length;
}

function formatMembers(row) {
    const members = getMembersList(row);
    if (members.length === 0) return '-';
    if (members.length <= 2) return members.join(', ');
    return `${members.slice(0, 2).join(', ')} +${members.length - 2}`;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}
