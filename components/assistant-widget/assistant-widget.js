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
import { isLoggedIn } from '../../authService.js';
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

const STORAGE_OPEN = 'assistantOpen';
const STORAGE_CONVERSATION = 'assistantConversationId';

// Report id from a bell-notification deep link (/?bildirim=<id>), if any.
const DEEPLINK_REPORT_ID = Number(
    new URLSearchParams(window.location.search).get('bildirim'),
) || null;

const TOOL_LABELS = {
    search_job_orders: 'İş emri aranıyor',
    get_job_order_brief: 'İş emri özeti alınıyor',
    get_job_order_hours: 'Çalışma saatleri alınıyor',
    get_job_costs: 'Maliyetler alınıyor',
    get_material_status: 'Malzeme durumu alınıyor',
    get_discussions: 'Tartışmalar okunuyor',
    get_my_summary: 'Kişisel özet alınıyor',
    search_docs: 'Rehber dokümanlar aranıyor',
    read_doc: 'Rehber okunuyor',
};

const SUGGESTIONS = [
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
};

const el = {};

export function initAssistantWidget(launcherMount) {
    if (window.__assistantWidgetInit) return;
    if (!isLoggedIn()) return;
    window.__assistantWidgetInit = true;

    injectStyles();
    buildLauncher(launcherMount);
    buildPanel();

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
    button.addEventListener('click', () => togglePanel());
    mount.appendChild(button);
}

function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'assistant-panel';
    panel.innerHTML = `
        <div class="aw-header">
            <span class="aw-title"><i class="fas fa-robot"></i> Neo</span>
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
                <div class="aw-report-list-title">Bildirimlerim</div>
                <div class="aw-report-list"></div>
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

    panel.querySelector('[data-action="close"]').addEventListener('click', () => closePanel());
    panel.querySelector('[data-action="new"]').addEventListener('click', () => startNewChat());
    el.historyBtn.addEventListener('click', () => toggleHistoryView());
    el.reportBtn.addEventListener('click', () => toggleReportView());
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

// ---------------------------------------------------------------- history

function toggleHistoryView() {
    if (state.view !== 'history') {
        state.view = 'history';
        el.messages.style.display = 'none';
        el.inputArea.style.display = 'none';
        el.report.style.display = 'none';
        el.reportBtn.classList.remove('active');
        el.history.style.display = 'block';
        el.historyBtn.classList.add('active');
        refreshConversationList();
    } else {
        showChatView();
    }
}

function showChatView() {
    state.view = 'chat';
    el.history.style.display = 'none';
    el.report.style.display = 'none';
    el.messages.style.display = 'flex';
    // Locked users keep chat input hidden (bootstrap) but can still report.
    el.inputArea.style.display = state.locked ? 'none' : 'block';
    el.historyBtn.classList.remove('active');
    el.reportBtn.classList.remove('active');
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
    state.view = 'report';
    el.messages.style.display = 'none';
    el.inputArea.style.display = 'none';
    el.history.style.display = 'none';
    el.historyBtn.classList.remove('active');
    el.report.style.display = 'block';
    el.reportBtn.classList.add('active');
    refreshMyReports();
    el.reportForm.querySelector('[name="title"]').focus();
}

async function refreshMyReports() {
    try {
        const reports = await listMyFeedbackReports();
        renderMyReports(reports.slice(0, 10));
    } catch (error) {
        el.reportList.innerHTML =
            '<div class="aw-muted-block">Bildirimler yüklenemedi.</div>';
    }
}

function renderMyReports(reports) {
    if (!reports.length) {
        el.reportList.innerHTML =
            '<div class="aw-muted-block">Henüz bildiriminiz yok.</div>';
        return;
    }
    el.reportList.innerHTML = '';
    for (const report of reports) {
        el.reportList.appendChild(buildReportItem(report));
    }
}

function buildReportItem(report) {
    const meta = REPORT_STATUS_META[report.status] || { label: report.status_display || report.status, cls: 'grey' };
    const icon = REPORT_KIND_ICONS[report.kind] || 'fa-comment-dots';
    const needsAnswer = report.status === 'needs_info'
        && (report.clarifying_questions || []).length > 0;

    const wrap = document.createElement('div');
    wrap.className = 'report-entry';

    const item = document.createElement('div');
    item.className = 'report-item';
    item.title = report.ai_summary || report.title;
    item.innerHTML = `
        <i class="fas ${icon} report-kind-icon"></i>
        <span class="report-title">${escapeHtml(report.title)}</span>
        ${needsAnswer ? '<i class="fas fa-reply report-answer-hint" title="Neo yanıtınızı bekliyor"></i>' : ''}
        <span class="report-status report-status-${meta.cls}">${escapeHtml(meta.label)}</span>`;
    wrap.appendChild(item);

    if (needsAnswer) {
        const details = document.createElement('div');
        details.className = 'report-qa';
        details.innerHTML = `
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
            </form>`;
        wrap.appendChild(details);

        // Collapsed by default; the header row toggles it open. A deep link
        // from the bell notification lands with its questions already open.
        item.classList.add('report-item-clickable');
        item.addEventListener('click', () => details.classList.toggle('open'));
        if (report.id === DEEPLINK_REPORT_ID) details.classList.add('open');

        const form = details.querySelector('form');
        const textarea = details.querySelector('textarea');
        const submitBtn = details.querySelector('button');
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
