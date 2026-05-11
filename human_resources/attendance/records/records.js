import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';

import { fetchAttendanceHrRecords, patchAttendanceHrRecord } from '../../../apis/human_resources/attendance.js';
import { fetchUserGroups } from '../../../apis/users.js';

function pick(obj, keys) {
    for (const k of keys) {
        if (obj && obj[k] != null) return obj[k];
    }
    return null;
}

function fmtDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('tr-TR');
}

function fmtDate(value) {
    if (!value) return '-';
    // If backend sends YYYY-MM-DD, keep it stable and locale-friendly
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
    // Accept plain HH:MM or HH:MM:SS
    const raw = String(value);
    const simple = raw.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
    if (simple) return simple[1];
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status, statusDisplay = null) {
    const map = {
        pending_override: { cls: 'status-yellow', label: 'İnsan Kaynakları Onayı Bekliyor (GİRİŞ)' },
        pending_checkout_override: { cls: 'status-yellow', label: 'İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)' },
        active: { cls: 'status-blue', label: 'Aktif (Giriş Yapıldı)' },
        complete: { cls: 'status-green', label: 'Tamamlandı (Çıkış Yapıldı)' },
        override_rejected: { cls: 'status-red', label: 'Reddedildi' },
        rejected: { cls: 'status-red', label: 'Reddedildi' },
        submitted: { cls: 'status-yellow', label: 'Onay Bekliyor' },
        approved: { cls: 'status-green', label: 'Onaylandı' },
        cancelled: { cls: 'status-grey', label: 'İptal Edildi' }
    };
    const mapped = map[status] || { cls: 'status-grey', label: status || '-' };
    const label = statusDisplay || mapped.label;
    const v = { cls: mapped.cls, label };
    return `<span class="status-badge ${v.cls}">${v.label}</span>`;
}

class AttendanceRecordsPage {
    constructor() {
        this.filtersComponent = null;
        this.tableComponent = null;
        this.editModal = null;
        this.currentFilters = {};
        this.editingId = null;
        this.groups = [];
        this.init();
    }

