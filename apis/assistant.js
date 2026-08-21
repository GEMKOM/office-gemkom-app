/**
 * Assistant API — chat (SSE over fetch), conversations, quota, feedback.
 *
 * The chat endpoint streams Server-Sent Events. EventSource cannot send the
 * JWT header, so we POST with authedFetch and read response.body ourselves.
 * authedFetch never consumes a 2xx body, so the stream reaches us untouched.
 */
import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

const ASSISTANT_BASE = `${backendBase}/assistant`;

export async function getAssistantQuota() {
    const response = await authedFetch(`${ASSISTANT_BASE}/me/`);
    if (!response.ok) {
        const error = new Error('Asistan kotası yüklenemedi');
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

export async function listConversations() {
    try {
        const response = await authedFetch(`${ASSISTANT_BASE}/conversations/`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Sohbetler yüklenirken hata oluştu' }));
            throw new Error(errorData.detail || 'Sohbetler yüklenirken hata oluştu');
        }
        const data = await response.json();
        return data.results || data;
    } catch (error) {
        console.error('Error fetching assistant conversations:', error);
        throw error;
    }
}

export async function getConversation(conversationId) {
    try {
        const response = await authedFetch(`${ASSISTANT_BASE}/conversations/${conversationId}/`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Sohbet yüklenirken hata oluştu' }));
            throw new Error(errorData.detail || 'Sohbet yüklenirken hata oluştu');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching assistant conversation:', error);
        throw error;
    }
}

export async function archiveConversation(conversationId) {
    try {
        const response = await authedFetch(`${ASSISTANT_BASE}/conversations/${conversationId}/`, {
            method: 'DELETE',
        });
        if (!response.ok && response.status !== 204) {
            const errorData = await response.json().catch(() => ({ detail: 'Sohbet arşivlenirken hata oluştu' }));
            throw new Error(errorData.detail || 'Sohbet arşivlenirken hata oluştu');
        }
        return true;
    } catch (error) {
        console.error('Error archiving assistant conversation:', error);
        throw error;
    }
}

export async function sendMessageFeedback(messageId, value) {
    try {
        const response = await authedFetch(`${ASSISTANT_BASE}/messages/${messageId}/feedback/`, {
            method: 'POST',
            body: JSON.stringify({ value }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Geri bildirim gönderilemedi' }));
            throw new Error(errorData.detail || 'Geri bildirim gönderilemedi');
        }
        return await response.json();
    } catch (error) {
        console.error('Error sending assistant feedback:', error);
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Analytics (manage_assistant_analytics only — the API refuses everyone else)
// ---------------------------------------------------------------------------

async function analyticsFetch(url, defaultMessage) {
    const response = await authedFetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: defaultMessage }));
        const error = new Error(errorData.detail || defaultMessage);
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

export function getAnalyticsSummary(days = 30) {
    return analyticsFetch(
        `${ASSISTANT_BASE}/analytics/summary/?days=${encodeURIComponent(days)}`,
        'Kullanım özeti yüklenemedi',
    );
}

export function getAnalyticsQuestions({ days = 90, q = '', page = 1, pageSize = 25 } = {}) {
    const params = new URLSearchParams({ days, page, page_size: pageSize });
    if (q) params.set('q', q);
    return analyticsFetch(
        `${ASSISTANT_BASE}/analytics/questions/?${params}`,
        'Soru kayıtları yüklenemedi',
    );
}

export function getAnalyticsConversation(conversationId) {
    return analyticsFetch(
        `${ASSISTANT_BASE}/analytics/conversations/${conversationId}/`,
        'Sohbet yüklenemedi',
    );
}

/**
 * Send one question and stream the answer.
 *
 * onEvent(name, payload) fires for every SSE frame the backend emits:
 *   conversation {conversation_id, title}
 *   delta        {text}
 *   tool         {name, status: 'start'|'done'|'error', duration_ms?}
 *   done         {conversation_id, message_id?, outcome, cost_usd, usage?}
 *   error        {conversation_id, message_id, detail}
 */
export async function streamChat({ message, conversationId, onEvent, signal }) {
    const body = { message };
    if (conversationId) {
        body.conversation_id = conversationId;
    }

    const response = await authedFetch(`${ASSISTANT_BASE}/chat/`, {
        method: 'POST',
        headers: { 'Accept': 'text/event-stream' },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Neo şu anda yanıt veremiyor' }));
        const error = new Error(errorData.detail || 'Neo şu anda yanıt veremiyor');
        error.status = response.status;
        throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);

            let eventName = 'message';
            let data = '';
            for (const line of frame.split('\n')) {
                if (line.startsWith('event: ')) {
                    eventName = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                    data += line.slice(6);
                }
            }
            if (!data) continue;

            let payload;
            try {
                payload = JSON.parse(data);
            } catch (parseError) {
                console.warn('Skipping malformed SSE frame:', data);
                continue;
            }
            onEvent(eventName, payload);
        }
    }
}
