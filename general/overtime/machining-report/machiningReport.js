import { guardRoute } from '../../../authService.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { getOvertimeMachiningReport, getOvertimeMachiningSummary, getMachiningOperators } from '../../../apis/overtime.js';
import { showNotification } from '../../../components/notification/notification.js';
import { formatJobNumber } from '../../../apis/formatters.js';
import { loadJobOrderOptions, addJobFilter, jobFilterValue } from '../jobFilter.js';

const num = (v) => Number(v || 0);

const fmtNum = (n, digits = 1) =>
    num(n).toLocaleString('tr-TR', { maximumFractionDigits: digits });

const formatHours = (n) =>
    `${num(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} saat`;

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '-');

const fmtTime = (iso) => (iso
    ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '-');

const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '-');

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
        subtitle: 'Onaylı mesailerde seçilen operasyonların mesai saatleri içinde çalışılıp çalışılmadığı',
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

    // Started before the other filters are added so the request overlaps them.
    const jobOptionsPromise = loadJobOrderOptions();

    filters.addDateFilter({ id: 'start_date', label: 'Başlangıç Tarihi', colSize: 3 });
    filters.addDateFilter({ id: 'end_date', label: 'Bitiş Tarihi', colSize: 3 });
    // İş No — searchable multi-select; each pick includes its sub-jobs.
    await addJobFilter(filters, jobOptionsPromise);

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
              formatter: (v, row) => {
                  if (window.isExporting) return row.sub ? `  ↳ ${v}` : v;
                  const icon = `<i class="${row.icon} ${row.color} me-2"></i>`;
                  return row.sub
                      ? `<span class="ps-4 text-nowrap"><i class="fas fa-level-up-alt fa-rotate-90 text-muted me-2"></i>${icon}${v}</span>`
                      : `<span class="fw-semibold text-nowrap">${icon}${v}</span>`;
              } },
            { field: 'value', label: 'Değer', sortable: false,
              formatter: (v, row) => window.isExporting ? v
                  : `<span class="${row.sub ? '' : 'fw-semibold'} text-nowrap">${v}</span>` },
            { field: 'share', label: 'Talebe Oranı', sortable: false,
              formatter: (v) => v || '' },
            { field: 'note', label: 'Ne gösterir?', sortable: false,
              formatter: (v) => window.isExporting ? (v || '') : `<span class="small">${v || ''}</span>` },
        ],
        data: [],
        pagination: false,
        sortable: false,
        small: true,
        exportable: true,
        emptyMessage: 'Veri yok',
        emptyIcon: 'fas fa-inbox',
    });

    // Who makes up "Talep edilen toplam mesai" — one row per operator.
    const operatorTable = new TableComponent('operators-placeholder', {
        title: 'Operatör Bazında',
        icon: 'fas fa-user-clock',
        iconColor: 'text-primary',
        columns: [
            { field: 'full_name', label: 'Operatör', sortable: true, formatter: (v) => v || '-' },
            { field: 'requested_hours', label: 'Talep Edilen', sortable: true, type: 'number', formatter: (v) => formatHours(v) },
            { field: 'worked_hours', label: 'Mesaide Çalışılan (tüm işler)', sortable: true, type: 'number', formatter: (v) => formatHours(v) },
            { field: 'no_timer_hours', label: 'Zamanlayıcı Kaydı Olmayan', sortable: true, type: 'number',
              formatter: (v) => window.isExporting ? num(v)
                  : (num(v) > 0 ? `<span class="text-danger">${formatHours(v)}</span>` : formatHours(v)) },
            { field: 'ratio', label: 'Çalışma Oranı', sortable: true, type: 'number',
              formatter: (v) => `%${fmtNum(v)}` },
        ],
        data: [],
        pagination: false,
        sortable: true,
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
            { field: 'date', label: 'Tarih', sortable: true, formatter: (v) => fmtDate(v) },
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
            { field: 'worked_hours', label: 'Çalışılan Saat', sortable: true, type: 'number',
              formatter: (v) => formatHours(v) },
            { field: 'overtime_window_hours', label: 'Mesai Süresi', sortable: true, type: 'number',
              formatter: (v) => formatHours(v) },
        ],
        data: [],
        loading: false,
        emptyMessage: 'Seçilen kriterlerde operasyonlu onaylı mesai bulunamadı',
        emptyIcon: 'fas fa-inbox',
        refreshable: true,
        // Long report; keep the column headers in view while scrolling.
        stickyHeader: true,
        exportable: true,
        initialSortField: 'date',
        initialSortDirection: 'desc',
        footer: ({ allData, columns, hasActions }) => buildTotalsRow(allData, columns, hasActions),
        onSort: (field, direction) => {
            reportRows = sortRows(reportRows, field, direction);
            table.updateData(reportRows);
        },
        onRefresh: () => loadReport(),
        actions: [
            {
                key: 'detail',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => showTimerDetail(row)
            }
        ],
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

    // One overtime entry can carry several operations, so the window is only
    // comparable to the *sum* of its operations' hours. (talep, operatör, gün)
    // is the level where planned and worked line up.
    function groupByEntryDay(rows) {
        const groups = new Map();
        rows.forEach(r => {
            const key = `${r.request_id}|${r.user_id}|${r.date}`;
            let g = groups.get(key);
            if (!g) {
                g = {
                    key, date: r.date, request_id: r.request_id,
                    user_full_name: r.user_full_name,
                    window_hours: num(r.overtime_window_hours),
                    worked_hours: 0, outside_hours: 0, operations: 0,
                };
                groups.set(key, g);
            }
            g.worked_hours += num(r.worked_hours);
            g.outside_hours += num(r.outside_window_hours);
            g.operations += 1;
        });
        return [...groups.values()];
    }

    function computeTotals(rows) {
        const groups = groupByEntryDay(rows);
        return {
            rowCount: rows.length,
            workedCount: rows.filter(r => r.worked).length,
            workedHours: rows.reduce((sum, r) => sum + num(r.worked_hours), 0),
            // Each (talep, operatör, gün) window counted once, not once per operation.
            windowHours: groups.reduce((sum, g) => sum + g.window_hours, 0),
            operatorCount: new Set(rows.map(r => r.user_id)).size,
            dayCount: new Set(rows.map(r => r.date)).size,
        };
    }

    // Period totals come from the summary endpoint, which counts every timer
    // inside the overtime windows — not only the operations picked on the
    // request — so "requested vs. actually worked" is the real comparison.
    function renderSummary(summary, rows) {
        if (!summary || !num(summary.requested_hours)) {
            summaryTable.updateData([]);
            return;
        }
        const t = computeTotals(rows);
        const requested = num(summary.requested_hours);
        const pct = (h) => `%${fmtNum((num(h) / requested) * 100)}`;

        summaryTable.updateData([
            { label: 'Talep edilen toplam mesai', value: formatHours(requested), share: '%100',
              icon: 'fas fa-clipboard-check', color: 'text-primary',
              note: 'Filtrelere uyan onaylı mesai taleplerinde talaşlı imalat operatörlerine (talepte operasyon seçilmiş kişiler) yazılan '
                  + 'mesai süresinin toplamı (talep başlangıç–bitiş saatleri, 12:00–12:30 öğle molası düşülmüş). '
                  + 'Aynı kişinin çakışan talepleri bir kez sayılır. '
                  + `${summary.operator_count} operatör · ${summary.request_count} talep · ${summary.entry_count} mesai kaydı · ${summary.day_count} gün. `
                  + 'Kişi bazında dökümü "Operatör Bazında" tablosundadır.' },
            { label: 'Mesai içinde toplam çalışılan', value: formatHours(summary.worked_hours), share: pct(summary.worked_hours),
              icon: 'fas fa-stopwatch', color: 'text-success',
              note: 'Mesai saatleri içinde operatörün açık olan tüm üretim zamanlayıcıları — hangi iş veya operasyon olursa olsun. '
                  + 'Mesai penceresi dışındaki kısımlar (ör. normal vardiya) sayılmaz; aynı anda açık iki zamanlayıcı bir kez sayılır. '
                  + 'Altındaki iki satır bu toplamın dökümüdür.' },
            { sub: true, label: 'Talepte seçilen operasyonlarda', value: formatHours(summary.selected_operation_hours),
              share: pct(summary.selected_operation_hours),
              icon: 'fas fa-cogs', color: 'text-success',
              note: 'Toplam çalışmanın, mesai talebinde o operatör için seçilen operasyonlarda geçen kısmı. '
                  + 'Aşağıdaki tablonun "Çalışılan Saat" toplamıyla aynıdır.' },
            { sub: true, label: 'Başka işlerde', value: formatHours(summary.other_work_hours),
              share: pct(summary.other_work_hours),
              icon: 'fas fa-shuffle', color: 'text-info',
              note: 'Toplam çalışmanın, talepte seçilmemiş başka operasyon veya işlerde geçen kısmı.' },
            { label: 'Duruş / mola kaydı', value: formatHours(summary.downtime_hours), share: pct(summary.downtime_hours),
              icon: 'fas fa-circle-pause', color: 'text-secondary',
              note: 'Mesai içinde üretim yerine duruş veya mola zamanlayıcısının açık olduğu süre. '
                  + 'Aynı anda üretim zamanlayıcısı da açıksa çalışılan sayılır, burada tekrar sayılmaz.' },
            { label: 'Zamanlayıcı kaydı olmayan süre', value: formatHours(summary.no_timer_hours), share: pct(summary.no_timer_hours),
              icon: 'fas fa-circle-question', color: 'text-danger',
              note: 'Mesai saatleri içinde operatörün hiçbir zamanlayıcısının açık olmadığı süre. '
                  + 'Talep edilen = toplam çalışılan + duruş/mola + kayıtsız süre.' },
            { label: 'Seçilen operasyonlardan çalışılanlar', value: rows.length ? `${t.workedCount} / ${t.rowCount}` : '-', share: '',
              icon: 'fas fa-list-check', color: 'text-primary',
              note: 'En alttaki tablonun operasyon satırlarından (talep × operatör × gün × operasyon) '
                  + `mesai içinde en az bir kez zamanlayıcı açılanların sayısı / toplam satır. ${t.operatorCount} operatör, ${t.dayCount} gün.` },
        ]);
    }

    function renderOperators(summary) {
        const rows = (summary?.operators || []).map(o => ({
            ...o,
            requested_hours: num(o.requested_hours),
            worked_hours: num(o.worked_hours),
            no_timer_hours: num(o.no_timer_hours),
            ratio: num(o.requested_hours) > 0 ? (num(o.worked_hours) / num(o.requested_hours)) * 100 : 0,
        }));
        operatorTable.updateData(rows, rows.length, 1);
    }

    function buildTotalsRow(rows, columns, hasActions) {
        const t = computeTotals(rows);
        const totals = {
            worked: `${t.workedCount} / ${t.rowCount}`,
            worked_hours: formatHours(t.workedHours),
            overtime_window_hours: `<span title="Aynı mesai kaydı birden fazla operasyon satırında tekrar ettiği için bir kez sayılmıştır">${formatHours(t.windowHours)}</span>`,
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

    function showTimerDetail(row) {
        const modal = new DisplayModal('timer-detail-modal-container', {
            title: `${row.operation_name || row.operation_key} — ${fmtDate(row.date)}`,
            icon: 'fas fa-stopwatch',
            size: 'lg',
            showEditButton: false,
        });

        modal.addSection({ title: 'Mesai Kaydı', icon: 'fas fa-info-circle' });
        modal.addField({ label: 'Operatör', value: row.user_full_name || '-', icon: 'fas fa-user', colSize: 4 });
        modal.addField({ label: 'Talep No', value: `#${row.request_id}`, icon: 'fas fa-file-alt', colSize: 4 });
        modal.addField({ label: 'İş No', value: row.job_no || '-', icon: 'fas fa-hashtag', colSize: 4 });
        modal.addField({ label: 'Parça', value: row.part_name || '-', icon: 'fas fa-cube', colSize: 4 });
        modal.addField({ label: 'Mesai süresi (bu gün)', value: formatHours(row.overtime_window_hours), icon: 'fas fa-clock', colSize: 4 });
        modal.addField({ label: 'Mesai içinde çalışılan', value: formatHours(row.worked_hours), icon: 'fas fa-stopwatch', colSize: 4 });

        const timers = row.timers || [];
        if (num(row.outside_window_hours) > 0) {
            modal.addCustomSection({
                title: null,
                customContent: `
                    <div class="alert alert-secondary d-flex align-items-start mb-0">
                        <i class="fas fa-scissors me-2 mt-1"></i>
                        <div class="small">
                            Bu operasyonda o gün toplam <strong>${formatHours(row.timer_hours)}</strong> timer kaydı var;
                            bunun <strong>${formatHours(row.outside_window_hours)}</strong> kadarı mesai penceresinin
                            dışında kaldığı için mesaiye sayılmadı. Öğle molası her iki tarafta da düşülmüştür.
                        </div>
                    </div>`
            });
        }

        const lines = timers.map(t => `
            <tr>
                <td>${fmtDateTime(t.start_at)}</td>
                <td>${fmtTime(t.finish_at)}</td>
                <td class="text-end">${formatHours(t.total_hours)}</td>
                <td class="text-end ${num(t.in_window_hours) > 0 ? 'fw-semibold text-success' : 'text-muted'}">${formatHours(t.in_window_hours)}</td>
                <td class="text-end text-muted">${formatHours(t.outside_window_hours)}</td>
            </tr>`).join('');

        modal.addCustomSection({
            title: 'Timer Kayıtları',
            icon: 'fas fa-list',
            iconColor: 'text-success',
            customContent: `
                <div class="table-responsive">
                    <table class="table table-sm table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Başlangıç</th><th>Bitiş</th>
                                <th class="text-end">Toplam</th>
                                <th class="text-end">Mesai İçi</th>
                                <th class="text-end">Mesai Dışı</th>
                            </tr>
                        </thead>
                        <tbody>${lines || '<tr><td colspan="5" class="text-center text-muted py-3">Bu operasyonda o gün timer kaydı yok</td></tr>'}</tbody>
                        ${timers.length ? `<tfoot class="table-light">
                            <tr>
                                <th colspan="2" class="text-end">Toplam</th>
                                <th class="text-end">${formatHours(row.timer_hours)}</th>
                                <th class="text-end">${formatHours(row.worked_hours)}</th>
                                <th class="text-end">${formatHours(row.outside_window_hours)}</th>
                            </tr>
                        </tfoot>` : ''}
                    </table>
                </div>`,
        });

        modal.render().show();
    }

    function mapFilters(f) {
        const out = {};
        if (f.start_date) out.start_date = f.start_date;
        if (f.end_date) out.end_date = f.end_date;
        const jobNo = jobFilterValue(f.job_no);
        if (jobNo) out.job_no = jobNo;
        if (f.user) out.user = f.user;
        return out;
    }

    async function loadReport() {
        try {
            table.setLoading(true);
            summaryTable.setLoading(true);
            operatorTable.setLoading(true);
            const [rows, summary] = await Promise.all([
                getOvertimeMachiningReport(currentFilters),
                getOvertimeMachiningSummary(currentFilters),
            ]);
            reportRows = sortRows(Array.isArray(rows) ? rows : [], 'date', 'desc');
            renderSummary(summary, reportRows);
            renderOperators(summary);
            table.updateData(reportRows);
        } catch (error) {
            reportRows = [];
            renderSummary(null, []);
            renderOperators(null);
            table.updateData([]);
            showNotification('Rapor yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
        } finally {
            table.setLoading(false);
            summaryTable.setLoading(false);
            operatorTable.setLoading(false);
        }
    }

    await loadReport();
});
