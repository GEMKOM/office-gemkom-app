import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { NEO_UNAVAILABLE, streamChat, type ChatEvent } from '@/api/assistant';
import {
  activePage,
  applyChatEvent,
  askNeo,
  bindNeoUser,
  clearNeoPage,
  closeNeo,
  CONVERSATION_KEY,
  dismissNeoPage,
  getNeoState,
  openKey,
  openNeo,
  resetNeoStore,
  sendNeoMessage,
  setNeoPage,
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
vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

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

describe('page context', () => {
  const job = { type: 'job_order' as const, id: '293-10', label: 'TUNNEL PANEL' };
  const ncr = { type: 'ncr' as const, id: 'NCR-1' };

  beforeEach(() => resetNeoStore());

  it('follows the page, keeps another page’s record when an old one clears', () => {
    setNeoPage(job);
    expect(activePage()).toEqual(job);
    // The next page registers before the old one unmounts.
    setNeoPage(ncr);
    clearNeoPage(job);
    expect(activePage()).toEqual(ncr);
    clearNeoPage(ncr);
    expect(activePage()).toBeNull();
  });

  it('the pill’s × holds until a different record comes', () => {
    setNeoPage(job);
    dismissNeoPage();
    expect(activePage()).toBeNull();
    setNeoPage({ ...job });
    expect(activePage()).toBeNull();
    setNeoPage(ncr);
    expect(activePage()).toEqual(ncr);
  });

  it('asking from the record brings the pill back after its ×', () => {
    setNeoPage(job);
    dismissNeoPage();
    setNeoPage(job, { force: true });
    expect(activePage()).toEqual(job);
  });

  it('a forced record still leaves with its page (no stale pill)', () => {
    setNeoPage(job);
    setNeoPage(job, { force: true });
    clearNeoPage(job);
    expect(activePage()).toBeNull();
  });

  it('a kept record outlives its page for one question, then goes', async () => {
    vi.mocked(streamChat).mockClear();
    vi.mocked(streamChat).mockResolvedValue(undefined);
    setNeoPage(job);
    setNeoPage(job, { force: true, keep: true });
    clearNeoPage(job); // the modal closed
    expect(activePage()).toEqual(job);
    await sendNeoMessage('Bunda ne var?');
    expect(vi.mocked(streamChat)).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ id: '293-10' }) }),
    );
    expect(activePage()).toBeNull();
  });

  it('closing Neo drops a kept record whose page is gone', () => {
    setNeoPage(job, { force: true, keep: true });
    clearNeoPage(job);
    openNeo();
    closeNeo();
    expect(activePage()).toBeNull();
  });

  it('sends the record, the page path and the source with a question', async () => {
    const spy = vi.mocked(streamChat);
    spy.mockClear();
    spy.mockResolvedValue(undefined);
    setNeoPage(job);
    await sendNeoMessage('Bu işin maliyeti ne?', { source: 'page_button' });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Bu işin maliyeti ne?',
        context: expect.objectContaining({
          type: 'job_order',
          id: '293-10',
          path: expect.any(String),
        }),
        source: 'page_button',
      }),
    );
    const question = getNeoState().items[0];
    expect(question).toMatchObject({ role: 'user', page: job });

    dismissNeoPage();
    await sendNeoMessage('Genel soru');
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: null, source: 'panel' }),
    );
  });

  it('askNeo opens the panel and asks; while streaming it only fills the box', async () => {
    const spy = vi.mocked(streamChat);
    spy.mockClear();
    spy.mockResolvedValue(undefined);
    await askNeo('293-10 işinin genel durumu ne?');
    expect(getNeoState().open).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ source: 'page_button' }));
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

  it('counts repeated runs of one tool on its single chip', () => {
    const events: ChatEvent[] = [
      { event: 'tool', data: { name: 'get_job_costs', status: 'start' } },
      { event: 'tool', data: { name: 'get_job_costs', status: 'done' } },
      { event: 'tool', data: { name: 'get_job_costs', status: 'start' } },
      { event: 'tool', data: { name: 'get_job_costs', status: 'done' } },
    ];
    const result = events.reduce(applyChatEvent, answer);
    expect(result.tools).toEqual([{ name: 'get_job_costs', status: 'done', count: 2 }]);
  });

  it('keeps up to three distinct follow-up questions, from their frame or from done', () => {
    const fromFrame = applyChatEvent(answer, {
      event: 'followups',
      data: { items: ['A?', 'A?', ' ', 'B?', 'C?', 'D?'] },
    });
    expect(fromFrame.followups).toEqual(['A?', 'B?', 'C?']);
    const fromDone = applyChatEvent(answer, {
      event: 'done',
      data: { message_id: 1, followups: ['X?'] },
    });
    expect(fromDone.followups).toEqual(['X?']);
    // A done frame without them, or with an empty list, keeps the ones that came first.
    expect(applyChatEvent(fromFrame, { event: 'done', data: { message_id: 1 } }).followups).toEqual(
      ['A?', 'B?', 'C?'],
    );
    expect(
      applyChatEvent(fromFrame, { event: 'done', data: { message_id: 1, followups: [] } })
        .followups,
    ).toEqual(['A?', 'B?', 'C?']);
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
