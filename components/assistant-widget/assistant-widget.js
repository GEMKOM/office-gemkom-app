/**
 * Asistan widget — a floating chat panel available on every page.
 *
 * Mounted by the navbar (initNavbar → initAssistantWidget), so any page that
 * renders the navbar gets the launcher + panel for free; no per-page wiring.
 * Open/closed state and the active conversation live in sessionStorage, so
 * navigating between pages keeps the chat exactly where it was.
 *
 * Streams answers over SSE (fetch + ReadableStream). Authorization lives in
 * the backend's tool layer — this widget only renders what the API releases.
 */
import { isImpersonating, isLoggedIn } from '../../authService.js';
import { showNotification } from '../notification/notification.js';
import { renderRichText } from '../../utils/richText.js';
import { escapeHtml } from '../../utils/text.js';
import {
    archiveConversation,
    getAssistantQuota,
    getConversation,
    listConversations,
    sendMessageFeedback,
    streamChat,
} from '../../apis/assistant.js';
import {
    createFeedbackReport,
    listMyFeedbackReports,
    respondFeedbackReport,
} from '../../apis/feedback.js';
import { getDailySummary, listDailySummaries } from '../../apis/dailySummary.js';
import { ensureDailySummaryStyles, relativeDayLabel } from '../daily-summary/render.js';

// The popup lives in daily-summary.js, whose first release exported only
// initDailySummary. A static named import of openDailySummaryModal is a
// link-time SyntaxError against a cached old copy and would take the whole
// widget down with it; a dynamic import degrades to null instead.
function loadSummaryModal() {
    return import('../daily-summary/daily-summary.js')
        .then((mod) => (typeof mod.openDailySummaryModal === 'function' ? mod.openDailySummaryModal : null))
        .catch(() => null);
}

const STORAGE_OPEN = 'assistantOpen';
const STORAGE_CONVERSATION = 'assistantConversationId';

// Report id from a bell-notification deep link (/?bildirim=<id>), if any.
const DEEPLINK_REPORT_ID = Number(
    new URLSearchParams(window.location.search).get('bildirim'),
) || null;

// Daily-summary id from a deep link (/?ozet=<id>), if any.
const DEEPLINK_SUMMARY_ID = Number(
    new URLSearchParams(window.location.search).get('ozet'),
) || null;

const TOOL_LABELS = {
    search_job_orders: 'İş emri aranıyor',
    get_job_order_brief: 'İş emri özeti alınıyor',
    get_job_order_hours: 'Çalışma saatleri alınıyor',
    get_job_costs: 'Maliyetler alınıyor',
    get_material_status: 'Malzeme durumu alınıyor',
    get_discussions: 'Tartışmalar okunuyor',
    get_my_mentions: 'Etiketlenmeler alınıyor',
    get_my_summary: 'Kişisel özet alınıyor',
    get_daily_summary: 'Günlük özet okunuyor',
    search_docs: 'Rehber dokümanlar aranıyor',
    read_doc: 'Rehber okunuyor',
};

const SUGGESTIONS = [
    'Dün neler oldu?',
    'İş emri nasıl açılır?',
    'Aktif iş emirlerini listele',
    'Bu ay kaç saat çalışmışım?',
    'İzin bakiyem ne durumda?',
];

// Report statuses → chip color + label (backend feedback.FeedbackReport).
const REPORT_STATUS_META = {
    new: { label: 'Yeni', cls: 'grey' },
    analyzed: { label: 'İncelendi', cls: 'purple' },
    needs_info: { label: 'Bilgi Bekleniyor', cls: 'orange' },
    duplicate: { label: 'Yinelenen', cls: 'grey' },
    queued: { label: 'Kuyruğa Alındı', cls: 'blue' },
    in_review: { label: 'İncelemede', cls: 'orange' },
    done: { label: 'Tamamlandı', cls: 'green' },
    dismissed: { label: 'Reddedildi', cls: 'grey' },
    failed: { label: 'Başarısız', cls: 'red' },
};

const REPORT_KIND_ICONS = {
    bug: 'fa-bug',
    feature: 'fa-lightbulb',
    improvement: 'fa-arrow-trend-up',
    other: 'fa-comment-dots',
};

// How many reports the history list shows before the "tümünü göster" button.
const REPORT_PAGE_SIZE = 5;

const state = {
    open: false,
    expanded: false,
    view: 'chat',
    conversationId: null,
    streaming: false,
    conversations: [],
    bootstrapped: false,
    locked: false,
    reportSending: false,
    reports: [],
    reportsExpanded: false,
    summaries: [],
    summaryCache: {},          // id → Promise<Detail>, so a double click fetches once
    summaryPendingOpen: false, // pop the pending row's popup too (deep links only)
    summariesLoaded: false,
    summariesLoading: false,
    summariesDays: 0,          // 30 after the first load, 90 after "Daha eski özetler"
    summaryPendingId: null,    // row to open once the list holds it (deep link / modal)
    unreadSummary: null,       // {id, summary_date} while the launcher dot shows
    unreadRedirected: false,   // the dot's "first click lands on the pane" already used
};

const el = {};

