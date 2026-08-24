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
import { showNotification } from '../../components/notification/notification.js';
import { renderRichText } from '../../utils/richText.js';
import { escapeHtml } from '../../utils/text.js';
import {
    getAnalyticsConversation,
    getAnalyticsQuestions,
    getAnalyticsSummary,
} from '../../apis/assistant.js';

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
};

const PAGE_SIZE = 25;

const state = {
    days: 30,
    q: '',
    page: 1,
};

let statsCards = null;
let usersTable = null;
let toolsTable = null;
let jobsTable = null;
let questionsTable = null;

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
    statsCards = new StatisticsCards('neo-stats', { cards: [], itemsPerRow: 5 });
    statsCards.showSkeletonLoading(5);

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
        const summary = await getAnalyticsSummary(state.days);
        document.getElementById('neo-content').classList.remove('d-none');
        renderStats(summary);
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

function renderStats(summary) {
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
            color: 'warning',
        },
        {
            title: declined ? `Geri Bildirim · ${declined} red` : 'Geri Bildirim',
            value: `${summary.feedback.up} 👍 · ${summary.feedback.down} 👎`,
            icon: 'fas fa-thumbs-up',
            color: 'secondary',
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
