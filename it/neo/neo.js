/**
 * Neo Kullanımı — who asks what, how much it costs, where the friction is.
 *
 * Built on the shared components (StatisticsCards, TableComponent,
 * FiltersComponent, DisplayModal), mirroring management/analytics.
 * Data comes from the assistant analytics endpoints, gated by the
 * manage_assistant_analytics permission (question logs are personal data);
 * this page is the one place that shows real USD figures.
 */
import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../components/notification/notification.js';
import { renderRichText } from '../../utils/richText.js';
import { escapeHtml } from '../../utils/text.js';
import {
    getAnalyticsConversation,
    getAnalyticsQuestions,
    getAnalyticsSummary,
} from '../../apis/assistant.js';
import {
    getAnalyticsDailySummaries,
    getAnalyticsDailySummary,
    regenerateDailySummary,
    runDailySummary,
} from '../../apis/dailySummary.js';
import {
    renderDailySummary,
    bindDailySummaryInteractions,
    ensureDailySummaryStyles,
    formatWindowLabel,
} from '../../components/daily-summary/render.js';

const OUTCOME_LABELS = {
    answered: 'Yanıtlandı',
    declined_budget: 'Bütçe reddi',
    declined_permission: 'Yetki reddi',
    error: 'Hata',
};

const TOOL_LABELS = {
    search_job_orders: 'İş emri arama',
    get_job_order_brief: 'İş emri özeti',
    get_job_order_hours: 'Çalışma saatleri',
    get_job_costs: 'Maliyetler',
    get_material_status: 'Malzeme durumu',
    get_discussions: 'Tartışmalar',
    get_my_mentions: 'Etiketlenmeler',
    get_my_summary: 'Kişisel özet',
    search_docs: 'Rehber arama',
    read_doc: 'Rehber okuma',
    get_daily_summary: 'Günlük özet',
};

// DailySummary.status → [label, badges.css class]; no yellow by house rule.
const SUMMARY_STATUS = {
    ok: ['Hazır', 'status-green'],
    empty: ['Aktivite yok', 'status-grey'],
    failed: ['Hata', 'status-red'],
    running: ['Üretiliyor', 'status-blue'],
};

const TRIGGER_LABELS = {
    schedule: 'Zamanlayıcı',
    workflow_dispatch: 'Elle (Actions)',
    command: 'Komut',
    api: 'Sayfa / API',
};

// run_daily_summary() status → [toast text, toast type]; 'failed' is
// handled separately because its message comes from the response.
const RUN_MESSAGES = {
    ok: ['Özet üretildi', 'success'],
    exists: ['Bugünün özeti zaten var', 'info'],
    empty: ['Aktivite yok', 'info'],
    already_running: ['Özet şu anda üretiliyor', 'info'],
    skipped_weekday: ['Hafta sonu: özet üretilmedi', 'info'],
    disabled: ['Günlük özet devre dışı', 'info'],
};

const PAGE_SIZE = 25;
const SUMMARY_COST_CARD_ID = 'neo-stat-summary-cost';
const SUMMARY_READ_CARD_ID = 'neo-stat-summary-read';

const state = {
    days: 30,
    q: '',
    page: 1,
    lastSummary: null,        // last analytics summary, re-used when only the summaries card reloads
    summaryRows: [],          // DailySummary analytics rows for the selected period
    regenerating: new Set(),  // DailySummary ids with a regenerate call in flight
};

let statsCards = null;
let usersTable = null;
let toolsTable = null;
let jobsTable = null;
let questionsTable = null;
let summariesTable = null;
let confirmModal = null;