export function initAssistantWidget(launcherMount) {
    if (window.__assistantWidgetInit) return;
    if (!isLoggedIn()) return;
    window.__assistantWidgetInit = true;

    injectStyles();
    buildLauncher(launcherMount);
    buildPanel();

    // The daily-summary modal drives the widget through this event; the flag
    // tells it the summaries pane exists (stale widget code → no button).
    document.addEventListener('assistant:open', onAssistantOpenEvent);
    window.__assistantSummariesReady = true;
    // Unread-latest signal from the same module (fires after its async check,
    // so registering here is early enough); the dot lives on the launcher.
    document.addEventListener('daily-summary:unread', onSummaryUnreadEvent);
    document.addEventListener('daily-summary:read', onSummaryReadEvent);

    state.conversationId = Number(sessionStorage.getItem(STORAGE_CONVERSATION)) || null;
    if (sessionStorage.getItem(STORAGE_OPEN) === '1') {
        openPanel({ instant: true });
    }

    // Bell-notification deep link ("Neo bildiriminizle ilgili bilgi istiyor"
    // links to /?bildirim=<id>): open straight into the report view.
    if (new URLSearchParams(window.location.search).has('bildirim')) {
        openPanel({ instant: true });
        toggleReportView();
    }

    // Daily-summary deep link (/?ozet=<id>): open straight onto that summary.
    if (DEEPLINK_SUMMARY_ID) {
        openPanel({ instant: true });
        showSummariesView(DEEPLINK_SUMMARY_ID, { open: true });
    }
}

function onAssistantOpenEvent(event) {
    const detail = (event && event.detail) || {};
    openPanel();
    if (detail.view === 'summaries') {
        showSummariesView(Number(detail.summaryId) || null);
        return;
    }
    showChatView();
    if (detail.prefill && !state.locked) {
        el.input.value = String(detail.prefill);
        el.input.dispatchEvent(new Event('input'));  // autosize
        el.input.focus();
    }
}

// ------------------------------------------------------------------ mount

