import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DiscussionsPage } from './DiscussionsPage';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ben' } }) }));

const NOW = new Date();
const today = (h: number) => {
  const date = new Date(NOW);
  date.setHours(h, 15, 0, 0);
  return date.toISOString();
};

const TOPICS = [
  {
    id: 11,
    title: 'Kaynak fikstürü ölçüleri',
    topic_type: 'general',
    priority: 'urgent',
    priority_display: 'Acil',
    comment_count: 3,
    reply_count: 2,
    last_comment_by_me: false,
    last_comment_by: 'Caner Şahin',
    last_comment_excerpt: '**Ölçüler** teyit edildi\n- tamam',
    created_at: '2026-10-20T08:00:00Z',
    last_activity_at: today(10),
    source: {
      kind: 'job_order',
      label: '293-12',
      detail: 'COPPER PANEL',
      link: '/projects/project-tracking?job=293-12',
    },
  },
  {
    id: 12,
    title: 'Boya rengi',
    topic_type: 'general',
    comment_count: 1,
    reply_count: 1,
    last_comment_by_me: true,
    excerpt: 'RAL 7035 mi?',
    created_at: '2026-10-21T08:00:00Z',
    last_activity_at: '2026-10-21T09:00:00Z',
    source: null,
  },
];

const COMMENTS = [
  {
    id: 501,
    content: 'Benim yorumum',
    reply_count: 1,
    last_reply_at: '2026-10-22T10:00:00Z',
    last_reply_by: 'Caner Şahin',
    attachment_count: 2,
    created_at: '2026-10-22T09:00:00Z',
    last_activity_at: '2026-10-22T10:00:00Z',
    topic: {
      id: 11,
      title: 'Kaynak fikstürü ölçüleri',
      topic_type: 'general',
      is_mine: false,
      created_by: 'Ayşe',
      last_comment_at: '2026-10-23T08:00:00Z',
    },
    source: { kind: 'job_order', label: '293-12' },
  },
];

const THREAD = {
  topic: {
    id: 11,
    title: 'Kaynak fikstürü ölçüleri',
    content: 'Ölçüleri **kontrol** edelim',
    attachments_data: [
      { id: 3, file_url: 'https://files.test/olcu.pdf', name: 'olcu.pdf', uploaded_by: 'ayse' },
    ],
  },
  comments: [
    {
      id: 90,
      content: 'İlk yorum @ben',
      created_by_name: 'Caner Şahin',
      created_by_username: 'caner',
      created_at: '2026-10-22T09:00:00Z',
      mentioned_users_data: [{ username: 'ben', full_name: 'Ben Kullanıcı' }],
    },
    {
      id: 91,
      content: 'Benim yorumum',
      created_by_name: 'Ben Kullanıcı',
      created_by_username: 'ben',
      created_at: '2026-10-22T09:30:00Z',
    },
  ],
};

type Call = { path: string; options: ApiFetchOptions };
const calls = (): Call[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, options]) => ({ path, options: options ?? {} }));
const callsTo = (path: string, method = 'GET') =>
  calls().filter((c) => c.path === path && (c.options.method ?? 'GET') === method);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
    const method = options.method ?? 'GET';
    if (path === '/projects/my-discussions/topics/') return { count: 2, results: TOPICS };
    if (path === '/projects/my-discussions/comments/') return { count: 1, results: COMMENTS };
    if (path === '/projects/my-discussions/summary/') {
      return {
        topics: 2,
        comments: 1,
        total_topics: 2,
        total_comments: 1,
        types: [{ value: 'general', label: 'Genel', count: 2 }],
      };
    }
    if (path === '/projects/discussion-topics/11/') return THREAD.topic;
    if (path === '/projects/discussion-topics/11/comments/') return THREAD.comments;
    if (path === '/projects/discussion-comments/' && method === 'POST')
      return { id: 92, content: 'x' };
    if (path === '/projects/discussion-comments/91/' && method === 'PATCH') return { id: 91 };
    if (path === '/users/dropdown/')
      return [{ id: 1, username: 'caner', full_name: 'Caner Şahin' }];
    if (path === '/organization/groups/') return [];
    throw new Error(`unexpected ${method} ${path}`);
  });
});

function renderPage(route = '/general/discussions') {
  return renderWithProviders(
    <>
      <DiscussionsPage />
      <LocationProbe />
    </>,
    { route },
  );
}

function typeInto(surface: HTMLElement, html: string) {
  surface.innerHTML = html;
  fireEvent.input(surface);
}

