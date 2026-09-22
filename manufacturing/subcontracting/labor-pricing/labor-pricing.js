import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { getJobOrderDropdown } from '../../../../apis/projects/jobOrders.js';
import { fetchLaborPricing, saveLaborPricingParams } from '../../../../apis/subcontracting/laborPricing.js';

// filter id -> querystring key expected by the endpoint
const PARAM_KEYS = {
    'material-rate': 'material_rate',
    'general-rate': 'general_rate',
    'margin-pct': 'margin_pct',
    'alpha': 'alpha',
    'factor-min': 'factor_min',
    'factor-max': 'factor_max',
};

const PARAM_DEFAULTS = {
    'material-rate': '1.50',
    'general-rate': '0.70',
    'margin-pct': '30',
    'alpha': '0.75',
    'factor-min': '0.70',
    'factor-max': '2.00',
};

// Cost bar segments, in the order they stack across a kilogram of steel.
const SEGMENTS = [
    { key: 'material_per_kg', label: 'Malzeme', color: '#455a67' },
    { key: 'general_per_kg', label: 'Genel gider', color: '#7c909d' },
    { key: 'labor_per_kg', label: 'İşçilik', color: '#c4470f' },
    { key: 'profit_per_kg', label: 'Kâr', color: '#276b4c' },
];

let headerComponent = null;
let filters = null;
let stats = null;
let linesTable = null;

let selected = [];
let difficulty = {};
let lastReport = null;
// Rate thresholds: at or under `green` is comfortable, over `red` needs a look.
// Both optional; red wins where the two overlap.
let thresholds = { green: null, red: null };
const THRESHOLD_KEY = 'labor-pricing-thresholds';
// Ticking a selection on quickly fires overlapping requests; without this the
// slower earlier one can land last and paint a result for a stale selection.
let requestSeq = 0;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    initHeader();
    initStats();
    initThresholds();
    initTable();
    await initFilters();
});

function initHeader() {
    headerComponent = new HeaderComponent({
        title: 'Taşeron İşçilik Fiyatı',
        subtitle: 'Satış fiyatından geriye giderek taşerona verilebilecek €/kg işçiliği hesaplar',
        icon: 'calculator',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        showCreateButton: 'block',
        createButtonText: 'Parametreleri Kaydet',
        onBackClick: () => window.location.href = '/manufacturing/subcontracting',
        onRefreshClick: () => recompute(),
        onCreateClick: () => saveParams()
    });
}

// ---------------------------------------------------------------------------
// Filters — selection and the six knobs live in one bar
// ---------------------------------------------------------------------------

async function initFilters() {
    filters = new FiltersComponent('filters-placeholder', {
        title: 'Hesaplama',
        applyButtonText: 'Hesapla',
        clearButtonText: 'Sıfırla',
        onApply: () => {
            selected = asArray(filters.getFilterValues()['job-orders']);
            difficulty = {};
            recompute();
        },
        onClear: () => {
            selected = [];
            difficulty = {};
            filters.setFilterValues({ ...PARAM_DEFAULTS, 'job-orders': [] });
            recompute();
        }
    });

    let options = [];
    try {
        const jobs = await getJobOrderDropdown(false, { rootOnly: true, withCustomer: true });
        options = jobs
            // '1000' is the synthetic "Fabrika İşleri" catch-all, not a real job
            // order — there is nothing under it to price.
            .filter(job => job.job_no !== '1000')
            .map(job => ({
                value: job.job_no,
                label: `${job.job_no} · ${job.title || ''}${
                    job.customer_name ? ' · ' + job.customer_name : ''}`
            }));
    } catch (error) {
        console.error('Error loading job orders:', error);
        showNotification('İş emirleri yüklenemedi', 'error');
    }

    filters.addDropdownFilter({
        id: 'job-orders',
        label: 'İş Emirleri',
        options,
        placeholder: 'İş emri seçin (birden fazla seçilebilir)',
        multiple: true,
        searchable: true,
        colSize: 4
    });

    filters.addTextFilter({ id: 'material-rate', label: 'Malzeme €/kg', type: 'number',
        value: PARAM_DEFAULTS['material-rate'], placeholder: '1.50', colSize: 1 });
    filters.addTextFilter({ id: 'general-rate', label: 'Genel Gider €/kg', type: 'number',
        value: PARAM_DEFAULTS['general-rate'], placeholder: '0.70', colSize: 1 });
    filters.addTextFilter({ id: 'margin-pct', label: 'Hedef Kâr %', type: 'number',
        value: PARAM_DEFAULTS['margin-pct'], placeholder: '30', colSize: 1 });
    filters.addTextFilter({
        id: 'alpha', type: 'number', value: PARAM_DEFAULTS['alpha'], placeholder: '0.75', colSize: 2,
        label: 'Ağırlık Etkisi (α)' + help(
            '1,00 = işçilik tamamen kiloya orantılı. 0,00 = ağırlıktan bağımsız, her parça aynı ücret. ' +
            '0,75’te bir parçanın ağırlığı iki katına çıkınca işçiliği %100 değil %68 artar, ' +
            'yani kilogram başına oranı %16 düşer.')
    });
    filters.addTextFilter({
        id: 'factor-min', type: 'number', value: PARAM_DEFAULTS['factor-min'], placeholder: '0.70', colSize: 2,
        label: 'Oran Alt Sınırı ×' + help(
            'En ağır parçaların oranı taban oranın bu katının altına inemez. ' +
            'Taşeronun kabul etmeyeceği kadar düşük bir kilogram fiyatı çıkmasını engeller.')
    });
    filters.addTextFilter({
        id: 'factor-max', type: 'number', value: PARAM_DEFAULTS['factor-max'], placeholder: '2.00', colSize: 2,
        label: 'Oran Üst Sınırı ×' + help(
            'En hafif parçaların oranı taban oranın bu katını aşamaz. ' +
            'Sınır olmazsa en küçük parçalar kendi satış fiyatlarının üzerine çıkar ve o kalemin kârı sıfırlanır.')
    });

    renderBreakdown(null);
}

