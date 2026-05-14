import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';

import {
    fetchPendingAttendanceOverrides,
    approveAttendanceSessionOverride,
    rejectAttendanceSessionOverride
} from '../../../apis/human_resources/attendance.js';

function getPendingSession(row) {
    const sessions = row.sessions || [];
    return sessions.find((s) =>
        s.status === 'pending_override' || s.status === 'pending_checkout_override'
    ) || sessions[0] || null;
}

function fmtDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('tr-TR');
}

function statusBadge(status) {
    const map = {
        pending_override: { cls: 'status-yellow', label: 'İnsan Kaynakları Onayı Bekliyor (GİRİŞ)' },
        pending_checkout_override: { cls: 'status-yellow', label: 'İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)' },
        override_rejected: { cls: 'status-red', label: 'Reddedildi' },
        active: { cls: 'status-blue', label: 'Aktif (Giriş Yapıldı)' },
        complete: { cls: 'status-green', label: 'Tamamlandı (Çıkış Yapıldı)' },
        rejected: { cls: 'status-red', label: 'Reddedildi' }
    };
    const v = map[status] || { cls: 'status-grey', label: status || '-' };
    return `<span class="status-badge ${v.cls}">${v.label}</span>`;
}

class PendingOverridesPage {
    constructor() {
        this.records = [];
        this.confirmModal = null;
        this.tableComponent = null;
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

        await this.refresh();
    }

    initHeader() {
        const header = new HeaderComponent({
            title: 'PDKS Onayları',
            subtitle: 'Ofis dışı giriş taleplerini onaylayın veya reddedin',
            icon: 'user-check',
            showBackButton: 'block',
            showRefreshButton: 'block',
            refreshButtonText: 'Yenile'
        });
        header.render();
    }

