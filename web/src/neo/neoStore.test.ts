import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { NEO_UNAVAILABLE, streamChat, type ChatEvent } from '@/api/assistant';
import {
  applyChatEvent,
  bindNeoUser,
  closeNeo,
  CONVERSATION_KEY,
  getNeoState,
  openKey,
  openNeo,
  resetNeoStore,
  sendNeoMessage,
  showConversation,
  startNewChat,
  toggleNeo,
  toggleNeoView,
  type AssistantItem,
} from './neoStore';

vi.mock('@/api/assistant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/assistant')>()),
  streamChat: vi.fn(),
}));
vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const mockedStream = vi.mocked(streamChat);

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  resetNeoStore();
  mockedStream.mockReset();
});

describe('open / closed', () => {
  it('is remembered per user', () => {
    localStorage.setItem(openKey(7), '1');
    bindNeoUser(7);
    expect(getNeoState().open).toBe(true);

    closeNeo();
    expect(localStorage.getItem(openKey(7))).toBe('0');

    // Another user signs in without a reload: their own choice, no conversation.
    sessionStorage.setItem(CONVERSATION_KEY, '55');
    bindNeoUser(8);
    expect(getNeoState()).toMatchObject({ open: false, userId: 8, conversationId: null });
    toggleNeo();
    expect(localStorage.getItem(openKey(8))).toBe('1');
    expect(localStorage.getItem(openKey(7))).toBe('0');
  });

  it("picks up the legacy widget's conversation on first bind", () => {
    sessionStorage.setItem(CONVERSATION_KEY, '31');
    bindNeoUser(7);
    expect(getNeoState().conversationId).toBe(31);
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    bindNeoUser(7);
    expect(getNeoState().open).toBe(false);
    openNeo();
    expect(getNeoState().open).toBe(true);
  });
});

describe('openNeo', () => {
  beforeEach(() => bindNeoUser(7));

  it('prefills a prompt on the chat view without sending it', () => {
    toggleNeoView('report');
    openNeo({ prompt: 'Dün neler oldu?' });
    const state = getNeoState();
    expect(state).toMatchObject({ open: true, view: 'chat', draft: { text: 'Dün neler oldu?' } });
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it("lands on a report's thread for the bell deep link", () => {
    openNeo({ reportId: 42 });
    expect(getNeoState()).toMatchObject({ open: true, view: 'report', focusReportId: 42 });
  });

  it('lands on a daily summary', () => {
    openNeo({ summaryId: 9, openSummary: true });
    expect(getNeoState()).toMatchObject({
      view: 'summaries',
      summaryRequest: { id: 9, open: true },
    });
  });

  it('a header button toggles its view and back to chat', () => {
    toggleNeoView('history');
    expect(getNeoState().view).toBe('history');
    toggleNeoView('history');
    expect(getNeoState().view).toBe('chat');
  });
});

describe('applyChatEvent', () => {
  const answer: AssistantItem = {
    id: 'a',
    role: 'assistant',
    text: '',
    tools: [],
    streaming: true,
  };

  it('appends deltas, tracks tools by name and finishes with the message id', () => {
    const events: ChatEvent[] = [
      { event: 'tool', data: { name: 'search_job_orders', status: 'start' } },
      { event: 'delta', data: { text: 'İki ' } },
      { event: 'tool', data: { name: 'search_job_orders', status: 'done' } },
      { event: 'delta', data: { text: 'iş emri var.' } },
      { event: 'done', data: { message_id: 77 } },
    ];
    const result = events.reduce(applyChatEvent, answer);
    expect(result).toMatchObject({
      text: 'İki iş emri var.',
      tools: [{ name: 'search_job_orders', status: 'done' }],
      streaming: false,
      messageId: 77,
    });
  });

  it('keeps a partial answer on error, or shows the detail', () => {
    const partial = applyChatEvent(
      { ...answer, text: 'Yarım' },
      { event: 'error', data: { detail: 'x' } },
    );
    expect(partial).toMatchObject({ text: 'Yarım', error: true, streaming: false });
    const empty = applyChatEvent(answer, { event: 'error', data: { detail: 'Kota doldu' } });
    expect(empty.text).toBe('Kota doldu');
  });
});

describe('sendNeoMessage', () => {
  beforeEach(() => bindNeoUser(7));

  it('streams the answer and remembers the new conversation', async () => {
    mockedStream.mockImplementation(async ({ onEvent }) => {
      onEvent({ event: 'conversation', data: { conversation_id: 12 } });
      onEvent({ event: 'delta', data: { text: 'Merhaba' } });
      onEvent({ event: 'done', data: { message_id: 3 } });
    });
    await sendNeoMessage('  Selam  ');
    const state = getNeoState();
    expect(mockedStream).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Selam', conversationId: null }),
    );
    expect(state.streaming).toBe(false);
    expect(state.conversationId).toBe(12);
    expect(sessionStorage.getItem(CONVERSATION_KEY)).toBe('12');
    expect(state.items).toMatchObject([
      { role: 'user', text: 'Selam' },
      { role: 'assistant', text: 'Merhaba', messageId: 3, streaming: false },
    ]);
  });

  it("shows the backend's message, or the legacy one for a network failure", async () => {
    mockedStream.mockRejectedValueOnce(new ApiError(429, {}, 'Günlük limitinize ulaştınız.'));
    await sendNeoMessage('a');
    mockedStream.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await sendNeoMessage('b');
    const answers = getNeoState().items.filter((item) => item.role === 'assistant');
    expect(answers.map((item) => item.text)).toEqual([
      'Günlük limitinize ulaştınız.',
      NEO_UNAVAILABLE,
    ]);
    expect(answers.every((item) => item.role === 'assistant' && item.error)).toBe(true);
  });

  it('an empty stream says no answer came', async () => {
    mockedStream.mockResolvedValue(undefined);
    await sendNeoMessage('a');
    expect(getNeoState().items[1]).toMatchObject({
      error: true,
      text: 'Yanıt alınamadı, lütfen tekrar deneyin.',
    });
  });

  it('refuses a second question and a new chat while one streams', async () => {
    let finish!: () => void;
    mockedStream.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const first = sendNeoMessage('bir');
    await sendNeoMessage('iki');
    startNewChat();
    expect(mockedStream).toHaveBeenCalledTimes(1);
    expect(getNeoState().items).toHaveLength(2);
    finish();
    await first;
    startNewChat();
    expect(getNeoState()).toMatchObject({ items: [], conversationId: null });
    expect(sessionStorage.getItem(CONVERSATION_KEY)).toBeNull();
  });

  it('a stored conversation replaces the list', () => {
    showConversation({
      id: 5,
      messages: [
        { id: 1, role: 'user', content: 'Soru' },
        { id: 2, role: 'assistant', content: 'Yanıt', feedback: 1 },
        { id: 3, role: 'assistant', content: 'Hata', outcome: 'error' },
      ],
    });
    expect(getNeoState().items).toMatchObject([
      { role: 'user', text: 'Soru' },
      { role: 'assistant', messageId: 2, feedback: 1, error: false },
      { role: 'assistant', messageId: 3, error: true },
    ]);
  });
});