/** A hoverable help marker inside a filter label (labels are injected raw). */
function help(text) {
    return ` <i class="fas fa-circle-question text-muted" title="${escapeAttr(text)}"></i>`;
}

function currentParams() {
    const values = filters.getFilterValues();
    const params = {};
    Object.entries(PARAM_KEYS).forEach(([id, key]) => {
        if (values[id] !== '' && values[id] !== undefined && values[id] !== null) {
            params[key] = values[id];
        }
    });
    return params;
}

async function saveParams() {
    if (!selected.length) {
        showNotification('Önce iş emri seçin', 'warning');
        return;
    }
    try {
        const result = await saveLaborPricingParams(selected, currentParams());
        showNotification(`${result.saved.length} iş emrine kaydedildi`, 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// ---------------------------------------------------------------------------
// Statistics cards
// ---------------------------------------------------------------------------

function initStats() {
    stats = new StatisticsCards('stats-placeholder', { cards: [], itemsPerRow: 5, compact: true });
}

function renderStats(report) {
    if (!report) {
        stats.setCards([]);
        return;
    }
    const t = report.totals;
    stats.setCards([
        {
            title: 'Taşerona verilebilir',
            value: `${fmt(Number(t.labor_per_kg), 3)} €/kg`,
            icon: 'fas fa-hand-holding-dollar',
            color: t.is_feasible ? 'primary' : 'danger',
            tooltip: `Temel oran k = ${fmt(Number(t.base_rate_k), 4)} €/kg, referans ağırlık ${fmt(Number(t.reference_weight_kg), 0)} kg`
        },
        {
            title: `İşçilik havuzu · ${t.line_count} kalem`,
            value: eur(t.labor_pool_eur),
            icon: 'fas fa-coins',
            color: 'info',
            tooltip: `${t.piece_count} adet · kalemlere dağıtılan ${eur(t.labor_allocated_eur)}`
        },
        {
            title: 'Toplam ağırlık',
            value: `${fmt(Number(t.total_weight_kg), 0)} kg`,
            icon: 'fas fa-weight-hanging',
            color: 'secondary'
        },
        {
            title: `Satış · ${fmt(Number(t.revenue_per_kg), 2)} €/kg`,
            value: eur(t.total_price_eur),
            icon: 'fas fa-file-invoice',
            color: 'dark',
            tooltip: 'Nakliye hariç — ayrıca fiyatlanıyor'
        },
        {
            title: `Kalan kâr · %${fmt(Number(report.params.margin_pct), 0)}`,
            value: eur(t.profit_eur),
            icon: 'fas fa-chart-line',
            color: 'success'
        }
    ]);
}

// ---------------------------------------------------------------------------
// Cost composition bar
// ---------------------------------------------------------------------------

function renderBreakdown(report) {
    const box = document.getElementById('breakdown-placeholder');
    if (!report) {
        box.innerHTML = explainerHtml();
        return;
    }
    const t = report.totals;
    const segments = SEGMENTS.map(s => ({ ...s, value: Math.max(0, Number(t[s.key])) }));
    const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
    const alpha = Number(report.params.alpha);

    box.innerHTML = `
        <div class="card mb-3">
            <div class="card-body">
                <h6 class="mb-3"><i class="fas fa-percent me-2 text-primary"></i>Bir Kilogram Nereye Gidiyor</h6>
                <div class="lp-bar">
                    ${segments.map(s => `<span style="flex:${s.value / total};background:${s.color}"></span>`).join('')}
                </div>
                <div class="lp-bar-key">
                    ${segments.map(s => `<div><i style="background:${s.color}"></i>${s.label} <b>${fmt(s.value, 3)} €</b></div>`).join('')}
                </div>
                <p class="text-muted small mb-0 mt-3">
                    Kilogram başına <strong>${fmt(Number(t.revenue_per_kg), 4)} €</strong> satıyorsunuz,
                    <strong>${fmt(Number(t.profit_per_kg), 3)} €</strong> kâr olarak kalıyor,
                    <strong>${fmt(Number(t.labor_per_kg), 3)} €</strong> taşerona verilebilir.
                    Nakliye bu hesaba girmez — ayrıca fiyatlanıyor.
                    α = ${fmt(alpha, 2)} olduğu için bir parçanın ağırlığı iki katına çıktığında işçiliği
                    %100 değil <strong>%${fmt((Math.pow(2, alpha) - 1) * 100, 0)}</strong> artar;
                    kilogram başına fiyatı %${fmt((1 - Math.pow(2, alpha - 1)) * 100, 0)} düşer.
                    Alt/üst kat sayılar bunu iki uçta sınırlar.
                </p>
                ${warningHtml(report)}
            </div>
        </div>`;
}

/** Shown before anything is calculated, so the parameters are not a puzzle. */
function explainerHtml() {
    return `
        <div class="card mb-3">
            <div class="card-body">
                <h6 class="mb-3"><i class="fas fa-circle-info me-2 text-primary"></i>Nasıl Çalışır</h6>
                <div class="row g-3">
                    <div class="col-md-6">
                        <p class="small mb-2"><strong>1 · Havuz.</strong> Teklifteki satış fiyatından
                        malzeme, genel gider ve hedef kâr düşülür; kalan tutar taşerona verilebilecek
                        işçiliktir. <em>Nakliye bu hesaba girmez</em> — ayrıca fiyatlanıyor.</p>
                        <p class="small mb-0"><strong>2 · Dağıtım.</strong> İşçilik ağırlıkla doğru
                        orantılı değildir: 24 kg’lık bir panel, 6.100 kg’lık birinin 254’te biri kadar iş
                        değildir. Bu yüzden her kalem ağırlığına değil <em>emek ağırlığına</em> göre pay
                        alır — hafif parçalar kilogram başına daha yüksek oran alır. Havuz sabit olduğu
                        için toplam kâr oranı her koşulda hedefte kalır.</p>
                    </div>
                    <div class="col-md-6">
                        <ul class="small mb-0 ps-3">
                            <li class="mb-2"><strong>Ağırlık Etkisi (α)</strong> — işçiliğin ağırlığı ne
                            kadar takip ettiği. <strong>1,00</strong> düz €/kg demek;
                            <strong>0,00</strong> ağırlıktan bağımsız sabit €/adet demek.
                            <strong>0,75</strong>’te ağırlık iki katına çıkınca işçilik %68 artar.</li>
                            <li class="mb-2"><strong>Oran Üst Sınırı ×</strong> — en hafif parçaların
                            oranına tavan. Olmazsa küçük parçalar kendi satış fiyatlarının üzerine çıkar.</li>
                            <li><strong>Oran Alt Sınırı ×</strong> — en ağır parçaların oranına taban.
                            Taşeronun kabul etmeyeceği kadar düşük fiyat çıkmasını engeller.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>`;
}

function warningHtml(report) {
    const t = report.totals;
    const blocks = [];

    if (!t.is_feasible) {
        const costs = Number(t.material_per_kg) + Number(t.general_per_kg) + Number(t.profit_per_kg);
        blocks.push(`<div class="alert alert-danger mb-0 mt-3">
            <i class="fas fa-triangle-exclamation me-1"></i>
            <strong>İşçilik için para kalmıyor.</strong> Malzeme, genel gider ve
            %${fmt(Number(report.params.margin_pct), 0)} kâr birlikte kilogram başına
            ${fmt(costs, 3)} € ediyor; satış ise ${fmt(Number(t.revenue_per_kg), 4)} €/kg.
            Kâr hedefini düşürün ya da satış fiyatı yetersiz.
        </div>`);
    } else if (Number(t.labor_per_kg) < 0.35) {
        blocks.push(`<div class="alert alert-warning mb-0 mt-3">
            <i class="fas fa-triangle-exclamation me-1"></i>
            <strong>Çok ince.</strong> ${fmt(Number(t.labor_per_kg), 3)} €/kg bu tür plaka imalatını
            karşılamaz. Maliyet girdilerinden biri ya da kâr hedefi gözden geçirilmeli.
        </div>`);
    }

    if (report.skipped?.length) {
        const names = report.skipped.slice(0, 8).map(s => s.job_no).join(', ');
        blocks.push(`<div class="alert alert-warning mb-0 mt-3">
            <i class="fas fa-circle-info me-1"></i>
            <strong>${report.skipped.length} kalem hesaba katılmadı</strong>
            (ağırlık veya satış fiyatı girilmemiş): ${names}${report.skipped.length > 8 ? '…' : ''}.
            Eksik ağırlık diğer kalemlerin fiyatını sessizce yükseltir.
        </div>`);
    }
    return blocks.join('');
}

// ---------------------------------------------------------------------------
// Lines table
// ---------------------------------------------------------------------------

/**
 * Two rate limits that colour the rows by İşçilik €/kg.
 *
 * Rendered once and left alone: the table component replaces its whole
 * container on every render, so inputs living inside it would be rebuilt —
 * and lose focus — on each recompute.
 */
function initThresholds() {
    try {
        const saved = JSON.parse(localStorage.getItem(THRESHOLD_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            thresholds = { green: toLimit(saved.green), red: toLimit(saved.red) };
        }
    } catch (e) { /* private window or blocked storage — defaults are fine */ }

    document.getElementById('thresholds-placeholder').innerHTML = `
        <div class="lp-thresholds">
            <span class="fw-semibold"><i class="fas fa-fill-drip me-1 text-muted"></i>İşçilik €/kg sınırları</span>
            <span class="lp-th-group">
                <span class="lp-swatch lp-swatch-green"></span>
                <label for="th-green" class="mb-0">Şunun altı iyi:</label>
                <input type="number" id="th-green" step="0.05" min="0" placeholder="örn. 1,00"
                       value="${thresholds.green ?? ''}" aria-label="Yeşil sınır, €/kg">
                <span class="text-muted">€/kg</span>
            </span>
            <span class="lp-th-group">
                <span class="lp-swatch lp-swatch-red"></span>
                <label for="th-red" class="mb-0">Şunun üstü pahalı:</label>
                <input type="number" id="th-red" step="0.05" min="0" placeholder="örn. 2,00"
                       value="${thresholds.red ?? ''}" aria-label="Kırmızı sınır, €/kg">
                <span class="text-muted">€/kg</span>
            </span>
            <span class="text-muted ms-auto">Boş bırakılan sınır kapalıdır.</span>
        </div>`;

    ['green', 'red'].forEach(key => {
        document.getElementById(`th-${key}`).addEventListener('input', event => {
            thresholds[key] = toLimit(event.target.value);
            try {
                localStorage.setItem(THRESHOLD_KEY, JSON.stringify(thresholds));
            } catch (e) { /* not worth failing the repaint over */ }
            if (lastReport) linesTable.render();
        });
    });
}

function toLimit(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && value !== '' && value !== null ? parsed : null;
}

/** Row tint from the line's labor rate. Red wins where the two limits overlap. */
function rowColor(row) {
    const rate = Number(row.labor_per_kg);
    if (!Number.isFinite(rate)) return null;
    if (thresholds.red !== null && rate > thresholds.red) return 'rgba(176, 46, 46, .16)';
    if (thresholds.green !== null && rate < thresholds.green) return 'rgba(39, 107, 76, .16)';
    return null;
}

function initTable() {
    linesTable = new TableComponent('lines-placeholder', {
        title: 'Alt Kalemler',
        icon: 'fas fa-table-list',
        iconColor: 'text-primary',
        columns: [
            { field: 'job_no', label: 'İş No', sortable: true },
            { field: 'title', label: 'Kalem', sortable: true },
            { field: 'quantity', label: 'Adet', sortable: true, type: 'number',
              formatter: v => `<span class="lp-num">${v}</span>` },
            { field: 'weight_kg', label: 'kg / adet', sortable: true, type: 'number',
              formatter: v => numCell(v, 1) },
            { field: 'sell_per_kg', label: 'Satış €/kg', sortable: true, type: 'number',
              formatter: v => numCell(v, 2) },
            { field: 'size_factor', label: 'Boyut (f)', sortable: true, type: 'number',
              formatter: v => numCell(v, 2) },
            { field: 'difficulty', label: 'Zorluk', sortable: false, type: 'number',
              editable: true, min: 0.1, max: 5, step: 0.05,
              formatter: v => window.isExporting ? Number(v).toFixed(2)
                  : `<span class="lp-num text-decoration-underline" title="Değiştirmek için tıklayın">${fmt(Number(v), 2)}</span>`,
              validate: value => {
                  const parsed = Number(value);
                  if (!Number.isFinite(parsed) || parsed <= 0) return 'Zorluk sıfırdan büyük bir sayı olmalı';
                  if (parsed > 5) return 'Zorluk en fazla 5 olabilir';
                  return true;
              } },
            { field: 'labor_per_kg', label: 'İşçilik €/kg', sortable: true, type: 'number',
              formatter: v => window.isExporting ? Number(v) : `<span class="lp-rate">${fmt(Number(v), 3)}</span>` },
            { field: 'labor_per_piece_eur', label: '€ / adet', sortable: true, type: 'number',
              formatter: v => numCell(v, 0) },
            { field: 'labor_total_eur', label: 'Toplam €', sortable: true, type: 'number',
              formatter: v => numCell(v, 0) },
            { field: 'line_margin_pct', label: 'Kâr', sortable: true, type: 'number',
              formatter: v => marginBadge(v) },
        ],
        data: [],
        sortable: true,
        pagination: false,
        small: true,
        // Striping would fight the threshold tints, and here the row colour
        // carries meaning while the stripe is only decoration.
        striped: false,
        stickyHeader: true,
        rowBackgroundColor: rowColor,
        exportable: true,
        editable: true,
        editableColumns: ['difficulty'],
        onEdit: async (row, field, newValue) => {
            const parsed = Number(newValue);
            if (Number.isFinite(parsed) && parsed > 0) difficulty[row.job_no] = parsed;
            else delete difficulty[row.job_no];
            await recompute();
        },
        groupBy: 'root_job_no',
        groupHeaderFormatter: (groupValue, groupRows) => {
            const title = groupRows[0]?.root_title || '';
            const kg = groupRows.reduce((sum, r) => sum + Number(r.total_weight_kg), 0);
            const cost = groupRows.reduce((sum, r) => sum + Number(r.labor_total_eur), 0);
            return `<div class="d-flex align-items-center flex-wrap gap-2">
                        <strong>${groupValue}</strong>
                        <span class="text-muted">${title}</span>
                        <span class="badge bg-secondary">${groupRows.length} kalem</span>
                        <span class="badge bg-light text-dark">${fmt(kg, 0)} kg</span>
                        <span class="badge bg-light text-dark">${eur(cost)} işçilik</span>
                    </div>`;
        },
        emptyMessage: 'İş emri seçin ve Hesapla’ya basın',
        emptyIcon: 'fas fa-calculator',
    });
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------

async function recompute() {
    const seq = ++requestSeq;

    if (!selected.length) {
        lastReport = null;
        renderStats(null);
        renderBreakdown(null);
        linesTable.updateData([]);
        return;
    }

    linesTable.setLoading(true);
    let report;
    try {
        report = await fetchLaborPricing(selected, currentParams(), difficulty);
    } catch (error) {
        if (seq !== requestSeq) return;
        lastReport = null;
        linesTable.setLoading(false);
        linesTable.updateData([]);
        renderStats(null);
        renderBreakdown(null);
        showNotification(error.message, 'error');
        return;
    }
    if (seq !== requestSeq) return;   // a newer selection already won

    lastReport = report;
    linesTable.setLoading(false);
    renderStats(report);
    renderBreakdown(report);
    linesTable.updateData(report.lines);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
}

function fmt(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('tr-TR', {
        minimumFractionDigits: digits, maximumFractionDigits: digits
    });
}

function numCell(value, digits) {
    const parsed = Number(value);
    if (window.isExporting) return Number.isFinite(parsed) ? parsed : '';
    return `<span class="lp-num">${fmt(parsed, digits)}</span>`;
}

function eur(value) {
    return `${fmt(Math.round(Number(value)), 0)} €`;
}

function escapeAttr(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function marginBadge(value) {
    if (value === null || value === undefined) return '—';
    const pct = Number(value);
    if (window.isExporting) return pct;
    // No yellow anywhere in this app — orange carries the middle band.
    const tone = pct < 15 ? 'status-red' : pct < 25 ? 'status-orange' : 'status-green';
    return `<span class="status-badge ${tone}">%${fmt(pct, 1)}</span>`;
}
