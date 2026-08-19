import { guardRoute } from '../../../authService.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { getOvertimeWeldingReport, getWeldingOperators } from '../../../apis/overtime.js';
import { showNotification } from '../../../components/notification/notification.js';
import { formatJobNumber } from '../../../apis/formatters.js';

// Outlier flags as emitted by overtime/services/welding_report.py. Order here
// is the order of the summary table — worst first.
const FLAG_META = {
    no_record:          { label: 'Kayıt yok',          cls: 'status-red',    icon: 'fas fa-ban',
                          hint: 'Onaylı mesai var ama o gün hiç kaynak zaman kaydı girilmemiş.' },
    pending_entry:      { label: 'Veri girilmemiş',    cls: 'status-grey',   icon: 'fas fa-hourglass-half',
                          hint: 'O gün, kaynak zaman kayıtlarının girildiği son tarihten sonrasına ait — kayıt henüz işlenmemiş olabilir.' },
    no_overtime_record: { label: 'Mesai işlenmemiş',   cls: 'status-orange', icon: 'fas fa-exclamation',
                          hint: 'O gün kayıt var ama tamamı normal mesai olarak girilmiş.' },
    unapproved:         { label: 'Onaysız mesai',      cls: 'status-purple', icon: 'fas fa-user-slash',
                          hint: 'Fazla mesai işlenmiş ama o gün için onaylı mesai talebi yok.' },
    under:              { label: 'Eksik',              cls: 'status-orange', icon: 'fas fa-arrow-down',
                          hint: 'İşlenen mesai saati, onaylı süreden tolerans kadar az.' },
    over:               { label: 'Fazla',              cls: 'status-blue',   icon: 'fas fa-arrow-up',
                          hint: 'İşlenen mesai saati, onaylı süreden tolerans kadar fazla.' },
    job_mismatch:       { label: 'İş no farklı',       cls: 'status-grey',   icon: 'fas fa-random',
                          hint: 'Mesai talebindeki iş emri ile çalışılan iş emri örtüşmüyor.' },
};

const FLAG_ORDER = Object.keys(FLAG_META);

const OVERTIME_TYPE_LABELS = {
    regular:     'Normal',
    after_hours: 'Mesai (1.5x)',
    holiday:     'Tatil (2x)',
};

const TOLERANCE_OPTIONS = [
    { value: '0.5', label: '0,5 saat' },
    { value: '1',   label: '1 saat' },
    { value: '2',   label: '2 saat' },
    { value: '0',   label: 'Tolerans yok' },
];

const OUTLIER_OPTIONS = [
    { value: '',  label: 'Tüm kayıtlar' },
    { value: '1', label: 'Sadece sapmalar' },
];

const num = (v) => Number(v || 0);

const fmtHours = (v) =>
    num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' saat';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '-');

