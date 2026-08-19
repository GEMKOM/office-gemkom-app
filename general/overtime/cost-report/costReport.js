import { guardRoute } from '../../../authService.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { getOvertimeCostReport } from '../../../apis/overtime.js';
import { fetchUsersDropdown } from '../../../apis/users.js';
import { formatJobNumber } from '../../../apis/formatters.js';

// Mirrors the canonical department list in human_resources/org/org.js. Keep in
// sync — overtime rows carry `rollingmill`, `management` etc. and a missing
// entry shows the raw code to the user.
const TEAM_OPTIONS = [
    { value: '',                   label: 'Tümü' },
    { value: 'machining',          label: 'Talaşlı İmalat' },
    { value: 'design',             label: 'Dizayn' },
    { value: 'logistics',          label: 'Lojistik' },
    { value: 'procurement',        label: 'Satın Alma' },
    { value: 'welding',            label: 'Kaynaklı İmalat' },
    { value: 'planning',           label: 'Planlama' },
    { value: 'manufacturing',      label: 'İmalat' },
    { value: 'maintenance',        label: 'Bakım' },
    { value: 'rollingmill',        label: 'Haddehane' },
    { value: 'qualitycontrol',     label: 'Kalite Kontrol' },
    { value: 'cutting',            label: 'CNC Kesim' },
    { value: 'warehouse',          label: 'Ambar' },
    { value: 'finance',            label: 'Finans' },
    { value: 'management',         label: 'Yönetim' },
    { value: 'external_workshops', label: 'Dış Atölyeler' },
    { value: 'human_resources',    label: 'İnsan Kaynakları' },
    { value: 'sales',              label: 'Proje Taahhüt' },
    { value: 'accounting',         label: 'Muhasebe' },
];

const TEAM_LABELS = Object.fromEntries(TEAM_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]));

const STATUS_OPTIONS = [
    { value: 'approved',           label: 'Sadece onaylı' },
    { value: 'approved,submitted', label: 'Onaylı + bekleyen (tahmini)' },
    { value: 'submitted',          label: 'Sadece bekleyen' },
];

const GROUP_OPTIONS = [
    { value: 'by_team', label: 'Ekibe göre' },
    { value: 'by_user', label: 'Kişiye göre' },
    { value: 'by_job',  label: 'İş No’ya göre' },
];

// Rate buckets as priced by the backend (see overtime/services/cost.py).
// Overtime is outside normal hours by definition, so there is no 1x bucket.
// Hafta içi/Cumartesi share a rate, as do Pazar/Resmi tatil — but all four stay
// separate rows so each is visible on its own.
const BUCKET_META = [
    { key: 'weekday',  label: 'Hafta içi (1.5x)',  icon: 'fas fa-moon',          color: 'text-info' },
    { key: 'saturday', label: 'Cumartesi (1.5x)',  icon: 'fas fa-calendar-week', color: 'text-primary' },
    { key: 'sunday',   label: 'Pazar (2x)',        icon: 'fas fa-calendar-day',  color: 'text-warning' },
    { key: 'holiday',  label: 'Resmi tatil (2x)',  icon: 'fas fa-flag',          color: 'text-danger' },
];

const num = (v) => Number(v || 0);

const fmtEur = (v) =>
    '€' + num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtHours = (v) =>
    num(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' saat';

const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '-');

// Falls back to the raw code for teams not in the map (e.g. legacy snapshots).
const teamLabel = (t) => TEAM_LABELS[t] || esc(t) || '-';

const toInputDate = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Job numbers are hierarchical: 272-01 is the parent of 272-01-01, 272-01-02, ...
// The breakdown rolls everything up to the first two segments so a project shows
// as one line, with its sub-jobs underneath.
const JOB_PARENT_SEGMENTS = 2;

function jobParentKey(jobNo) {
    const parts = String(jobNo || '').trim().split('-');
    return parts.slice(0, JOB_PARENT_SEGMENTS).join('-');
}