function injectStyles() {
    if (document.querySelector('link[data-assistant-widget]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/components/assistant-widget/assistant-widget.css';
    link.dataset.assistantWidget = '1';
    document.head.appendChild(link);
}

function buildLauncher(mount) {
    if (!mount) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assistant-launcher';
    button.title = 'Neo — her sayfadan soru sorun';
    button.innerHTML =
        '<i class="fas fa-robot"></i><span class="al-label">Neo</span>' +
        '<i class="fas fa-wand-magic-sparkles al-spark"></i>';
    button.addEventListener('click', () => onLauncherClick());
    mount.appendChild(button);
    el.launcher = button;
}

// While the unread dot shows, the first click lands on the summaries pane
// instead of chat — once; after that the launcher is a plain toggle again.
function onLauncherClick() {
    if (!state.open && state.unreadSummary && !state.unreadRedirected) {
        state.unreadRedirected = true;
        openPanel();
        showSummariesView(state.unreadSummary.id);
        return;
    }
    togglePanel();
}

// ------------------------------------------------------ launcher badge

// Idempotent: one dot at most, appended to the launcher, removed on read.
function setLauncherBadge(on) {
    if (!el.launcher) return;
    const dot = el.launcher.querySelector('.al-badge');
    if (on && !dot) {
        const badge = document.createElement('span');
        badge.className = 'al-badge';
        badge.title = 'Bugünün özeti okunmadı';
        el.launcher.appendChild(badge);
    } else if (!on && dot) {
        dot.remove();
    }
}

function onSummaryUnreadEvent(event) {
    const detail = (event && event.detail) || {};
    const id = Number(detail.id) || null;
    if (!id) return;
    // A newer unread summary re-arms the one-time redirect.
    if (!state.unreadSummary || state.unreadSummary.id !== id) state.unreadRedirected = false;
    state.unreadSummary = { id, summary_date: detail.summary_date || null };
    setLauncherBadge(true);
}

function onSummaryReadEvent(event) {
    const detail = (event && event.detail) || {};
    const id = Number(detail.id) || null;
    // Reads of older summaries (pane, deep link) leave the dot alone.
    if (!id || !state.unreadSummary || state.unreadSummary.id === id) {
        state.unreadSummary = null;
        setLauncherBadge(false);
    }
    if (id) markPaneRowRead(id);
}

// A summary read outside the pane (morning popup, deep link) still has to
// drop its 'Yeni' chip if the list is already rendered.
function markPaneRowRead(id) {
    const summary = state.summaries.find((row) => Number(row.id) === id);
    if (summary) summary.is_read = true;
    const chip = el.summariesList
        && el.summariesList.querySelector(`[data-summary-id="${id}"] .summary-new`);
    if (chip) chip.remove();
}

function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'assistant-panel';
    panel.innerHTML = `
        <div class="aw-header">
            <span class="aw-title"><i class="fas fa-robot"></i> Neo</span>
            <button type="button" class="aw-btn" data-action="summaries" title="Günlük özetler"><i class="fas fa-newspaper"></i></button>
            <button type="button" class="aw-btn" data-action="report" title="Hata / öneri bildir"><i class="fas fa-bug"></i></button>
            <button type="button" class="aw-btn" data-action="history" title="Sohbet geçmişi"><i class="fas fa-history"></i></button>
            <button type="button" class="aw-btn" data-action="new" title="Yeni sohbet"><i class="fas fa-plus"></i></button>
            <button type="button" class="aw-btn d-none d-sm-inline-block" data-action="expand" title="Genişlet"><i class="fas fa-expand"></i></button>
            <button type="button" class="aw-btn" data-action="close" title="Kapat"><i class="fas fa-times"></i></button>
        </div>
        <div class="aw-body">
            <div class="aw-messages"></div>
            <div class="aw-history" style="display:none">
                <div class="aw-history-title"><i class="fas fa-comments me-2"></i>Sohbetler</div>
                <div class="aw-history-list"></div>
            </div>
            <div class="aw-report" style="display:none">
                <div class="aw-report-title"><i class="fas fa-bug me-2"></i>Hata / Öneri Bildir</div>
                <form class="aw-report-form">
                    <select class="form-select form-select-sm" name="kind" aria-label="Bildirim türü">
                        <option value="bug">Hata</option>
                        <option value="feature">Özellik İsteği</option>
                        <option value="improvement">İyileştirme</option>
                        <option value="other">Diğer</option>
                    </select>
                    <input class="form-control form-control-sm" name="title" maxlength="200"
                           placeholder="Kısa başlık" required>
                    <textarea class="form-control form-control-sm" name="description" rows="5" maxlength="8000"
                              placeholder="Sorunu veya isteği anlatın: Hangi sayfada? Ne yaptınız? Ne oldu, ne olmalıydı?"
                              required></textarea>
                    <button type="submit" class="aw-report-submit">
                        <i class="fas fa-paper-plane me-1"></i>Gönder
                    </button>
                </form>
                <div class="aw-report-note">
                    Bildiriminiz yapay zekâ tarafından incelenir; uygun görülenler otomatik
                    olarak geliştirme kuyruğuna alınır. Durumunu aşağıdan takip edebilirsiniz.
                </div>
                <div class="aw-report-list-title">Bildirim Geçmişim</div>
                <div class="aw-report-list"></div>
            </div>
            <div class="aw-summaries" style="display:none">
                <div class="aw-summaries-title"><i class="fas fa-newspaper me-2"></i>Günlük Özetler</div>
                <div class="aw-summaries-list"></div>
            </div>
            <div class="aw-input-area">
                <form>
                    <textarea class="form-control" rows="1" maxlength="4000"
                              placeholder="Sorunuzu yazın..."></textarea>
                    <button class="aw-send-btn" type="submit" title="Gönder">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </form>
                <div class="aw-footnotes">
                    <span class="aw-quota"></span>
                    <span>Sorular kayıt altına alınır · Neo hata yapabilir</span>
                </div>
            </div>
        </div>`;
    document.body.appendChild(panel);

    el.panel = panel;
    el.messages = panel.querySelector('.aw-messages');
    el.history = panel.querySelector('.aw-history');
    el.historyList = panel.querySelector('.aw-history-list');
    el.inputArea = panel.querySelector('.aw-input-area');
    // Scope to the chat input area: the report pane has its own form/textarea.
    el.form = panel.querySelector('.aw-input-area form');
    el.input = panel.querySelector('.aw-input-area textarea');
    el.sendBtn = panel.querySelector('.aw-send-btn');
    el.quotaLine = panel.querySelector('.aw-quota');
    el.historyBtn = panel.querySelector('[data-action="history"]');
    el.expandBtn = panel.querySelector('[data-action="expand"]');
    el.report = panel.querySelector('.aw-report');
    el.reportBtn = panel.querySelector('[data-action="report"]');
    el.reportForm = panel.querySelector('.aw-report-form');
    el.reportList = panel.querySelector('.aw-report-list');
    el.summaries = panel.querySelector('.aw-summaries');
    el.summariesBtn = panel.querySelector('[data-action="summaries"]');
    el.summariesList = panel.querySelector('.aw-summaries-list');

    panel.querySelector('[data-action="close"]').addEventListener('click', () => closePanel());
    panel.querySelector('[data-action="new"]').addEventListener('click', () => startNewChat());
    el.historyBtn.addEventListener('click', () => toggleHistoryView());
    el.reportBtn.addEventListener('click', () => toggleReportView());
    el.summariesBtn.addEventListener('click', () => toggleSummariesView());
    el.reportForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitReport();
    });
    el.expandBtn.addEventListener('click', () => {
        state.expanded = !state.expanded;
        panel.classList.toggle('expanded', state.expanded);
        el.expandBtn.innerHTML = `<i class="fas fa-${state.expanded ? 'compress' : 'expand'}"></i>`;
    });

    el.form.addEventListener('submit', (event) => {
        event.preventDefault();
        sendCurrentInput();
    });
    el.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendCurrentInput();
        }
    });
    el.input.addEventListener('input', () => {
        el.input.style.height = 'auto';
        el.input.style.height = `${Math.min(el.input.scrollHeight, 120)}px`;
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.open) closePanel();
    });
}

// ------------------------------------------------------------ open / close

function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
}

function openPanel({ instant = false } = {}) {
    state.open = true;
    sessionStorage.setItem(STORAGE_OPEN, '1');
    if (instant) {
        el.panel.style.transition = 'none';
        el.panel.classList.add('open');
        requestAnimationFrame(() => { el.panel.style.transition = ''; });
    } else {
        el.panel.classList.add('open');
    }
    if (!state.bootstrapped) {
        state.bootstrapped = true;
        bootstrap();
    }
    if (!instant) el.input.focus();
}

function closePanel() {
    state.open = false;
    sessionStorage.setItem(STORAGE_OPEN, '');
    el.panel.classList.remove('open');
}

