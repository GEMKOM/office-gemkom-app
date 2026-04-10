import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { showNotification } from '../../../components/notification/notification.js';

import { fetchAttendanceHrRecords } from '../../../apis/attendance.js';

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

function statusBadge(status) {
    const map = {
        pending_override: { cls: 'status-yellow', label: 'Onay Bekliyor' },
        active: { cls: 'status-blue', label: 'Aktif' },
        complete: { cls: 'status-green', label: 'Tamamlandı' },
        rejected: { cls: 'status-red', label: 'Reddedildi' }
    };
    const v = map[status] || { cls: 'status-grey', label: status || '-' };
    return `<span class="status-badge ${v.cls}">${v.label}</span>`;
}

class AttendanceRecordsPage {
    constructor() {
        this.filtersComponent = null;
        this.tableComponent = null;
        this.currentFilters = {};
        this.init();
    }

    async init() {
        if (!guardRoute()) return;
        if (!initRouteProtection()) return;

        await initNavbar();
        this.initHeader();
        this.initFilters();
        this.initTable();
        this.setupEventListeners();

        await this.load();
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
            id: 'status',
            label: 'Durum',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'active', label: 'Aktif' },
                { value: 'complete', label: 'Tamamlandı' },
                { value: 'pending_override', label: 'Onay Bekliyor' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        });

        this.filtersComponent.addDropdownFilter({
            id: 'method',
            label: 'Yöntem',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'ip', label: 'IP' },
                { value: 'override', label: 'Ofis Dışı' },
                { value: 'manual', label: 'Manuel' }
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
                    field: 'check_in_at',
                    label: 'Giriş',
                    sortable: false,
                    formatter: (v, row) => fmtDateTime(pick(row, ['check_in_at', 'check_in_time', 'check_in']))
                },
                {
                    field: 'check_out_at',
                    label: 'Çıkış',
                    sortable: false,
                    formatter: (v, row) => fmtDateTime(pick(row, ['check_out_at', 'check_out_time', 'check_out']))
                },
                {
                    field: 'status',
                    label: 'Durum',
                    sortable: false,
                    formatter: (v, row) => statusBadge(row.status)
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
            pagination: false,
            loading: false,
            skeleton: true,
            emptyMessage: 'Kayıt bulunamadı',
            emptyIcon: 'fas fa-clipboard-list'
        });
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