function usd(value) {
    const n = Number.parseFloat(value);
    return `$${(Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Neo Kullanımı',
        subtitle: 'Kim neyi sordu, ne kadar kullandı — soru kayıtları, konu dağılımı ve maliyet',
        icon: 'robot',
        showBackButton: 'block',
        backUrl: '/it/',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onRefreshClick: () => loadAll(),
    });

    setupFilters();
    setupComponents();
    await loadAll();
});

// ---------------------------------------------------------------- set up

function setupFilters() {
    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtrele',
        applyButtonText: 'Uygula',
        clearButtonText: 'Temizle',
        onApply: (values) => {
            state.days = Number(values['neo-days']) || 30;
            state.q = (values['neo-q'] || '').trim();
            state.page = 1;
            loadAll();
        },
        onClear: () => {
            state.days = 30;
            state.q = '';
            state.page = 1;
            loadAll();
        },
    });

    filters.addDropdownFilter({
        id: 'neo-days',
        label: 'Dönem',
        options: [
            { value: '7', label: 'Son 7 gün' },
            { value: '30', label: 'Son 30 gün' },
            { value: '90', label: 'Son 90 gün' },
        ],
        placeholder: 'Son 30 gün',
        colSize: 3,
    });

    filters.addTextFilter({
        id: 'neo-q',
        label: 'Soru Ara',
        placeholder: 'Soru içinde ara...',
        colSize: 4,
    });
}

function setupComponents() {
    statsCards = new StatisticsCards('neo-stats', { cards: [], itemsPerRow: 6 });
    statsCards.showSkeletonLoading(6);
    ensureDailySummaryStyles();
    setupSummariesCard();

    usersTable = new TableComponent('neo-users-table', {
        columns: [
            {
                field: 'conversation__user__username', label: 'Kullanıcı', sortable: false,
                formatter: (v) => escapeHtml(v || '?'),
            },
            { field: 'messages', label: 'Soru', sortable: false, width: '70px' },
            {
                field: 'cost_usd', label: 'Maliyet', sortable: false, width: '110px',
                formatter: (v) => usd(v),
            },
            {
                field: 'thumbs_down', label: '👎', sortable: false, width: '60px',
                formatter: (v) => (v ? `<span class="text-danger">${v}</span>` : '0'),
            },
        ],
        data: [],
        small: true,
        emptyMessage: 'Kayıt yok',
    });

    toolsTable = new TableComponent('neo-tools-table', {
        columns: [
            {
                field: 'tool_name', label: 'Araç', sortable: false,
                formatter: (v) => escapeHtml(TOOL_LABELS[v] || v),
            },
            { field: 'calls', label: 'Çağrı', sortable: false, width: '70px' },
            {
                field: 'denied', label: 'Red', sortable: false, width: '60px',
                formatter: (v) => (v ? `<span class="text-danger">${v}</span>` : '0'),
            },
            {
                field: 'avg_duration_ms', label: 'Süre', sortable: false, width: '80px',
                formatter: (v) => (v == null ? '—' : `${Math.round(v)} ms`),
            },
        ],
        data: [],
        small: true,
        emptyMessage: 'Kayıt yok',
    });

    jobsTable = new TableComponent('neo-jobs-table', {
        columns: [
            {
                field: 'job_no', label: 'İş Emri', sortable: false,
                formatter: (v) => `<strong>${escapeHtml(v)}</strong>`,
            },
            { field: 'times_asked', label: 'Soru', sortable: false, width: '70px' },
        ],
        data: [],
        small: true,
        emptyMessage: 'Henüz iş emri bazlı soru yok',
    });

    questionsTable = new TableComponent('neo-questions-table', {
        columns: [
            {
                field: 'created_at', label: 'Zaman', sortable: false, width: '150px',
                formatter: (v) => new Date(v).toLocaleString('tr-TR'),
            },
            {
                field: 'user_full_name', label: 'Kullanıcı', sortable: false, width: '170px',
                formatter: (v, row) => escapeHtml(v || row.user || '?'),
            },
            {
                field: 'content', label: 'Soru', sortable: false,
                formatter: (v) => {
                    const text = v || '';
                    return escapeHtml(text.length > 160 ? `${text.slice(0, 160)}…` : text);
                },
            },
        ],
        data: [],
        small: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: PAGE_SIZE,
        totalItems: 0,
        emptyMessage: 'Soru kaydı yok',
        onRowClick: (row) => openConversationModal(row.conversation_id),
        onPageChange: (page) => {
            state.page = page;
            loadQuestions();
        },
    });
}

// ------------------------------------------------------------------ load

async function loadAll() {
    try {
        // loadSummaryRows never throws, so a missing/failed summaries endpoint
        // cannot take the rest of the page down with it.
        const [summary, summaryRows] = await Promise.all([
            getAnalyticsSummary(state.days),
            loadSummaryRows(),
        ]);
        state.lastSummary = summary;
        document.getElementById('neo-content').classList.remove('d-none');
        renderStats(summary, summaryRows);
        usersTable.updateData(summary.per_user, summary.per_user.length, 1);
        toolsTable.updateData(summary.per_tool, summary.per_tool.length, 1);
        jobsTable.updateData(summary.top_job_orders, summary.top_job_orders.length, 1);
        state.page = 1;
        await loadQuestions();
    } catch (error) {
        if (error.status === 403) {
            document.getElementById('neo-denied').classList.remove('d-none');
            document.getElementById('neo-content').classList.add('d-none');
            return;
        }
        console.error('Error loading Neo analytics:', error);
        showNotification(error.message || 'Kullanım özeti yüklenemedi.', 'error');
    }
}

function renderStats(summary, summaryRows = state.summaryRows) {
    const outcomes = Object.fromEntries(summary.outcomes.map((o) => [o.outcome, o.count]));
    const declined = (outcomes.declined_budget || 0) + (outcomes.declined_permission || 0);
    statsCards.setCards([
        {
            title: `Soru (${summary.days} gün)`,
            value: summary.questions.toLocaleString('tr-TR'),
            icon: 'fas fa-comments',
            color: 'primary',
        },
        {
            title: 'Aktif Kullanıcı',
            value: summary.active_users.toLocaleString('tr-TR'),
            icon: 'fas fa-users',
            color: 'info',
        },
        {
            title: 'Maliyet',
            value: usd(summary.total_cost_usd),
            icon: 'fas fa-coins',
            color: 'success',
        },
        {
            title: 'Ort. Yanıt Süresi',
            value: `${(summary.avg_latency_ms / 1000).toFixed(1)} sn`,
            icon: 'fas fa-stopwatch',
            color: 'secondary',
        },
        {
            title: declined ? `Geri Bildirim · ${declined} red` : 'Geri Bildirim',
            value: `${summary.feedback.up} 👍 · ${summary.feedback.down} 👎`,
            icon: 'fas fa-thumbs-up',
            color: 'secondary',
        },
        {
            id: SUMMARY_COST_CARD_ID,
            title: 'Günlük Özet maliyeti',
            value: usd(sumSummaryCost(summaryRows)),
            icon: 'fas fa-newspaper',
            color: 'dark',
        },
        {
            id: SUMMARY_READ_CARD_ID,
            title: 'Ort. okuma süresi',
            value: readSecondsLabel(avgReadSeconds(summaryRows)),
            icon: 'fas fa-book-open-reader',
            color: 'info',
        },
    ]);
}

async function loadQuestions() {
    try {
        const data = await getAnalyticsQuestions({
            days: state.days, q: state.q, page: state.page, pageSize: PAGE_SIZE,
        });
        const rows = data.results || data;
        const count = data.count ?? rows.length;
        questionsTable.updateData(rows, count, state.page);
    } catch (error) {
        console.error('Error loading Neo questions:', error);
        showNotification(error.message || 'Soru kayıtları yüklenemedi.', 'error');
    }
}

// ----------------------------------------------------------------- modal

async function openConversationModal(conversationId) {
    try {
        const detail = await getAnalyticsConversation(conversationId);
        const modal = new DisplayModal('neo-modal-container', {
            title: `${detail.user} — ${detail.title || `Sohbet #${detail.id}`}`,
            icon: 'fas fa-comments',
            size: 'lg',
        });
        modal.addCustomSection({
            title: 'Sohbet Dökümü',
            icon: 'fas fa-comments',
            customContent:
                detail.messages.map(renderTranscriptMessage).join('') ||
                '<div class="text-muted">Mesaj yok.</div>',
        });
        modal.render().show();
    } catch (error) {
        showNotification(error.message || 'Sohbet yüklenemedi.', 'error');
    }
}

function renderTranscriptMessage(message) {
    const isUser = message.role === 'user';
    const meta = [];
    if (!isUser) {
        meta.push(OUTCOME_LABELS[message.outcome] || message.outcome);
        meta.push(`$${Number(message.cost_usd || 0).toFixed(4)}`);
        if (message.latency_ms != null) meta.push(`${(message.latency_ms / 1000).toFixed(1)} sn`);
        if (message.feedback === 1) meta.push('👍');
        if (message.feedback === -1) meta.push('👎');
        for (const call of message.tool_calls || []) {
            const label = TOOL_LABELS[call.tool_name] || call.tool_name;
            meta.push(
                `${label}${call.job_no ? ` (${call.job_no})` : ''}${call.allowed ? '' : ' — reddedildi'}`,
            );
        }
    }
    return `
        <div class="neo-msg ${isUser ? 'user' : 'assistant'}">
            <div class="neo-msg-role">${isUser ? 'Soru' : 'Neo'}</div>
            <div class="rich-text">${renderRichText(message.content)}</div>
            ${meta.length ? `<div class="neo-msg-meta">${meta.map(escapeHtml).map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
        </div>`;
}

// ------------------------------------------------------ daily summaries
// Generation log for the company-wide "Günlük Özet": one row per
// DailySummary with its ledger, plus run/regenerate controls. Reads are
// analytics-only data, so this card shares the page's permission gate.

function setupSummariesCard() {
    summariesTable = new TableComponent('neo-summaries-table', {
        columns: [
            {
                field: 'summary_date', label: 'Tarih', sortable: false, width: '130px',
                formatter: (v) => `<strong>${escapeHtml(formatSummaryDate(v))}</strong>`,
            },
            {
                field: 'status', label: 'Durum', sortable: false, width: '110px',
                formatter: (v) => summaryStatusChip(v),
            },
            {
                field: 'headline', label: 'Başlık', sortable: false,
                formatter: (v, row) => summaryHeadlineCell(v, row),
            },
            {
                field: 'model', label: 'Model', sortable: false, width: '130px',
                formatter: (v) => escapeHtml(v || '—'),
            },
            {
                field: 'input_tokens', label: 'Token (giriş / çıkış)', sortable: false, width: '150px',
                formatter: (v, row) => summaryTokensCell(row),
            },
            {
                field: 'cost_usd', label: 'Maliyet', sortable: false, width: '90px',
                formatter: (v) => usd(v),
            },
            {
                field: 'read_count', label: 'Okuma', sortable: false, width: '70px',
                formatter: (v) => Number(v || 0).toLocaleString('tr-TR'),
            },
            {
                field: 'avg_read_seconds', label: 'Ort. okuma', sortable: false, width: '90px',
                formatter: (v) => readSecondsLabel(v),
            },
            {
                field: 'expand_rate', label: 'Detay %', sortable: false, width: '80px',
                formatter: (v) => expandRateLabel(v),
            },
            {
                field: 'latency_ms', label: 'Süre', sortable: false, width: '75px',
                formatter: (v) => (v == null ? '—' : `${(v / 1000).toFixed(1)} sn`),
            },
            { field: 'attempts', label: 'Deneme', sortable: false, width: '70px' },
            {
                field: 'triggered_by', label: 'Tetik', sortable: false, width: '110px',
                formatter: (v) => escapeHtml(TRIGGER_LABELS[v] || v || '—'),
            },
        ],
        actions: [
            {
                key: 'view', label: 'Görüntüle', icon: 'fas fa-eye', class: 'btn-outline-primary',
                onClick: (row) => openSummaryModal(row.id),
            },
            {
                key: 'regenerate', label: 'Yeniden üret', icon: 'fas fa-arrows-rotate',
                class: 'btn-outline-secondary',
                visible: (row) => !state.regenerating.has(row.id),
                onClick: (row) => confirmRegenerate(row),
            },
            {
                // Spinner stand-in while the synchronous regenerate call (30–120 s)
                // runs; the no-op onClick keeps the click from bubbling to onRowClick.
                key: 'regenerating', label: 'Yeniden üretiliyor…', icon: 'fas fa-spinner fa-spin',
                class: 'btn-outline-secondary',
                visible: (row) => state.regenerating.has(row.id),
                onClick: () => {},
            },
        ],
        data: [],
        small: true,
        emptyMessage: 'Henüz günlük özet üretilmedi',
        onRowClick: (row) => openSummaryModal(row.id),
    });

    confirmModal = new ConfirmationModal('neo-confirm-container', {
        title: 'Özeti yeniden üret',
        icon: 'fas fa-arrows-rotate',
        confirmText: 'Yeniden üret',
        confirmButtonClass: 'btn-primary',
    });

    const runBtn = document.getElementById('neo-summary-run-btn');
    if (runBtn) runBtn.addEventListener('click', () => runTodaySummary(runBtn));
}

/** Loads the period's rows into the table; never throws (see loadAll). */
async function loadSummaryRows() {
    try {
        const rows = await getAnalyticsDailySummaries({ days: state.days });
        state.summaryRows = Array.isArray(rows) ? rows : (rows?.results || []);
    } catch (error) {
        state.summaryRows = [];
        // 403 is already surfaced by the page-level guard in loadAll.
        if (error.status !== 403) {
            console.error('Error loading daily summaries:', error);
            showNotification(error.message || 'Günlük özetler yüklenemedi.', 'error');
        }
    }
    summariesTable.updateData(state.summaryRows, state.summaryRows.length, 1);
    return state.summaryRows;
}

/** Re-fetches the summaries and refreshes only their two cards (no re-animation). */
async function reloadSummaries() {
    const rows = await loadSummaryRows();
    if (state.lastSummary) {
        statsCards.updateCardById(SUMMARY_COST_CARD_ID, { value: usd(sumSummaryCost(rows)) });
        statsCards.updateCardById(SUMMARY_READ_CARD_ID, {
            value: readSecondsLabel(avgReadSeconds(rows)),
        });
    }
}

function sumSummaryCost(rows) {
    return (rows || []).reduce((acc, row) => {
        const n = Number.parseFloat(row.cost_usd);
        return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
}

/** Plain mean of the per-summary averages; null until some read carried metrics. */
function avgReadSeconds(rows) {
    const values = (rows || [])
        .map((row) => Number.parseFloat(row.avg_read_seconds))
        .filter(Number.isFinite);
    if (!values.length) return null;
    return values.reduce((acc, n) => acc + n, 0) / values.length;
}

async function runTodaySummary(button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" style="width:0.8rem;height:0.8rem"></span>Üretiliyor…';
    try {
        const result = await runDailySummary({ force: false });
        notifyRunResult(result, result?.error);
    } catch (error) {
        showNotification(error.message || 'Özet üretilemedi.', 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }
    await reloadSummaries();
}

function confirmRegenerate(row) {
    confirmModal.show({
        title: 'Özeti yeniden üret',
        message: `${formatSummaryDate(row.summary_date)} özeti yeniden üretilsin mi?`,
        description: 'Mevcut özet yeni sürümle değiştirilir, okundu bilgileri korunur. '
            + 'İşlem 1–2 dakika sürebilir ve API maliyeti oluşturur.',
        confirmText: 'Yeniden üret',
        // Returns nothing on purpose: the modal closes at once and the table
        // row carries the spinner instead of the dialog blocking for minutes.
        onConfirm: () => { regenerateSummary(row); },
    });
}

async function regenerateSummary(row) {
    state.regenerating.add(row.id);
    summariesTable.updateData(state.summaryRows);
    try {
        const result = await regenerateDailySummary(row.id, { resetReads: false });
        notifyRunResult(result, result?.error_detail, 'Özet yeniden üretildi');
    } catch (error) {
        showNotification(error.message || 'Özet yeniden üretilemedi.', 'error');
    } finally {
        state.regenerating.delete(row.id);
    }
    await reloadSummaries();
}

/** One toast for both run and regenerate responses (task body or AnalyticsRow). */
function notifyRunResult(result, failureDetail, okText) {
    const status = result?.status;
    if (status === 'failed') {
        showNotification(failureDetail || 'Özet üretilemedi.', 'error');
        return;
    }
    const entry = RUN_MESSAGES[status];
    if (entry) {
        showNotification(status === 'ok' && okText ? okText : entry[0], entry[1]);
        return;
    }
    showNotification(`Durum: ${status || 'bilinmiyor'}`, 'info');
}

async function openSummaryModal(summaryId) {
    try {
        const detail = await getAnalyticsDailySummary(summaryId);
        const modal = new DisplayModal('neo-modal-container', {
            title: `Günlük Özet · ${formatSummaryDate(detail.summary_date)}`,
            icon: 'fas fa-newspaper',
            size: 'xl',
        });
        modal.addCustomSection({ customContent: renderSummaryMeta(detail) });

        if (detail.status === 'ok') {
            modal.addCustomSection({
                customContent: `<div class="neo-summary-body">${renderDailySummary(detail)}</div>`,
            });
        } else if (detail.status === 'empty') {
            modal.addCustomSection({
                customContent: '<div class="text-muted">Bu pencerede kayda değer bir hareket yok; model çağrısı yapılmadı.</div>',
            });
        } else if (detail.status === 'failed') {
            modal.addCustomSection({
                title: 'Hata',
                icon: 'fas fa-triangle-exclamation',
                iconColor: 'text-danger',
                customContent: `<pre class="small mb-0" style="white-space:pre-wrap">${escapeHtml(detail.error_detail || 'Ayrıntı yok.')}</pre>`,
            });
        } else {
            modal.addCustomSection({
                customContent: '<div class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>Özet şu anda üretiliyor.</div>',
            });
        }

        const warnings = Array.isArray(detail.warnings) ? detail.warnings : [];
        if (warnings.length) {
            modal.addCustomSection({
                title: `Uyarılar (${warnings.length})`,
                icon: 'fas fa-circle-info',
                iconColor: 'text-secondary',
                customContent: `<ul class="small mb-0">${warnings.map((w) => `<li>${escapeHtml(String(w))}</li>`).join('')}</ul>`,
            });
        }

        modal.render().show();
        bindDailySummaryInteractions(document.getElementById('neo-modal-container'));
    } catch (error) {
        showNotification(error.message || 'Özet yüklenemedi.', 'error');
    }
}

/** Ledger strip at the top of the modal — the only place users see summary USD. */
function renderSummaryMeta(detail) {
    const items = [
        ['Pencere', safeWindowLabel(detail)],
        ['Model', detail.model || '—'],
        ['Token', `${fmtInt(detail.input_tokens)} giriş · ${fmtInt(detail.output_tokens)} çıkış`
            + (detail.cache_read_tokens ? ` · ${fmtInt(detail.cache_read_tokens)} önbellek` : '')],
        ['Maliyet', usd(detail.cost_usd)],
        ['Süre', detail.latency_ms == null ? '—' : `${(detail.latency_ms / 1000).toFixed(1)} sn`],
        ['Deneme', fmtInt(detail.attempts)],
        ['Tetik', TRIGGER_LABELS[detail.triggered_by] || detail.triggered_by || '—'],
        ['Üretildi', detail.generated_at ? formatDateTime(detail.generated_at) : '—'],
        ['Okuma', fmtInt(detail.read_count)],
        ['Ort. okuma', readSecondsLabel(detail.avg_read_seconds)],
        ['Detay', expandRateLabel(detail.expand_rate)],
    ];
    if (detail.redactions) items.push(['Sansürlenen', fmtInt(detail.redactions)]);
    if (detail.facts_chars) items.push(['Girdi metni', `${fmtInt(detail.facts_chars)} karakter`]);

    return `
        <div class="d-flex flex-wrap align-items-center gap-2 small mb-1">
            ${summaryStatusChip(detail.status)}
            ${items.map(([label, value]) => `
                <span class="text-muted"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</span>
            `).join('')}
        </div>`;
}

// ---- formatters (tr-TR, Istanbul) ----

function summaryStatusChip(status) {
    const [label, cls] = SUMMARY_STATUS[status] || [status || '?', 'status-grey'];
    return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

function summaryHeadlineCell(headline, row) {
    if (row.status === 'failed') {
        const text = row.error_detail || 'Hata ayrıntısı yok';
        return `<span class="text-danger" title="${escapeHtml(text)}">${escapeHtml(truncate(text, 90))}</span>`;
    }
    if (!headline) return '<span class="text-muted">—</span>';
    return `<span title="${escapeHtml(headline)}">${escapeHtml(truncate(headline, 90))}</span>`;
}

function summaryTokensCell(row) {
    const title = row.cache_read_tokens || row.cache_write_tokens
        ? `Önbellek okuma ${fmtInt(row.cache_read_tokens)} · yazma ${fmtInt(row.cache_write_tokens)}`
        : '';
    return `<span title="${escapeHtml(title)}">${fmtInt(row.input_tokens)} / ${fmtInt(row.output_tokens)}</span>`;
}

function safeWindowLabel(detail) {
    try {
        return formatWindowLabel(detail) || '—';
    } catch (e) {
        return '—';
    }
}

function fmtInt(value) {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR');
}

/** avg_read_seconds → '42 sn'; '—' while no read of that summary carried metrics. */
function readSecondsLabel(value) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? `${Math.round(n)} sn` : '—';
}

/** expand_rate (0..1) → '35%'; '—' when null. */
function expandRateLabel(value) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
}

function truncate(text, max) {
    const s = String(text || '');
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 'YYYY-MM-DD' → '22.09.2026 Pzt'; parsed by parts so no UTC shift creeps in. */
function formatSummaryDate(value) {
    if (!value) return '—';
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return String(value);
    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short',
    });
}

function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}
