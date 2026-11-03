import { useSyncExternalStore } from 'react';
import {
  NEO_UNAVAILABLE,
  streamChat,
  type ChatEvent,
  type ConversationDetail,
} from '@/api/assistant';
import { isApiError } from '@/api/client';

// Neo's state lives outside React so the panel keeps its conversation while
// pages change under it, and so anything (the bell, a future daily-summary
// modal) can open it with openNeo(). Open/closed is remembered per user in
// localStorage; the conversation id in sessionStorage under the legacy
// widget's key, so a chat started on a legacy page continues here.

export type NeoView = 'chat' | 'history' | 'report' | 'summaries';

export interface ToolChip {
  name: string;
  status: 'start' | 'done' | 'error';
}

export type ChatItem =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      tools: ToolChip[];
      streaming?: boolean;
      error?: boolean;
      messageId?: number | null;
      feedback?: number | null;
    };

export type AssistantItem = Extract<ChatItem, { role: 'assistant' }>;

/** The id and dates of a daily summary the user has not read. */
export interface UnreadSummary {
  id: number;
  summary_date: string | null;
  generated_at: string | null;
}

/** What the morning check puts in front of the user: a popup, or a slim banner. */
export interface SummaryPrompt {
  kind: 'modal' | 'banner';
  summary: UnreadSummary;
  /** For a popup: how it came up (the read metric's source). Default 'modal'. */
  source?: 'modal' | 'banner';
}

export interface NeoState {
  open: boolean;
  view: NeoView;
  conversationId: number | null;
  items: ChatItem[];
  streaming: boolean;
  /** Whether the stored conversation has been loaded (or found gone) yet. */
  restored: boolean;
  /** Text for the input, from openNeo({ prompt }). The nonce lets the same text land twice. */
  draft: { text: string; nonce: number } | null;
  /** Report to open in the report view (bell deep link). */
  focusReportId: number | null;
  /** Summary to scroll to, and pop open when `open`. */
  summaryRequest: { id: number; open: boolean; nonce: number } | null;
  userId: number | null;
  /** Newest summary this user has not read (the dot on Neo's entry). */
  unreadSummary: UnreadSummary | null;
  /** The dot's "first click lands on the summaries" shortcut has been used. */
  unreadRedirected: boolean;
  summaryPrompt: SummaryPrompt | null;
}

export interface OpenNeoOptions {
  /** Prefills the question box (not sent), e.g. "Dün neler oldu?". */
  prompt?: string;
  view?: NeoView;
  /** Opens the report view with this report expanded. */
  reportId?: number;
  /** Opens the summaries view at this summary; `openSummary` also pops it. */
  summaryId?: number;
  openSummary?: boolean;
}

export const CONVERSATION_KEY = 'assistantConversationId';
export const openKey = (userId: number) => `gk.neoOpen.${userId}`;
export const hintKey = (userId: number) => `gk.neoHintSeen.${userId}`;

const initialState = (): NeoState => ({
  open: false,
  view: 'chat',
  conversationId: null,
  items: [],
  streaming: false,
  restored: false,
  draft: null,
  focusReportId: null,
  summaryRequest: null,
  userId: null,
  unreadSummary: null,
  unreadRedirected: false,
  summaryPrompt: null,
});

let state: NeoState = initialState();
const listeners = new Set<() => void>();
let nonce = 0;
let itemSeq = 0;

function set(patch: Partial<NeoState> | ((s: NeoState) => Partial<NeoState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  const prev = state;
  state = { ...state, ...next };
  if (state.userId !== null && state.open !== prev.open) {
    writeStorage(localStorage, openKey(state.userId), state.open ? '1' : '0');
  }
  if (state.conversationId !== prev.conversationId) {
    writeStorage(
      sessionStorage,
      CONVERSATION_KEY,
      state.conversationId ? String(state.conversationId) : null,
    );
  }
  listeners.forEach((listener) => listener());
}

// Storage can be missing or throw (private windows, blocked site data); Neo
// then simply forgets between page loads.
function readStorage(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Not remembered.
  }
}

export function getNeoState(): NeoState {
  return state;
}

export function subscribeNeo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNeo<T>(selector: (s: NeoState) => T): T {
  return useSyncExternalStore(subscribeNeo, () => selector(state));
}

/**
 * Called by the layout with the signed-in user. Another user (sign-in without
 * a reload) starts from a clean panel with their own open/closed choice.
 */
export function bindNeoUser(userId: number) {
  if (state.userId === userId) return;
  const storedId = Number(readStorage(() => sessionStorage, CONVERSATION_KEY)) || null;
  // No listeners are told: this runs while the layout renders, and everything
  // that reads the store renders under it.
  state = {
    ...initialState(),
    userId,
    open: readStorage(() => localStorage, openKey(userId)) === '1',
    // A different user's conversation must not leak in.
    conversationId: state.userId === null ? storedId : null,
  };
}

/** Opens the panel; the options pick where it lands. Safe to call from anywhere. */
export function openNeo(options: OpenNeoOptions = {}) {
  set((s) => {
    const patch: Partial<NeoState> = { open: true };
    if (options.reportId) {
      patch.view = 'report';
      patch.focusReportId = options.reportId;
    } else if (options.summaryId || options.view === 'summaries') {
      patch.view = 'summaries';
      if (options.summaryId) {
        patch.summaryRequest = {
          id: options.summaryId,
          open: !!options.openSummary,
          nonce: ++nonce,
        };
      }
    } else if (options.view) {
      patch.view = options.view;
    } else if (options.prompt) {
      patch.view = 'chat';
    }
    if (options.prompt) patch.draft = { text: options.prompt, nonce: ++nonce };
    return s.open && !Object.keys(patch).some((k) => k !== 'open') ? {} : patch;
  });
}