async function bootstrap() {
    const hasAccess = await refreshQuota();
    if (!hasAccess) {
        state.locked = true;  // chat kapalı; hata/öneri bildirimi yine açık
        window.__assistantLocked = true;  // the daily-summary modal hides "Neo'ya sor" on this
        el.messages.innerHTML =
            '<div class="aw-muted-block"><i class="fas fa-lock me-1"></i> ' +
            "Neo'ya erişiminiz kapatılmış görünüyor. Gerekli olduğunu düşünüyorsanız " +
            'yöneticinizle görüşün.</div>';
        el.inputArea.style.display = 'none';
        el.historyBtn.style.display = 'none';
        return;
    }
    if (state.conversationId) {
        const ok = await openConversation(state.conversationId, { silent: true });
        if (ok) return;
    }
    // keepView: the user may already have switched to the report/history pane
    // while this bootstrap was in flight — don't yank them back to chat.
    startNewChat({ keepPanel: true, keepView: true });
}

// ------------------------------------------------------------------ quota

async function refreshQuota() {
    try {
        const quota = await getAssistantQuota();
        el.quotaLine.textContent =
            `Bu ay: ${quota.used_credits.toLocaleString('tr-TR')}/${quota.monthly_limit_credits.toLocaleString('tr-TR')} kredi · ` +
            `Bugün: ${quota.messages_today}/${quota.daily_message_limit}`;
        if (!quota.allowed && !state.streaming) {
            el.input.disabled = true;
            el.sendBtn.disabled = true;
            el.input.placeholder = 'Günlük veya aylık limitinize ulaştınız.';
        }
        return true;
    } catch (error) {
        if (error.status === 403) return false;
        console.error('Error fetching assistant quota:', error);
        return true; // cosmetic; the chat call enforces for real
    }
}

// ------------------------------------------------------------------ views

// One switch for the four panes; the toggle functions below stay as thin
// wrappers so their call sites (bootstrap, list clicks, send) are unchanged.
function setView(view) {
    state.view = view;
    el.messages.style.display = view === 'chat' ? 'flex' : 'none';
    el.history.style.display = view === 'history' ? 'block' : 'none';
    el.report.style.display = view === 'report' ? 'block' : 'none';
    el.summaries.style.display = view === 'summaries' ? 'block' : 'none';
    // Locked users keep chat input hidden (bootstrap) but can still report
    // and read the daily summaries.
    el.inputArea.style.display = view === 'chat' && !state.locked ? 'block' : 'none';
    el.historyBtn.classList.toggle('active', view === 'history');
    el.reportBtn.classList.toggle('active', view === 'report');
    el.summariesBtn.classList.toggle('active', view === 'summaries');
}

function showChatView() {
    setView('chat');
}

// ---------------------------------------------------------------- history

function toggleHistoryView() {
    if (state.view === 'history') {
        showChatView();
        return;
    }
    setView('history');
    refreshConversationList();
}

async function refreshConversationList() {
    try {
        state.conversations = await listConversations();
        renderConversationList();
    } catch (error) {
        el.historyList.innerHTML =
            '<div class="aw-muted-block">Sohbetler yüklenemedi.</div>';
    }
}

function renderConversationList() {
    if (!state.conversations.length) {
        el.historyList.innerHTML =
            '<div class="aw-muted-block">Henüz sohbet yok. İlk sorunuzu sorun!</div>';
        return;
    }

    el.historyList.innerHTML = '';
    for (const conversation of state.conversations) {
        const item = document.createElement('div');
        item.className = 'conversation-item' +
            (conversation.id === state.conversationId ? ' active' : '');

        const title = document.createElement('span');
        title.className = 'conv-title';
        title.textContent = conversation.title || `Sohbet #${conversation.id}`;
        title.title = conversation.title || '';

        const date = document.createElement('span');
        date.className = 'conv-date';
        date.textContent = new Date(conversation.updated_at).toLocaleDateString('tr-TR');

        const archiveBtn = document.createElement('button');
        archiveBtn.type = 'button';
        archiveBtn.className = 'conv-archive';
        archiveBtn.title = 'Arşivle';
        archiveBtn.innerHTML = '<i class="fas fa-trash"></i>';
        archiveBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (state.streaming) return;
            if (!confirm('Bu sohbet arşivlensin mi?')) return;
            try {
                await archiveConversation(conversation.id);
                if (conversation.id === state.conversationId) {
                    startNewChat({ keepPanel: true });
                }
                await refreshConversationList();
            } catch (error) {
                showNotification('Sohbet arşivlenemedi.', 'error');
            }
        });

        item.appendChild(title);
        item.appendChild(date);
        item.appendChild(archiveBtn);
        item.addEventListener('click', async () => {
            if (state.streaming) return;
            const ok = await openConversation(conversation.id);
            if (ok) showChatView();
        });
        el.historyList.appendChild(item);
    }
}

async function openConversation(conversationId, { silent = false } = {}) {
    try {
        const detail = await getConversation(conversationId);
        state.conversationId = conversationId;
        sessionStorage.setItem(STORAGE_CONVERSATION, String(conversationId));
        el.messages.innerHTML = '';
        for (const message of detail.messages) {
            if (message.role === 'user') {
                appendUserMessage(message.content);
            } else {
                const node = appendAssistantMessage();
                setAssistantContent(node, message.content, message.outcome === 'error');
                finalizeAssistantMessage(node, message.id, message.feedback);
            }
        }
        scrollToBottom(true);
        return true;
    } catch (error) {
        if (!silent) showNotification('Sohbet açılamadı.', 'error');
        sessionStorage.removeItem(STORAGE_CONVERSATION);
        return false;
    }
}

// -------------------------------------------------------- feedback reports

function toggleReportView() {
    if (state.view === 'report') {
        showChatView();
        return;
    }
    setView('report');
    refreshMyReports();
    el.reportForm.querySelector('[name="title"]').focus();
}

