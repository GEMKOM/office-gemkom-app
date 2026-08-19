import { guardRoute } from '../../../authService.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
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

    // guardRoute() only proves you are logged in. These reports expose wage and
    // per-person performance data, so the page permission is enforced here too
    // — without this a direct URL renders for anyone the menu hides it from.
    if (!initRouteProtection()) {
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

    const summaryTable = new TableComponent('summary-placeholder', {
        title: 'Dönem Özeti',
        icon: 'fas fa-list-check',
        iconColor: 'text-primary',
        columns: [
            { field: 'label', label: 'Kalem', sortable: false,
              formatter: (v, row) => window.isExporting ? v
                  : `<i class="${row.icon} ${row.color} me-2"></i>${v}` },
            { field: 'value', label: 'Değer', sortable: false },
            { field: 'note', label: 'Açıklama', sortable: false,
              formatter: (v) => window.isExporting ? (v || '') : `<span class="text-muted small">${v || ''}</span>` },
        ],
        data: [],
        pagination: false,
        sortable: false,
        small: true,
        exportable: true,
        emptyMessage: 'Veri yok',
        emptyIcon: 'fas fa-inbox',
    });

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
                      ? '<span class="status-badge status-green"><i class="fas fa-check me-1"></i>Evet</span>'
                      : '<span class="status-badge status-red"><i class="fas fa-times me-1"></i>Hayır</span>';
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
        initialSortField: 'date',
        initialSortDirection: 'desc',
        footer: ({ allData, columns, hasActions }) => buildTotalsRow(allData, columns, hasActions),
        onSort: (field, direction) => {
            reportRows = sortRows(reportRows, field, direction);
            table.updateData(reportRows);
        },
        onRefresh: () => loadReport()
    });

    // Rows as last fetched, kept so header clicks can re-sort without a refetch.
    let reportRows = [];

    function compareValues(a, b) {
        if (a === b) return 0;
        if (a === null || a === undefined || a === '') return 1;
        if (b === null || b === undefined || b === '') return -1;
        if (typeof a === 'boolean' || typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
        const na = Number(a), nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b), 'tr');
    }

    function sortRows(rows, field, direction) {
        const factor = direction === 'desc' ? -1 : 1;
        return [...rows].sort((r1, r2) => factor * compareValues(r1[field], r2[field]));
    }

    const formatHours = (n) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} saat`;

    function computeTotals(rows) {
        // Mesai süresi is the request's window, repeated on every (gün x operasyon)
        // row, so count each request/operator pair once instead of summing rows.
        const seen = new Set();
        const windowHours = rows.reduce((sum, r) => {
            const key = `${r.request_id}|${r.user_id}`;
            if (seen.has(key)) return sum;
            seen.add(key);
            return sum + Number(r.overtime_window_hours || 0);
        }, 0);

        return {
            rowCount: rows.length,
            workedCount: rows.filter(r => r.worked).length,
            workedHours: rows.reduce((sum, r) => sum + Number(r.worked_hours || 0), 0),
            windowHours,
            pairCount: seen.size,
            requestCount: new Set(rows.map(r => r.request_id)).size,
            operatorCount: new Set(rows.map(r => r.user_id)).size,
            dayCount: new Set(rows.map(r => r.date)).size,
        };
    }

    function renderSummary(rows) {
        const t = computeTotals(rows);
        const diff = t.workedHours - t.windowHours;
        const coverage = t.windowHours > 0 ? (t.workedHours / t.windowHours) * 100 : 0;

        summaryTable.updateData(rows.length ? [
            { label: 'Talep edilen mesai süresi', value: formatHours(t.windowHours),
              icon: 'fas fa-clipboard-check', color: 'text-primary',
              note: `${t.pairCount} mesai kaydı, ${t.requestCount} talep` },
            { label: 'Çalışılan saat', value: formatHours(t.workedHours),
              icon: 'fas fa-stopwatch', color: 'text-success',
              note: 'Operasyon timer kayıtlarından' },
            { label: 'Fark', value: (diff > 0 ? '+' : '') + formatHours(diff),
              icon: 'fas fa-scale-unbalanced', color: diff < 0 ? 'text-danger' : 'text-primary',
              note: `Çalışma oranı %${coverage.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` },
            { label: 'Çalışılan operasyon', value: `${t.workedCount} / ${t.rowCount}`,
              icon: 'fas fa-cogs', color: 'text-info',
              note: `${t.operatorCount} operatör, ${t.dayCount} gün` },
        ] : []);
    }

    function buildTotalsRow(rows, columns, hasActions) {
        const t = computeTotals(rows);
        const workedCount = t.workedCount;
        const workedHours = t.workedHours;
        const windowHours = t.windowHours;

        const totals = {
            worked: `${workedCount} / ${rows.length}`,
            worked_hours: formatHours(workedHours),
            overtime_window_hours: `<span title="Aynı talep birden fazla satırda tekrar ettiği için bir kez sayılmıştır">${formatHours(windowHours)}</span>`
        };

        // Label spans every column before the first one that carries a total.
        const firstTotalIndex = columns.findIndex(c => totals[c.field] !== undefined);
        if (firstTotalIndex < 0) return '';

        const cells = [`<td colspan="${Math.max(1, firstTotalIndex)}" class="text-end fw-semibold">Toplam</td>`];
        columns.slice(firstTotalIndex).forEach(c => {
            cells.push(`<td class="fw-semibold">${totals[c.field] ?? ''}</td>`);
        });
        if (hasActions) cells.push('<td></td>');

        return `<tr class="table-light">${cells.join('')}</tr>`;
    }

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
            summaryTable.setLoading(true);
            const rows = await getOvertimeMachiningReport(currentFilters);
            reportRows = sortRows(Array.isArray(rows) ? rows : [], 'date', 'desc');
            renderSummary(reportRows);
            table.updateData(reportRows);
        } catch (error) {
            reportRows = [];
            renderSummary([]);
            table.updateData([]);
            showNotification('Rapor yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
        } finally {
            table.setLoading(false);
            summaryTable.setLoading(false);
        }
    }

    await loadReport();
});
