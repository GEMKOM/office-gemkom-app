import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getOvertimeMachiningReport, getMachiningOperators } from '../../../apis/overtime.js';
import { showNotification } from '../../../components/notification/notification.js';
import { formatJobNumber } from '../../../apis/formatters.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    let currentFilters = {};

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Talaşlı İmalat Mesai Raporu',
        subtitle: 'Onaylı mesailerde seçilen operasyonların o gün çalışılıp çalışılmadığı ve süreleri',
        icon: 'cogs',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/general/overtime',
        onRefreshClick: () => loadReport()
    });

    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Listele',
        clearButtonText: 'Temizle',
        onApply: (f) => {
            currentFilters = mapFilters(f);
            loadReport();
        },
        onClear: () => {
            currentFilters = {};
            loadReport();
        }
    });

    filters.addDateFilter({ id: 'start_date', label: 'Başlangıç Tarihi', colSize: 3 });
    filters.addDateFilter({ id: 'end_date', label: 'Bitiş Tarihi', colSize: 3 });
    filters.addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş emri no...', colSize: 3 });

    // Populate the operator filter from machining operators (access_machining_tasks).
    try {
        const machinists = await getMachiningOperators();
        const rows = Array.isArray(machinists) ? machinists : (machinists?.results || []);
        const options = [{ value: '', label: 'Tümü' }].concat(
            rows.map(u => ({ value: u.id, label: u.full_name || u.username }))
        );
        filters.addSelectFilter({ id: 'user', label: 'Operatör', options, colSize: 3 });
    } catch (e) {
        console.warn('Could not load machining operators for filter:', e);
    }

    const table = new TableComponent('table-placeholder', {
        title: 'Mesai / Operasyon Çalışma Raporu',
        icon: 'fas fa-cogs',
        iconColor: 'text-success',
        columns: [
            { field: 'date', label: 'Tarih', sortable: true,
              formatter: (v) => v ? new Date(v).toLocaleDateString('tr-TR') : '-' },
            { field: 'request_id', label: 'Talep No', sortable: true,
              formatter: (v) => window.isExporting ? v : `<span class="badge bg-primary">#${v}</span>` },
            { field: 'user_full_name', label: 'Operatör', sortable: true,
              formatter: (v) => v || '-' },
            { field: 'job_no', label: 'İş No', sortable: true,
              formatter: (v) => window.isExporting ? (v || '-') : formatJobNumber(v) },
            { field: 'operation_name', label: 'Operasyon', sortable: true,
              formatter: (v, row) => v || row.operation_key || '-' },
            { field: 'part_name', label: 'Parça', sortable: true,
              formatter: (v) => v || '-' },
            { field: 'worked', label: 'Çalışıldı mı?', sortable: true,
              formatter: (v) => {
                  if (window.isExporting) return v ? 'Evet' : 'Hayır';
                  return v
                      ? '<span class="badge status-green"><i class="fas fa-check me-1"></i>Evet</span>'
                      : '<span class="badge status-red"><i class="fas fa-times me-1"></i>Hayır</span>';
              } },
            { field: 'worked_hours', label: 'Çalışılan Saat', sortable: true,
              formatter: (v) => `${Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} saat` },
            { field: 'overtime_window_hours', label: 'Mesai Süresi', sortable: false,
              formatter: (v) => `${Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} saat` }
        ],
        data: [],
        loading: false,
        emptyMessage: 'Seçilen kriterlerde operasyonlu onaylı mesai bulunamadı',
        emptyIcon: 'fas fa-inbox',
        refreshable: true,
        exportable: true,
        onRefresh: () => loadReport()
    });

    function mapFilters(f) {
        const out = {};
        if (f.start_date) out.start_date = f.start_date;
        if (f.end_date) out.end_date = f.end_date;
        if (f.job_no) out.job_no = f.job_no;
        if (f.user) out.user = f.user;
        return out;
    }

    async function loadReport() {
        try {
            table.setLoading(true);
            const rows = await getOvertimeMachiningReport(currentFilters);
            table.updateData(Array.isArray(rows) ? rows : []);
        } catch (error) {
            table.updateData([]);
            showNotification('Rapor yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
        } finally {
            table.setLoading(false);
        }
    }

    await loadReport();
});