const toInputDate = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const jobListHtml = (jobs) => {
    if (!jobs || !jobs.length) return '<span class="text-muted">-</span>';
    return jobs.map(j => formatJobNumber(j)).join(', ');
};

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

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    let currentFilters = {
        start_date: toInputDate(monthStart),
        end_date: toInputDate(today),
        tolerance: '0.5',
    };
    let reportRows = [];

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Kaynaklı İmalat Mesai Raporu',
        subtitle: 'Onaylı mesai saatleri ile kaynak zaman kayıtlarının karşılaştırması ve sapmalar',
        icon: 'fire',
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
            currentFilters = {
                start_date: toInputDate(monthStart),
                end_date: toInputDate(today),
                tolerance: '0.5',
            };
            loadReport();
        }
    });

    filters.addDateFilter({ id: 'start_date', label: 'Başlangıç Tarihi', value: currentFilters.start_date, colSize: 2 });
    filters.addDateFilter({ id: 'end_date', label: 'Bitiş Tarihi', value: currentFilters.end_date, colSize: 2 });
    filters.addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş emri no...', colSize: 2 });
    filters.addSelectFilter({ id: 'only_outliers', label: 'Görünüm', options: OUTLIER_OPTIONS, value: '', colSize: 2 });
    filters.addSelectFilter({ id: 'tolerance', label: 'Tolerans', options: TOLERANCE_OPTIONS, value: '0.5', colSize: 2 });

    try {
        const welders = await getWeldingOperators();
        const rows = Array.isArray(welders) ? welders : (welders?.results || []);
        const options = [{ value: '', label: 'Tümü' }].concat(
            rows.map(u => ({ value: u.id, label: u.full_name || u.username }))
        );
        filters.addSelectFilter({ id: 'user', label: 'Kaynakçı', options, colSize: 2 });
    } catch (e) {
        console.warn('Kaynakçı listesi yüklenemedi:', e);
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

    const flagsTable = new TableComponent('flags-placeholder', {
        title: 'Sapma Dağılımı',
        icon: 'fas fa-triangle-exclamation',
        iconColor: 'text-warning',
        columns: [
            { field: 'label', label: 'Durum', sortable: false,
              formatter: (v, row) => window.isExporting ? v
                  : `<span class="status-badge ${row.cls}"><i class="${row.icon} me-1"></i>${v}</span>
                     <span class="text-muted small ms-2">${esc(row.hint)}</span>` },
            { field: 'count', label: 'Kayıt', sortable: false, type: 'number' },
            { field: 'share', label: 'Pay', sortable: false, type: 'number',
              formatter: (v) => {
                  const pct = num(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '%';
                  if (window.isExporting) return pct;
                  return `<div class="d-flex align-items-center gap-2">
                            <div class="progress flex-grow-1" style="height:6px;min-width:60px;">
                              <div class="progress-bar bg-warning" style="width:${Math.min(100, num(v))}%"></div>
                            </div>
                            <span class="small text-muted">${pct}</span>
                          </div>`;
              } },
        ],
        data: [],
        pagination: false,
        sortable: false,
        small: true,
        exportable: true,
        emptyMessage: 'Sapma bulunamadı — tüm kayıtlar uyumlu',
        emptyIcon: 'fas fa-circle-check',
    });

    const table = new TableComponent('table-placeholder', {
        title: 'Mesai / Kaynak Zaman Karşılaştırması',
        icon: 'fas fa-fire',
        iconColor: 'text-danger',
        columns: [
            { field: 'date', label: 'Tarih', sortable: true, formatter: (v) => fmtDate(v) },
            { field: 'user_full_name', label: 'Kaynakçı', sortable: true, formatter: (v) => esc(v || '-') },
            { field: 'request_label', label: 'Talep', sortable: false,
              formatter: (v, row) => {
                  if (window.isExporting) return v;
                  if (!row.request_ids.length) return '<span class="text-muted">-</span>';
                  return row.request_ids.map(id => `<span class="badge bg-primary">#${id}</span>`).join(' ');
              } },
            { field: 'planned_jobs_label', label: 'Talep Edilen İş', sortable: true,
              formatter: (v, row) => window.isExporting ? v : jobListHtml(row.planned_jobs) },
            { field: 'worked_jobs_label', label: 'Çalışılan İş', sortable: true,
              formatter: (v, row) => window.isExporting ? v : jobListHtml(row.worked_jobs) },
            { field: 'planned_hours', label: 'Onaylı Mesai', sortable: true, type: 'number',
              formatter: (v) => fmtHours(v) },
            { field: 'logged_overtime_hours', label: 'İşlenen Mesai', sortable: true, type: 'number',
              formatter: (v) => fmtHours(v) },
            { field: 'variance_hours', label: 'Fark', sortable: true, type: 'number',
              formatter: (v) => {
                  const n = num(v);
                  const text = (n > 0 ? '+' : '') + fmtHours(n);
                  if (window.isExporting) return n;
                  if (Math.abs(n) < 0.005) return `<span class="text-muted">${text}</span>`;
                  return `<span class="${n < 0 ? 'text-danger' : 'text-primary'} fw-semibold">${text}</span>`;
              } },
            { field: 'logged_regular_hours', label: 'Normal Mesai', sortable: true, type: 'number',
              formatter: (v) => fmtHours(v) },
            { field: 'flags_label', label: 'Durum', sortable: true,
              formatter: (v, row) => {
                  if (window.isExporting) return v;
                  if (!row.flags.length) {
                      return '<span class="status-badge status-green"><i class="fas fa-check me-1"></i>Uyumlu</span>';
                  }
                  return row.flags.map(f => {
                      const m = FLAG_META[f] || { label: f, cls: 'status-grey', icon: 'fas fa-question' };
                      return `<span class="status-badge ${m.cls} me-1" title="${esc(m.hint || '')}"><i class="${m.icon} me-1"></i>${m.label}</span>`;
                  }).join('');
              } },
        ],
        data: [],
        pagination: true,
        itemsPerPage: 25,
        sortable: true,
        exportable: true,
        refreshable: true,
        onRefresh: () => loadReport(),
        initialSortField: 'date',
        initialSortDirection: 'desc',
        onSort: (field, direction) => {
            reportRows = sortRows(reportRows, field, direction);
            table.updateData(reportRows, reportRows.length, 1);
        },
        emptyMessage: 'Seçilen kriterlerde kaynak mesai kaydı bulunamadı',
        emptyIcon: 'fas fa-inbox',
        footer: ({ allData, columns, hasActions }) => buildTotalsRow(allData, columns, hasActions),
        rowAttributes: (row) => row.flags.length
            ? { class: 'welding-outlier-row', style: 'background-color:#fffaf5;' }
            : null,
        actions: [
            {
                key: 'detail',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => showDetail(row)
            }
        ],
    });

    function mapFilters(f) {
        const out = {};
        if (f.start_date) out.start_date = f.start_date;
        if (f.end_date) out.end_date = f.end_date;
        if (f.job_no) out.job_no = f.job_no;
        if (f.user) out.user = f.user;
        if (f.only_outliers) out.only_outliers = f.only_outliers;
        // '0' is a meaningful tolerance, so test for presence rather than truth.
        if (f.tolerance !== undefined && f.tolerance !== '') out.tolerance = f.tolerance;
        return out;
    }

    function compareValues(a, b) {
        if (a === b) return 0;
        if (a === null || a === undefined || a === '') return 1;
        if (b === null || b === undefined || b === '') return -1;
        const na = Number(a), nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b), 'tr');
    }

    function sortRows(rows, field, direction) {
        const factor = direction === 'desc' ? -1 : 1;
        return [...rows].sort((r1, r2) => factor * compareValues(r1[field], r2[field]));
    }

    // Export reads the raw field, so give every rendered-only column a plain
    // string counterpart on the row.
    function decorate(rows) {
        return rows.map(r => ({
            ...r,
            planned_hours: num(r.planned_hours),
            logged_overtime_hours: num(r.logged_overtime_hours),
            logged_regular_hours: num(r.logged_regular_hours),
            variance_hours: num(r.variance_hours),
            request_label: (r.request_ids || []).map(id => `#${id}`).join(' ') || '-',
            planned_jobs_label: (r.planned_jobs || []).join(', ') || '-',
            worked_jobs_label: (r.worked_jobs || []).join(', ') || '-',
            flags_label: (r.flags || []).map(f => FLAG_META[f]?.label || f).join(', ') || 'Uyumlu',
        }));
    }

    function renderNotice(meta, rows = []) {
        const el = document.getElementById('notice-placeholder');
        if (!el) return;
        const through = meta?.welding_data_through;
        const pendingCount = rows.filter(isPending).length;
        // Only worth saying when the period actually ran past the last entry.
        if (!through || !pendingCount) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `
            <div class="alert alert-info d-flex align-items-start" role="alert">
                <i class="fas fa-hourglass-half me-2 mt-1"></i>
                <div class="small">
                    Kaynak zaman kayıtları en son <strong>${fmtDate(through)}</strong> tarihine kadar girilmiş.
                    Sonraki günlerdeki <strong>${pendingCount}</strong> kayıt
                    <span class="status-badge status-grey">Veri girilmemiş</span> olarak işaretlendi ve
                    özet rakamlara dahil edilmedi — bunlar çalışılmadığı anlamına gelmez, kaydın
                    henüz işlenmediğini gösterir.
                </div>
            </div>`;
    }

    // Days whose welding entries have not been keyed in yet cannot be judged,
    // so every headline figure is computed over the reconcilable rows only —
    // otherwise a data-entry backlog reads as mass non-compliance.
    const isPending = (r) => r.flags.includes('pending_entry');

    function buildTotalsRow(rows, columns, hasActions) {
        // Rows awaiting data entry would drag the totals toward a deficit that
        // has not actually happened, so the footer sums the judgeable ones.
        const judged = rows.filter(r => !isPending(r));
        const sum = (f) => judged.reduce((acc, r) => acc + Number(r[f] || 0), 0);
        const outliers = judged.filter(r => r.flags.length).length;

        const totals = {
            planned_hours: fmtHours(sum('planned_hours')),
            logged_overtime_hours: fmtHours(sum('logged_overtime_hours')),
            variance_hours: (sum('variance_hours') > 0 ? '+' : '') + fmtHours(sum('variance_hours')),
            logged_regular_hours: fmtHours(sum('logged_regular_hours')),
            flags_label: `${outliers} / ${judged.length} sapmalı`,
        };

        const firstTotalIndex = columns.findIndex(c => totals[c.field] !== undefined);
        if (firstTotalIndex < 0) return '';

        const label = judged.length === rows.length ? 'Toplam' : 'Toplam (veri bekleyenler hariç)';
        const cells = [`<td colspan="${Math.max(1, firstTotalIndex)}" class="text-end fw-semibold">${label}</td>`];
        columns.slice(firstTotalIndex).forEach(c => {
            cells.push(`<td class="fw-semibold">${totals[c.field] ?? ''}</td>`);
        });
        if (hasActions) cells.push('<td></td>');

        return `<tr class="table-light">${cells.join('')}</tr>`;
    }

    function renderSummary(rows) {
        const judged = rows.filter(r => !isPending(r));
        const pending = rows.length - judged.length;
        const outliers = judged.filter(r => r.flags.length);
        const planned = judged.reduce((acc, r) => acc + r.planned_hours, 0);
        const logged = judged.reduce((acc, r) => acc + r.logged_overtime_hours, 0);
        const regular = judged.reduce((acc, r) => acc + r.logged_regular_hours, 0);
        const diff = logged - planned;
        const coverage = planned > 0 ? (logged / planned) * 100 : 0;
        const rate = judged.length ? ((judged.length - outliers.length) / judged.length) * 100 : 0;
        const welders = new Set(judged.map(r => r.user_id)).size;
        const days = new Set(judged.map(r => r.date)).size;

        const data = [
            { label: 'Talep edilen mesai süresi', value: fmtHours(planned),
              icon: 'fas fa-clipboard-check', color: 'text-primary',
              note: `${judged.length} kayıt, ${welders} kaynakçı, ${days} gün` },
            { label: 'İşlenen mesai saati', value: fmtHours(logged),
              icon: 'fas fa-fire', color: 'text-danger',
              note: 'Kaynak zaman kayıtlarındaki mesai (1.5x / 2x) satırları' },
            { label: 'Fark', value: (diff > 0 ? '+' : '') + fmtHours(diff),
              icon: 'fas fa-scale-unbalanced', color: diff < 0 ? 'text-danger' : 'text-primary',
              note: `İşlenme oranı %${coverage.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` },
            { label: 'İşlenen normal mesai', value: fmtHours(regular),
              icon: 'fas fa-clock', color: 'text-secondary',
              note: 'Aynı günlerdeki normal vardiya saatleri — mesaiye dahil değil' },
            { label: 'Sapmalı kayıt', value: `${outliers.length} / ${judged.length}`,
              icon: 'fas fa-triangle-exclamation', color: 'text-warning',
              note: `Uyum oranı %${rate.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` },
        ];
        if (pending > 0) {
            data.push({
                label: 'Veri bekleyen kayıt', value: String(pending),
                icon: 'fas fa-hourglass-half', color: 'text-muted',
                note: 'Kaynak zaman kaydı henüz girilmemiş — yukarıdaki toplamlara dahil değil',
            });
        }
        summaryTable.updateData(rows.length ? data : []);
    }

    function renderFlags(rows) {
        const counts = new Map();
        rows.forEach(r => r.flags.forEach(f => counts.set(f, (counts.get(f) || 0) + 1)));
        const judgedCount = rows.filter(r => !isPending(r)).length;
        const data = FLAG_ORDER
            .filter(f => counts.get(f))
            .map(f => {
                // pending_entry is measured against everything; the real flags
                // against the rows that could actually be judged.
                const base = f === 'pending_entry' ? rows.length : judgedCount;
                return {
                    ...FLAG_META[f],
                    count: counts.get(f),
                    // Rows can carry more than one flag, so this is share of
                    // rows, not a slice of a whole that adds up to 100%.
                    share: base ? (counts.get(f) / base) * 100 : 0,
                };
            });
        flagsTable.updateData(data);
    }

    function showDetail(row) {
        const modal = new DisplayModal('welding-detail-modal-container', {
            title: `${row.user_full_name} — ${fmtDate(row.date)}`,
            icon: 'fas fa-fire',
            size: 'lg',
            showEditButton: false,
        });

        modal.addSection({ title: 'Karşılaştırma', icon: 'fas fa-scale-balanced' });
        modal.addField({ label: 'Onaylı Mesai', value: fmtHours(row.planned_hours), icon: 'fas fa-clipboard-check', colSize: 4 });
        modal.addField({ label: 'İşlenen Mesai', value: fmtHours(row.logged_overtime_hours), icon: 'fas fa-fire', colSize: 4 });
        modal.addField({ label: 'Fark', value: (row.variance_hours > 0 ? '+' : '') + fmtHours(row.variance_hours), icon: 'fas fa-scale-unbalanced', colSize: 4 });
        modal.addField({ label: 'Mesai Talebi', value: row.request_label, icon: 'fas fa-file-alt', colSize: 4 });
        modal.addField({ label: 'Talep Edilen İş', value: row.planned_jobs_label, icon: 'fas fa-hashtag', colSize: 4 });
        modal.addField({ label: 'Normal Mesai', value: fmtHours(row.logged_regular_hours), icon: 'fas fa-clock', colSize: 4 });
        if (row.planned_note) {
            modal.addField({ label: 'Talep Açıklaması', value: row.planned_note, icon: 'fas fa-comment', colSize: 12 });
        }

        if (row.flags.length) {
            const items = row.flags.map(f => {
                const m = FLAG_META[f] || { label: f, hint: '' };
                return `<li><strong>${m.label}</strong> — ${esc(m.hint)}</li>`;
            }).join('');
            modal.addCustomSection({
                title: null,
                customContent: `
                    <div class="alert alert-warning d-flex align-items-start mb-0" role="alert">
                        <i class="fas fa-triangle-exclamation me-2 mt-1"></i>
                        <div>
                            <div class="fw-semibold mb-1">Sapmalar</div>
                            <ul class="mb-0 small">${items}</ul>
                        </div>
                    </div>`
            });
        }

        const lines = (row.lines || []).map(l => `
            <tr>
                <td>${l.job_no ? formatJobNumber(l.job_no) : '<span class="text-muted">-</span>'}</td>
                <td>${OVERTIME_TYPE_LABELS[l.overtime_type] || esc(l.overtime_type)}</td>
                <td class="text-muted small">${esc(l.description || '-')}</td>
                <td class="text-end">${fmtHours(l.hours)}</td>
            </tr>`).join('');

        modal.addCustomSection({
            title: 'Kaynak Zaman Kayıtları',
            icon: 'fas fa-list',
            iconColor: 'text-danger',
            customContent: `
                <div class="table-responsive">
                    <table class="table table-sm table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr><th>İş No</th><th>Tür</th><th>Açıklama</th><th class="text-end">Saat</th></tr>
                        </thead>
                        <tbody>${lines || '<tr><td colspan="4" class="text-center text-muted py-3">O gün için kaynak zaman kaydı girilmemiş</td></tr>'}</tbody>
                    </table>
                </div>`,
        });

        modal.render().show();
    }

    async function loadReport() {
        try {
            table.setLoading(true);
            flagsTable.setLoading(true);
            summaryTable.setLoading(true);

            const data = await getOvertimeWeldingReport(currentFilters);
            reportRows = decorate(data?.rows || []);

            renderNotice(data?.meta, reportRows);
            renderSummary(reportRows);
            renderFlags(reportRows);
            table.updateData(reportRows, reportRows.length, 1);
        } catch (error) {
            reportRows = [];
            renderNotice(null);
            renderSummary([]);
            flagsTable.updateData([]);
            table.updateData([], 0, 1);
            showNotification('Rapor yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
        } finally {
            table.setLoading(false);
            flagsTable.setLoading(false);
            summaryTable.setLoading(false);
        }
    }

    await loadReport();
});