    initTable() {
        this.tableComponent = new TableComponent('table-container', {
            title: 'Bekleyen Talepler',
            icon: 'user-clock',
            iconColor: 'warning',
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
                    field: 'check_in_at',
                    label: 'Giriş',
                    sortable: false,
                    formatter: (v, row) => {
                        const s = getPendingSession(row);
                        return fmtDateTime(s?.check_in_time || null);
                    }
                },
                {
                    field: 'check_out_at',
                    label: 'Çıkış',
                    sortable: false,
                    formatter: (v, row) => {
                        const s = getPendingSession(row);
                        return fmtDateTime(s?.check_out_time || null);
                    }
                },
                {
                    field: 'override_reason',
                    label: 'Açıklama',
                    sortable: false,
                    formatter: (v, row) => {
                        const s = getPendingSession(row);
                        const reason = s?.override_reason || '';
                        return reason ? `<span title="${reason.replaceAll('"', '&quot;')}">${reason}</span>` : '-';
                    }
                },
                {
                    field: 'status',
                    label: 'Durum',
                    sortable: false,
                    formatter: (v, row) => statusBadge(row.status)
                }
            ],
            actions: [
                {
                    key: 'approve',
                    label: 'Onayla',
                    icon: 'fas fa-check',
                    class: 'btn-outline-success',
                    visible: (row) => row.status === 'pending_override' || row.status === 'pending_checkout_override',
                    onClick: (row) => this.confirmApprove(row)
                },
                {
                    key: 'reject',
                    label: 'Reddet',
                    icon: 'fas fa-times',
                    class: 'btn-outline-danger',
                    visible: (row) => row.status === 'pending_override' || row.status === 'pending_checkout_override',
                    onClick: (row) => this.confirmReject(row)
                }
            ],
            pagination: false,
            loading: false,
            skeleton: true,
            emptyMessage: 'Bekleyen talep bulunamadı',
            emptyIcon: 'fas fa-user-check'
        });
    }

    initModals() {
        this.confirmModal = new ConfirmationModal('action-confirm-modal-container', {
            title: 'Onay',
            icon: 'fas fa-exclamation-triangle',
            message: 'Bu işlemi yapmak istediğinize emin misiniz?',
            confirmText: 'Evet',
            cancelText: 'İptal',
            confirmButtonClass: 'btn-primary'
        });
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.refresh();
            } else if (e.target.id === 'back-to-main' || e.target.closest('#back-to-main')) {
                window.location.href = '/human_resources/';
            }
        });
    }

    async refresh() {
        try {
            this.tableComponent.setLoading(true);
            const data = await fetchPendingAttendanceOverrides();
            const arr = Array.isArray(data) ? data : (data?.results || []);
            this.records = arr;
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData(this.records, this.records.length, 1);
        } catch (e) {
            console.error(e);
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData([], 0, 1);
            showNotification(`Bekleyen talepler yüklenemedi: ${e.message || e}`, 'error');
        }
    }

    confirmApprove(row) {
        const s = getPendingSession(row);
        if (!s) return;
        const isCheckIn = s.status === 'pending_override';
        const isCheckOut = s.status === 'pending_checkout_override';

        const inputId = `approve-dt-${s.id}`;
        const label = isCheckIn ? 'Giriş saati (opsiyonel)' : 'Çıkış saati (opsiyonel)';
        const help = isCheckIn
            ? 'Dilerseniz giriş saatini düzeltebilirsiniz. Boş bırakırsanız mevcut saat kullanılır.'
            : 'Dilerseniz çıkış saatini seçebilirsiniz. Boş bırakırsanız sistem şu anı kullanabilir.';

        this.confirmModal.show({
            title: 'Onayla',
            message: isCheckOut ? 'Bu çıkış düzeltme talebini onaylamak istiyor musunuz?' : 'Bu giriş düzeltme talebini onaylamak istiyor musunuz?',
            description: `${row.user_display || ''}`.trim(),
            details: `
                <div class="text-start">
                    <label class="form-label mb-1">${label}</label>
                    <input class="form-control" id="${inputId}" type="datetime-local" />
                    <div class="form-text">${help}</div>
                </div>
            `,
            confirmText: 'Onayla',
            confirmButtonClass: 'btn-success',
            onConfirm: async () => {
                try {
                    const el = document.getElementById(inputId);
                    const raw = (el && el.value ? el.value : '').trim();

                    const payload = {};
                    if (raw) {
                        if (isCheckIn) payload.check_in_time = raw;
                        if (isCheckOut) payload.check_out_time = raw;
                    }

                    await approveAttendanceSessionOverride(s.id, payload);
                    showNotification('Talep onaylandı', 'success');
                    await this.refresh();
                } catch (e) {
                    showNotification(`Onaylama başarısız: ${e.message || e}`, 'error');
                    throw e;
                }
            }
        });
    }

    confirmReject(row) {
        const s = getPendingSession(row);
        if (!s) return;
        const textareaId = `reject-notes-${s.id}`;
        this.confirmModal.show({
            title: 'Reddet',
            message: s.status === 'pending_checkout_override'
                ? 'Bu çıkış düzeltme talebini reddetmek istiyor musunuz?'
                : 'Bu giriş düzeltme talebini reddetmek istiyor musunuz?',
            description: `${row.user_display || ''}`.trim(),
            details: `
                <div class="text-start">
                    <label class="form-label mb-1">Reddetme notu (opsiyonel)</label>
                    <textarea class="form-control" id="${textareaId}" rows="3" placeholder="Reddetme nedeni..."></textarea>
                </div>
            `,
            confirmText: 'Reddet',
            confirmButtonClass: 'btn-danger',
            onConfirm: async () => {
                const notesEl = document.getElementById(textareaId);
                const notes = (notesEl && notesEl.value ? notesEl.value : '').trim();
                try {
                    await rejectAttendanceSessionOverride(s.id, notes);
                    showNotification('Talep reddedildi', 'success');
                    await this.refresh();
                } catch (e) {
                    showNotification(`Reddetme başarısız: ${e.message || e}`, 'error');
                    throw e;
                }
            }
        });

        // Focus textarea after modal paint
        setTimeout(() => {
            const el = document.getElementById(textareaId);
            if (el) el.focus();
        }, 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const page = new PendingOverridesPage();
    window.pendingOverridesPage = page;
});