async function refreshMyReports() {
    try {
        state.reports = await listMyFeedbackReports();
        renderMyReports();
    } catch (error) {
        el.reportList.innerHTML =
            '<div class="aw-muted-block">Bildirimler yüklenemedi.</div>';
    }
}

function renderMyReports() {
    const reports = state.reports || [];
    if (!reports.length) {
        el.reportList.innerHTML =
            '<div class="aw-muted-block">Henüz bildiriminiz yok.</div>';
        return;
    }

    const visible = state.reportsExpanded ? reports : reports.slice(0, REPORT_PAGE_SIZE);
    el.reportList.innerHTML = '';
    for (const report of visible) {
        el.reportList.appendChild(buildReportItem(report));
    }

    if (reports.length > visible.length) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'report-show-all';
        more.textContent = `Tümünü göster (${reports.length})`;
        more.addEventListener('click', () => {
            state.reportsExpanded = true;
            renderMyReports();
        });
        el.reportList.appendChild(more);
    }
}

function formatReportDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function timelineRow(done, label, when) {
    const icon = done
        ? '<i class="fas fa-check-circle rt-done"></i>'
        : '<i class="far fa-circle rt-pending"></i>';
    return `<li class="${done ? '' : 'rt-muted'}">${icon}
        <span class="rt-label">${escapeHtml(label)}</span>
        <span class="rt-when">${escapeHtml(formatReportDate(when))}</span></li>`;
}

function buildReportTimeline(report) {
    const status = report.status;
    const analyzed = !!report.analyzed_at;
    // reviewed_at is also stamped on dismissal, so the status decides whether
    // the report actually reached development.
    const wentToDev = ['queued', 'in_review', 'done'].includes(status);
    const closed = ['done', 'dismissed', 'duplicate'].includes(status);

    let finalLabel = 'Tamamlanma';
    if (status === 'done') finalLabel = 'Tamamlandı — yayında';
    else if (status === 'dismissed') finalLabel = 'Değerlendirildi, uygulanmayacak';
    else if (status === 'duplicate') finalLabel = 'Aynı konu daha önce bildirilmiş';

    const rows = [
        timelineRow(true, 'Bildiriminiz alındı', report.created_at),
        timelineRow(analyzed, 'Neo inceledi', report.analyzed_at),
    ];
    if (status === 'needs_info') {
        rows.push(timelineRow(false, 'Yanıtınız bekleniyor', null));
    }
    rows.push(timelineRow(wentToDev, 'Geliştirmeye alındı', wentToDev ? report.queued_at : null));
    if (status === 'in_review') {
        rows.push(timelineRow(false, 'Değişiklik hazır, onay bekliyor', null));
    }
    rows.push(timelineRow(closed, finalLabel, report.resolved_at));
    return `<ul class="report-timeline">${rows.join('')}</ul>`;
}

function buildReportHistory(report) {
    const parts = [buildReportTimeline(report)];

    parts.push(`
        <div class="report-section-label">Bildiriminiz</div>
        <div class="report-quote">${escapeHtml(report.description || '')}</div>`);

    if (report.ai_summary) {
        parts.push(`
            <div class="report-section-label">Neo'nun değerlendirmesi</div>
            <div class="report-quote report-quote-ai">${escapeHtml(report.ai_summary)}</div>`);
    }

    // Previous Q&A rounds, oldest first — the conversation so far.
    for (const response of report.user_responses || []) {
        const questions = (response.questions || [])
            .map((q) => `<li>${escapeHtml(q)}</li>`).join('');
        parts.push(`
            <div class="report-section-label">Neo sordu</div>
            <ul class="report-qa-questions">${questions}</ul>
            <div class="report-section-label">Yanıtınız
                <span class="report-when">${escapeHtml(formatReportDate(response.at))}</span>
            </div>
            <div class="report-quote">${escapeHtml(response.text || '')}</div>`);
    }

    return parts.join('');
}

