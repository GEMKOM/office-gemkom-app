import { authedFetch } from '@legacy/authService.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveConversation,
  getAssistantQuota,
  isAccessDenied,
  listConversations,
  NEO_UNAVAILABLE,
  needsAnswer,
  parseSseFrames,
  quotaLine,
  streamChat,
  summaryMiniStats,
  type ChatEvent,
} from './assistant';
import { neoLinkTarget } from '@/neo/neoLinks';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const mockedFetch = vi.mocked(authedFetch);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A streamed body that arrives in the given chunks. */
function sse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('parseSseFrames', () => {
  it('splits complete frames and keeps the unfinished tail', () => {
    const { events, rest } = parseSseFrames(
      'event: delta\ndata: {"text":"Mer"}\n\nevent: delta\ndata: {"text":"haba"}\n\nevent: do',
    );
    expect(events).toEqual([
      { event: 'delta', data: { text: 'Mer' } },
      { event: 'delta', data: { text: 'haba' } },
    ]);
    expect(rest).toBe('event: do');
  });

  it('reads CRLF frames and skips malformed or empty ones', () => {
    const { events } = parseSseFrames(
      'event: delta\r\ndata: {broken\r\n\r\n: keep-alive\r\n\r\nevent: done\r\ndata: {"message_id":5}\r\n\r\n',
    );
    expect(events).toEqual([{ event: 'done', data: { message_id: 5 } }]);
  });
});

describe('streamChat', () => {
  it('posts the question with the conversation and emits frames split across chunks', async () => {
    mockedFetch.mockResolvedValue(
      sse([
        'event: conversation\ndata: {"conversation_id":12,"title":"Yeni"}\n\nevent: del',
        'ta\ndata: {"text":"Teklif onay"}\n\nevent: tool\ndata: {"name":"search_job_orders","status":"start"}\n\n',
        'event: delta\ndata: {"text":" bekliyor."}\n\nevent: done\ndata: {"conversation_id":12,"message_id":99}',
      ]),
    );
    const events: ChatEvent[] = [];
    await streamChat({
      message: 'TKL-1 ne durumda?',
      conversationId: 12,
      onEvent: (e) => events.push(e),
    });

    const [url, init] = mockedFetch.mock.calls[0]!;
    expect(url).toBe('https://api.test/assistant/chat/');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      message: 'TKL-1 ne durumda?',
      conversation_id: 12,
    });
    expect(events.map((e) => e.event)).toEqual(['conversation', 'delta', 'tool', 'delta', 'done']);
    expect(events.at(-1)).toEqual({ event: 'done', data: { conversation_id: 12, message_id: 99 } });
  });

  it('leaves conversation_id out of a new chat', async () => {
    mockedFetch.mockResolvedValue(sse([]));
    await streamChat({ message: 'Merhaba', conversationId: null, onEvent: () => {} });
    expect(JSON.parse(String(mockedFetch.mock.calls[0]![1]?.body))).toEqual({ message: 'Merhaba' });
  });

  it("throws the backend's detail, or the legacy message when there is none", async () => {
    mockedFetch.mockResolvedValueOnce(json({ detail: 'Günlük limitinize ulaştınız.' }, 429));
    await expect(
      streamChat({ message: 'x', conversationId: null, onEvent: () => {} }),
    ).rejects.toMatchObject({
      status: 429,
      message: 'Günlük limitinize ulaştınız.',
    });
    mockedFetch.mockResolvedValueOnce(new Response('', { status: 502 }));
    await expect(
      streamChat({ message: 'x', conversationId: null, onEvent: () => {} }),
    ).rejects.toMatchObject({
      message: NEO_UNAVAILABLE,
    });
  });
});

describe('the rest of the client', () => {
  it('a 403 on the quota means access is closed', async () => {
    mockedFetch.mockResolvedValue(json({ detail: 'Yetkiniz yok' }, 403));
    const error = await getAssistantQuota().catch((e: unknown) => e);
    expect(isAccessDenied(error)).toBe(true);
    expect(isAccessDenied(new Error('x'))).toBe(false);
  });

  it('unwraps DRF pages and plain lists', async () => {
    mockedFetch.mockResolvedValueOnce(json({ results: [{ id: 1 }], count: 1 }));
    expect(await listConversations()).toEqual([{ id: 1 }]);
    mockedFetch.mockResolvedValueOnce(json([{ id: 2 }]));
    expect(await listConversations()).toEqual([{ id: 2 }]);
  });

  it('archives with DELETE and accepts 204', async () => {
    mockedFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await archiveConversation(7);
    expect(mockedFetch.mock.calls[0]![0]).toBe('https://api.test/assistant/conversations/7/');
    expect(mockedFetch.mock.calls[0]![1]?.method).toBe('DELETE');
  });

  it('formats the quota line and summary stats in Turkish', () => {
    expect(
      quotaLine({
        allowed: true,
        used_credits: 1200,
        monthly_limit_credits: 5000,
        messages_today: 3,
        daily_message_limit: 40,
      }),
    ).toBe('Bu ay: 1.200/5.000 kredi · Bugün: 3/40');
    expect(
      summaryMiniStats({
        id: 1,
        summary_date: '2026-11-01',
        status: 'ok',
        stats: { new_jobs_root: 2, new_jobs_child: 1, topics_new: 4, comments: 9 },
      }),
    ).toBe('3 iş emri · 4 konu · 9 yorum');
  });

  it('a report needs an answer only while Neo waits with questions', () => {
    const base = { id: 1, kind: 'bug', title: 'Kaydet çalışmıyor' };
    expect(
      needsAnswer({ ...base, status: 'needs_info', clarifying_questions: ['Hangi sayfa?'] }),
    ).toBe(true);
    expect(needsAnswer({ ...base, status: 'needs_info', clarifying_questions: [] })).toBe(false);
    expect(needsAnswer({ ...base, status: 'queued', clarifying_questions: ['x'] })).toBe(false);
  });
});

describe('neoLinkTarget', () => {
  it('reads the bell and daily-summary deep links', () => {
    expect(neoLinkTarget('/?bildirim=42')).toEqual({ reportId: 42 });
    expect(neoLinkTarget('?ozet=7')).toEqual({ summaryId: 7, openSummary: true });
    expect(neoLinkTarget('https://ofis.gemkom.com.tr/?bildirim=3&x=1')).toEqual({ reportId: 3 });
  });

  it('leaves ordinary links alone', () => {
    expect(neoLinkTarget('/sales/offers/?id=4')).toBeNull();
    expect(neoLinkTarget('/?bildirim=abc')).toBeNull();
    expect(neoLinkTarget(null)).toBeNull();
  });
});