    async init() {
        if (!guardRoute()) return;
        if (!initRouteProtection()) return;

        await initNavbar();
        this.initHeader();
        this.initFilters();
        this.initTable();
        this.initEditModal();
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

            if (this.filtersComponent) {
                this.filtersComponent.updateFilterOptions('group_id', options);
            }
        } catch (e) {
            console.error('Failed to load groups:', e);
            if (this.filtersComponent) {
                this.filtersComponent.updateFilterOptions('group_id', [{ value: '', label: 'Tümü' }]);
            }
        }
    }

    initHeader() {
        const header = new HeaderComponent({
            title: 'Yoklama Kayıtları',
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

        this.filtersComponent.addDateFilter({
            id: 'date',
            label: 'Tarih',
            colSize: 2
        });

        this.filtersComponent.addDateFilter({
            id: 'date_from',
            label: 'Başlangıç',
            colSize: 2
        });

        this.filtersComponent.addDateFilter({
            id: 'date_to',
            label: 'Bitiş',
            colSize: 2
        });

        this.filtersComponent.addTextFilter({
            id: 'user_id',
            label: 'Kullanıcı ID',
            placeholder: 'Örn: 5',
            type: 'number',
            colSize: 2
        });

        this.filtersComponent.addTextFilter({
            id: 'username',
            label: 'Kullanıcı adı',
            placeholder: 'Örn: john',
            colSize: 2
        });

        this.filtersComponent.addTextFilter({
            id: 'name',
            label: 'Ad/Soyad',
            placeholder: 'Örn: Ahmet',
            colSize: 2
        });

        this.filtersComponent.addDropdownFilter({
            id: 'group_id',
            label: 'Grup',
            options: [
                { value: '', label: 'Yükleniyor...' }
            ],
            placeholder: 'Tümü',
            searchable: true,
            colSize: 3
        });

        this.filtersComponent.addDropdownFilter({
            id: 'status',
            label: 'Durum',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'active', label: 'Aktif (Giriş Yapıldı)' },
                { value: 'complete', label: 'Tamamlandı (Çıkış Yapıldı)' },
                { value: 'pending_override', label: 'İnsan Kaynakları Onayı Bekliyor (GİRİŞ)' },
                { value: 'pending_checkout_override', label: 'İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)' },
                { value: 'override_rejected', label: 'Reddedildi' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        });

        this.filtersComponent.addDropdownFilter({
            id: 'method',
            label: 'Yöntem',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'ip', label: 'IP (Ofis Ağı)' },
                { value: 'gps', label: 'GPS' },
                { value: 'manual_override', label: 'Manuel Değişim Talebi' },
                { value: 'hr_manual', label: 'Manuel' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        });
    }

    initTable() {
        this.tableComponent = new TableComponent('table-container', {
            title: 'Yoklama Kayıtları',
            icon: 'clipboard-list',
            iconColor: 'info',
            columns: [
                {
                    field: 'user_display',
                    label: 'Kullanıcı',
                    sortable: false,
                    formatter: (v, row) => {
                        const userDisplay = row.user_display || v || '-';
                        return `<strong>${userDisplay}</strong>`;
                    }
                },
                {
                    field: 'date',
                    label: 'Tarih',
                    sortable: false,
                    formatter: (v, row) => {
                        const dateVal = row.date || pick(row, ['check_in_time', 'check_in_at', 'check_in', 'check_out_time', 'check_out_at', 'check_out']);
                        return fmtDate(dateVal);
                    }
                },
                {
                    field: 'check_in_at',
                    label: 'Giriş',
                    sortable: false,
                    formatter: (v, row) => fmtTime(pick(row, ['check_in_at', 'check_in_time', 'check_in']))
                },
                {
                    field: 'check_out_at',
                    label: 'Çıkış',
                    sortable: false,
                    formatter: (v, row) => fmtTime(pick(row, ['check_out_at', 'check_out_time', 'check_out']))
                },
                {
                    field: 'status',
                    label: 'Durum',
                    sortable: false,
                    formatter: (v, row) => statusBadge(row.status, row.status_display || row.status_label)
                },
                {
                    field: 'override_reason',
                    label: 'Açıklama',
                    sortable: false,
                    formatter: (v, row) => {
                        const reason = pick(row, ['override_reason', 'reason']) || '';
                        return reason ? `<span title="${reason.replaceAll('"', '&quot;')}">${reason}</span>` : '-';
                    }
                },
                {
                    field: 'overtime_hours',
                    label: 'Fazla Mesai (saat)',
                    sortable: false,
                    formatter: (v, row) => {
                        const ot = pick(row, ['overtime_hours', 'overtime']) ?? v;
                        if (ot === undefined || ot === null || ot === '') return '0.00';
                        const n = Number(ot);
                        if (Number.isFinite(n)) return n.toFixed(2);
                        return String(ot);
                    }
                }
            ],
            actions: [
                {
                    key: 'edit',
                    label: 'Düzenle',
                    icon: 'fas fa-edit',
                    class: 'btn-outline-primary',
                    onClick: (row) => this.openEdit(row)
                }
            ],
            pagination: false,
            loading: false,
            skeleton: true,
            emptyMessage: 'Kayıt bulunamadı',
            emptyIcon: 'fas fa-clipboard-list'
        });
    }

    initEditModal() {
        this.editModal = new EditModal('edit-modal-container', {
            title: 'Yoklama Kaydı Düzenle',
            saveButtonText: 'Kaydet',
            size: 'xl'
        });

        this.editModal.addSection({
            id: 'attendance-edit',
            title: 'Kayıt',
            icon: 'fas fa-clipboard-list',
            iconColor: 'text-primary',
            fields: [
                { id: 'user_display', name: 'user_display', label: 'Kullanıcı', type: 'text', readonly: true, colSize: 6 },
                { id: 'reviewed_by_display', name: 'reviewed_by_display', label: 'İnceleyen', type: 'text', readonly: true, colSize: 6 },

                { id: 'date', name: 'date', label: 'Tarih', type: 'date', colSize: 4 },
                { id: 'check_in_time', name: 'check_in_time', label: 'Giriş Saati', type: 'datetime-local', colSize: 4 },
                { id: 'check_out_time', name: 'check_out_time', label: 'Çıkış Saati', type: 'datetime-local', colSize: 4 },

                {
                    id: 'method',
                    name: 'method',
                    label: 'Yöntem',
                    type: 'dropdown',
                    options: [
                        { value: 'ip', label: 'IP (Ofis Ağı)' },
                        { value: 'gps', label: 'GPS' },
                        { value: 'manual_override', label: 'Manuel Değişim Talebi' },
                        { value: 'hr_manual', label: 'Manuel' }
                    ],
                    placeholder: 'Seçiniz...',
                    colSize: 4
                },
                {
                    id: 'status',
                    name: 'status',
                    label: 'Durum',
                    type: 'dropdown',
                    options: [
                        { value: 'active', label: 'Aktif (Giriş Yapıldı)' },
                        { value: 'complete', label: 'Tamamlandı (Çıkış Yapıldı)' },
                        { value: 'pending_override', label: 'İnsan Kaynakları Onayı Bekliyor (GİRİŞ)' },
                        { value: 'pending_checkout_override', label: 'İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)' },
                        { value: 'override_rejected', label: 'Reddedildi' }
                    ],
                    placeholder: 'Seçiniz...',
                    colSize: 4
                },
                { id: 'overtime_hours', name: 'overtime_hours', label: 'Fazla Mesai (saat)', type: 'number', step: 0.01, min: 0, colSize: 4 },

                { id: 'notes', name: 'notes', label: 'Notlar', type: 'textarea', rows: 3, colSize: 12 }
            ]
        });

        this.editModal.render();
        this.editModal.onSaveCallback(async (data) => this.saveEdit(data));
    }

    openEdit(row) {
        this.editingId = row.id;

        const toLocalDateTime = (value) => {
            if (!value) return '';
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return String(value);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        this.editModal.setFormData({
            user_display: row.user_display || '',
            reviewed_by_display: row.reviewed_by_display || '',
            date: row.date || '',
            check_in_time: toLocalDateTime(pick(row, ['check_in_time', 'check_in_at', 'check_in'])),
            check_out_time: toLocalDateTime(pick(row, ['check_out_time', 'check_out_at', 'check_out'])),
            method: pick(row, ['method', 'check_in_method']) || '',
            status: row.status || '',
            overtime_hours: row.overtime_hours ?? '0.00',
            notes: row.notes || ''
        });

        this.editModal.show();
    }

    async saveEdit(formData) {
        if (!this.editingId) return;

        const patch = {
            date: formData.date || undefined,
            check_in_time: formData.check_in_time || undefined,
            check_out_time: formData.check_out_time || undefined,
            method: formData.method || undefined,
            status: formData.status || undefined,
            overtime_hours: formData.overtime_hours === '' ? undefined : formData.overtime_hours,
            notes: formData.notes || undefined
        };

        Object.keys(patch).forEach((k) => {
            if (patch[k] === undefined) delete patch[k];
        });

        try {
            await patchAttendanceHrRecord(this.editingId, patch);
            showNotification('Kayıt güncellendi', 'success');
            this.editModal.hide();
            await this.load();
        } catch (e) {
            console.error(e);
            showNotification(`Güncelleme başarısız: ${e.message || e}`, 'error');
            throw e;
        }
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.load();
            } else if (e.target.id === 'back-to-main' || e.target.closest('#back-to-main')) {
                window.location.href = '/human_resources/';
            }
        });
    }

    async load() {
        try {
            this.tableComponent.setLoading(true);
            const resp = await fetchAttendanceHrRecords(this.currentFilters);
            const rows = Array.isArray(resp) ? resp : (resp?.results || []);
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData(rows, rows.length, 1);
        } catch (e) {
            console.error(e);
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData([], 0, 1);
            showNotification(`Kayıtlar yüklenemedi: ${e.message || e}`, 'error');
        }
    }

    async applyFilters(values) {
        // Send whatever user sets; backend supports combinations.
        this.currentFilters = {
            date: values.date || '',
            date_from: values.date_from || '',
            date_to: values.date_to || '',
            user_id: values.user_id || '',
            username: values.username || '',
            name: values.name || '',
            group_id: values.group_id || '',
            status: values.status || '',
            method: values.method || ''
        };
        await this.load();
        showNotification('Filtreler uygulandı', 'info', 1500);
    }

    async clearFilters() {
        this.currentFilters = {};
        await this.load();
        showNotification('Filtreler temizlendi', 'info', 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = new AttendanceRecordsPage();
    window.attendanceRecordsPage = page;
});