function buildReportItem(report) {
    const meta = REPORT_STATUS_META[report.status] || { label: report.status_display || report.status, cls: 'grey' };
    const icon = REPORT_KIND_ICONS[report.kind] || 'fa-comment-dots';
    const needsAnswer = report.status === 'needs_info'
        && (report.clarifying_questions || []).length > 0;

    const wrap = document.createElement('div');
    wrap.className = 'report-entry';

    const item = document.createElement('div');
    item.className = 'report-item report-item-clickable';
    item.title = 'Ayrıntılar için tıklayın';
    item.innerHTML = `
        <i class="fas ${icon} report-kind-icon"></i>
        <span class="report-title">${escapeHtml(report.title)}</span>
        ${needsAnswer ? '<i class="fas fa-reply report-answer-hint" title="Neo yanıtınızı bekliyor"></i>' : ''}
        <span class="report-status report-status-${meta.cls}">${escapeHtml(meta.label)}</span>
        <i class="fas fa-chevron-down report-caret"></i>`;
    wrap.appendChild(item);

    const details = document.createElement('div');
    details.className = 'report-qa';
    details.innerHTML = buildReportHistory(report) + (needsAnswer ? `
        <div class="report-qa-intro">Neo bu bildirimi çözmek için ek bilgiye ihtiyaç duyuyor:</div>
        <ul class="report-qa-questions">
            ${report.clarifying_questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
        </ul>
        <form class="report-qa-form">
            <textarea class="form-control form-control-sm" rows="4" maxlength="8000"
                      placeholder="Soruların yanıtlarını buraya yazın..."></textarea>
            <button type="submit" class="aw-report-submit">
                <i class="fas fa-paper-plane me-1"></i>Yanıtla
            </button>
        </form>` : '');
    wrap.appendChild(details);

    // Collapsed by default; the header row toggles the history open. A deep
    // link from the bell notification lands with its report already open.
    item.addEventListener('click', () => {
        const open = details.classList.toggle('open');
        item.classList.toggle('report-item-open', open);
    });
    if (report.id === DEEPLINK_REPORT_ID) {
        details.classList.add('open');
        item.classList.add('report-item-open');
    }

    const form = details.querySelector('form');
    if (form) {
        const textarea = form.querySelector('textarea');
        const submitBtn = form.querySelector('button');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const text = textarea.value.trim();
            if (text.length < 5) {
                showNotification('Lütfen soruları yanıtlayın.', 'error');
                return;
            }
            submitBtn.disabled = true;
            submitBtn.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1" style="width:0.8rem;height:0.8rem"></span>Gönderiliyor...';
            try {
                await respondFeedbackReport(report.id, text);
                showNotification('Yanıtınız alındı; bildirim yeniden inceleniyor.', 'success');
                refreshMyReports();
            } catch (error) {
                showNotification(error.message || 'Yanıt gönderilemedi.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>Yanıtla';
            }
        });
        // Clicks inside the reply form must not collapse the panel.
        form.addEventListener('click', (event) => event.stopPropagation());
    }
    return wrap;
}

async function submitReport() {
    if (state.reportSending) return;
    const form = el.reportForm;
    const kind = form.querySelector('[name="kind"]').value;
    const titleInput = form.querySelector('[name="title"]');
    const descriptionInput = form.querySelector('[name="description"]');
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();

    if (title.length < 5) {
        showNotification('Başlık en az 5 karakter olmalı.', 'error');
        return;
    }
    if (description.length < 15) {
        showNotification('Lütfen sorunu biraz daha ayrıntılı anlatın.', 'error');
        return;
    }

    const submitBtn = form.querySelector('.aw-report-submit');
    state.reportSending = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" style="width:0.8rem;height:0.8rem"></span>Gönderiliyor...';

    try {
        await createFeedbackReport({
            kind,
            title,
            description,
            pageUrl: window.location.href,
            context: {
                user_agent: navigator.userAgent,
                screen: `${window.innerWidth}x${window.innerHeight}`,
                portal: 'office',
            },
        });
        titleInput.value = '';
        descriptionInput.value = '';
        showNotification('Bildiriminiz alındı. Teşekkürler!', 'success');
        refreshMyReports();
    } catch (error) {
        showNotification(error.message || 'Bildirim gönderilemedi.', 'error');
    } finally {
        state.reportSending = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>Gönder';
    }
}

// --------------------------------------------------------- daily summaries

// Header button: toggles like history/report (second click → chat).
function toggleSummariesView() {
    if (state.view === 'summaries') {
        showChatView();
        return;
    }
    showSummariesView();
}

// Modal / deep link entry: always lands on the pane, optionally scrolled to
// one row; `open` also pops that row's summary (deep links only — the modal's
// own "Geçmiş özetler" button must not reopen what was just closed).
function showSummariesView(summaryId = null, { open = false } = {}) {
    setView('summaries');
    ensureDailySummaryStyles();
    if (summaryId) {
        state.summaryPendingId = summaryId;
        state.summaryPendingOpen = open;
    }
    if (!state.summariesLoaded) {
        loadSummaries(30);
    } else {
        revealPendingSummary();
    }
}

async function loadSummaries(days) {
    if (state.summariesLoading) return;
    state.summariesLoading = true;
    if (!state.summaries.length) {
        el.summariesList.innerHTML =
            '<div class="aw-muted-block"><span class="spinner-border spinner-border-sm me-1" style="width:0.8rem;height:0.8rem"></span>Yükleniyor...</div>';
    }
    let rows;
    try {
        rows = await listDailySummaries({ days });
    } catch (error) {
        el.summariesList.innerHTML = error && error.status === 403
            ? '<div class="aw-muted-block">Günlük özetler yalnızca ofis kullanıcılarına açıktır.</div>'
            : '<div class="aw-muted-block">Özetler yüklenemedi.</div>';
        return;
    } finally {
        // Cleared before rendering: the render may chain a 90-day load.
        state.summariesLoading = false;
    }
    state.summaries = Array.isArray(rows) ? rows : ((rows && rows.results) || []);
    state.summariesDays = days;
    state.summariesLoaded = true;
    renderSummaryList();
}

function renderSummaryList() {
    const rows = state.summaries || [];
    el.summariesList.innerHTML = '';
    if (!rows.length) {
        el.summariesList.innerHTML = '<div class="aw-muted-block">Henüz özet yok.</div>';
    }
    // Rows open a popup, which nothing in the list itself says; skipped when
    // every row is a "Hareket yok" day, since those don't open anything.
    if (rows.some((row) => row.status !== 'empty')) {
        const hint = document.createElement('div');
        hint.className = 'aw-summaries-hint';
        hint.textContent = 'Bir özeti açmak için tıklayın.';
        el.summariesList.appendChild(hint);
    }
    for (const summary of rows) {
        el.summariesList.appendChild(buildSummaryItem(summary));
    }
    if (state.summariesDays < 90) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'report-show-all';
        more.textContent = 'Daha eski özetler';
        more.addEventListener('click', () => loadSummaries(90));
        el.summariesList.appendChild(more);
    }
    revealPendingSummary();
}

