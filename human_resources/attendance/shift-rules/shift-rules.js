import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';

import {
    fetchShiftRules,
    createShiftRule,
    patchShiftRule,
    deleteShiftRule
} from '../../../apis/human_resources/attendance.js';

function boolBadge(v, trueLabel, falseLabel) {
    if (v === true) return `<span class="status-badge status-green">${trueLabel}</span>`;
    return `<span class="status-badge status-grey">${falseLabel}</span>`;
}

function defaultBadge(isDefault) {
    return isDefault
        ? `<span class="status-badge status-blue">Varsayılan</span>`
        : `<span class="status-badge status-grey">-</span>`;
}

function fmtTime(value) {
    if (!value) return '-';
    // API returns HH:MM:SS; accept HH:MM too
    const s = String(value);
    return s.length >= 5 ? s.slice(0, 5) : s;
}

class ShiftRulesPage {
    constructor() {
        this.rows = [];
        this.table = null;
        this.modal = null;
        this.confirm = null;
        this.editingId = null;
        this.init();
    }

    async init() {
        if (!guardRoute()) return;
        if (!initRouteProtection()) return;

        await initNavbar();
        this.initHeader();
        this.initTable();
        this.initModals();
        this.setupEventListeners();

        await this.load();
    }

    initHeader() {
        const header = new HeaderComponent({
            title: 'Vardiya Kuralları',
            subtitle: 'Mesai başlangıç/bitiş saatlerini ve eşiklerini yönetin',
            icon: 'clock',
            showBackButton: 'block',
            showRefreshButton: 'block',
            showCreateButton: 'block',
            createButtonText: 'Yeni Kural',
            refreshButtonText: 'Yenile'
        });
        header.render();
    }

    initTable() {
        this.table = new TableComponent('table-container', {
            title: 'Vardiya Kuralları',
            icon: 'clock',
            iconColor: 'info',
            columns: [
                { field: 'name', label: 'Ad', sortable: false, formatter: (v) => v || '-' },
                { field: 'expected_start', label: 'Başlangıç', sortable: false, formatter: (v) => fmtTime(v) },
                { field: 'expected_end', label: 'Bitiş', sortable: false, formatter: (v) => fmtTime(v) },
                {
                    field: 'overtime_threshold_minutes',
                    label: 'Eşik (dk)',
                    sortable: false,
                    formatter: (v) => (v ?? '-')
                },
                {
                    field: 'is_active',
                    label: 'Aktif',
                    sortable: false,
                    formatter: (v) => boolBadge(v, 'Aktif', 'Pasif')
                },
                {
                    field: 'is_default',
                    label: 'Varsayılan',
                    sortable: false,
                    formatter: (v) => defaultBadge(v === true)
                },
                {
                    field: 'assigned_user_count',
                    label: 'Atanan',
                    sortable: false,
                    formatter: (v) => (v ?? 0)
                }
            ],
            actions: [
                {
                    key: 'set_default',
                    label: 'Varsayılan Yap',
                    icon: 'fas fa-star',
                    class: 'btn-outline-info',
                    visible: (row) => row.is_default !== true,
                    onClick: (row) => this.setDefault(row)
                },
                {
                    key: 'edit',
                    label: 'Düzenle',
                    icon: 'fas fa-edit',
                    class: 'btn-outline-primary',
                    onClick: (row) => this.openEdit(row)
                },
                {
                    key: 'delete',
                    label: 'Sil',
                    icon: 'fas fa-trash',
                    class: 'btn-outline-danger',
                    onClick: (row) => this.confirmDelete(row)
                }
            ],
            pagination: false,
            skeleton: true,
            emptyMessage: 'Vardiya kuralı bulunamadı',
            emptyIcon: 'fas fa-clock'
        });
    }

