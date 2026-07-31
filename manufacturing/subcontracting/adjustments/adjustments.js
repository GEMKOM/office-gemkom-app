import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { fetchAdjustmentsReport } from '../../../../apis/subcontracting/adjustments.js';
import { fetchSubcontractors } from '../../../../apis/subcontracting/subcontractors.js';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Fields whose values arrive as numeric strings and should sort numerically.
const NUMERIC_FIELDS = new Set(['amount', 'weight_kg']);

// Component instances
let headerComponent = null;
let adjustmentsFilters = null;
let additionsTable = null;
let deductionsTable = null;

// State
let subcontractors = [];
let additionsData = [];
let deductionsData = [];
let isLoading = false;
const additionsSort = { field: 'created_at', direction: 'desc' };
const deductionsSort = { field: 'created_at', direction: 'desc' };

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    initHeaderComponent();
    initTables();

    // Subcontractor list feeds the filter dropdown; load before building filters.
    await loadSubcontractors();
    initFilters();

    await loadAdjustments();
});

function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Taşeron Düzeltmeleri',
        subtitle: 'Tüm hakediş düzeltmeleri — ek ödemeler ve kesintiler',
        icon: 'balance-scale-left',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/subcontracting',
        onRefreshClick: () => loadAdjustments()
    });
}

async function loadSubcontractors() {
    try {
        const response = await fetchSubcontractors({ is_active: true });
        subcontractors = response.results || response || [];
    } catch (error) {
        console.error('Error loading subcontractors:', error);
        subcontractors = [];
    }
}