describe('DiscussionsPage', () => {
  it('lists my topics by latest activity and marks the ones waiting on me', async () => {
    renderPage();
    const awaiting = await screen.findByTestId('disc-row-11');
    expect(awaiting).toHaveAttribute('data-awaiting');
    expect(awaiting).toHaveTextContent('Yeni yanıt');
    expect(awaiting).toHaveTextContent('Acil');
    expect(awaiting).toHaveTextContent('293-12 COPPER PANEL');
    // The reply excerpt is one plain line, markers stripped.
    expect(awaiting).toHaveTextContent('Caner Şahin Ölçüler teyit edildi • tamam');
    expect(screen.getByTestId('disc-row-12')).toHaveTextContent('Son yorum sizde');
    expect(screen.getByText('Bugün')).toBeInTheDocument();

    const [list] = callsTo('/projects/my-discussions/topics/');
    expect(list!.options.params).toMatchObject({ ordering: 'activity', page: 1, page_size: 25 });
    const tabs = screen.getByRole('tablist', { name: 'Tartışmalar' });
    expect(within(tabs).getByRole('tab', { name: /Açtığım Konular\s*2/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches to my comments and keeps the tab in the URL', async () => {
    renderPage('/general/discussions?topic_type=general');
    await screen.findByTestId('disc-row-11');
    fireEvent.click(screen.getByRole('tab', { name: /Yorumlarım/ }));
    const row = await screen.findByTestId('disc-row-501');
    expect(row).toHaveTextContent('Konu: Ayşe');
    expect(row).toHaveTextContent('1 yanıt');
    expect(screen.getByTestId('location').textContent).toContain('tab=comments');
    // The type facet is per tab, so it is cleared on the way.
    expect(screen.getByTestId('location').textContent).not.toContain('topic_type');
  });

  it('orders by creation date from the sort toggle', async () => {
    renderPage();
    await screen.findByTestId('disc-row-11');
    fireEvent.click(screen.getByRole('button', { name: 'Açılış tarihi' }));
    await waitFor(() =>
      expect(callsTo('/projects/my-discussions/topics/').at(-1)!.options.params).toMatchObject({
        ordering: 'created',
      }),
    );
  });

  it('opens the thread in place and posts a comment with a mention', async () => {
    const success = vi.spyOn(notify, 'success');
    renderPage();
    fireEvent.click(
      within(await screen.findByTestId('disc-row-11')).getByRole('button', {
        name: 'Tartışmayı aç',
      }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Kaynak fikstürü ölçüleri' });
    expect((await within(dialog).findByText('kontrol')).tagName).toBe('STRONG');
    expect(within(dialog).getByText('@Ben Kullanıcı')).toHaveClass('mention-badge');
    expect(within(dialog).getByRole('button', { name: 'olcu.pdf' })).toBeInTheDocument();
    expect(within(dialog).getByText('Yorumlar (2)')).toBeInTheDocument();
    // Only my own comment can be edited.
    expect(within(dialog).getAllByRole('button', { name: 'Yorumu düzenle' })).toHaveLength(1);

    const editor = within(dialog).getByRole('textbox', { name: 'Yorum' });
    typeInto(
      editor,
      'Tamamdır <span class="mention-badge" data-mention="caner">@Caner Şahin</span> <b>teşekkürler</b>',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yorum Ekle' }));

    await waitFor(() => expect(success).toHaveBeenCalledWith('Yorum eklendi'));
    const [post] = callsTo('/projects/discussion-comments/', 'POST');
    expect(post!.options.body).toEqual({ topic: 11, content: 'Tamamdır @caner **teşekkürler**' });

    // Closing after a change reloads the list, so the counts follow.
    const before = callsTo('/projects/my-discussions/topics/').length;
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
    await waitFor(() =>
      expect(callsTo('/projects/my-discussions/topics/').length).toBeGreaterThan(before),
    );
  });

  it('edits my own comment', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Kaynak fikstürü ölçüleri'));
    const dialog = await screen.findByRole('dialog', { name: 'Kaynak fikstürü ölçüleri' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Yorumu düzenle' }));
    const editor = within(dialog).getByRole('textbox', { name: 'Yorumu düzenle' });
    expect(editor).toHaveTextContent('Benim yorumum');
    typeInto(editor, 'Düzeltilmiş yorum');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() =>
      expect(callsTo('/projects/discussion-comments/91/', 'PATCH')).toHaveLength(1),
    );
    expect(callsTo('/projects/discussion-comments/91/', 'PATCH')[0]!.options.body).toEqual({
      content: 'Düzeltilmiş yorum',
    });
  });

  it('refuses an empty comment', async () => {
    const error = vi.spyOn(notify, 'error');
    renderPage();
    fireEvent.click(await screen.findByText('Kaynak fikstürü ölçüleri'));
    const dialog = await screen.findByRole('dialog', { name: 'Kaynak fikstürü ölçüleri' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Yorum Ekle' }));
    expect(error).toHaveBeenCalledWith('Lütfen yorum metni girin');
    expect(callsTo('/projects/discussion-comments/', 'POST')).toHaveLength(0);
  });

  it('shows the first-visit message when there is nothing yet', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/projects/my-discussions/summary/')
        return { topics: 0, comments: 0, total_topics: 0, total_comments: 0, types: [] };
      return { count: 0, results: [] };
    });
    renderPage();
    expect(await screen.findByText('Henüz bir tartışma konusu açmadınız.')).toBeInTheDocument();
  });
});