// Opens the row a deep link / the modal asked for once the list holds it;
// falls back to the 90-day list once when the 30-day page doesn't have it.
function revealPendingSummary() {
    const id = state.summaryPendingId;
    if (!id) return;
    const wrap = el.summariesList.querySelector(`[data-summary-id="${Number(id)}"]`);
    if (wrap) {
        state.summaryPendingId = null;
        const summary = state.summaries.find((row) => Number(row.id) === Number(id));
        wrap.scrollIntoView({ block: 'nearest' });
        if (state.summaryPendingOpen && summary && summary.status !== 'empty') {
            openSummaryPopup(wrap, summary);
        }
        state.summaryPendingOpen = false;
        return;
    }
    if (state.summariesDays && state.summariesDays < 90 && !state.summariesLoading) {
        loadSummaries(90);
    } else if (state.summariesDays >= 90) {
        state.summaryPendingId = null;
    }
}

function summaryMiniStats(summary) {
    const stats = summary.stats || {};
    const num = (key) => Number(stats[key]) || 0;
    const jobs = num('new_jobs_root') + num('new_jobs_child');
    return `${jobs} iş emri · ${num('topics_new')} konu · ${num('comments')} yorum`;
}

function buildSummaryItem(summary) {
    const isEmpty = summary.status === 'empty';

    const wrap = document.createElement('div');
    wrap.className = 'summary-entry';
    wrap.dataset.summaryId = String(summary.id);

    const item = document.createElement('div');
    item.className = 'summary-item ' + (isEmpty ? 'summary-item-empty' : 'summary-item-clickable');
    const headline = isEmpty ? '' : String(summary.headline || '');
    item.innerHTML = `
        <span class="summary-day">${escapeHtml(relativeDayLabel(summary.summary_date))}</span>
        <span class="summary-mini">${escapeHtml(isEmpty ? 'Hareket yok' : summaryMiniStats(summary))}</span>
        ${!isEmpty && !summary.is_read ? '<span class="report-status report-status-blue summary-new">Yeni</span>' : ''}
        ${isEmpty ? '' : '<i class="fas fa-up-right-from-square summary-open-icon"></i>'}
        ${headline ? `<span class="summary-headline" title="${escapeHtml(headline)}">${escapeHtml(headline)}</span>` : ''}`;
    wrap.appendChild(item);

    if (!isEmpty) {
        item.title = 'Özeti aç';
        item.addEventListener('click', () => openSummaryPopup(wrap, summary));
    }
    return wrap;
}

function fetchSummaryDetail(id) {
    if (!state.summaryCache[id]) {
        state.summaryCache[id] = getDailySummary(id).catch((error) => {
            delete state.summaryCache[id];  // let the next click retry
            throw error;
        });
    }
    return state.summaryCache[id];
}

// One popup for every summary — the same one the morning check shows — so a
// past day reads exactly like today's did. The modal marks it read on close
// (server + the local seen key when it is the newest); the pane only has to
// drop the 'Yeni' chip.
async function openSummaryPopup(wrap, summary) {
    const item = wrap.querySelector('.summary-item');
    if (!item || item.dataset.loading) return;
    item.dataset.loading = '1';
    item.classList.add('summary-item-loading');
    try {
        const [detail, openDailySummaryModal] = await Promise.all([
            fetchSummaryDetail(summary.id),
            loadSummaryModal(),
        ]);
        if (!openDailySummaryModal) {
            showNotification('Özet açılamadı; lütfen sayfayı yenileyin.', 'error');
            return;
        }
        const latest = state.summaries[0];
        openDailySummaryModal(detail, {
            isLatest: Boolean(latest && latest.id === summary.id),
            fromWidget: true,
            onClose: () => {
                if (summary.is_read || isImpersonating()) return;
                summary.is_read = true;
                const chip = wrap.querySelector('.summary-new');
                if (chip) chip.remove();
                // The modal also emits daily-summary:read; this only covers a
                // cached older modal build that doesn't.
                if (state.unreadSummary && state.unreadSummary.id === Number(summary.id)) {
                    state.unreadSummary = null;
                    setLauncherBadge(false);
                }
            },
        });
    } catch (error) {
        showNotification('Özet yüklenemedi.', 'error');
    } finally {
        delete item.dataset.loading;
        item.classList.remove('summary-item-loading');
    }
}

function startNewChat({ keepPanel = false, keepView = false } = {}) {
    if (state.streaming) return;
    state.conversationId = null;
    sessionStorage.removeItem(STORAGE_CONVERSATION);
    renderEmptyState();
    if (!(keepView && state.view !== 'chat')) {
        showChatView();
    }
    if (!keepPanel) el.input.focus();
}

// ------------------------------------------------------------- rendering

function renderEmptyState() {
    el.messages.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.innerHTML = `
        <div class="chat-empty-icon"><i class="fas fa-robot"></i></div>
        <div class="fw-semibold mb-1">Merhaba, ben Neo! Size nasıl yardımcı olabilirim?</div>
        <div class="text-muted" style="font-size:.8rem">
            İş emirleri, saatler, malzeme durumu, tartışma özetleri ve süreç soruları.
        </div>
        <div class="chat-suggestions"></div>`;
    const suggestionsWrap = empty.querySelector('.chat-suggestions');
    for (const suggestion of SUGGESTIONS) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chat-suggestion';
        chip.textContent = suggestion;
        chip.addEventListener('click', () => {
            el.input.value = suggestion;
            sendCurrentInput();
        });
        suggestionsWrap.appendChild(chip);
    }
    el.messages.appendChild(empty);
}