function initFilters() {
    adjustmentsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Düzeltme Filtreleri',
        onApply: () => loadAdjustments(),
        onClear: () => loadAdjustments()
    });

    adjustmentsFilters.addDropdownFilter({
        id: 'subcontractor-filter',
        label: 'Taşeron',
        options: [
            { value: '', label: 'Tümü' },
            ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);
    adjustmentsFilters.addDropdownFilter({
        id: 'year-filter',
        label: 'Yıl',
        options: [
            { value: '', label: 'Tümü' },
            ...yearOptions.map(y => ({ value: y.toString(), label: y.toString() }))
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    adjustmentsFilters.addDropdownFilter({
        id: 'month-filter',
        label: 'Ay',
        options: [
            { value: '', label: 'Tümü' },
            ...MONTH_NAMES.map((name, i) => ({ value: (i + 1).toString(), label: name }))
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    adjustmentsFilters.addTextFilter({
        id: 'job_no-filter',
        label: 'İş No',
        placeholder: 'İş numarası',
        colSize: 3
    });
}

function initTables() {
    additionsTable = new TableComponent('additions-table-container', {
        title: 'Ek Ödemeler',
        icon: 'fas fa-plus-circle',
        iconColor: 'text-success',
        columns: buildColumns(true),
        onSort: (field, direction) => {
            additionsSort.field = field;
            additionsSort.direction = direction;
            renderAdditions();
        },
        footer: buildFooter(),
        emptyMessage: 'Ek ödeme bulunamadı',
        exportable: true,
        exportFilename: () => `taseron-ek-odemeler_${new Date().toISOString().slice(0, 10)}.xlsx`,
        initialSortField: additionsSort.field,
        initialSortDirection: additionsSort.direction,
        skeletonLoading: true
    });

    deductionsTable = new TableComponent('deductions-table-container', {
        title: 'Kesintiler',
        icon: 'fas fa-minus-circle',
        iconColor: 'text-danger',
        columns: buildColumns(false),
        onSort: (field, direction) => {
            deductionsSort.field = field;
            deductionsSort.direction = direction;
            renderDeductions();
        },
        footer: buildFooter(),
        emptyMessage: 'Kesinti bulunamadı',
        exportable: true,
        exportFilename: () => `taseron-kesintiler_${new Date().toISOString().slice(0, 10)}.xlsx`,
        initialSortField: deductionsSort.field,
        initialSortDirection: deductionsSort.direction,
        skeletonLoading: true
    });
}

// Both tables share the same columns; amount color differs by side.
function buildColumns(isAddition) {
    const amountClass = isAddition ? 'text-success' : 'text-danger';
    return [
        {
            field: 'created_at',
            label: 'Tarih',
            sortable: true,
            type: 'date'
        },
        {
            field: 'statement_period',
            label: 'Hakediş Dönemi',
            sortable: true,
            type: 'text',
            formatter: (value, row) => formatPeriod(row)
        },
        {
            field: 'subcontractor_name',
            label: 'Taşeron',
            sortable: true,
            type: 'text',
            formatter: (value) => value || '-'
        },
        {
            field: 'job_no',
            label: 'İş No',
            sortable: true,
            type: 'text',
            formatter: (value) => value ? `<span class="fw-semibold text-primary">${value}</span>` : '-'
        },
        {
            field: 'weight_kg',
            label: 'Ağırlık (kg)',
            sortable: true,
            type: 'number',
            formatter: (value) => formatWeight(value)
        },
        {
            field: 'amount',
            label: 'Tutar',
            sortable: true,
            type: 'number',
            formatter: (value, row) => `<span class="fw-bold ${amountClass}">${formatMoney(value, row.currency)}</span>`
        },
        {
            field: 'reason',
            label: 'Sebep',
            sortable: true,
            type: 'text',
            formatter: (value) => value || '-'
        },
        {
            field: 'description',
            label: 'Açıklama',
            sortable: false,
            type: 'text',
            formatter: (value) => value || '-'
        }
    ];
}

// Footer: per-currency total of the amount column across all rows in the table.
function buildFooter() {
    return ({ allData, columns }) => {
        if (!allData || allData.length === 0) return '';
        const byCurrency = {};
        allData.forEach(row => {
            const cur = row.currency || '';
            byCurrency[cur] = (byCurrency[cur] || 0) + (Number(row.amount) || 0);
        });
        const parts = Object.keys(byCurrency).sort().map(cur => formatMoney(byCurrency[cur], cur));
        return `
            <tr class="table-group-divider fw-bold">
                <td colspan="${columns.length}" class="text-end">
                    Toplam: ${parts.join(' + ')}
                </td>
            </tr>
        `;
    };
}

async function loadAdjustments() {
    if (isLoading) return;
    isLoading = true;

    try {
        const filters = adjustmentsFilters ? adjustmentsFilters.getFilterValues() : {};
        const data = await fetchAdjustmentsReport({
            subcontractor: filters['subcontractor-filter'] || undefined,
            year: filters['year-filter'] || undefined,
            month: filters['month-filter'] || undefined,
            job_no: filters['job_no-filter'] || undefined
        });

        const results = data.results || [];
        additionsData = results.filter(r => r.adjustment_type === 'addition');
        deductionsData = results.filter(r => r.adjustment_type === 'deduction');

        renderAdditions();
        renderDeductions();
    } catch (error) {
        console.error('Error loading adjustments:', error);
        showNotification(error.message || 'Düzeltmeler yüklenirken hata oluştu', 'error');
    } finally {
        isLoading = false;
    }
}

function renderAdditions() {
    if (!additionsTable) return;
    const sorted = sortRows(additionsData, additionsSort.field, additionsSort.direction);
    additionsTable.updateData(sorted, sorted.length, 1);
}

function renderDeductions() {
    if (!deductionsTable) return;
    const sorted = sortRows(deductionsData, deductionsSort.field, deductionsSort.direction);
    deductionsTable.updateData(sorted, sorted.length, 1);
}

function sortRows(data, field, direction) {
    if (!field) return data.slice();
    const dir = direction === 'desc' ? -1 : 1;
    return data.slice().sort((a, b) => {
        let cmp;
        if (NUMERIC_FIELDS.has(field)) {
            cmp = (Number(a[field]) || 0) - (Number(b[field]) || 0);
        } else {
            cmp = String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'tr', { numeric: true });
        }
        return cmp * dir;
    });
}

// --- formatting helpers ---------------------------------------------------

function formatMoney(value, currency) {
    const n = Number(value);
    if (!isFinite(n)) return '-';
    const formatted = n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency ? `${formatted} ${currency}` : formatted;
}

function formatWeight(value) {
    const n = Number(value);
    if (!isFinite(n) || n === 0) return '-';
    return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

function formatPeriod(row) {
    if (row.statement_year && row.statement_month) {
        return `${MONTH_NAMES[row.statement_month - 1]} ${row.statement_year}`;
    }
    return row.statement_period || '-';
}