/** Raises or clears the unread dot. A newer unread summary re-arms the first-click shortcut. */
export function setUnreadSummary(summary: UnreadSummary | null) {
  set((s) => ({
    unreadSummary: summary,
    unreadRedirected: summary && s.unreadSummary?.id === summary.id ? s.unreadRedirected : false,
  }));
}

export function setSummaryPrompt(prompt: SummaryPrompt | null) {
  set({ summaryPrompt: prompt });
}

/**
 * The entry's click. While the dot shows, the first click lands on the
 * summaries (once); after that the entry is a plain toggle again.
 */
export function clickNeoEntry() {
  const { open, unreadSummary, unreadRedirected } = state;
  if (!open && unreadSummary && !unreadRedirected) {
    set({ unreadRedirected: true });
    openNeo({ view: 'summaries', summaryId: unreadSummary.id });
    return;
  }
  toggleNeo();
}

export function closeNeo() {
  set({ open: false });
}

export function toggleNeo() {
  if (state.open) closeNeo();
  else openNeo();
}

/** A header button: its view, or back to chat on the second press. */
export function toggleNeoView(view: Exclude<NeoView, 'chat'>) {
  set((s) => ({ view: s.view === view ? 'chat' : view }));
}

export function showNeoChat() {
  set({ view: 'chat' });
}

export function consumeDraft() {
  if (state.draft) set({ draft: null });
}

export function clearFocusReport() {
  if (state.focusReportId !== null) set({ focusReportId: null });
}

export function clearSummaryRequest() {
  if (state.summaryRequest) set({ summaryRequest: null });
}

/** Empty chat; refused while an answer streams. */
export function startNewChat() {
  if (state.streaming) return;
  set({ conversationId: null, items: [], view: 'chat', restored: true });
}

/** Shows a stored conversation; `keepView` leaves another pane the user moved to. */
export function showConversation(detail: ConversationDetail, { keepView = false } = {}) {
  const items: ChatItem[] = detail.messages.map((message) =>
    message.role === 'user'
      ? { id: nextId(), role: 'user', text: message.content }
      : {
          id: nextId(),
          role: 'assistant',
          text: message.content,
          tools: [],
          error: message.outcome === 'error',
          messageId: message.id,
          feedback: message.feedback ?? null,
        },
  );
  set({
    conversationId: detail.id,
    items,
    restored: true,
    ...(keepView ? {} : { view: 'chat' as const }),
  });
}

/** The stored conversation is gone (archived, another user): start empty. */
export function markRestored(forget: boolean) {
  set(forget ? { restored: true, conversationId: null, items: [] } : { restored: true });
}

export function setItemFeedback(itemId: string, feedback: number | null) {
  set((s) => ({
    items: s.items.map((item) =>
      item.id === itemId && item.role === 'assistant' ? { ...item, feedback } : item,
    ),
  }));
}

function nextId() {
  itemSeq += 1;
  return `neo-${itemSeq}`;
}

/** One SSE frame applied to the answer being streamed. */
export function applyChatEvent(item: AssistantItem, event: ChatEvent): AssistantItem {
  switch (event.event) {
    case 'delta':
      return { ...item, text: item.text + event.data.text };
    case 'tool': {
      const { name, status } = event.data;
      const others = item.tools.filter((tool) => tool.name !== name);
      const exists = others.length !== item.tools.length;
      const chip = { name, status };
      return {
        ...item,
        tools: exists
          ? item.tools.map((tool) => (tool.name === name ? chip : tool))
          : [...item.tools, chip],
      };
    }
    case 'done':
      return { ...item, streaming: false, messageId: event.data.message_id ?? null };
    case 'error':
      return {
        ...item,
        streaming: false,
        error: true,
        text: item.text || event.data.detail || 'Bir hata oluştu.',
      };
    default:
      return item;
  }
}

function updateAnswer(id: string, update: (item: AssistantItem) => AssistantItem) {
  set((s) => ({
    items: s.items.map((item) =>
      item.id === id && item.role === 'assistant' ? update(item) : item,
    ),
  }));
}

/** Sends a question and streams the answer into the list. Resolves when it ends. */
export async function sendNeoMessage(text: string): Promise<void> {
  const question = text.trim();
  if (!question || state.streaming) return;
  const answerId = nextId();
  set((s) => ({
    view: 'chat',
    streaming: true,
    items: [
      ...s.items,
      { id: nextId(), role: 'user', text: question },
      { id: answerId, role: 'assistant', text: '', tools: [], streaming: true },
    ],
  }));

  try {
    await streamChat({
      message: question,
      conversationId: state.conversationId,
      onEvent: (event) => {
        if (event.event === 'conversation') {
          set({ conversationId: event.data.conversation_id });
          return;
        }
        updateAnswer(answerId, (item) => applyChatEvent(item, event));
      },
    });
    updateAnswer(answerId, (item) =>
      item.text
        ? { ...item, streaming: false }
        : {
            ...item,
            streaming: false,
            error: true,
            text: 'Yanıt alınamadı, lütfen tekrar deneyin.',
          },
    );
  } catch (error) {
    // A network failure's own text ("Failed to fetch") means nothing to the user.
    const message = isApiError(error) && error.message ? error.message : NEO_UNAVAILABLE;
    updateAnswer(answerId, (item) => ({
      ...item,
      streaming: false,
      error: true,
      tools: [],
      text: message,
    }));
  } finally {
    set({ streaming: false });
  }
}

/** Tests only: back to a fresh store. */
export function resetNeoStore() {
  state = initialState();
  listeners.forEach((listener) => listener());
}
