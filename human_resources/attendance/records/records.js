import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';

// Session modal field definitions (shared between edit and add)
const SESSION_FIELDS = [
    { id: 's_check_in_time',  name: 's_check_in_time',  label: 'Giriş Saati',  type: 'datetime-local', required: true, colSize: 6 },
    { id: 's_check_out_time', name: 's_check_out_time', label: 'Çıkış Saati',  type: 'datetime-local', colSize: 6 },
    {
        id: 's_method', name: 's_method', label: 'Yöntem', type: 'dropdown', colSize: 6,
        options: [
            { value: 'ip',              label: 'IP (Ofis Ağı)' },
            { value: 'gps',             label: 'GPS' },
            { value: 'manual_override', label: 'Manuel Değişim Talebi' },
            { value: 'hr_manual',       label: 'HR Değişikliği' },
        ]
    },
    {
        id: 's_status', name: 's_status', label: 'Durum', type: 'dropdown', colSize: 6,
        options: [
            { value: 'open',                     label: 'Açık' },
            { value: 'closed',                   label: 'Kapalı' },
            { value: 'pending_override',          label: 'HR Onayı Bekliyor (Giriş)' },
            { value: 'pending_checkout_override', label: 'HR Onayı Bekliyor (Çıkış)' },
            { value: 'override_rejected',         label: 'Reddedildi' },
        ]
    },
    { id: 's_override_reason', name: 's_override_reason', label: 'Açıklama', type: 'text', placeholder: 'Override nedeni...', colSize: 12 },
];

import {
    fetchAttendanceHrRecords,
    patchAttendanceHrRecord,
    createAttendanceHrSession,
    patchAttendanceHrSession,
    deleteAttendanceHrSession,
} from '../../../apis/human_resources/attendance.js';
import { fetchUserGroups } from '../../../apis/users.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(value) {
    if (!value) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        const d = new Date(`${value}T00:00:00`);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('tr-TR');
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('tr-TR');
}