const NO_JOB_LABEL = 'İş No Yok';

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
        status: 'approved',
    };
    let groupBy = 'by_team';
    let report = null;

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Mesai Maliyet Raporu',
        subtitle: 'Seçilen dönemdeki toplam mesai maliyeti — ekip, kişi ve iş bazında dağılım',
        icon: 'coins',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/general/overtime',
        onRefreshClick: () => loadReport()
    });

    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Raporla',
        clearButtonText: 'Temizle',
        onApply: (f) => {
            currentFilters = mapFilters(f);
            groupBy = f.group_by || 'by_team';
            loadReport();
        },
        onClear: () => {
            currentFilters = {
                start_date: toInputDate(monthStart),
                end_date: toInputDate(today),
                status: 'approved',
            };
            groupBy = 'by_team';
            loadReport();
        }
    });

    filters.addDateFilter({ id: 'start_date', label: 'Başlangıç Tarihi', value: currentFilters.start_date, colSize: 2 });
    filters.addDateFilter({ id: 'end_date', label: 'Bitiş Tarihi', value: currentFilters.end_date, colSize: 2 });
    filters.addSelectFilter({ id: 'status', label: 'Durum', options: STATUS_OPTIONS, value: 'approved', colSize: 2 });
    filters.addSelectFilter({ id: 'team', label: 'Ekip', options: TEAM_OPTIONS, colSize: 2 });
    filters.addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş emri no...', colSize: 2 });
    filters.addSelectFilter({ id: 'group_by', label: 'Dağılım', options: GROUP_OPTIONS, value: 'by_team', colSize: 2 });

    // Personnel filter — populated from the light users dropdown endpoint.
    try {
        const users = await fetchUsersDropdown({ is_active: true });
        const options = [{ value: '', label: 'Tümü' }].concat(
            users.map(u => ({ value: u.id, label: u.full_name || u.username }))
        );
        filters.addDropdownFilter({ id: 'user', label: 'Personel', options, placeholder: 'Tümü', searchable: true, colSize: 3 });
    } catch (e) {
        console.warn('Personel listesi yüklenemedi:', e);
    }

    const stats = new StatisticsCards('stats-placeholder', { cards: [], itemsPerRow: 5, compact: true });

    const bucketTable = new TableComponent('bucket-placeholder', {
        title: 'Ücret Katsayısına Göre Dağılım',
        icon: 'fas fa-layer-group',
        iconColor: 'text-warning',
        columns: [
            { field: 'label', label: 'Kategori', sortable: false,
              formatter: (v, row) => window.isExporting ? v : `<i class="${row.icon} ${row.color} me-2"></i>${v}` },
            { field: 'hours', label: 'Saat', sortable: true, type: 'number', formatter: (v) => fmtHours(v) },
            { field: 'cost_eur', label: 'Maliyet', sortable: true, type: 'number', formatter: (v) => fmtEur(v) },
            { field: 'share', label: 'Maliyet Payı', sortable: true, type: 'number',
              formatter: (v) => {
                  const pct = num(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '%';
                  if (window.isExporting) return pct;
                  return `<div class="d-flex align-items-center gap-2">
                            <div class="progress flex-grow-1" style="height:6px;min-width:60px;">
                              <div class="progress-bar bg-primary" style="width:${Math.min(100, num(v))}%"></div>
                            </div>
                            <span class="small text-muted">${pct}</span>
                          </div>`;
              } },
        ],
        data: [],
        pagination: false,
        sortable: false,
        small: true,
        emptyMessage: 'Veri yok',
        exportable: true,
    });

    // Job-order breakdown, rolled up two levels: 272-01 with 272-01-01 beneath it.
    const expandedJobs = new Set();
    let jobTree = [];

    const jobTreeTable = new TableComponent('job-tree-placeholder', {
        title: 'İş Emri Numarasına Göre Dağılım',
        icon: 'fas fa-sitemap',
        iconColor: 'text-success',
        columns: [
            { field: 'job_no', label: 'İş No', sortable: false, formatter: (v, row) => jobCellHtml(row) },
            { field: 'request_count', label: 'Talep', sortable: false, type: 'number', formatter: (v) => v ?? 0 },
            { field: 'entry_count', label: 'Kayıt', sortable: false, type: 'number', formatter: (v) => v ?? 0 },
            { field: 'hours', label: 'Saat', sortable: false, type: 'number', formatter: (v) => fmtHours(v) },
            { field: 'cost_eur', label: 'Maliyet', sortable: false, type: 'number',
              formatter: (v, row) => window.isExporting ? num(v)
                  : (row.level === 0 ? `<strong>${fmtEur(v)}</strong>` : fmtEur(v)) },
            { field: 'share', label: 'Pay', sortable: false, type: 'number',
              formatter: (v) => {
                  const pct = num(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '%';
                  if (window.isExporting) return pct;
                  return `<div class="d-flex align-items-center gap-2">
                            <div class="progress flex-grow-1" style="height:6px;min-width:60px;">
                              <div class="progress-bar bg-success" style="width:${Math.min(100, num(v))}%"></div>
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
        emptyMessage: 'Seçilen dönemde iş emrine bağlı mesai kaydı bulunamadı',
        emptyIcon: 'fas fa-inbox',
        rowAttributes: (row) => row.level === 0
            ? { class: 'job-tree-parent', style: 'background-color:#f8f9fa;' }
            : { class: 'job-tree-child' },
    });

    function jobCellHtml(row) {
        const label = row.job_no || NO_JOB_LABEL;
        if (window.isExporting) return (row.level === 1 ? '    ' : '') + label;

        // Parents own the expand toggle; both levels open the detail modal.
        const toggle = row.level === 0 && row.expandable
            ? `<i class="fas ${row.expanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-muted me-2 job-tree-toggle"
                  role="button" data-job-toggle="${esc(row.key)}" title="Alt iş emirleri"></i>`
            : '<span class="d-inline-block me-2" style="width:1em;"></span>';
        const indent = row.level === 1 ? 'ps-4' : '';
        // The no-job bucket is clickable too — seeing which entries were filed
        // without a job number is exactly why you would open it.
        const inner = row.job_no ? formatJobNumber(row.job_no) : `<span class="text-muted">${NO_JOB_LABEL}</span>`;
        const name = `<a href="javascript:void(0)" class="text-decoration-none" data-job-detail="${esc(row.key)}">${inner}</a>`;
        const badge = row.level === 0 && row.expandable
            ? ` <span class="badge bg-light text-dark ms-2">${row.child_count} alt iş</span>`
            : '';
        return `<span class="${indent}">${toggle}${row.level === 0 ? `<strong>${name}</strong>` : name}${badge}</span>`;
    }

    const breakdownTable = new TableComponent('breakdown-placeholder', {
        title: 'Dağılım',
        icon: 'fas fa-chart-pie',
        iconColor: 'text-primary',
        columns: buildBreakdownColumns('by_team'),
        data: [],
        pagination: true,
        itemsPerPage: 15,
        sortable: true,
        exportable: true,
        emptyMessage: 'Seçilen dönemde mesai kaydı bulunamadı',
        emptyIcon: 'fas fa-inbox',
    });

    const table = new TableComponent('table-placeholder', {
        title: 'Mesai Talepleri',
        icon: 'fas fa-clock',
        iconColor: 'text-success',
        columns: [
            { field: 'id', label: 'Talep No', sortable: true, type: 'number',
              formatter: (v) => window.isExporting ? v : `<span class="badge bg-primary">#${v}</span>` },
            { field: 'counted_start_at', label: 'Başlangıç', sortable: true, type: 'date',
              formatter: (v) => fmtDateTime(v) },
            { field: 'counted_end_at', label: 'Bitiş', sortable: true, type: 'date',
              formatter: (v) => fmtDateTime(v) },
            { field: 'team', label: 'Ekip', sortable: true, formatter: (v) => teamLabel(v) },
            { field: 'requester_name', label: 'Talep Eden', sortable: true, formatter: (v) => v || '-' },
            { field: 'entry_count', label: 'Kişi', sortable: true, type: 'number',
              formatter: (v) => window.isExporting ? v : `<span class="badge bg-light text-dark">${v}</span>` },
            { field: 'hours', label: 'Toplam Saat', sortable: true, type: 'number', formatter: (v) => fmtHours(v) },
            { field: 'cost_eur', label: 'Maliyet', sortable: true, type: 'number',
              formatter: (v) => window.isExporting ? num(v) : `<strong>${fmtEur(v)}</strong>` },
            { field: 'status', label: 'Durum', sortable: true,
              formatter: (v, row) => {
                  const label = v === 'approved' ? 'Onaylandı' : v === 'submitted' ? 'Onay Bekliyor' : v;
                  if (window.isExporting) return label + (row.is_partial ? ' (kısmi)' : '');
                  const cls = v === 'approved' ? 'status-green' : 'status-yellow';
                  const partial = row.is_partial
                      ? ` <span class="badge bg-secondary" title="Bu talep seçilen dönemin dışına taşıyor; sadece dönem içindeki kısmı hesaplandı.">kısmi</span>`
                      : '';
                  return `<span class="badge ${cls}">${label}</span>${partial}`;
              } },
        ],
        data: [],
        pagination: true,
        itemsPerPage: 20,
        sortable: true,
        exportable: true,
        refreshable: true,
        onRefresh: () => loadReport(),
        emptyMessage: 'Seçilen dönemde mesai talebi bulunamadı',
        emptyIcon: 'fas fa-inbox',
        actions: [
            {
                key: 'detail',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => showRequestDetail(row)
            }
        ],
    });

    function buildBreakdownColumns(mode) {
        const first = {
            by_team: { field: 'team', label: 'Ekip', formatter: (v) => teamLabel(v) },
            by_user: {
                field: 'full_name', label: 'Personel',
                formatter: (v, row) => {
                    const name = v || row.username || '-';
                    if (window.isExporting) return name + (row.estimated_wage ? ' (tahmini ücret)' : '');
                    return row.estimated_wage
                        ? `${esc(name)} <i class="fas fa-exclamation-triangle text-warning ms-1" title="Bu personelin tanımlı maaşı yok; sistem ortalaması kullanıldı."></i>`
                        : esc(name);
                }
            },
            by_job: {
                field: 'job_no', label: 'İş No',
                formatter: (v) => window.isExporting ? (v || '-') : (v ? formatJobNumber(v) : '<span class="text-muted">-</span>')
            },
        }[mode];

        return [
            { ...first, sortable: true },
            { field: 'request_count', label: 'Talep', sortable: true, type: 'number', formatter: (v) => v ?? 0 },
            { field: 'entry_count', label: 'Kayıt', sortable: true, type: 'number', formatter: (v) => v ?? 0 },
            { field: 'hours', label: 'Saat', sortable: true, type: 'number', formatter: (v) => fmtHours(v) },
            { field: 'cost_eur', label: 'Maliyet', sortable: true, type: 'number',
              formatter: (v) => window.isExporting ? num(v) : `<strong>${fmtEur(v)}</strong>` },
            { field: 'share', label: 'Pay', sortable: true, type: 'number',
              formatter: (v) => num(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '%' },
        ];
    }

    function mapFilters(f) {
        const out = {};
        if (f.start_date) out.start_date = f.start_date;
        if (f.end_date) out.end_date = f.end_date;
        if (f.status) out.status = f.status;
        if (f.team) out.team = f.team;
        if (f.job_no) out.job_no = f.job_no;
        if (f.user) out.user = f.user;
        return out;
    }

    function renderNotice(html) {
        document.getElementById('notice-placeholder').innerHTML = html || '';
    }

    function renderStats(data) {
        const s = data.summary;
        stats.setCards([
            { title: 'Toplam Mesai Maliyeti', value: fmtEur(s.total_cost_eur), icon: 'fas fa-coins', color: 'primary' },
            { title: 'Toplam Mesai Saati', value: fmtHours(s.total_hours), icon: 'fas fa-hourglass-half', color: 'info' },
            { title: 'Ortalama Saat Maliyeti', value: fmtEur(s.avg_cost_per_hour_eur), icon: 'fas fa-tachometer-alt', color: 'secondary' },
            { title: 'Mesai Yapan Kişi', value: s.user_count, icon: 'fas fa-users', color: 'success' },
            { title: 'Talep Sayısı', value: s.request_count, icon: 'fas fa-file-alt', color: 'warning' },
        ]);
    }

    function renderBuckets(data) {
        const total = num(data.summary.total_cost_eur);
        const rows = BUCKET_META.map(b => {
            const cell = data.by_bucket[b.key] || { hours: '0', cost_eur: '0' };
            return {
                label: b.label,
                icon: b.icon,
                color: b.color,
                hours: num(cell.hours),
                cost_eur: num(cell.cost_eur),
                share: total > 0 ? (num(cell.cost_eur) / total) * 100 : 0,
            };
        }).filter(r => r.hours > 0 || r.cost_eur > 0);
        bucketTable.updateData(rows);
    }

    function renderBreakdown(data) {
        const rows = (data[groupBy] || []).map(r => ({
            ...r,
            hours: num(r.hours),
            cost_eur: num(r.cost_eur),
            share: num(data.summary.total_cost_eur) > 0
                ? (num(r.cost_eur) / num(data.summary.total_cost_eur)) * 100
                : 0,
        }));
        const titles = { by_team: 'Ekip Bazında Dağılım', by_user: 'Kişi Bazında Dağılım', by_job: 'İş No Bazında Dağılım' };
        breakdownTable.options.title = titles[groupBy];
        breakdownTable.options.columns = buildBreakdownColumns(groupBy);
        // Pass totalItems explicitly — client-side pagination reads it for the
        // "x / y kayıt" footer and leaves it at 0 otherwise.
        breakdownTable.updateData(rows, rows.length, 1);
    }

    function buildJobTree(data) {
        // A request touching two sub-jobs must count once at the parent level,
        // so gather request ids per job rather than summing child counts.
        const requestIdsByJob = new Map();
        (data.requests || []).forEach(req => {
            (req.entries || []).forEach(e => {
                const job = (e.job_no || '').trim();
                if (!requestIdsByJob.has(job)) requestIdsByJob.set(job, new Set());
                requestIdsByJob.get(job).add(req.id);
            });
        });

        const parents = new Map();
        (data.by_job || []).forEach(r => {
            const job = (r.job_no || '').trim();
            const key = job ? jobParentKey(job) : '';
            let p = parents.get(key);
            if (!p) {
                p = { key, job_no: key, level: 0, hours: 0, cost_eur: 0,
                      entry_count: 0, requestIds: new Set(), children: [] };
                parents.set(key, p);
            }
            p.children.push({
                key: job, job_no: job, level: 1,
                hours: num(r.hours), cost_eur: num(r.cost_eur),
                entry_count: r.entry_count ?? 0,
                request_count: r.request_count ?? 0,
            });
            p.hours += num(r.hours);
            p.cost_eur += num(r.cost_eur);
            p.entry_count += r.entry_count ?? 0;
            (requestIdsByJob.get(job) || new Set()).forEach(id => p.requestIds.add(id));
        });

        const total = num(data.summary.total_cost_eur);
        const share = (cost) => (total > 0 ? (cost / total) * 100 : 0);

        return [...parents.values()]
            .map(p => ({
                ...p,
                request_count: p.requestIds.size,
                share: share(p.cost_eur),
                child_count: p.children.length,
                // A lone child identical to its parent adds no information.
                expandable: !(p.children.length === 1 && p.children[0].job_no === p.key),
                children: p.children
                    .map(c => ({ ...c, share: share(c.cost_eur) }))
                    .sort((a, b) => b.cost_eur - a.cost_eur),
            }))
            .sort((a, b) => b.cost_eur - a.cost_eur);
    }

    function flattenJobTree() {
        const rows = [];
        jobTree.forEach(p => {
            const expanded = expandedJobs.has(p.key);
            rows.push({ ...p, expanded });
            if (expanded && p.expandable) rows.push(...p.children);
        });
        return rows;
    }

    function renderJobTree() {
        jobTreeTable.updateData(flattenJobTree());
    }

    // Delegated because TableComponent replaces its container's contents (and
    // the container node itself) on every re-render.
    document.addEventListener('click', (ev) => {
        const toggle = ev.target.closest('[data-job-toggle]');
        if (toggle) {
            const key = toggle.getAttribute('data-job-toggle');
            if (expandedJobs.has(key)) expandedJobs.delete(key);
            else expandedJobs.add(key);
            renderJobTree();
            return;
        }
        const detail = ev.target.closest('[data-job-detail]');
        if (detail) {
            ev.preventDefault();
            showJobDetail(detail.getAttribute('data-job-detail'));
        }
    });

    function renderRequests(data) {
        const rows = (data.requests || []).map(r => ({
            ...r,
            hours: num(r.hours),
            cost_eur: num(r.cost_eur),
        }));
        table.updateData(rows, rows.length, 1);
    }

    function showJobDetail(jobKey) {
        if (!report) return;

        const parent = jobTree.find(p => p.key === jobKey);
        const isParent = !!parent;
        // A parent covers itself and every sub-job beneath it; a child is exact.
        const matches = isParent
            ? new Set(parent.children.map(c => c.job_no))
            : new Set([jobKey]);

        const rows = [];
        (report.requests || []).forEach(req => {
            (req.entries || []).forEach(e => {
                if (!matches.has((e.job_no || '').trim())) return;
                rows.push({
                    request_id: req.id,
                    date: req.counted_start_at,
                    team: req.team,
                    job_no: e.job_no,
                    full_name: e.full_name || e.username,
                    description: e.description,
                    hours: num(e.hours),
                    cost_eur: num(e.cost_eur),
                });
            });
        });
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.cost_eur - a.cost_eur);

        const totalHours = rows.reduce((s2, r) => s2 + r.hours, 0);
        const totalCost = rows.reduce((s2, r) => s2 + r.cost_eur, 0);

        const modal = new DisplayModal('job-detail-modal-container', {
            title: `İş Emri ${jobKey || NO_JOB_LABEL} — Mesai Detayı`,
            icon: 'fas fa-sitemap',
            size: 'xl',
            showEditButton: false,
        });

        modal.addSection({ title: 'Özet', icon: 'fas fa-info-circle' });
        modal.addField({ label: 'İş No', value: jobKey || NO_JOB_LABEL, icon: 'fas fa-hashtag', colSize: 3 });
        modal.addField({ label: 'Toplam Saat', value: fmtHours(totalHours), icon: 'fas fa-hourglass-half', colSize: 3 });
        modal.addField({ label: 'Toplam Maliyet', value: fmtEur(totalCost), icon: 'fas fa-coins', colSize: 3 });
        modal.addField({ label: 'Mesai Kaydı', value: String(rows.length), icon: 'fas fa-list', colSize: 3 });

        if (isParent && parent.expandable) {
            modal.addCustomSection({
                title: 'Alt İş Emirleri',
                icon: 'fas fa-code-branch',
                iconColor: 'text-success',
                customContent: buildSimpleTableHtml(
                    ['İş No', 'Kayıt', 'Saat', 'Maliyet'],
                    parent.children.map(c => [
                        formatJobNumber(c.job_no), String(c.entry_count),
                        fmtHours(c.hours), `<strong>${fmtEur(c.cost_eur)}</strong>`,
                    ]),
                    [false, true, true, true],
                ),
            });
        }

        const byPerson = new Map();
        rows.forEach(r => {
            const cur = byPerson.get(r.full_name) || { hours: 0, cost_eur: 0, count: 0 };
            cur.hours += r.hours; cur.cost_eur += r.cost_eur; cur.count += 1;
            byPerson.set(r.full_name, cur);
        });
        modal.addCustomSection({
            title: 'Kişi Bazında',
            icon: 'fas fa-user-tag',
            iconColor: 'text-primary',
            customContent: buildSimpleTableHtml(
                ['Personel', 'Kayıt', 'Saat', 'Maliyet'],
                [...byPerson.entries()]
                    .sort((a, b) => b[1].cost_eur - a[1].cost_eur)
                    .map(([name, v]) => [esc(name), String(v.count), fmtHours(v.hours), `<strong>${fmtEur(v.cost_eur)}</strong>`]),
                [false, true, true, true],
            ),
        });

        modal.addCustomSection({
            title: 'Mesai Kayıtları',
            icon: 'fas fa-clock',
            iconColor: 'text-warning',
            customContent: buildSimpleTableHtml(
                ['Tarih', 'Talep', 'Personel', 'İş No', 'Açıklama', 'Saat', 'Maliyet'],
                rows.map(r => [
                    fmtDate(r.date),
                    `<span class="badge bg-primary">#${r.request_id}</span>`,
                    esc(r.full_name),
                    formatJobNumber(r.job_no),
                    `<span class="text-muted small">${esc(r.description || '-')}</span>`,
                    fmtHours(r.hours),
                    `<strong>${fmtEur(r.cost_eur)}</strong>`,
                ]),
                [false, false, false, false, false, true, true],
            ),
        });

        modal.render().show();
    }

    // Small read-only table used by the job detail modal. `alignEnd` marks the
    // numeric columns.
    function buildSimpleTableHtml(headers, rows, alignEnd = []) {
        const th = headers.map((h, i) => `<th${alignEnd[i] ? ' class="text-end"' : ''}>${h}</th>`).join('');
        const body = rows.map(cells =>
            `<tr>${cells.map((c, i) => `<td${alignEnd[i] ? ' class="text-end"' : ''}>${c}</td>`).join('')}</tr>`
        ).join('');
        return `
            <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light"><tr>${th}</tr></thead>
                    <tbody>${body || `<tr><td colspan="${headers.length}" class="text-center text-muted py-3">Kayıt yok</td></tr>`}</tbody>
                </table>
            </div>`;
    }

    function showRequestDetail(row) {
        // The report payload already carries every entry, so the modal opens
        // instantly with no extra request.
        const req = (report?.requests || []).find(r => r.id === row.id);
        if (!req) {
            showNotification('Talep detayı bulunamadı', 'error');
            return;
        }

        const modal = new DisplayModal('cost-detail-modal-container', {
            title: `Mesai Talebi #${req.id} — Maliyet Detayı`,
            icon: 'fas fa-coins',
            size: 'xl',
            showEditButton: false,
        });

        modal.addSection({ title: 'Talep Bilgileri', icon: 'fas fa-info-circle' });
        modal.addField({ label: 'Talep Eden', value: req.requester_name || '-', icon: 'fas fa-user', colSize: 6 });
        modal.addField({ label: 'Ekip', value: teamLabel(req.team), icon: 'fas fa-users', colSize: 6 });
        modal.addField({ label: 'Başlangıç', value: fmtDateTime(req.start_at), icon: 'fas fa-play', colSize: 6 });
        modal.addField({ label: 'Bitiş', value: fmtDateTime(req.end_at), icon: 'fas fa-stop', colSize: 6 });
        modal.addField({ label: 'Talep Süresi', value: fmtHours(req.duration_hours), icon: 'fas fa-clock', colSize: 6 });
        modal.addField({ label: 'Kişi Sayısı', value: String(req.entry_count), icon: 'fas fa-user-friends', colSize: 6 });
        if (req.reason) {
            modal.addField({ label: 'Gerekçe', value: req.reason, icon: 'fas fa-comment', colSize: 12 });
        }

        if (req.is_partial) {
            modal.addCustomSection({
                title: null,
                customContent: `
                    <div class="alert alert-secondary d-flex align-items-center mb-0">
                        <i class="fas fa-scissors me-2"></i>
                        <div class="small">
                            Bu talep seçilen rapor döneminin dışına taşıyor. Aşağıdaki tutarlar yalnızca
                            <strong>${fmtDateTime(req.counted_start_at)} – ${fmtDateTime(req.counted_end_at)}</strong>
                            aralığı için hesaplanmıştır.
                        </div>
                    </div>`
            });
        }

        modal.addCustomSection({
            title: 'Kişi Bazında Maliyet',
            icon: 'fas fa-user-tag',
            iconColor: 'text-primary',
            customContent: buildEntriesTableHtml(req),
        });

        modal.addCustomSection({
            title: 'Ücret Katsayısı Dağılımı',
            icon: 'fas fa-layer-group',
            iconColor: 'text-warning',
            customContent: buildBucketTableHtml(req.buckets, req.cost_eur),
        });

        modal.render().show();
    }

    function buildEntriesTableHtml(req) {
        const rows = (req.entries || []).map(e => {
            const warn = e.estimated_wage
                ? ` <i class="fas fa-exclamation-triangle text-warning" title="Tanımlı maaş yok; sistem ortalaması kullanıldı."></i>`
                : '';
            const unpriced = num(e.unpriced_hours) > 0
                ? `<div class="small text-danger"><i class="fas fa-times-circle me-1"></i>${fmtHours(e.unpriced_hours)} fiyatlanamadı (kur verisi yok)</div>`
                : '';
            const statusLabel = { approved: 'Onaylandı', pending: 'Bekliyor', rejected: 'Reddedildi' }[e.status] || e.status;
            const statusCls = { approved: 'status-green', pending: 'status-yellow', rejected: 'status-red' }[e.status] || 'bg-light text-dark';
            return `
                <tr>
                    <td>${esc(e.full_name || e.username)}${warn}${unpriced}</td>
                    <td>${e.job_no ? formatJobNumber(e.job_no) : '<span class="text-muted">-</span>'}</td>
                    <td class="text-muted small">${esc(e.description || '-')}</td>
                    <td><span class="badge ${statusCls}">${statusLabel}</span></td>
                    <td class="text-end">${fmtHours(e.hours)}</td>
                    <td class="text-end"><strong>${fmtEur(e.cost_eur)}</strong></td>
                </tr>`;
        }).join('');

        return `
            <div class="table-responsive">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Personel</th><th>İş No</th><th>Açıklama</th><th>Durum</th>
                            <th class="text-end">Saat</th><th class="text-end">Maliyet</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6" class="text-center text-muted py-3">Kayıt yok</td></tr>'}</tbody>
                    <tfoot class="table-light">
                        <tr>
                            <th colspan="4" class="text-end">Toplam</th>
                            <th class="text-end">${fmtHours(req.hours)}</th>
                            <th class="text-end">${fmtEur(req.cost_eur)}</th>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
    }

    function buildBucketTableHtml(buckets, totalCost) {
        const total = num(totalCost);
        const rows = BUCKET_META.map(b => {
            const cell = (buckets || {})[b.key] || { hours: '0', cost_eur: '0' };
            if (num(cell.hours) === 0 && num(cell.cost_eur) === 0) return '';
            const share = total > 0 ? (num(cell.cost_eur) / total) * 100 : 0;
            return `
                <tr>
                    <td><i class="${b.icon} ${b.color} me-2"></i>${b.label}</td>
                    <td class="text-end">${fmtHours(cell.hours)}</td>
                    <td class="text-end">${fmtEur(cell.cost_eur)}</td>
                    <td class="text-end text-muted small">${share.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%</td>
                </tr>`;
        }).join('');

        return `
            <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                    <thead class="table-light">
                        <tr><th>Kategori</th><th class="text-end">Saat</th><th class="text-end">Maliyet</th><th class="text-end">Pay</th></tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" class="text-center text-muted py-3">Veri yok</td></tr>'}</tbody>
                </table>
            </div>`;
    }

    function buildDataQualityNotice(data) {
        const s = data.summary;
        const parts = [];
        if (s.estimated_wage_entry_count > 0) {
            parts.push(`<strong>${s.estimated_wage_entry_count}</strong> mesai kaydında personelin tanımlı maaşı olmadığı için sistem ortalaması kullanıldı.`);
        }
        if (num(s.unpriced_hours) > 0) {
            parts.push(`<strong>${fmtHours(s.unpriced_hours)}</strong> ilgili güne ait kur verisi bulunmadığı için fiyatlanamadı ve toplama dahil edilmedi.`);
        }
        if (!parts.length) return '';
        return `
            <div class="alert alert-warning d-flex align-items-start" role="alert">
                <i class="fas fa-exclamation-triangle me-2 mt-1"></i>
                <div>
                    <div class="fw-semibold mb-1">Maliyet doğruluğu uyarısı</div>
                    <ul class="mb-0 small">${parts.map(p => `<li>${p}</li>`).join('')}</ul>
                </div>
            </div>`;
    }

    function clearAll(message) {
        stats.setCards([]);
        bucketTable.updateData([]);
        jobTree = [];
        expandedJobs.clear();
        jobTreeTable.updateData([]);
        breakdownTable.updateData([]);
        table.updateData([]);
        renderNotice(message || '');
    }

    async function loadReport() {
        try {
            table.setLoading(true);
            breakdownTable.setLoading(true);
            bucketTable.setLoading(true);
            jobTreeTable.setLoading(true);

            const data = await getOvertimeCostReport(currentFilters);

            if (data === null) {
                report = null;
                clearAll(`
                    <div class="alert alert-danger d-flex align-items-center" role="alert">
                        <i class="fas fa-lock me-2"></i>
                        <div>Bu raporu görüntüleme yetkiniz yok. Mesai maliyet raporu için <strong>maliyet görüntüleme</strong> yetkisi gerekir.</div>
                    </div>`);
                return;
            }

            report = data;
            renderNotice(buildDataQualityNotice(data));
            renderStats(data);
            renderBuckets(data);
            jobTree = buildJobTree(data);
            // Filtered views are small enough to read at a glance; a broad
            // period would be a wall of sub-jobs, so start collapsed there.
            expandedJobs.clear();
            if (jobTree.length <= 5) jobTree.forEach(p => expandedJobs.add(p.key));
            renderJobTree();
            renderBreakdown(data);
            renderRequests(data);
        } catch (error) {
            report = null;
            clearAll('');
            showNotification('Rapor yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
        } finally {
            table.setLoading(false);
            breakdownTable.setLoading(false);
            bucketTable.setLoading(false);
            jobTreeTable.setLoading(false);
        }
    }

    await loadReport();
});
