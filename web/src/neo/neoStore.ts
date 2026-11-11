import { useEffect, useSyncExternalStore } from 'react';
import {
  NEO_UNAVAILABLE,
  streamChat,
  type ChatEvent,
  type ChatSource,
  type ConversationDetail,
  type NeoAction,
  type NeoPageContext,
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
  /** How many times the tool ran for this answer (one chip per tool). */
  count?: number;
}

export type ChatItem =
  /** `page`: the record it was asked about (fresh questions only). */
  | { id: string; role: 'user'; text: string; page?: NeoPageContext }
  | {
      id: string;
      role: 'assistant';
      text: string;
      tools: ToolChip[];
      streaming?: boolean;
      error?: boolean;
      messageId?: number | null;
      feedback?: number | null;
      /** Questions the user may want to ask next (only on fresh answers). */
      followups?: string[];
      /** Writes this answer proposed, as cards the user confirms. */
      actions?: NeoAction[];
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
  /** The wide panel, for table-heavy answers (desktop only). */
  wide: boolean;
  /** The record the page on screen shows (useNeoPage); sent with questions. */
  page: NeoPageContext | null;
  /** The user took the page pill off: questions go without it until the page changes. */
  pageOff: boolean;
  /** setNeoPage({ keep }): the record stays when its page closes (see setNeoPage). */
  pageKeep: boolean;
  /** A kept record whose page has closed: dropped after the next question or when Neo closes. */
  pageOrphan: boolean;
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
export const wideKey = (userId: number) => `gk.neoWide.${userId}`;

/** Panel widths in px: normal, and wide for tables. */
export const NEO_WIDTH = 380;
export const NEO_WIDE_WIDTH = 680;

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
  wide: false,
  page: null,
  pageOff: false,
  pageKeep: false,
  pageOrphan: false,
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
  if (state.userId !== null && state.wide !== prev.wide) {
    writeStorage(localStorage, wideKey(state.userId), state.wide ? '1' : null);
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
    wide: readStorage(() => localStorage, wideKey(userId)) === '1',
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
  // A kept record whose page is gone has nothing left to point at.
  set((s) => ({ open: false, ...(s.pageOrphan ? NO_PAGE : {}) }));
}

export function toggleNeo() {
  if (state.open) closeNeo();
  else openNeo();
}

/** A header button: its view, or back to chat on the second press. */
export function toggleNeoView(view: Exclude<NeoView, 'chat'>) {
  set((s) => ({ view: s.view === view ? 'chat' : view }));
}

export function toggleNeoWide() {
  set((s) => ({ wide: !s.wide }));
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
          ...(message.actions?.length ? { actions: message.actions } : {}),
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

/** A card came back from confirm / cancel: it replaces the one with its id. */
export function setItemAction(itemId: string, action: NeoAction) {
  set((s) => ({
    items: s.items.map((item) =>
      item.id === itemId && item.role === 'assistant' ? withAction(item, action) : item,
    ),
  }));
}

function withAction(item: AssistantItem, action: NeoAction): AssistantItem {
  const actions = item.actions ?? [];
  return {
    ...item,
    actions: actions.some((a) => a.id === action.id)
      ? actions.map((a) => (a.id === action.id ? action : a))
      : [...actions, action],
  };
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

/** At most three short, distinct, non-empty questions. */
function cleanFollowups(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text || text.length > 140 || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length === 3) break;
  }
  return out;
}

/** The question the last answer replied to: what "Tekrar dene" sends again. */
export function lastQuestion(): string | null {
  for (let i = state.items.length - 1; i >= 0; i -= 1) {
    const item = state.items[i];
    if (item?.role === 'user') return item.text;
  }
  return null;
}

/** One SSE frame applied to the answer being streamed. */
export function applyChatEvent(item: AssistantItem, event: ChatEvent): AssistantItem {
  switch (event.event) {
    case 'delta':
      return { ...item, text: item.text + event.data.text };
    case 'tool': {
      const { name, status } = event.data;
      const existing = item.tools.find((tool) => tool.name === name);
      const runs = (existing?.count ?? 0) + (status === 'start' ? 1 : 0);
      const chip: ToolChip = { name, status, count: Math.max(runs, 1) };
      return {
        ...item,
        tools: existing
          ? item.tools.map((tool) => (tool.name === name ? chip : tool))
          : [...item.tools, chip],
      };
    }
    case 'followups':
      return { ...item, followups: cleanFollowups(event.data.items) };
    case 'action':
      return event.data && typeof event.data.id === 'number' ? withAction(item, event.data) : item;
    case 'done': {
      const next: AssistantItem = {
        ...item,
        streaming: false,
        messageId: event.data.message_id ?? null,
      };
      // An empty list on done means "none attached here", not "clear the
      // ones the followups frame already brought".
      const fromDone = cleanFollowups(event.data.followups);
      if (fromDone.length > 0) next.followups = fromDone;
      return next;
    }
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

/** The page context a question goes with: none when the user took the pill off. */
export function activePage(s: NeoState = state): NeoPageContext | null {
  return s.page && !s.pageOff ? s.page : null;
}

const samePage = (a: NeoPageContext | null, b: NeoPageContext | null) =>
  !!a && !!b && a.type === b.type && a.id === b.id;

const NO_PAGE = { page: null, pageOff: false, pageKeep: false, pageOrphan: false } as const;

/**
 * A page shows this record. A new record brings the pill back.
 * - `force`: asked from the record itself ("Neo'ya sor"): the pill comes back
 *   even after its ×.
 * - `keep`: the record outlives its page, for a modal that has to close as
 *   Neo opens (the daily summary). It then goes with the next question and is
 *   dropped after it, or when Neo closes.
 */
export function setNeoPage(
  page: NeoPageContext,
  { force = false, keep = false }: { force?: boolean; keep?: boolean } = {},
) {
  const s = state;
  const same = samePage(s.page, page);
  if (!force && same && s.page?.label === page.label && !s.pageOrphan) return;
  set({
    page,
    pageOff: force ? false : same ? s.pageOff : false,
    pageKeep: keep || (same && !force && s.pageKeep),
    pageOrphan: false,
  });
}

/**
 * The page closed. Only its own record goes (the next page may have set one
 * already); a kept one stays, marked as orphaned, until it has been used.
 */
export function clearNeoPage(page: NeoPageContext) {
  if (!samePage(state.page, page)) return;
  if (state.pageKeep) set({ pageOrphan: true });
  else set(NO_PAGE);
}

/** The pill's ×. */
export function dismissNeoPage() {
  if (state.page && !state.pageOff) set({ pageOff: true });
}

/**
 * Tells Neo which record this page shows, while it is mounted. Pass null
 * while the record is loading.
 */
export function useNeoPage(page: NeoPageContext | null) {
  const type = page?.type;
  const id = page?.id;
  const label = page?.label;
  useEffect(() => {
    if (!type || !id) return;
    const current: NeoPageContext = { type, id, ...(label ? { label } : {}) };
    setNeoPage(current);
    return () => clearNeoPage(current);
  }, [type, id, label]);
}

/**
 * One click from a page: opens Neo and asks right away. While an answer is
 * still streaming the question lands in the box instead, unsent.
 */
export function askNeo(question: string, source: ChatSource = 'page_button') {
  if (state.streaming) {
    openNeo({ prompt: question });
    return Promise.resolve();
  }
  openNeo({ view: 'chat' });
  return sendNeoMessage(question, { source });
}

/** Sends a question and streams the answer into the list. Resolves when it ends. */
export async function sendNeoMessage(
  text: string,
  { source = 'panel' }: { source?: ChatSource } = {},
): Promise<void> {
  const question = text.trim();
  if (!question || state.streaming) return;
  const page = activePage();
  const answerId = nextId();
  set((s) => ({
    // A kept record whose page has closed has now been used: it goes.
    ...(s.pageOrphan ? NO_PAGE : {}),
    view: 'chat',
    streaming: true,
    // A question asked before the stored conversation loaded (from a page,
    // with the panel never opened) wins: the restore must not replace it.
    restored: true,
    items: [
      ...s.items,
      { id: nextId(), role: 'user', text: question, ...(page ? { page } : {}) },
      { id: answerId, role: 'assistant', text: '', tools: [], streaming: true },
    ],
  }));

  try {
    await streamChat({
      message: question,
      conversationId: state.conversationId,
      context: page
        ? { ...page, path: `${window.location.pathname}${window.location.search}` }
        : null,
      source,
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