function fmtTime(value) {
    if (!value) return '-';
    const raw = String(value);
    const simple = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (simple) return simple[1];
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function toLocalDateTimeInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFirstSession(row) {
    const sessions = row.sessions || [];
    return sessions.length > 0 ? sessions[0] : null;
}

function getLastSession(row) {
    const sessions = row.sessions || [];
    return sessions.length > 0 ? sessions[sessions.length - 1] : null;
}

function statusBadge(st, display = null) {
    const map = {
        pending_override:         { cls: 'status-yellow', label: 'HR Onayı Bekliyor (Giriş)' },
        pending_checkout_override:{ cls: 'status-yellow', label: 'HR Onayı Bekliyor (Çıkış)' },
        active:                   { cls: 'status-blue',   label: 'Aktif (Giriş Yapıldı)' },
        complete:                 { cls: 'status-green',  label: 'Tamamlandı' },
        override_rejected:        { cls: 'status-red',    label: 'Reddedildi' },
        leave:                    { cls: 'status-grey',   label: 'İzinli' },
        // session statuses
        open:                     { cls: 'status-blue',   label: 'Açık' },
        closed:                   { cls: 'status-green',  label: 'Kapalı' },
    };
    const mapped = map[st] || { cls: 'status-grey', label: st || '-' };
    return `<span class="status-badge ${mapped.cls}">${display || mapped.label}</span>`;
}


// ---------------------------------------------------------------------------
// Page class
// ---------------------------------------------------------------------------

class AttendanceRecordsPage {
    constructor() {
        this.filtersComponent = null;
        this.tableComponent = null;
        this.editModal = null;
        this.sessionModal = null;
        this.confirmModal = null;
        this.currentFilters = { date: this.todayIso() };
        this.editingRecordId = null;
        this._sessionSaveAction = null; // { type: 'edit', sessionId } | { type: 'add', recordId }
        this.groups = [];
        this.records = [];
        this.expandedRecordIds = new Set();
        this.init();
    }

    async init() {
        if (!guardRoute()) return;
        if (!initRouteProtection()) return;

        await initNavbar();
        this.initHeader();
        this.initFilters();
        this.initTable();
        this.initRecordEditModal();
        this.initSessionModal();
        this.initConfirmModal();
        this.setupEventListeners();

        await this.loadGroups();
        await this.load();
    }

    async loadGroups() {
        try {
            const data = await fetchUserGroups();
            const groups = Array.isArray(data) ? data : (data?.results || data?.data || []);
            this.groups = groups;
            const options = [
                { value: '', label: 'Tümü' },
                ...groups.map(g => {
                    const id = g?.id ?? g?.pk ?? g?.group_id;
                    return {
                        value: id != null ? String(id) : '',
                        label: g.display_name || g.label || g.name || String(id || '')
                    };
                }).filter(o => o.value !== '')
            ];
            if (this.filtersComponent) this.filtersComponent.updateFilterOptions('group_id', options);
        } catch (e) {
            console.error('Failed to load groups:', e);
            if (this.filtersComponent) this.filtersComponent.updateFilterOptions('group_id', [{ value: '', label: 'Tümü' }]);
        }
    }

    initHeader() {
        const header = new HeaderComponent({
            title: 'PDKS Kayıtları',
            subtitle: 'Kayıtları filtreleyin ve inceleyin',
            icon: 'clipboard-list',
            showBackButton: 'block',
            showRefreshButton: 'block',
            refreshButtonText: 'Yenile'
        });
        header.render();
    }

    initFilters() {
        this.filtersComponent = new FiltersComponent('filters-container', {
            title: 'Filtreler',
            onApply: (values) => this.applyFilters(values),
            onClear: () => this.clearFilters()
        });

        this.filtersComponent.addDateFilter({ id: 'date',      label: 'Tarih',      colSize: 2 });
        this.filtersComponent.addDateFilter({ id: 'date_from', label: 'Başlangıç',  colSize: 2 });
        this.filtersComponent.addDateFilter({ id: 'date_to',   label: 'Bitiş',      colSize: 2 });

        this.filtersComponent.addTextFilter({ id: 'user_id',  label: 'Kullanıcı ID', placeholder: 'Örn: 5', type: 'number', colSize: 2 });
        this.filtersComponent.addTextFilter({ id: 'username', label: 'Kullanıcı adı', placeholder: 'Örn: john', colSize: 2 });
        this.filtersComponent.addTextFilter({ id: 'name',     label: 'Ad/Soyad', placeholder: 'Örn: Ahmet', colSize: 2 });

        this.filtersComponent.addDropdownFilter({
            id: 'group_id', label: 'Grup',
            options: [{ value: '', label: 'Yükleniyor...' }],
            placeholder: 'Tümü', searchable: true, colSize: 3
        });

        this.filtersComponent.addDropdownFilter({
            id: 'status', label: 'Durum',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'active',                    label: 'Aktif (Giriş Yapıldı)' },
                { value: 'complete',                  label: 'Tamamlandı' },
                { value: 'pending_override',          label: 'HR Onayı Bekliyor (Giriş)' },
                { value: 'pending_checkout_override', label: 'HR Onayı Bekliyor (Çıkış)' },
                { value: 'override_rejected',         label: 'Reddedildi' },
                { value: 'leave',                     label: 'İzinli' },
            ],
            placeholder: 'Tümü', colSize: 2
        });

        this.filtersComponent.setFilterValues({ date: this.currentFilters.date });
    }

    initTable() {
        this.tableComponent = new TableComponent('table-container', {
            title: 'PDKS Kayıtları',
            icon: 'clipboard-list',
            iconColor: 'info',
            columns: [
                {
                    field: '_expand',
                    label: '',
                    sortable: false,
                    width: '56px',
                    formatter: (v, row) => this.expandColumnFormatter(row)
                },
                {
                    field: 'user_display',
                    label: 'Kullanıcı',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'session') {
                            const method = row.method_display || row.method || '-';
                            const ip = row.client_ip ? `<div class="text-muted small">IP: ${row.client_ip}</div>` : '';
                            return `
                                <div class="ps-4">
                                    <strong>↳ Oturum #${row.id}</strong>
                                    <div class="text-muted small">${method}</div>
                                    ${ip}
                                </div>
                            `;
                        }
                        if (row._rowType === 'add-session') {
                            return `<div class="ps-4 text-muted fst-italic small">Yeni oturum ekle</div>`;
                        }
                        return `<strong>${row.user_display || v || '-'}</strong>`;
                    }
                },
                {
                    field: 'date',
                    label: 'Tarih',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'session') return fmtDate(row.check_in_time || row._recordDate);
                        if (row._rowType === 'add-session') return '';
                        return fmtDate(row.date || row.first_check_in || getFirstSession(row)?.check_in_time);
                    }
                },
                {
                    field: 'check_in_at',
                    label: 'Giriş',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'add-session') return '';
                        return fmtTime(row._rowType === 'session'
                            ? row.check_in_time
                            : (row.first_check_in || getFirstSession(row)?.check_in_time));
                    }
                },
                {
                    field: 'check_out_at',
                    label: 'Çıkış',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'add-session') return '';
                        return fmtTime(row._rowType === 'session'
                            ? row.check_out_time
                            : (row.last_check_out || getLastSession(row)?.check_out_time));
                    }
                },
                {
                    field: 'status',
                    label: 'Durum',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'add-session') return '';
                        return statusBadge(row.status, row.status_display || null);
                    }
                },
                {
                    field: 'override_reason',
                    label: 'Açıklama',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'add-session') return '';
                        if (row._rowType === 'session') {
                            const r = row.override_reason || '';
                            return r ? `<span title="${r.replaceAll('"', '&quot;')}">${r}</span>` : '-';
                        }
                        const reasons = (row.sessions || []).map(s => s.override_reason).filter(Boolean).join(' | ');
                        return reasons ? `<span title="${reasons.replaceAll('"', '&quot;')}">${reasons}</span>` : '-';
                    }
                },
                {
                    field: 'overtime_hours',
                    label: 'Fazla Mesai (dk)',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'session') {
                            const mins = row.duration_minutes ?? 0;
                            return mins > 0 ? `${mins} dk` : '-';
                        }
                        if (row._rowType === 'add-session') return '';
                        const mins = row.overtime_minutes ?? 0;
                        return mins > 0 ? `${mins} dk` : '-';
                    }
                },
                {
                    field: 'total_present_minutes',
                    label: 'Ofiste (dk)',
                    sortable: false,
                    formatter: (v, row) => {
                        if (row._rowType === 'add-session') return '';
                        if (row._rowType === 'session') return '';
                        return row.total_present_minutes > 0 ? `${row.total_present_minutes} dk` : '-';
                    }
                }
            ],
            actions: [
                {
                    key: 'edit-record',
                    label: 'Kaydı Düzenle',
                    icon: 'fas fa-edit',
                    class: 'btn-outline-primary',
                    visible: (row) => row._rowType === 'record',
                    onClick: (row) => this.openRecordEdit(row)
                },
                {
                    key: 'edit-session',
                    label: 'Düzenle',
                    icon: 'fas fa-pen',
                    class: 'btn-outline-secondary btn-sm',
                    visible: (row) => row._rowType === 'session',
                    onClick: (row) => this.openSessionEdit(row)
                },
                {
                    key: 'delete-session',
                    label: 'Sil',
                    icon: 'fas fa-trash',
                    class: 'btn-outline-danger btn-sm',
                    visible: (row) => row._rowType === 'session',
                    onClick: (row) => this.confirmDeleteSession(row)
                },
                {
                    key: 'add-session',
                    label: 'Oturum Ekle',
                    icon: 'fas fa-plus',
                    class: 'btn-outline-success btn-sm',
                    visible: (row) => row._rowType === 'add-session',
                    onClick: (row) => this.openAddSession(row._recordId)
                },
            ],
            pagination: false,
            loading: false,
            skeleton: true,
            emptyMessage: 'Kayıt bulunamadı',
            emptyIcon: 'fas fa-clipboard-list',
            rowAttributes: (row) => {
                if (row._rowType === 'session') return { class: 'table-light' };
                if (row._rowType === 'add-session') return { class: 'table-secondary' };
                return {};
            }
        });
    }

    initRecordEditModal() {
        this.editModal = new EditModal('edit-modal-container', {
            title: 'Kayıt Düzenle',
            saveButtonText: 'Kaydet',
            size: 'lg'
        });

        this.editModal.addSection({
            id: 'attendance-edit',
            title: 'Günlük Kayıt',
            icon: 'fas fa-clipboard-list',
            iconColor: 'text-primary',
            fields: [
                { id: 'user_display',      name: 'user_display',      label: 'Kullanıcı', type: 'text', readonly: true, colSize: 6 },
                { id: 'reviewed_by_display', name: 'reviewed_by_display', label: 'İnceleyen', type: 'text', readonly: true, colSize: 6 },
                { id: 'date',              name: 'date',              label: 'Tarih',     type: 'date', readonly: true, colSize: 4 },
                {
                    id: 'status', name: 'status', label: 'Durum', type: 'dropdown',
                    options: [
                        { value: 'active',                    label: 'Aktif (Giriş Yapıldı)' },
                        { value: 'complete',                  label: 'Tamamlandı' },
                        { value: 'pending_override',          label: 'HR Onayı Bekliyor (Giriş)' },
                        { value: 'pending_checkout_override', label: 'HR Onayı Bekliyor (Çıkış)' },
                        { value: 'override_rejected',         label: 'Reddedildi' },
                        { value: 'leave',                     label: 'İzinli' },
                    ],
                    placeholder: 'Seçiniz...', colSize: 4
                },
                {
                    id: 'leave_type', name: 'leave_type', label: 'İzin Türü', type: 'dropdown',
                    options: [
                        { value: '', label: '—' },
                        { value: 'annual_leave',       label: 'Yıllık İzin' },
                        { value: 'sick_leave',         label: 'Hastalık İzni' },
                        { value: 'maternity_leave',    label: 'Doğum İzni' },
                        { value: 'paternity_leave',    label: 'Babalık İzni' },
                        { value: 'bereavement_leave',  label: 'Ölüm İzni' },
                        { value: 'marriage_leave',     label: 'Evlilik İzni' },
                        { value: 'public_duty',        label: 'Resmi Görev' },
                        { value: 'compensatory_leave', label: 'Mazeret İzni' },
                        { value: 'business_trip',      label: 'Görev Seyahati' },
                        { value: 'half_day',           label: 'Yarım Gün' },
                        { value: 'paid_leave',         label: 'Ücretli İzin' },
                        { value: 'unpaid_leave',       label: 'Ücretsiz İzin' },
                        { value: 'unauthorized_absence', label: 'İzinsiz Devamsızlık' },
                    ],
                    placeholder: 'Seçiniz...', colSize: 4
                },
                { id: 'notes', name: 'notes', label: 'Notlar', type: 'textarea', rows: 3, colSize: 12 },
            ]
        });

        this.editModal.render();
        this.editModal.onSaveCallback(async (data) => this.saveRecordEdit(data));
    }

    initConfirmModal() {
        this.confirmModal = new ConfirmationModal('action-confirm-modal-container', {
            title: 'Onay',
            confirmText: 'Evet',
            cancelText: 'İptal',
            confirmButtonClass: 'btn-danger'
        });
    }

    // -------------------------------------------------------------------------
    // Record edit
    // -------------------------------------------------------------------------

    openRecordEdit(row) {
        this.editingRecordId = row.id;
        this.editModal.setFormData({
            user_display:       row.user_display || '',
            reviewed_by_display: row.reviewed_by_display || '',
            date:       row.date || '',
            status:     row.status || '',
            leave_type: row.leave_type || '',
            notes:      row.notes || '',
        });
        this.editModal.show();
    }

    async saveRecordEdit(formData) {
        if (!this.editingRecordId) return;
        const patch = {};
        if (formData.status)              patch.status = formData.status;
        if (formData.leave_type !== undefined) patch.leave_type = formData.leave_type || null;
        if (formData.notes !== undefined) patch.notes = formData.notes;

        try {
            await patchAttendanceHrRecord(this.editingRecordId, patch);
            showNotification('Kayıt güncellendi', 'success');
            this.editModal.hide();
            await this.load();
        } catch (e) {
            showNotification(`Güncelleme başarısız: ${e.message || e}`, 'error');
            throw e;
        }
    }

    // -------------------------------------------------------------------------
    // Session modal (EditModal-based, shared for edit and add)
    // -------------------------------------------------------------------------

    initSessionModal() {
        this.sessionModal = new EditModal('session-modal-container', {
            title: 'Oturum',
            icon: 'fas fa-clock',
            saveButtonText: 'Kaydet',
            size: 'lg'
        });

        this.sessionModal.addSection({
            id: 'session-fields',
            fields: SESSION_FIELDS
        });
        this.sessionModal.render();

        this.sessionModal.onSaveCallback(async (formData) => {
            const action = this._sessionSaveAction;
            if (!action) return;

            const ci = (formData.s_check_in_time || '').trim();
            if (!ci) {
                showNotification('Giriş saati zorunludur.', 'error');
                throw new Error('validation');
            }

            const payload = {
                check_in_time:   ci,
                check_out_time:  (formData.s_check_out_time || '').trim() || null,
                method:          formData.s_method   || 'hr_manual',
                status:          formData.s_status   || 'closed',
                override_reason: (formData.s_override_reason || '').trim(),
            };

            if (action.type === 'edit') {
                await patchAttendanceHrSession(action.sessionId, payload);
                showNotification('Oturum güncellendi', 'success');
            } else {
                await createAttendanceHrSession(action.recordId, payload);
                showNotification('Oturum eklendi', 'success');
            }

            this.sessionModal.hide();
            await this.load();
        });
    }

    openSessionEdit(sessionRow) {
        this._sessionSaveAction = { type: 'edit', sessionId: sessionRow.id };
        this.sessionModal.setTitle(`Oturum #${sessionRow.id} Düzenle`);
        this.sessionModal.setFormData({
            s_check_in_time:   toLocalDateTimeInput(sessionRow.check_in_time),
            s_check_out_time:  toLocalDateTimeInput(sessionRow.check_out_time),
            s_method:          sessionRow.method          || 'hr_manual',
            s_status:          sessionRow.status          || 'closed',
            s_override_reason: sessionRow.override_reason || '',
        });
        this.sessionModal.show();
    }

    openAddSession(recordId) {
        this._sessionSaveAction = { type: 'add', recordId };
        this.sessionModal.setTitle('Yeni Oturum Ekle');
        this.sessionModal.setFormData({
            s_check_in_time:   '',
            s_check_out_time:  '',
            s_method:          'hr_manual',
            s_status:          'closed',
            s_override_reason: '',
        });
        this.sessionModal.show();
    }

    // -------------------------------------------------------------------------
    // Session delete
    // -------------------------------------------------------------------------

    confirmDeleteSession(sessionRow) {
        this.confirmModal.show({
            title: 'Oturumu Sil',
            message: `Oturum #${sessionRow.id} silinecek. Bu işlem geri alınamaz.`,
            confirmText: 'Sil',
            confirmButtonClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    await deleteAttendanceHrSession(sessionRow.id);
                    showNotification('Oturum silindi', 'success');
                    await this.load();
                } catch (e) {
                    showNotification(`Silme başarısız: ${e.message || e}`, 'error');
                    throw e;
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.load();
            } else if (e.target.id === 'back-to-main' || e.target.closest('#back-to-main')) {
                window.location.href = '/human_resources/';
            } else if (e.target.closest('.attendance-session-toggle')) {
                e.preventDefault();
                e.stopPropagation();
                const button = e.target.closest('.attendance-session-toggle');
                const recordId = Number(button?.getAttribute('data-record-id'));
                if (!recordId) return;
                if (this.expandedRecordIds.has(recordId)) {
                    this.expandedRecordIds.delete(recordId);
                } else {
                    this.expandedRecordIds.add(recordId);
                }
                this.renderRows();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Data loading and rendering
    // -------------------------------------------------------------------------

    async load() {
        try {
            this.tableComponent.setLoading(true);
            const resp = await fetchAttendanceHrRecords(this.currentFilters);
            const rows = Array.isArray(resp) ? resp : (resp?.results || []);
            this.records = rows;
            this.tableComponent.setLoading(false);
            this.renderRows();
        } catch (e) {
            console.error(e);
            this.records = [];
            this.expandedRecordIds.clear();
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData([], 0, 1);
            showNotification(`Kayıtlar yüklenemedi: ${e.message || e}`, 'error');
        }
    }

    async applyFilters(values) {
        this.currentFilters = {
            date:      values.date      || '',
            date_from: values.date_from || '',
            date_to:   values.date_to   || '',
            user_id:   values.user_id   || '',
            username:  values.username  || '',
            name:      values.name      || '',
            group_id:  values.group_id  || '',
            status:    values.status    || '',
        };
        this.expandedRecordIds.clear();
        await this.load();
        showNotification('Filtreler uygulandı', 'info', 1500);
    }

    async clearFilters() {
        this.currentFilters = {};
        this.expandedRecordIds.clear();
        await this.load();
        showNotification('Filtreler temizlendi', 'info', 1500);
    }

    todayIso() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    expandColumnFormatter(row) {
        if (row._rowType === 'session' || row._rowType === 'add-session') return '';
        const sessions = row.sessions || [];
        const isExpanded = this.expandedRecordIds.has(row.id);
        const count = sessions.length;
        const icon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
        const label = count > 0 ? `${count}` : '+';
        const title = isExpanded ? 'Oturumları gizle' : 'Oturumları göster / ekle';
        return `
            <button
                type="button"
                class="btn btn-sm btn-outline-primary attendance-session-toggle"
                data-record-id="${row.id}"
                title="${title}"
            >
                <i class="fas ${icon}"></i>
                <span class="ms-1 small">${label}</span>
            </button>
        `;
    }

    getDisplayRows() {
        const displayRows = [];
        for (const record of this.records) {
            displayRows.push({ ...record, _rowType: 'record' });
            if (!this.expandedRecordIds.has(record.id)) continue;
            const sessions = Array.isArray(record.sessions) ? record.sessions : [];
            for (const session of sessions) {
                displayRows.push({
                    ...session,
                    _rowType: 'session',
                    _recordId: record.id,
                    _recordDate: record.date,
                });
            }
            // Always show the "add session" sentinel row when expanded
            displayRows.push({ _rowType: 'add-session', _recordId: record.id, id: `add-${record.id}` });
        }
        return displayRows;
    }

    renderRows() {
        const rows = this.getDisplayRows();
        this.tableComponent.updateData(rows, rows.length, 1);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = new AttendanceRecordsPage();
    window.attendanceRecordsPage = page;
});
