import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { TableComponent } from '../../components/table/table.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

let table = null;
let lastMappedRows = [];
let xlsxReady = false;
let xlsxLoadError = null;
const TURKISH_MONTHS = [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık'
];

const COLUMN_SCHEMA = [
    { field: 's', label: 'S', aliases: [] },
    { field: 'stock_code', label: 'Stok Kodu', aliases: ['stock_code'] },
    { field: 'b1', label: 'B1', aliases: ['b1'] },
    { field: 'b2', label: 'B2', aliases: ['b2'] },
    { field: 'quantity_done', label: 'Yapılan Miktar', aliases: ['amount'], numeric: true },
    { field: 'unit_price', label: 'Birim Fiyat', aliases: ['unit_price'], numeric: true },
    { field: 'b3', label: 'B3', aliases: ['b3'] },
    { field: 'b4', label: 'B4', aliases: ['b4'] },
    { field: 'amount', label: 'Tutar', aliases: ['total_price'], numeric: true },
    { field: 'project_code', label: 'Proje Kodu', aliases: ['job_no'] },
    { field: 'b5_1', label: 'B5', aliases: ['b5_1'] },
    { field: 'b5_2', label: 'B5', aliases: ['b5_2'] },
    { field: 'b5_3', label: 'B5', aliases: ['b5_3'] },
    { field: 'b5_4', label: 'B5', aliases: ['b5_4'] },
    { field: 'b5_5', label: 'B5', aliases: ['b5_5'] },
    { field: 'description', label: 'Açıklama', aliases: ['description'] },
    { field: 'subcontractor', label: 'Taşeron', aliases: ['subcontractor_name'] }
];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function setStatus(message) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = message || '';
}

function buildUrl(year, month) {
    const qs = new URLSearchParams({ year: String(year), month: String(month) });
    return `${backendBase}/subcontracting/statements/accounting-export/?${qs.toString()}`;
}

function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function inferType(v) {
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    const asDate = typeof v === 'string' ? Date.parse(v) : NaN;
    if (typeof v === 'string' && Number.isFinite(asDate) && v.length >= 8) return 'date';
    return 'string';
}

