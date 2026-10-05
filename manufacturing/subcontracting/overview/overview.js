import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { fetchSubcontractorMonthlyReport } from '../../../../apis/subcontracting/subcontractors.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { escapeHtml } from '../../../../utils/text.js';

/*
 * Taşeron Genel Bakış — monthly work per subcontractor × fiyat kalemi × job.
 *
 * The backend sends flat facts (one per subcontractor/month/kalem/job/kind)
 * and a backlog (remaining work per subcontractor/kalem/job, as of today).
 * This page folds them into a tree in whichever order the grouping switch
 * asks for; the month level is always last so each month's job orders sit
 * directly under it. Backlog columns only fill on the levels above the
 * months, since remaining work belongs to no month.
 */

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const ADJUSTMENT_KALEM = '__adjustment__';
// Painting is priced per kg of the same steel the welders already counted, so
// its kg never adds to welding kg: wherever both meet, they show apart.
const PAINT_KALEM = 'boya';

const GROUPINGS = [
    { id: 'sub-month', label: 'Taşeron › Ay', levels: ['sub', 'month'] },
    { id: 'sub-kalem-month', label: 'Taşeron › Kalem › Ay', levels: ['sub', 'kalem', 'month'] },
    { id: 'kalem-sub-month', label: 'Kalem › Taşeron › Ay', levels: ['kalem', 'sub', 'month'] }
];
const GROUPING_STORAGE_KEY = 'subcontracting-overview-grouping';

const STATEMENT_STATUS = {
    draft: { label: 'Taslak', cls: 'status-grey' },
    submitted: { label: 'Onay Bekliyor', cls: 'status-blue' },
    approved: { label: 'Onaylandı', cls: 'status-green' },
    paid: { label: 'Ödendi', cls: 'status-purple' },
    rejected: { label: 'Reddedildi', cls: 'status-red' }
};

const JOB_STATUS = {
    draft: 'Taslak',
    active: 'Aktif',
    on_hold: 'Beklemede',
    completed: 'Tamamlandı',
    cancelled: 'İptal'
};

const KIND_LABEL = { billed: 'Faturalanan', pending: 'Bekleyen' };

const CURRENCY_SYMBOL = { TRY: '₺', EUR: '€', USD: '$', GBP: '£' };

const CHILD_NOUN = { sub: 'taşeron', kalem: 'kalem', month: 'ay' };

const COLUMN_COUNT = 12;

// Component instances
let headerComponent = null;
let overviewStats = null;
let overviewFilters = null;

// State
let report = null;           // raw API response
let lookup = null;           // id -> subcontractor / kalem / statement maps
let tree = null;             // root node for the current grouping
let grouping = loadGrouping();
const expanded = new Set();  // node ids; stable across reloads of the same grouping
let isLoading = false;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    initHeaderComponent();
    initStatisticsCards();
    initializeFiltersComponent();
    renderReportShell();

    await loadReport();
});

// ---------------------------------------------------------------------------
// Header, cards, filters
// ---------------------------------------------------------------------------

function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Taşeron Genel Bakış',
        subtitle: 'Taşeron, ay ve fiyat kalemi bazında yapılan iş, hakediş ve kalan iş',
        icon: 'chart-line',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/',
        onRefreshClick: async () => {
            await loadReport();
        }
    });
}

function initStatisticsCards() {
    overviewStats = new StatisticsCards('overview-statistics', {
        cards: [
            { title: 'Taşeron', value: '0', icon: 'fas fa-building', color: 'primary', id: 'overview-total-subcontractors' },
            { title: 'Yapılan İş', value: '0', icon: 'fas fa-weight-hanging', color: 'info', id: 'overview-done-kg' },
            { title: 'Faturalanan İş', value: '0', icon: 'fas fa-file-invoice', color: 'success', id: 'overview-billed' },
            { title: 'Bekleyen Hakediş', value: '0', icon: 'fas fa-hourglass-half', color: 'danger', id: 'overview-pending' },
            { title: 'Kalan İş', value: '0', icon: 'fas fa-list-check', color: 'secondary', id: 'overview-remaining' },
            { title: 'Ort. Toplam Çalışan', value: '0', icon: 'fas fa-users', color: 'dark', id: 'overview-avg-employees' }
        ],
        compact: true,
        animation: true,
        itemsPerRow: 6
    });
}

function initializeFiltersComponent() {
    overviewFilters = new FiltersComponent('filters-placeholder', {
        title: 'Genel Bakış Filtreleri',
        onApply: () => {
            loadReport();
        },
        onClear: () => {
            loadReport();
        }
    });

    const monthOptions = [{ value: '', label: 'Tümü' }, ...buildMonthOptions()];

    overviewFilters.addDropdownFilter({
        id: 'start-month-filter',
        label: 'Başlangıç Ayı',
        options: monthOptions,
        placeholder: 'Tümü',
        colSize: 2
    });

    overviewFilters.addDropdownFilter({
        id: 'end-month-filter',
        label: 'Bitiş Ayı',
        options: monthOptions,
        placeholder: 'Tümü',
        colSize: 2
    });

    overviewFilters.addTextFilter({
        id: 'name-filter',
        label: 'Taşeron',
        placeholder: 'Taşeron adı / kısa ad / yetkili...',
        colSize: 2
    });

    overviewFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Taşeron Durumu',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    overviewFilters.addDropdownFilter({
        id: 'job-status-filter',
        label: 'İş Emri Durumu',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'active', label: 'Aktif' },
            { value: 'completed', label: 'Tamamlandı' },
            { value: 'active,completed', label: 'Aktif + Tamamlandı' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
}

