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

const STORAGE_OPEN = 'assistantOpen';
const STORAGE_CONVERSATION = 'assistantConversationId';

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

const state = {
    open: false,
    expanded: false,
    view: 'chat',
    conversationId: null,
    streaming: false,
    conversations: [],
    bootstrapped: false,
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
    el.form = panel.querySelector('form');
    el.input = panel.querySelector('textarea');
    el.sendBtn = panel.querySelector('.aw-send-btn');
    el.quotaLine = panel.querySelector('.aw-quota');
    el.historyBtn = panel.querySelector('[data-action="history"]');
    el.expandBtn = panel.querySelector('[data-action="expand"]');

    panel.querySelector('[data-action="close"]').addEventListener('click', () => closePanel());
    panel.querySelector('[data-action="new"]').addEventListener('click', () => startNewChat());
    el.historyBtn.addEventListener('click', () => toggleHistoryView());
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
    startNewChat({ keepPanel: true });
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
    if (state.view === 'chat') {
        state.view = 'history';
        el.messages.style.display = 'none';
        el.inputArea.style.display = 'none';
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
    el.messages.style.display = 'flex';
    el.inputArea.style.display = 'block';
    el.historyBtn.classList.remove('active');
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

function startNewChat({ keepPanel = false } = {}) {
    if (state.streaming) return;
    state.conversationId = null;
    sessionStorage.removeItem(STORAGE_CONVERSATION);
    renderEmptyState();
    showChatView();
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
