import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { showNotification } from '../../../components/notification/notification.js';

import { fetchAttendanceHrSummary } from '../../../apis/human_resources/attendance.js';
import { fetchUserGroups } from '../../../apis/users.js';

function fmtDate(value) {
    if (!value) return '-';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(`${raw}T00:00:00`);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('tr-TR');
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('tr-TR');
}

function fmtMinutes(value) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n <= 0) return '0 dk';
    return `${n.toLocaleString('tr-TR')} dk`;
}

function fmtCount(value) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('tr-TR');
}

class AttendanceSummaryPage {
    constructor() {
        const today = this.todayIso();
        this.filtersComponent = null;
        this.tableComponent = null;
        this.currentFilters = {
            date_from: today,
            date_to: today
        };
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

        await this.loadGroups();
        await this.load();
    }

    initHeader() {
        const header = new HeaderComponent({
            title: 'PDKS Özet',
            subtitle: 'Kullanıcı bazlı devam, geç kalma ve mesai özetlerini görüntüleyin',
            icon: 'chart-bar',
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
            placeholder: 'Örn: ahmet',
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
            options: [{ value: '', label: 'Yükleniyor...' }],
            placeholder: 'Tümü',
            searchable: true,
            colSize: 2
        });
        this.filtersComponent.addTextFilter({
            id: 'group_name',
            label: 'Grup adı',
            placeholder: 'Örn: Satış',
            colSize: 2
        });

        this.filtersComponent.setFilterValues({
            date_from: this.currentFilters.date_from,
            date_to: this.currentFilters.date_to
        });
    }

    initTable() {
        this.tableComponent = new TableComponent('table-container', {
            title: 'Kullanıcı Bazlı Özet',
            icon: 'users',
            iconColor: 'info',
            columns: [
                {
                    field: 'user_display',
                    label: 'Kullanıcı',
                    sortable: false,
                    formatter: (v) => `<strong>${v || '-'}</strong>`
                },
                { field: 'date_from', label: 'Başlangıç', sortable: false, formatter: (v) => fmtDate(v) },
                { field: 'date_to', label: 'Bitiş', sortable: false, formatter: (v) => fmtDate(v) },
                { field: 'total_working_days', label: 'İş Günü', sortable: false, formatter: (v) => fmtCount(v) },
                { field: 'days_present', label: 'Geldiği Gün', sortable: false, formatter: (v) => fmtCount(v) },
                { field: 'days_leave', label: 'İzin Gün', sortable: false, formatter: (v) => fmtCount(v) },
                { field: 'days_absent', label: 'Devamsız', sortable: false, formatter: (v) => fmtCount(v) },
                { field: 'session_count', label: 'Oturum', sortable: false, formatter: (v) => fmtCount(v) },
                { field: 'total_present_minutes', label: 'Ofiste', sortable: false, formatter: (v) => fmtMinutes(v) },
                { field: 'total_expected_minutes', label: 'Beklenen', sortable: false, formatter: (v) => fmtMinutes(v) },
                { field: 'total_overtime_minutes', label: 'Mesai', sortable: false, formatter: (v) => fmtMinutes(v) },
                { field: 'total_late_minutes', label: 'Geç Kalma', sortable: false, formatter: (v) => fmtMinutes(v) },
                { field: 'total_early_leave_minutes', label: 'Erken Çıkış', sortable: false, formatter: (v) => fmtMinutes(v) }
            ],
            pagination: false,
            loading: false,
            skeleton: true,
            emptyMessage: 'Özet veri bulunamadı',
            emptyIcon: 'fas fa-chart-bar'
        });
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.load();
            } else if (e.target.id === 'back-to-main' || e.target.closest('#back-to-main')) {
                window.location.href = '/human_resources/attendance/';
            }
        });
    }

    async loadGroups() {
        try {
            const data = await fetchUserGroups();
            const groups = Array.isArray(data) ? data : (data?.results || data?.data || []);
            const options = [
                { value: '', label: 'Tümü' },
                ...groups.map((g) => {
                    const id = g?.id ?? g?.pk ?? g?.group_id;
                    return {
                        value: id != null ? String(id) : '',
                        label: g.display_name || g.label || g.name || String(id || '')
                    };
                }).filter((o) => o.value !== '')
            ];
            this.filtersComponent.updateFilterOptions('group_id', options);
        } catch (e) {
            console.error('Failed to load groups:', e);
            this.filtersComponent.updateFilterOptions('group_id', [{ value: '', label: 'Tümü' }]);
        }
    }

    async load() {
        try {
            this.tableComponent.setLoading(true);
            const resp = await fetchAttendanceHrSummary(this.currentFilters);
            const rows = Array.isArray(resp) ? resp : (resp?.results || []);
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData(rows, rows.length, 1);
        } catch (e) {
            console.error(e);
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData([], 0, 1);
            showNotification(`Özet veriler yüklenemedi: ${e.message || e}`, 'error');
        }
    }

    async applyFilters(values) {
        this.currentFilters = {
            date_from: values.date_from || '',
            date_to: values.date_to || '',
            user_id: values.user_id || '',
            username: values.username || '',
            name: values.name || '',
            group_id: values.group_id || '',
            group_name: values.group_name || ''
        };
        await this.load();
        showNotification('Filtreler uygulandı', 'info', 1500);
    }

    async clearFilters() {
        const today = this.todayIso();
        this.currentFilters = {
            date_from: today,
            date_to: today
        };
        this.filtersComponent.setFilterValues({
            date_from: today,
            date_to: today,
            user_id: '',
            username: '',
            name: '',
            group_id: '',
            group_name: ''
        });
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
}

document.addEventListener('DOMContentLoaded', () => {
    const page = new AttendanceSummaryPage();
    window.attendanceSummaryPage = page;
});