function clearEmptyState() {
    const empty = el.messages.querySelector('.chat-empty');
    if (empty) empty.remove();
}

function appendUserMessage(text) {
    clearEmptyState();
    const node = document.createElement('div');
    node.className = 'msg user';
    node.innerHTML = `<div class="rich-text">${renderRichText(text)}</div>`;
    el.messages.appendChild(node);
    return node;
}

function appendAssistantMessage() {
    clearEmptyState();
    const node = document.createElement('div');
    node.className = 'msg assistant';
    node.innerHTML = '<div class="rich-text"></div>';
    el.messages.appendChild(node);
    return node;
}

function setAssistantContent(node, text, isError = false) {
    node.querySelector('.rich-text').innerHTML = renderRichText(text);
    if (isError) node.classList.add('msg-error');
}

function finalizeAssistantMessage(node, messageId, feedback = null) {
    node.classList.remove('streaming');
    if (!messageId) return;

    const bar = document.createElement('div');
    bar.className = 'msg-feedback';
    const current = { value: feedback };

    const makeButton = (value, cls, icon, titleText) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = cls + (current.value === value ? ' active' : '');
        button.title = titleText;
        button.innerHTML = `<i class="fas ${icon}"></i>`;
        button.addEventListener('click', async () => {
            const next = current.value === value ? null : value;
            try {
                await sendMessageFeedback(messageId, next);
                current.value = next;
                bar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
                if (next === 1) bar.querySelector('.up').classList.add('active');
                if (next === -1) bar.querySelector('.down').classList.add('active');
            } catch (error) {
                showNotification('Geri bildirim gönderilemedi.', 'error');
            }
        });
        return button;
    };

    bar.appendChild(makeButton(1, 'up', 'fa-thumbs-up', 'Faydalı'));
    bar.appendChild(makeButton(-1, 'down', 'fa-thumbs-down', 'Faydasız'));
    el.messages.appendChild(bar);
}

function appendToolActivity() {
    const wrap = document.createElement('div');
    wrap.className = 'tool-activity';
    el.messages.appendChild(wrap);
    return wrap;
}

function upsertToolChip(wrap, name, status) {
    const label = TOOL_LABELS[name] || name;
    let chip = wrap.querySelector(`[data-tool="${CSS.escape(name)}"]`);
    if (!chip) {
        chip = document.createElement('span');
        chip.className = 'tool-chip';
        chip.dataset.tool = name;
        wrap.appendChild(chip);
    }
    if (status === 'start') {
        chip.innerHTML =
            `<span class="spinner-border spinner-border-sm" style="width:0.65rem;height:0.65rem"></span> ${escapeHtml(label)}...`;
    } else if (status === 'done') {
        chip.classList.add('done');
        chip.innerHTML = `<i class="fas fa-check"></i> ${escapeHtml(label)}`;
    } else {
        chip.classList.add('error');
        chip.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(label)}`;
    }
}

function scrollToBottom(force = false) {
    const nearBottom =
        el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 140;
    if (force || nearBottom) {
        el.messages.scrollTop = el.messages.scrollHeight;
    }
}

// -------------------------------------------------------------- streaming

async function sendCurrentInput() {
    const text = el.input.value.trim();
    if (!text || state.streaming) return;

    showChatView();
    state.streaming = true;
    el.input.value = '';
    el.input.style.height = 'auto';
    el.input.disabled = true;
    el.sendBtn.disabled = true;

    appendUserMessage(text);
    const toolWrap = appendToolActivity();
    const assistantNode = appendAssistantMessage();
    assistantNode.classList.add('streaming');
    scrollToBottom(true);

    let answerBuffer = '';

    try {
        await streamChat({
            message: text,
            conversationId: state.conversationId,
            onEvent: (event, payload) => {
                if (event === 'conversation') {
                    state.conversationId = payload.conversation_id;
                    sessionStorage.setItem(STORAGE_CONVERSATION, String(payload.conversation_id));
                } else if (event === 'delta') {
                    answerBuffer += payload.text;
                    setAssistantContent(assistantNode, answerBuffer);
                    scrollToBottom();
                } else if (event === 'tool') {
                    upsertToolChip(toolWrap, payload.name, payload.status);
                    scrollToBottom();
                } else if (event === 'done') {
                    finalizeAssistantMessage(assistantNode, payload.message_id);
                } else if (event === 'error') {
                    setAssistantContent(
                        assistantNode,
                        answerBuffer || (payload.detail || 'Bir hata oluştu.'),
                        true,
                    );
                    assistantNode.classList.remove('streaming');
                }
            },
        });
        if (!toolWrap.children.length) toolWrap.remove();
        if (!answerBuffer) {
            setAssistantContent(assistantNode, 'Yanıt alınamadı, lütfen tekrar deneyin.', true);
        }
    } catch (error) {
        toolWrap.remove();
        assistantNode.classList.remove('streaming');
        setAssistantContent(
            assistantNode,
            error.message || 'Neo şu anda yanıt veremiyor.',
            true,
        );
    } finally {
        state.streaming = false;
        el.input.disabled = false;
        el.sendBtn.disabled = false;
        if (state.open) el.input.focus();
        scrollToBottom();
        refreshQuota();
    }
}