/** Newest first, from January of last year up to this month. */
function buildMonthOptions() {
    const now = new Date();
    const options = [];
    for (let back = 0; ; back += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
        if (d.getFullYear() < now.getFullYear() - 1) break;
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        options.push({ value, label: periodLabel(value) });
    }
    return options;
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------

function renderReportShell() {
    const container = document.getElementById('overview-report');
    const groupButtons = GROUPINGS.map(g => `
        <button type="button" class="btn btn-outline-secondary ${g.id === grouping ? 'active' : ''}"
                data-grouping="${g.id}">${escapeHtml(g.label)}</button>
    `).join('');

    container.innerHTML = `
        <div class="dashboard-card ov-card">
            <div class="card-header">
                <h5 class="card-title">
                    <i class="fas fa-chart-line me-2 text-primary"></i>Taşeron Aylık İş Raporu
                    <span class="ov-period-label" id="ov-period-label"></span>
                </h5>
                <div class="card-actions ov-actions">
                    <span class="ov-actions-label">Gruplama</span>
                    <div class="btn-group btn-group-sm" role="group" aria-label="Gruplama" id="ov-grouping">
                        ${groupButtons}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="ov-expand-all">
                        <i class="fas fa-angles-down me-1"></i>Tümünü Aç
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="ov-collapse-all">
                        <i class="fas fa-angles-up me-1"></i>Tümünü Kapat
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="ov-export">
                        <i class="fas fa-download me-1"></i>Dışa Aktar
                    </button>
                </div>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table ov-table mb-0">
                        <thead>
                            <tr>
                                <th class="ov-col-label">Taşeron / Kalem / Ay / İş Emri</th>
                                <th class="num" title="Taşeron satırında dönemdeki hakedişlerin ortalaması; ay satırında o ayın hakedişine girilen sayı">Çalışan</th>
                                <th title="İş emri satırında dönemdeki ilerleme (önceki → sonraki); üst satırlarda bugünkü sözleşme tamamlanma oranı">İlerleme</th>
                                <th class="num">Yapılan İş</th>
                                <th class="num">Ort. Birim Fiyat</th>
                                <th class="num" title="Onaylanmış / ödenmiş hakedişlerdeki iş tutarı">Faturalanan</th>
                                <th class="num" title="Henüz onaylı hakedişe girmemiş ilerlemenin tutarı">Bekleyen</th>
                                <th class="num" title="Onaylanmış / ödenmiş hakedişlerdeki ek ödeme ve kesintiler">Ek Ödeme / Kesinti</th>
                                <th class="num">Dönem Toplamı</th>
                                <th class="num" title="Kişi başına aylık ödenen. Ay satırında o ayın toplamı ÷ o ayın çalışanı; taşeron satırında seçili ayların aylık ortalaması (Σ tutar ÷ Σ çalışan), çalışan sayısı girilmemiş aylar hariç">Kişi Başı</th>
                                <th class="num ov-col-backlog" title="Bugün itibarıyla, dönemden bağımsız">Kalan İş</th>
                                <th class="num ov-col-backlog" title="Bugün itibarıyla, dönemden bağımsız">Kalan Tutar</th>
                            </tr>
                        </thead>
                        <tbody id="ov-tbody"></tbody>
                        <tfoot id="ov-tfoot"></tfoot>
                    </table>
                </div>
            </div>
            <div class="card-footer ov-legend">
                <span><strong>Faturalanan:</strong> onaylanmış/ödenmiş hakediş satırları, hakedişin ayında.</span>
                <span><strong>Bekleyen:</strong> henüz faturalanmamış ilerleme; açık hakedişin ayına, yoksa bu aya yazılır.</span>
                <span><strong>Kalan İş:</strong> sözleşmede kalan iş, bugün itibarıyla (dönem filtresinden bağımsız).</span>
                <span><strong>Kişi Başı:</strong> kişi başına aylık ödenen; taşeron satırında seçili ayların aylık ortalaması, çalışan sayısı girilmemiş aylar hariç.</span>
            </div>
        </div>
    `;

    container.querySelector('#ov-grouping').addEventListener('click', (e) => {
        const button = e.target.closest('[data-grouping]');
        if (!button || button.dataset.grouping === grouping) return;
        grouping = button.dataset.grouping;
        saveGrouping(grouping);
        container.querySelectorAll('#ov-grouping [data-grouping]').forEach(b => {
            b.classList.toggle('active', b.dataset.grouping === grouping);
        });
        rebuildTree();
    });

    container.querySelector('#ov-expand-all').addEventListener('click', () => {
        if (!tree) return;
        walk(tree, node => {
            if (node !== tree && hasRows(node)) expanded.add(node.id);
        });
        renderTable();
    });

    container.querySelector('#ov-collapse-all').addEventListener('click', () => {
        expanded.clear();
        renderTable();
    });

    container.querySelector('#ov-export').addEventListener('click', () => {
        exportToExcel();
    });

    container.querySelector('#ov-tbody').addEventListener('click', (e) => {
        if (e.target.closest('a')) return;  // statement links open on their own
        const row = e.target.closest('tr[data-node]');
        if (!row) return;
        const id = row.dataset.node;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        renderTable();
    });

    setBodyMessage('<i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...');
}

function setBodyMessage(html) {
    const tbody = document.getElementById('ov-tbody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${COLUMN_COUNT}" class="text-center text-muted py-5">${html}</td></tr>`;
    }
    const tfoot = document.getElementById('ov-tfoot');
    if (tfoot) tfoot.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadReport() {
    if (isLoading) return;

    const values = overviewFilters ? overviewFilters.getFilterValues() : {};
    const filters = {
        start: values['start-month-filter'] || '',
        end: values['end-month-filter'] || '',
        search: values['name-filter'] || '',
        is_active: values['is-active-filter'] || '',
        job_status: values['job-status-filter'] || ''
    };
    if (filters.start && filters.end && filters.start > filters.end) {
        showNotification('Başlangıç ayı bitiş ayından sonra olamaz.', 'error');
        return;
    }

    isLoading = true;
    setBodyMessage('<i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...');
    try {
        report = await fetchSubcontractorMonthlyReport(filters);
        lookup = buildLookup(report);
        updatePeriodLabel();
        rebuildTree();
    } catch (error) {
        console.error('Error loading subcontractor monthly report:', error);
        showNotification(error.message || 'Taşeron genel bakış verileri yüklenirken hata oluştu', 'error');
        report = null;
        lookup = null;
        tree = null;
        setBodyMessage('<i class="fas fa-triangle-exclamation me-2"></i>Veriler yüklenemedi');
        updateStatisticsCards();
    } finally {
        isLoading = false;
    }
}

function buildLookup(data) {
    // Dönem toplamı per subcontractor-month, whatever the grouping — the
    // per-person figure divides it by that month's headcount.
    const monthTotals = new Map();
    data.facts.forEach(f => {
        const key = `${f.subcontractor_id}|${f.period}`;
        monthTotals.set(key, (monthTotals.get(key) || 0) + num(f.amount));
    });
    return {
        subs: new Map(data.subcontractors.map(s => [String(s.id), s])),
        kalems: new Map(data.kalems.map(k => [k.key, k.label])),
        statements: new Map(data.statements.map(s => [`${s.subcontractor_id}|${s.period}`, s])),
        monthTotals
    };
}

function updatePeriodLabel() {
    const el = document.getElementById('ov-period-label');
    if (!el || !report) return;
    const { start, end } = report.period;
    let text = 'Tüm dönemler';
    if (start && end) text = start === end ? periodLabel(start) : `${periodLabel(start)} – ${periodLabel(end)}`;
    else if (start) text = `${periodLabel(start)} ve sonrası`;
    else if (end) text = `${periodLabel(end)} ve öncesi`;
    el.textContent = text;
}

function rebuildTree() {
    if (!report) return;
    const levels = GROUPINGS.find(g => g.id === grouping).levels;
    tree = buildTree(report, levels);
    renderTable();
    updateStatisticsCards();
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

function newNode(id, level, value, parent) {
    return {
        id,
        level,
        value,
        parent,
        depth: parent ? parent.depth + 1 : -1,
        children: new Map(),
        sorted: [],
        leaves: [],
        agg: { kg: 0, paintKg: 0, paintAmount: 0, billed: 0, pending: 0, adjustment: 0, currencies: new Set() },
        backlog: null
    };
}

function levelValue(level, row) {
    if (level === 'sub') return String(row.subcontractor_id);
    if (level === 'kalem') return row.kalem_key;
    return row.period;
}

function buildTree(data, levels) {
    const root = newNode('root', 'root', null, null);

    const descend = (node, level, row) => {
        const value = levelValue(level, row);
        if (!node.children.has(value)) {
            node.children.set(value, newNode(`${node.id}/${level}:${value}`, level, value, node));
        }
        return node.children.get(value);
    };

    data.facts.forEach(fact => {
        let node = root;
        addFact(node, fact);
        levels.forEach(level => {
            node = descend(node, level, fact);
            addFact(node, fact);
        });
        node.leaves.push(fact);
    });

    // Remaining work belongs to no month, so it stops one level short. A
    // finished contract only feeds rows that the period already opened —
    // on its own it would add an empty row for a subcontractor who did
    // nothing in the period and has nothing left.
    data.backlog.forEach(row => {
        const open = num(row.remaining_weight_kg) > 0;
        let node = root;
        addBacklog(node, row);
        for (const level of levels) {
            if (level === 'month') break;
            if (!open && !node.children.has(levelValue(level, row))) break;
            node = descend(node, level, row);
            addBacklog(node, row);
        }
    });

    sortTree(root);
    return root;
}

function addFact(node, fact) {
    const amount = num(fact.amount);
    const kg = num(fact.weight_kg);
    node.agg.kg += kg;
    if (fact.kalem_key === PAINT_KALEM) {
        node.agg.paintKg += kg;
        node.agg.paintAmount += amount;
    }
    if (fact.kind === 'billed') node.agg.billed += amount;
    else if (fact.kind === 'pending') node.agg.pending += amount;
    else node.agg.adjustment += amount;
    node.agg.currencies.add(fact.currency || 'TRY');
}

function addBacklog(node, row) {
    if (!node.backlog) {
        node.backlog = { allocated: 0, done: 0, remainingKg: 0, remainingAmount: 0, contract: 0, currencies: new Set() };
    }
    const b = node.backlog;
    b.allocated += num(row.allocated_weight_kg);
    b.done += num(row.done_weight_kg);
    b.remainingKg += num(row.remaining_weight_kg);
    b.remainingAmount += num(row.remaining_amount);
    b.contract += num(row.contract_amount);
    b.currencies.add(row.currency || 'TRY');
}

function sortTree(node) {
    node.sorted = [...node.children.values()].sort(compareNodes);
    node.sorted.forEach(sortTree);
    node.leaves.sort(compareLeaves);
}

function nodeTotal(node) {
    return node.agg.billed + node.agg.pending + node.agg.adjustment;
}

function compareNodes(a, b) {
    if (a.level === 'month') return a.value.localeCompare(b.value);  // 'YYYY-MM' is chronological
    // Welding kalems first, then paint (its kg is not comparable), then money-only adjustments.
    const tail = n => (n.level !== 'kalem' ? 0 : n.value === ADJUSTMENT_KALEM ? 2 : n.value === PAINT_KALEM ? 1 : 0);
    if (tail(a) !== tail(b)) return tail(a) - tail(b);
    // Top-level subcontractors read as a directory (A-Z, as before); anything
    // else is a ranking — who did the most ÇELİK, which kalem is biggest.
    if (a.level === 'sub' && a.depth === 0) return trCompare(subName(a.value), subName(b.value));
    return (b.agg.kg - a.agg.kg)
        || (nodeTotal(b) - nodeTotal(a))
        || ((b.backlog?.remainingKg || 0) - (a.backlog?.remainingKg || 0))
        || trCompare(nodeName(a), nodeName(b));
}

const KIND_ORDER = { billed: 0, pending: 1, adjustment: 2 };

function compareLeaves(a, b) {
    return String(a.job_no).localeCompare(String(b.job_no), 'tr', { numeric: true })
        || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
        || trCompare(kalemName(a.kalem_key), kalemName(b.kalem_key));
}

function walk(node, fn) {
    fn(node);
    node.sorted.forEach(child => walk(child, fn));
}

function hasRows(node) {
    return node.sorted.length > 0 || node.leaves.length > 0;
}

function ancestorLevels(node) {
    const levels = new Set();
    for (let n = node; n && n.level !== 'root'; n = n.parent) levels.add(n.level);
    return levels;
}

function ancestorValue(node, level) {
    for (let n = node; n && n.level !== 'root'; n = n.parent) {
        if (n.level === level) return n.value;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderTable() {
    const tbody = document.getElementById('ov-tbody');
    const tfoot = document.getElementById('ov-tfoot');
    if (!tbody || !tree) return;

    if (!tree.sorted.length) {
        setBodyMessage('<i class="fas fa-chart-line me-2"></i>Seçilen dönem ve filtrelerde veri bulunamadı');
        return;
    }

    const rows = [];
    const emit = (node) => {
        node.sorted.forEach(child => {
            rows.push(renderGroupRow(child));
            if (expanded.has(child.id)) {
                emit(child);
                child.leaves.forEach(fact => rows.push(renderLeafRow(fact, child)));
            }
        });
    };
    emit(tree);
    tbody.innerHTML = rows.join('');
    tfoot.innerHTML = renderTotalRow(tree);
}

function indent(depth) {
    return `style="padding-left: ${0.75 + depth * 1.4}rem"`;
}

function renderGroupRow(node) {
    const open = expanded.has(node.id);
    const expandable = hasRows(node);
    const caret = expandable
        ? '<i class="fas fa-chevron-right ov-caret"></i>'
        : '<span class="ov-caret"></span>';
    const isMonth = node.level === 'month';
    const currency = singleCurrency(node.agg.currencies);

    return `
        <tr class="ov-row ov-group ov-depth-${Math.min(node.depth, 2)} ${open ? 'ov-open' : ''} ${expandable ? 'ov-expandable' : ''}"
            ${expandable ? `data-node="${escapeHtml(node.id)}"` : ''}>
            <td class="ov-col-label" ${indent(node.depth)}>
                <div class="ov-label">${caret}<div class="ov-label-body">${groupLabel(node)}</div></div>
            </td>
            <td class="num">${employeeCell(node)}</td>
            <td>${isMonth ? '' : backlogProgressCell(node.backlog)}</td>
            <td class="num">${workKgCell(node.agg)}</td>
            <td class="num">${workUnitPriceCell(node.agg, currency)}</td>
            <td class="num">${moneyCell(node.agg.billed, currency)}</td>
            <td class="num">${moneyCell(node.agg.pending, currency, 'ov-pending')}</td>
            <td class="num">${moneyCell(node.agg.adjustment, currency, null, true)}</td>
            <td class="num fw-semibold">${moneyCell(nodeTotal(node), currency)}</td>
            <td class="num">${perPersonCell(node, currency)}</td>
            <td class="num ov-col-backlog">${isMonth ? '' : kgCell(node.backlog?.remainingKg, true)}</td>
            <td class="num ov-col-backlog">${isMonth ? '' : moneyCell(node.backlog?.remainingAmount, singleCurrency(node.backlog?.currencies))}</td>
        </tr>
    `;
}

function groupLabel(node) {
    const count = childCountChip(node);

    if (node.level === 'sub') {
        const sub = lookup.subs.get(node.value) || {};
        const display = sub.short_name || sub.name || '-';
        const full = sub.short_name && sub.name && sub.short_name !== sub.name
            ? `<div class="ov-sub">${escapeHtml(sub.name)}</div>` : '';
        const passive = sub.is_active === false
            ? ' <span class="status-badge status-grey ov-badge">Pasif</span>' : '';
        return `<span class="ov-name"><i class="fas fa-building ov-icon"></i>${escapeHtml(display)}</span>${passive}${count}${full}`;
    }

    if (node.level === 'kalem') {
        const isAdj = node.value === ADJUSTMENT_KALEM;
        const icon = isAdj ? 'fa-scale-balanced' : 'fa-layer-group';
        return `<span class="ov-name"><i class="fas ${icon} ov-icon"></i>${escapeHtml(kalemName(node.value))}</span>${count}`;
    }

    // Month: the subcontractor's hakediş for that month, when there is one.
    const subId = ancestorValue(node, 'sub');
    const statement = subId ? lookup.statements.get(`${subId}|${node.value}`) : null;
    let badge = '';
    if (statement) {
        const meta = STATEMENT_STATUS[statement.status] || { label: statement.status, cls: 'status-grey' };
        badge = ` <a class="ov-statement-link" href="/manufacturing/subcontracting/statements/?statement=${statement.id}"
                     target="_blank" rel="noopener" title="Hakedişi aç">
                    <span class="status-badge ${meta.cls} ov-badge">${escapeHtml(meta.label)}</span>
                    <i class="fas fa-arrow-up-right-from-square"></i>
                  </a>`;
    } else if (subId && node.agg.pending > 0) {
        badge = ' <span class="status-badge status-orange ov-badge" title="Bu ay için hakediş henüz oluşturulmadı">Hakediş yok</span>';
    }
    return `<span class="ov-name"><i class="far fa-calendar ov-icon"></i>${escapeHtml(periodLabel(node.value))}</span>${badge}${count}`;
}

function childCountChip(node) {
    if (node.sorted.length) {
        return ` <span class="ov-chip">${node.sorted.length} ${CHILD_NOUN[node.sorted[0].level]}</span>`;
    }
    if (node.leaves.length) {
        const jobs = new Set(node.leaves.map(f => f.job_no)).size;
        return ` <span class="ov-chip">${jobs} iş emri</span>`;
    }
    return '';
}

/**
 * Where a headcount applies: 'sub' for a top-level subcontractor row, 'month'
 * for its months, else null. Headcount is per subcontractor per month; under
 * a kalem it would read as "people on ÇELİK", which nobody records.
 */
function headcountScope(node) {
    if (node.level === 'sub' && node.depth === 0) return 'sub';
    if (node.level === 'month' && node.parent.level === 'sub' && node.parent.depth === 0) return 'month';
    return null;
}

function employeeCell(node) {
    const scope = headcountScope(node);
    if (scope === 'sub') {
        const sub = lookup.subs.get(node.value) || {};
        if (sub.avg_employee_count === null || sub.avg_employee_count === undefined) {
            return '<span class="ov-muted" title="Dönemdeki hakedişlerde çalışan sayısı girilmemiş">—</span>';
        }
        return `<span title="${sub.employee_count_months} hakediş ortalaması">${formatNumber(sub.avg_employee_count, 1)}</span>`;
    }
    if (scope === 'month') {
        const statement = lookup.statements.get(`${node.parent.value}|${node.value}`);
        const count = statement?.employee_count;
        return count === null || count === undefined ? '<span class="ov-muted">—</span>' : formatNumber(count, 0);
    }
    return '';
}

/**
 * A subcontractor's average headcount over the selected months: the backend's
 * avg_employee_count rule (rejected statements never happened) but unrounded,
 * so the per-person division is not skewed by the 1-decimal display.
 */
function subHeadcount(subId) {
    const counts = report.statements
        .filter(st => String(st.subcontractor_id) === subId && st.status !== 'rejected'
            && st.employee_count !== null && st.employee_count !== undefined)
        .map(st => num(st.employee_count));
    return counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null;
}

/** Sum of the shown subcontractors' average headcounts — "Ort. Toplam Çalışan". */
function totalHeadcount() {
    return report.subcontractors.reduce((sum, s) => sum + (subHeadcount(String(s.id)) || 0), 0);
}

/**
 * Monthly average paid per person over the selected months, for a set of
 * subcontractor ids: Σ month total ÷ Σ month headcount. With a headcount on
 * every month that is exactly dönem toplamı ÷ ort. çalışan ÷ ay. A month paid
 * without a headcount (the February 2026 catch-up hakedişleri) has no one to
 * divide by, so it is left out of both sides and counted in `skipped`.
 */
function monthlyPerPerson(subIds) {
    const pp = { total: 0, personMonths: 0, months: 0, skipped: 0 };
    lookup.monthTotals.forEach((amount, key) => {
        if (!amount || !subIds.has(key.split('|')[0])) return;
        const statement = lookup.statements.get(key);
        const count = statement && statement.status !== 'rejected' ? num(statement.employee_count) : 0;
        if (count > 0) {
            pp.total += amount;
            pp.personMonths += count;
            pp.months += 1;
        } else {
            pp.skipped += 1;
        }
    });
    pp.value = pp.personMonths ? pp.total / pp.personMonths : null;
    return pp;
}

function perPersonCell(node, currency) {
    const scope = headcountScope(node);
    if (scope === 'sub') {
        return monthlyPerPersonHtml(monthlyPerPerson(new Set([node.value])), currency, true);
    }
    if (scope === 'month') {
        const count = num(lookup.statements.get(`${node.parent.value}|${node.value}`)?.employee_count);
        const total = nodeTotal(node);
        if (!(count > 0) || !total) return '<span class="ov-muted" title="Çalışan sayısı girilmemiş">—</span>';
        const symbol = currencySymbol(currency);
        const title = `${formatNumber(total, 2)} ${symbol} ÷ ${formatNumber(count, 0)} çalışan`;
        return `<span title="${escapeHtml(title)}">${formatNumber(total / count, 2)} ${symbol}</span>`;
    }
    return '';
}

/** `showMonths` is off for Genel Toplam, where months would count subcontractor-months. */
function monthlyPerPersonHtml(pp, currency, showMonths) {
    const skippedText = pp.skipped ? `${pp.skipped} ay çalışan sayısı girilmediği için hariç` : '';
    if (pp.value === null) {
        return `<span class="ov-muted" title="${escapeHtml(skippedText || 'Çalışan sayısı girilmemiş')}">—</span>`;
    }
    const symbol = currencySymbol(currency);
    let title = `Aylık ortalama: ${formatNumber(pp.total, 2)} ${symbol} ÷ ${formatNumber(pp.personMonths, 0)} kişi-ay`;
    if (skippedText) title += ` — ${skippedText}`;
    const parts = ['aylık ort.'];
    if (showMonths) parts.push(`${pp.months} ay`);
    if (pp.skipped) parts.push(`<span class="ov-pending">${pp.skipped} ay hariç</span>`);
    return `<span title="${escapeHtml(title)}">${formatNumber(pp.value, 2)} ${symbol}</span>`
        + `<div class="ov-sub">${parts.join(' · ')}</div>`;
}

function backlogProgressCell(backlog) {
    if (!backlog || !backlog.allocated) return '';
    const pct = Math.max(0, Math.min(100, (backlog.done / backlog.allocated) * 100));
    const title = `Sözleşme: ${formatNumber(backlog.allocated, 0)} kg · Yapılan: ${formatNumber(backlog.done, 0)} kg`;
    return `
        <div class="ov-progress-wrap" title="${escapeHtml(title)}">
            <div class="ov-progress"><span style="width: ${pct.toFixed(1)}%"></span></div>
            <span class="ov-progress-text">%${formatNumber(pct, 0)}</span>
        </div>
    `;
}

function renderLeafRow(fact, parent) {
    const depth = parent.depth + 1;
    const ancestors = ancestorLevels(parent);
    const isAdj = fact.kind === 'adjustment';
    const amount = num(fact.amount);
    const currency = fact.currency || 'TRY';

    const kalemPill = !ancestors.has('kalem') && !isAdj
        ? ` <span class="ov-kalem-pill">${escapeHtml(kalemName(fact.kalem_key))}</span>` : '';

    let kindBadge = '';
    if (fact.kind === 'pending') {
        kindBadge = ' <span class="status-badge status-orange ov-badge">Bekleyen</span>';
    } else if (isAdj) {
        kindBadge = fact.adjustment_type === 'deduction'
            ? ' <span class="status-badge status-red ov-badge">Kesinti</span>'
            : ' <span class="status-badge status-green ov-badge">Ek Ödeme</span>';
    }

    const meta = [fact.customer_name, JOB_STATUS[fact.job_status]].filter(Boolean).map(escapeHtml).join(' · ');
    const reason = isAdj && fact.reason ? `<div class="ov-reason">${escapeHtml(fact.reason)}</div>` : '';

    return `
        <tr class="ov-row ov-leaf ${isAdj ? 'ov-leaf-adjustment' : ''}">
            <td class="ov-col-label" ${indent(depth)}>
                <div class="ov-label"><span class="ov-caret"></span><div class="ov-label-body">
                    <span class="ov-job">${escapeHtml(fact.job_no)}</span>
                    <span class="ov-job-title">${escapeHtml(fact.job_title || '')}</span>${kalemPill}${kindBadge}
                    ${meta ? `<div class="ov-sub">${meta}</div>` : ''}
                    ${reason}
                </div></div>
            </td>
            <td></td>
            <td>${isAdj ? '' : leafProgressCell(fact)}</td>
            <td class="num">${isAdj ? '' : kgCell(num(fact.weight_kg))}</td>
            <td class="num">${isAdj ? '' : unitPriceCell(amount, num(fact.weight_kg), currency)}</td>
            <td class="num">${fact.kind === 'billed' ? moneyCell(amount, currency) : ''}</td>
            <td class="num">${fact.kind === 'pending' ? moneyCell(amount, currency, 'ov-pending') : ''}</td>
            <td class="num">${isAdj ? moneyCell(amount, currency, null, true) : ''}</td>
            <td class="num">${moneyCell(amount, currency)}</td>
            <td></td>
            <td class="ov-col-backlog"></td>
            <td class="ov-col-backlog"></td>
        </tr>
    `;
}

function leafProgressCell(fact) {
    if (fact.previous_progress === null || fact.current_progress === null) return '';
    const title = `Sözleşme: ${formatNumber(num(fact.allocated_weight_kg), 0)} kg`;
    return `<span class="ov-progress-delta" title="${escapeHtml(title)}">%${formatNumber(num(fact.previous_progress), 1)}
            <i class="fas fa-arrow-right"></i> %${formatNumber(num(fact.current_progress), 1)}</span>`;
}

function renderTotalRow(root) {
    const currency = singleCurrency(root.agg.currencies);
    return `
        <tr class="ov-total-row">
            <td class="ov-col-label">Genel Toplam</td>
            <td class="num">${totalHeadcount() ? formatNumber(totalHeadcount(), 1) : ''}</td>
            <td>${backlogProgressCell(root.backlog)}</td>
            <td class="num">${workKgCell(root.agg)}</td>
            <td class="num">${workUnitPriceCell(root.agg, currency)}</td>
            <td class="num">${moneyCell(root.agg.billed, currency)}</td>
            <td class="num">${moneyCell(root.agg.pending, currency)}</td>
            <td class="num">${moneyCell(root.agg.adjustment, currency, null, true)}</td>
            <td class="num">${moneyCell(nodeTotal(root), currency)}</td>
            <td class="num">${monthlyPerPersonHtml(
                monthlyPerPerson(new Set(report.subcontractors.map(s => String(s.id)))), currency, false)}</td>
            <td class="num ov-col-backlog">${kgCell(root.backlog?.remainingKg, true)}</td>
            <td class="num ov-col-backlog">${moneyCell(root.backlog?.remainingAmount, singleCurrency(root.backlog?.currencies))}</td>
        </tr>
    `;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function kgCell(kg, allowEmpty = false) {
    if (kg === null || kg === undefined) return allowEmpty ? '' : '<span class="ov-muted">—</span>';
    if (!kg) return '<span class="ov-muted">—</span>';
    return `${formatNumber(kg, 0)} <span class="ov-unit">kg</span>`;
}

/** Welding kg, with painted kg on a line of its own when the node has both. */
function workKgCell(agg) {
    const weldKg = agg.kg - agg.paintKg;
    if (!weldKg || !agg.paintKg) return kgCell(agg.kg);
    return `${kgCell(weldKg)}<div class="ov-sub">+ ${formatNumber(agg.paintKg, 0)} kg boya</div>`;
}

/** Average price per kg — of the welding alone when the node mixes in paint. */
function workUnitPriceCell(agg, currency) {
    const work = agg.billed + agg.pending;
    const weldKg = agg.kg - agg.paintKg;
    if (!weldKg || !agg.paintKg) return unitPriceCell(work, agg.kg, currency);
    return `${unitPriceCell(work - agg.paintAmount, weldKg, currency)}<div class="ov-sub">boya hariç</div>`;
}

function unitPriceCell(amount, kg, currency) {
    if (!kg) return '<span class="ov-muted">—</span>';
    return `${formatNumber(amount / kg, 2)} <span class="ov-unit">${currencySymbol(currency)}/kg</span>`;
}

function moneyCell(value, currency, extraClass = null, signed = false) {
    if (value === null || value === undefined) return '';
    if (!value) return '<span class="ov-muted">—</span>';
    const cls = [extraClass, signed ? (value < 0 ? 'ov-neg' : 'ov-pos') : null].filter(Boolean).join(' ');
    const sign = signed && value > 0 ? '+' : '';
    const mixed = currency === null
        ? ' <i class="fas fa-circle-exclamation text-danger" title="Farklı para birimleri toplandı"></i>' : '';
    return `<span class="${cls}">${sign}${formatNumber(value, 2)} ${currencySymbol(currency)}</span>${mixed}`;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function updateStatisticsCards() {
    if (!overviewStats) return;
    if (!tree) {
        overviewStats.updateValues({ 0: '0', 1: '0', 2: '0', 3: '0', 4: '0', 5: '0' });
        return;
    }
    const currency = singleCurrency(tree.agg.currencies);
    // Same subcontractors the table shows: work in the period, or work left.
    const shown = new Set([
        ...report.facts.map(f => String(f.subcontractor_id)),
        ...report.backlog.filter(b => num(b.remaining_weight_kg) > 0).map(b => String(b.subcontractor_id))
    ]);
    const avgEmployees = [...shown].reduce((sum, id) => sum + (subHeadcount(id) || 0), 0);

    const weldKg = tree.agg.kg - tree.agg.paintKg;
    const mixed = weldKg > 0 && tree.agg.paintKg > 0;
    overviewStats.options.cards[1].title = mixed ? 'Yapılan İş (Boya Hariç)' : 'Yapılan İş';
    overviewStats.updateValues({
        0: String(shown.size),
        1: `${formatNumber(mixed ? weldKg : tree.agg.kg, 0)} kg`,
        2: formatMoneyText(tree.agg.billed, currency),
        3: formatMoneyText(tree.agg.pending, currency),
        4: formatMoneyText(tree.backlog?.remainingAmount || 0, singleCurrency(tree.backlog?.currencies)),
        5: formatNumber(avgEmployees, 1)
    });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function exportToExcel() {
    if (!report || !lookup) {
        showNotification('Dışa aktarılacak veri yok', 'info');
        return;
    }
    try {
        const XLSX = await loadXlsx();

        const facts = [...report.facts].sort((a, b) =>
            trCompare(subName(String(a.subcontractor_id)), subName(String(b.subcontractor_id)))
            || a.period.localeCompare(b.period)
            || trCompare(kalemName(a.kalem_key), kalemName(b.kalem_key))
            || compareLeaves(a, b));

        const workRows = [[
            'Taşeron', 'Ay', 'Fiyat Kalemi', 'İş Emri', 'İş Adı', 'Müşteri', 'İş Emri Durumu',
            'Tür', 'Hakediş Durumu', 'Önceki İlerleme (%)', 'Sonraki İlerleme (%)', 'Sözleşme (kg)',
            'Yapılan İş (kg)', 'Birim Fiyat', 'Tutar', 'Para Birimi', 'Açıklama'
        ]];
        facts.forEach(f => {
            const isAdj = f.kind === 'adjustment';
            workRows.push([
                subName(String(f.subcontractor_id)),
                f.period,
                kalemName(f.kalem_key),
                f.job_no,
                f.job_title || '',
                f.customer_name || '',
                JOB_STATUS[f.job_status] || '',
                isAdj ? (f.adjustment_type === 'deduction' ? 'Kesinti' : 'Ek Ödeme') : KIND_LABEL[f.kind],
                STATEMENT_STATUS[f.statement_status]?.label || '',
                isAdj || f.previous_progress === null ? '' : num(f.previous_progress),
                isAdj || f.current_progress === null ? '' : num(f.current_progress),
                isAdj ? '' : num(f.allocated_weight_kg),
                isAdj ? '' : num(f.weight_kg),
                f.price_per_kg === null || f.price_per_kg === undefined ? '' : num(f.price_per_kg),
                num(f.amount),
                f.currency || 'TRY',
                isAdj ? (f.reason || '') : ''
            ]);
        });

        const backlogRows = [[
            'Taşeron', 'Fiyat Kalemi', 'İş Emri', 'İş Adı', 'Müşteri', 'İş Emri Durumu',
            'Sözleşme (kg)', 'Yapılan (kg)', 'Kalan (kg)', 'Sözleşme Tutarı', 'Kalan Tutar', 'Para Birimi'
        ]];
        [...report.backlog]
            .sort((a, b) =>
                trCompare(subName(String(a.subcontractor_id)), subName(String(b.subcontractor_id)))
                || trCompare(kalemName(a.kalem_key), kalemName(b.kalem_key))
                || String(a.job_no).localeCompare(String(b.job_no), 'tr', { numeric: true }))
            .forEach(b => backlogRows.push([
                subName(String(b.subcontractor_id)),
                kalemName(b.kalem_key),
                b.job_no,
                b.job_title || '',
                b.customer_name || '',
                JOB_STATUS[b.job_status] || '',
                num(b.allocated_weight_kg),
                num(b.done_weight_kg),
                num(b.remaining_weight_kg),
                num(b.contract_amount),
                num(b.remaining_amount),
                b.currency || 'TRY'
            ]));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(workRows), 'Aylık İş');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(backlogRows), 'Kalan İş');

        const perPersonRows = [['Taşeron', 'Ay', 'Hakediş Durumu', 'Dönem Toplamı', 'Çalışan', 'Kişi Başı', 'Para Birimi']];
        [...report.statements]
            .sort((a, b) =>
                trCompare(subName(String(a.subcontractor_id)), subName(String(b.subcontractor_id)))
                || a.period.localeCompare(b.period))
            .forEach(st => {
                const total = lookup.monthTotals.get(`${st.subcontractor_id}|${st.period}`) || 0;
                const count = num(st.employee_count);
                perPersonRows.push([
                    subName(String(st.subcontractor_id)),
                    st.period,
                    STATEMENT_STATUS[st.status]?.label || st.status,
                    total,
                    st.employee_count ?? '',
                    count > 0 && total ? Number((total / count).toFixed(2)) : '',
                    st.currency || 'TRY'
                ]);
            });
        // One monthly-average row per subcontractor: Dönem Toplamı ÷ Çalışan ÷ ay
        // over the months with a headcount (= Kişi Başı on the table).
        report.subcontractors.forEach(sub => {
            const id = String(sub.id);
            const pp = monthlyPerPerson(new Set([id]));
            if (pp.value === null) return;
            perPersonRows.push([
                subName(id),
                `Aylık ortalama (${pp.months} ay)`,
                pp.skipped ? `${pp.skipped} ay çalışansız, hariç` : '',
                Number(pp.total.toFixed(2)),
                Number((pp.personMonths / pp.months).toFixed(2)),
                Number(pp.value.toFixed(2)),
                sub.default_currency || 'TRY'
            ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perPersonRows), 'Kişi Başı');

        const { start, end } = report.period;
        const suffix = start || end ? `${start || 'baslangic'}_${end || 'bugun'}` : 'tum-donemler';
        XLSX.writeFile(wb, `taseron-aylik-is-raporu_${suffix}.xlsx`);
    } catch (error) {
        console.error('Export failed:', error);
        showNotification(error.message || 'Dışa aktarma başarısız', 'error');
    }
}

function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => reject(new Error('Excel kütüphanesi yüklenemedi'));
        document.head.appendChild(script);
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadGrouping() {
    try {
        const saved = localStorage.getItem(GROUPING_STORAGE_KEY);
        if (GROUPINGS.some(g => g.id === saved)) return saved;
    } catch {
        // storage blocked — fall through to the default
    }
    return GROUPINGS[0].id;
}

function saveGrouping(value) {
    try {
        localStorage.setItem(GROUPING_STORAGE_KEY, value);
    } catch {
        // storage blocked — the choice just won't survive a reload
    }
}

function subName(id) {
    const sub = lookup?.subs.get(id);
    return sub ? (sub.short_name || sub.name) : `#${id}`;
}

function kalemName(key) {
    return lookup?.kalems.get(key) || key;
}

function nodeName(node) {
    if (node.level === 'sub') return subName(node.value);
    if (node.level === 'kalem') return kalemName(node.value);
    return node.value;
}

function periodLabel(period) {
    const [year, month] = String(period).split('-').map(Number);
    return `${MONTH_NAMES[month - 1] || month} ${year}`;
}

function trCompare(a, b) {
    return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' });
}

function num(value) {
    const n = typeof value === 'string' ? parseFloat(value) : value;
    return Number.isFinite(n) ? n : 0;
}

/** The one currency in the set, 'TRY' for an empty set, null when mixed. */
function singleCurrency(currencies) {
    if (!currencies || currencies.size === 0) return 'TRY';
    return currencies.size === 1 ? [...currencies][0] : null;
}

function currencySymbol(currency) {
    if (currency === null) return '';
    return CURRENCY_SYMBOL[currency] || currency || '₺';
}

function formatNumber(value, digits = 2) {
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(num(value));
}

function formatMoneyText(value, currency) {
    return `${formatNumber(value, 2)} ${currencySymbol(currency)}`.trim();
}