function formatValue(value) {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
    if (typeof value === 'number') return value.toLocaleString('tr-TR');
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function parseLocaleNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const raw = String(value).trim();
    if (!raw) return null;

    // Keep only digits, minus sign, comma and dot
    const cleaned = raw.replace(/[^0-9,.-]/g, '');
    if (!cleaned) return null;

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;

    if (lastComma > lastDot) {
        // Decimal separator is comma -> remove thousand dots, convert decimal comma to dot
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        // Decimal separator is dot -> remove thousand commas
        normalized = cleaned.replace(/,/g, '');
    } else {
        // Only one separator type exists or none; keep as-is except commas -> dots
        normalized = cleaned.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatTrNumber(value) {
    const num = parseLocaleNumber(value);
    if (num === null) return value === null || value === undefined ? '' : String(value);
    return num.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function normalizeKey(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function getValueByAliases(row, aliases) {
    if (!isPlainObject(row)) return null;
    const entries = Object.entries(row);
    const normalizedEntries = entries.map(([k, v]) => [normalizeKey(k), v]);

    for (const alias of aliases) {
        const normalizedAlias = normalizeKey(alias);
        const direct = normalizedEntries.find(([k]) => k === normalizedAlias);
        if (direct && direct[1] !== undefined && direct[1] !== null) {
            return direct[1];
        }
    }

    return null;
}

function mapRowToSchema(row) {
    const mapped = {};
    for (const col of COLUMN_SCHEMA) {
        if (col.field === 's') {
            mapped[col.field] = 'S';
            continue;
        }
        const value = getValueByAliases(row, col.aliases);
        mapped[col.field] = value === null || value === undefined ? '' : value;
    }
    return mapped;
}

function buildColumnsFromSchema(rows) {
    return COLUMN_SCHEMA.map((col) => {
        let sample = null;
        for (const row of rows) {
            const v = row[col.field];
            if (v !== null && v !== undefined && v !== '') {
                sample = v;
                break;
            }
        }

        const type = inferType(sample);
        return {
            field: col.field,
            label: col.label,
            sortable: true,
            type: col.numeric ? undefined : (type === 'date' ? 'date' : (type === 'number' ? 'number' : (type === 'boolean' ? 'boolean' : undefined))),
            formatter: (value) => {
                if (col.numeric) {
                    return formatTrNumber(value);
                }
                if (type === 'date') {
                    if (!value) return '-';
                    const d = new Date(value);
                    if (Number.isNaN(d.getTime())) return formatValue(value);
                    return d.toLocaleString('tr-TR');
                }
                return formatValue(value);
            }
        };
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function loadXLSXLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof XLSX !== 'undefined') {
            xlsxReady = true;
            resolve();
            return;
        }

        const timeoutId = setTimeout(() => {
            xlsxLoadError = new Error('XLSX library load timeout');
            reject(new Error('XLSX library load timeout'));
        }, 15000);

        const existing = document.querySelector('script[data-xlsx-loader="true"]');
        if (existing) {
            // If the script tag exists and already finished loading before we attached listeners,
            // the "load" event won't fire again. Use a marker + readyState.
            if (existing.getAttribute('data-xlsx-loaded') === 'true' || existing.readyState === 'complete') {
                clearTimeout(timeoutId);
                xlsxReady = true;
                resolve();
                return;
            }

            const onLoad = () => {
                existing.setAttribute('data-xlsx-loaded', 'true');
                clearTimeout(timeoutId);
                xlsxReady = true;
                resolve();
            };
            const onError = () => {
                clearTimeout(timeoutId);
                xlsxLoadError = new Error('XLSX library failed to load');
                reject(new Error('XLSX library failed to load'));
            };

            existing.addEventListener('load', onLoad, { once: true });
            existing.addEventListener('error', onError, { once: true });
            return;
        }

        const script = document.createElement('script');
        // Use the style-capable build so Excel honors cell fonts/sizes.
        // (Plain SheetJS build often ignores `cell.s` on write.)
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style/dist/xlsx.bundle.js';
        script.async = true;
        script.setAttribute('data-xlsx-loader', 'true');
        script.onload = () => {
            script.setAttribute('data-xlsx-loaded', 'true');
            clearTimeout(timeoutId);
            xlsxReady = true;
            resolve();
        };
        script.onerror = () => {
            clearTimeout(timeoutId);
            xlsxLoadError = new Error('XLSX library failed to load');
            reject(new Error('XLSX library failed to load'));
        };
        document.head.appendChild(script);
    });
}

async function exportMappedRowsAsXls(rows, year, month) {
    await loadXLSXLibrary();

    const headerRow = COLUMN_SCHEMA.map((c) => c.label);
    const dataRows = rows.map((row) => COLUMN_SCHEMA.map((c) => (
        c.numeric ? formatTrNumber(row[c.field]) : (row[c.field] ?? '')
    )));
    const sheetData = [headerRow, ...dataRows];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Apply uniform font settings to all cells in export.
    if (worksheet['!ref']) {
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!worksheet[addr]) continue;
                worksheet[addr].s = {
                    ...(worksheet[addr].s || {}),
                    font: {
                        name: 'Segoe UI',
                        sz: 8
                    }
                };
            }
        }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hakedişler');

    // XLSX preserves styles reliably across Excel versions.
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `subcontracting-statements-${year}-${pad2(month)}.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

async function fetchAsJson(year, month) {
    const url = buildUrl(year, month);
    const resp = await authedFetch(url, { method: 'GET' });

    if (!resp.ok) {
        let detail = '';
        try {
            const data = await resp.json();
            detail = data?.detail || data?.message || JSON.stringify(data);
        } catch {
            detail = await resp.text();
        }
        throw new Error(`HTTP ${resp.status} - ${detail}`);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        try {
            return await resp.json();
        } catch {
            throw new Error(`Yanıt JSON değil. content-type=${contentType || 'unknown'}`);
        }
    }

    return await resp.json();
}

function normalizeRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (isPlainObject(payload)) return [payload];
    return [];
}

async function downloadFile(year, month) {
    if (lastMappedRows.length > 0) {
        await exportMappedRowsAsXls(lastMappedRows, year, month);
        return;
    }

    const payload = await fetchAsJson(year, month);
    const rows = normalizeRows(payload).map(mapRowToSchema);
    lastMappedRows = rows;
    await exportMappedRowsAsXls(rows, year, month);
}

function ensureTable() {
    if (table) return table;
    table = new TableComponent('accounting-export-table-container', {
        title: 'Sonuç',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [],
        data: [],
        sortable: true,
        pagination: false,
        emptyMessage: 'Henüz veri yok. Yıl/Ay seçip "Yükle" tıklayın.',
        emptyIcon: 'fas fa-inbox'
    });
    return table;
}

async function loadAndRender() {
    const year = Number(document.getElementById('year-input')?.value);
    const month = Number(document.getElementById('month-input')?.value);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        setStatus('Geçersiz yıl');
        return;
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
        setStatus('Geçersiz ay');
        return;
    }

    const loadBtn = document.getElementById('load-btn');
    const downloadBtn = document.getElementById('download-btn');
    if (loadBtn) loadBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;

    setStatus('Yükleniyor...');
    const t = ensureTable();
    t.options.loading = true;
    t.render();

    try {
        const payload = await fetchAsJson(year, month);
        const rows = normalizeRows(payload).map(mapRowToSchema);
        const columns = buildColumnsFromSchema(rows);
        lastMappedRows = rows;

        t.options.loading = false;
        t.options.columns = columns;
        t.options.data = rows;
        t.render();

        setStatus(`Yüklendi (${rows.length} satır)`);
    } catch (e) {
        t.options.loading = false;
        t.options.columns = [];
        t.options.data = [];
        t.render();
        lastMappedRows = [];
        setStatus(e?.message || String(e));
    } finally {
        if (loadBtn) loadBtn.disabled = false;
        if (downloadBtn) downloadBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    new HeaderComponent({
        title: 'Hakedişler',
        subtitle: 'Yıl/Ay seçip sonucu tablo olarak görüntüleyin',
        icon: 'file-invoice-dollar',
        showBackButton: 'block',
        showRefreshButton: 'none',
        showCreateButton: 'none',
        onBackClick: () => { window.location.href = '/accounting/'; }
    });

    const now = new Date();
    const yearEl = document.getElementById('year-input');
    const monthEl = document.getElementById('month-input');
    if (yearEl) yearEl.value = String(now.getFullYear());
    if (monthEl) {
        monthEl.innerHTML = '';
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = TURKISH_MONTHS[m - 1];
            monthEl.appendChild(opt);
        }
        monthEl.value = String(now.getMonth() + 1);
    }

    ensureTable();

    // Preload Excel library early so exports are not blocked.
    loadXLSXLibrary().catch((e) => {
        console.error('Failed to preload XLSX library:', e);
        xlsxLoadError = e;
    });

    document.getElementById('load-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadAndRender();
    });

    document.getElementById('download-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const year = Number(document.getElementById('year-input')?.value);
        const month = Number(document.getElementById('month-input')?.value);
        if (!Number.isFinite(year) || !Number.isFinite(month)) return;
        if (xlsxLoadError) {
            setStatus(xlsxLoadError?.message || 'Excel kütüphanesi yüklenemedi');
            return;
        }
        if (!xlsxReady) {
            setStatus('Excel kütüphanesi yükleniyor... Lütfen tekrar deneyin.');
            return;
        }
        setStatus('İndiriliyor...');
        const btn = document.getElementById('download-btn');
        if (btn) btn.disabled = true;
        try {
            await downloadFile(year, month);
            setStatus('İndirme başlatıldı');
        } catch (err) {
            setStatus(err?.message || String(err));
        } finally {
            if (btn) btn.disabled = false;
        }
    });
});

