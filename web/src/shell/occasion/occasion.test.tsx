import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { act } from 'react';
import { OccasionLayer } from './OccasionLayer';
import { OccasionPreviewBanner } from './OccasionPreviewBanner';
import { endOccasionPreview, getOccasionPreview, startOccasionPreview } from './previewStore';
import { SpecialDaysPanel } from './SpecialDaysPanel';

const perms = vi.hoisted(() => ({ hr: true }));
vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  hasPerm: (codename: string) => perms.hr && codename === 'manage_hr',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const auth = vi.hoisted(() => ({ isImpersonating: false }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 7, username: 'mehmet', first_name: 'Mehmet' },
    isImpersonating: auth.isImpersonating,
  }),
}));

const fetchMock = vi.mocked(authedFetch);
let responses: Record<string, unknown>;
let posted: { url: string; body: unknown }[];
let celebrateStatus = 201;

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const BIRTHDAY_DAY = {
  date: '2026-11-11',
  occasions: [
    {
      key: 'birthday:2026',
      kind: 'birthday',
      theme: 'birthday',
      name: 'Doğum gününüz',
      title: 'İyi ki doğdunuz, Mehmet',
      body: 'GEMKOM ailesi olarak yeni yaşınızı kutlarız.',
      show_popup: true,
      years: null,
      is_half_day: false,
    },
  ],
  colleagues: [
    {
      user_id: 21,
      full_name: 'Ayşe Kaya',
      department_code: 'procurement',
      position_title: 'Uzman',
      kind: 'birthday',
      years: null,
      celebrated_by_me: false,
      celebration_count: 2,
    },
    {
      user_id: 22,
      full_name: 'Burak Tunç',
      department_code: null,
      position_title: null,
      kind: 'work_anniversary',
      years: 10,
      celebrated_by_me: true,
      celebration_count: 4,
    },
  ],
  received: [
    {
      sender_id: 21,
      sender_name: 'Ayşe Kaya',
      kind: 'birthday',
      message: 'Nice mutlu yıllara',
      created_at: '2026-11-11T07:00:00Z',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset.occasion;
  auth.isImpersonating = false;
  perms.hr = true;
  celebrateStatus = 201;
  posted = [];
  responses = {
    '/special-days/today/': BIRTHDAY_DAY,
    '/special-days/upcoming/': {
      start: '2026-11-11',
      days: 14,
      results: [
        {
          date: '2026-11-11',
          end_date: '2026-11-11',
          kind: 'birthday',
          theme: 'birthday',
          name: 'Doğum günü',
          user_id: 21,
          full_name: 'Ayşe Kaya',
        },
        {
          date: '2026-11-12',
          end_date: '2026-11-12',
          kind: 'work_anniversary',
          theme: 'anniversary',
          name: '5. iş yılı',
          user_id: 30,
          full_name: 'Kemal Aras',
          years: 5,
        },
        {
          date: '2026-11-20',
          end_date: '2026-11-20',
          kind: 'special_day',
          theme: 'company',
          name: 'Kuruluş Günü',
          key: 'special:2:2026',
        },
      ],
    },
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const { pathname } = new URL(String(url));
    if (init?.method === 'POST') {
      posted.push({ url: pathname, body: JSON.parse(String(init.body)) });
      return json(
        celebrateStatus === 201 ? { id: 1 } : { detail: 'Zaten kutladınız.' },
        celebrateStatus,
      );
    }
    return json(responses[pathname] ?? {});
  });
});