    initModals() {
        this.modal = new EditModal('edit-modal-container', {
            title: 'Vardiya Kuralı',
            saveButtonText: 'Kaydet',
            size: 'lg'
        });

        this.modal.addSection({
            id: 'shift-rule',
            title: 'Kural',
            icon: 'fas fa-clock',
            iconColor: 'text-primary',
            fields: [
                { id: 'name', name: 'name', label: 'Ad', type: 'text', required: true, colSize: 12 },
                { id: 'expected_start', name: 'expected_start', label: 'Başlangıç', type: 'time', required: true, colSize: 4 },
                { id: 'expected_end', name: 'expected_end', label: 'Bitiş', type: 'time', required: true, colSize: 4 },
                { id: 'overtime_threshold_minutes', name: 'overtime_threshold_minutes', label: 'Fazla Mesai Eşiği (dk)', type: 'number', min: 0, step: 1, colSize: 4 },
                { id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', colSize: 6 },
                { id: 'is_default', name: 'is_default', label: 'Varsayılan', type: 'checkbox', colSize: 6 }
            ]
        });

        this.modal.render();
        this.modal.onSaveCallback(async (data) => this.save(data));

        this.confirm = new ConfirmationModal('action-confirm-modal-container', {
            title: 'Onay',
            icon: 'fas fa-exclamation-triangle',
            message: 'Bu işlemi yapmak istediğinize emin misiniz?',
            confirmText: 'Evet',
            cancelText: 'İptal',
            confirmButtonClass: 'btn-danger'
        });
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.load();
            } else if (e.target.id === 'back-to-main' || e.target.closest('#back-to-main')) {
                window.location.href = '/human_resources/attendance/';
            } else if (e.target.id === 'create-btn' || e.target.closest('#create-btn')) {
                this.openCreate();
            }
        });
    }

    async load() {
        try {
            this.table.setLoading(true);
            const data = await fetchShiftRules();
            this.rows = Array.isArray(data) ? data : (data?.results || []);
            this.table.setLoading(false);
            this.table.updateData(this.rows, this.rows.length, 1);
        } catch (e) {
            console.error(e);
            this.table.setLoading(false);
            this.table.updateData([], 0, 1);
            showNotification(`Vardiya kuralları yüklenemedi: ${e.message || e}`, 'error');
        }
    }

    openCreate() {
        this.editingId = null;
        this.modal.setTitle('Yeni Vardiya Kuralı');
        this.modal.setSaveButtonText('Oluştur');
        this.modal.setFormData({
            name: '',
            expected_start: '08:30',
            expected_end: '17:30',
            overtime_threshold_minutes: 15,
            is_active: true,
            is_default: false
        });
        this.modal.show();
    }

    openEdit(row) {
        this.editingId = row.id;
        this.modal.setTitle('Vardiya Kuralı Düzenle');
        this.modal.setSaveButtonText('Kaydet');
        this.modal.setFormData({
            name: row.name || '',
            expected_start: fmtTime(row.expected_start || ''),
            expected_end: fmtTime(row.expected_end || ''),
            overtime_threshold_minutes: row.overtime_threshold_minutes ?? 0,
            is_active: row.is_active === true,
            is_default: row.is_default === true
        });
        this.modal.show();
    }

    async save(formData) {
        const payload = {
            name: formData.name,
            expected_start: formData.expected_start,
            expected_end: formData.expected_end,
            overtime_threshold_minutes: formData.overtime_threshold_minutes === '' ? 0 : Number(formData.overtime_threshold_minutes),
            is_active: formData.is_active === true,
            is_default: formData.is_default === true
        };

        try {
            if (this.editingId) {
                await patchShiftRule(this.editingId, payload);
                showNotification('Kural güncellendi', 'success');
            } else {
                await createShiftRule(payload);
                showNotification('Kural oluşturuldu', 'success');
            }
            this.modal.hide();
            await this.load();
        } catch (e) {
            showNotification(`Kaydetme başarısız: ${e.message || e}`, 'error');
            throw e;
        }
    }

    async setDefault(row) {
        try {
            await patchShiftRule(row.id, { is_default: true });
            showNotification('Varsayılan kural güncellendi', 'success');
            await this.load();
        } catch (e) {
            showNotification(`İşlem başarısız: ${e.message || e}`, 'error');
        }
    }

    confirmDelete(row) {
        const n = row.assigned_user_count ?? 0;
        const details = n > 0
            ? `${n} kullanıcı bu kurala atanmış. Silerseniz varsayılan kurala geçerler.`
            : null;

        this.confirm.show({
            title: 'Sil',
            message: `"${row.name}" kuralını silmek istiyor musunuz?`,
            description: details || '',
            confirmText: 'Sil',
            confirmButtonClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    await deleteShiftRule(row.id);
                    showNotification('Kural silindi', 'success');
                    await this.load();
                } catch (e) {
                    showNotification(`Silme başarısız: ${e.message || e}`, 'error');
                    throw e;
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = new ShiftRulesPage();
    window.shiftRulesPage = page;
});