describe('OccasionLayer', () => {
  it('themes the band and welcomes the person once', async () => {
    const first = renderWithProviders(<OccasionLayer />);
    const welcome = await screen.findByRole('dialog');
    expect(
      within(welcome).getByRole('heading', { name: 'İyi ki doğdunuz, Mehmet' }),
    ).toBeInTheDocument();
    expect(within(welcome).getByText('Nice mutlu yıllara')).toBeInTheDocument();
    expect(document.documentElement.dataset.occasion).toBe('birthday');

    fireEvent.click(within(welcome).getByRole('button', { name: 'Uygulamaya Geç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    first.unmount();
    expect(document.documentElement.dataset.occasion).toBeUndefined();

    // A later visit the same day: the theme, no welcome.
    renderWithProviders(<OccasionLayer />);
    await waitFor(() => expect(document.documentElement.dataset.occasion).toBe('birthday'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens no welcome while an admin browses as someone else', async () => {
    auth.isImpersonating = true;
    renderWithProviders(<OccasionLayer />);
    await waitFor(() => expect(document.documentElement.dataset.occasion).toBe('birthday'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves the band alone on an ordinary day', async () => {
    responses['/special-days/today/'] = {
      date: '2026-11-12',
      occasions: [],
      colleagues: [],
      received: [],
    };
    renderWithProviders(<OccasionLayer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(document.documentElement.dataset.occasion).toBeUndefined();
  });
});

describe('SpecialDaysPanel', () => {
  it('lists today and the coming days, without repeating today', async () => {
    renderWithProviders(<SpecialDaysPanel />);
    expect(await screen.findByText('1 kişi sizi kutladı.')).toBeInTheDocument();
    expect(screen.getByText('Ayşe Kaya')).toBeInTheDocument();
    expect(screen.getByText('Kutladınız')).toBeInTheDocument();
    expect(await screen.findByText('Kemal Aras, 5. yıl')).toBeInTheDocument();
    expect(screen.getByText('Yarın')).toBeInTheDocument();
    expect(screen.getByText('Kuruluş Günü')).toBeInTheDocument();
    expect(screen.queryByText('Ayşe Kaya, doğum günü')).not.toBeInTheDocument();
  });

  it('sends a celebration with its message', async () => {
    renderWithProviders(<SpecialDaysPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Kaya kutla' }));
    // The dropdown is still in its open transition in jsdom: reach it as hidden.
    fireEvent.change(await screen.findByLabelText('Kısa mesaj (isteğe bağlı)'), {
      target: { value: ' İyi ki doğdun ' },
    });
    expect(screen.getByText('15 / 280')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder', hidden: true }));
    await waitFor(() =>
      expect(posted).toEqual([
        {
          url: '/special-days/celebrate/',
          body: { recipient: 21, kind: 'birthday', message: 'İyi ki doğdun' },
        },
      ]),
    );
  });

  it('treats an earlier celebration as done', async () => {
    celebrateStatus = 409;
    renderWithProviders(<SpecialDaysPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ayşe Kaya kutla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Gönder' })).not.toBeInTheDocument(),
    );
  });

  it('stays hidden on a day with nothing to show', async () => {
    responses['/special-days/today/'] = {
      date: '2026-11-12',
      occasions: [],
      colleagues: [],
      received: [],
    };
    responses['/special-days/upcoming/'] = { start: '2026-11-12', days: 14, results: [] };
    renderWithProviders(<SpecialDaysPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Özel Günler')).not.toBeInTheDocument();
  });
});

describe('HR preview', () => {
  const ARIFE = {
    date: '2026-10-28',
    occasions: [
      {
        key: 'holiday:cumhuriyet-bayrami:2026',
        kind: 'public_holiday',
        theme: 'national',
        name: 'Cumhuriyet Bayramı',
        title: 'Cumhuriyet Bayramı kutlu olsun',
        body: '',
        show_popup: true,
        years: null,
        is_half_day: true,
      },
    ],
    colleagues: BIRTHDAY_DAY.colleagues,
    received: [],
  };
  const requested = (path: string) =>
    fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((u) => u.pathname === path);

  it('asks for the previewed day, themes for it, and welcomes again for each preview', async () => {
    fetchMock.mockImplementation((url) => {
      const u = new URL(String(url));
      if (u.pathname === '/special-days/today/' && u.searchParams.get('date') === '2026-10-28')
        return json(ARIFE);
      return json(responses[u.pathname] ?? {});
    });
    renderWithProviders(
      <>
        <OccasionPreviewBanner />
        <OccasionLayer />
      </>,
    );
    // The real day first: its welcome, closed.
    fireEvent.click(await screen.findByRole('button', { name: 'Uygulamaya Geç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    act(() => startOccasionPreview('2026-10-28'));
    expect(await screen.findByTestId('occasion-preview-banner')).toHaveTextContent('28 Ekim 2026');
    const welcome = await screen.findByRole('dialog');
    expect(
      within(welcome).getByRole('heading', { name: 'Cumhuriyet Bayramı kutlu olsun' }),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.occasion).toBe('national');
    expect(
      requested('/special-days/today/').some((u) => u.searchParams.get('date') === '2026-10-28'),
    ).toBe(true);
    // A preview never marks the real welcome list.
    fireEvent.click(within(welcome).getByRole('button', { name: 'Uygulamaya Geç' }));
    expect(localStorage.getItem('gk.occasion.seen')).not.toContain('cumhuriyet');

    fireEvent.click(screen.getByRole('button', { name: 'Önizlemeyi Bitir' }));
    await waitFor(() => expect(document.documentElement.dataset.occasion).toBe('birthday'));
    expect(screen.queryByTestId('occasion-preview-banner')).not.toBeInTheDocument();
  });

  it('turns Kutla off and moves the coming days to the previewed day', async () => {
    startOccasionPreview('2026-10-28');
    renderWithProviders(<SpecialDaysPanel />);
    expect(await screen.findByRole('button', { name: 'Ayşe Kaya kutla' })).toBeDisabled();
    await waitFor(() =>
      expect(requested('/special-days/upcoming/').map((u) => u.searchParams.get('date'))).toContain(
        '2026-10-28',
      ),
    );
    endOccasionPreview();
  });

  it('ignores a stored day for someone who is not HR', () => {
    startOccasionPreview('2026-10-28');
    perms.hr = false;
    expect(getOccasionPreview()).toBeNull();
    perms.hr = true;
    expect(getOccasionPreview()).toBe('2026-10-28');
    endOccasionPreview();
  });
});
