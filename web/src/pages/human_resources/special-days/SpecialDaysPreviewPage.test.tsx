import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getOccasionPreview } from '@/shell/occasion/previewStore';
import { renderWithProviders } from '@/test/render';
import { SpecialDaysPreviewPage } from './SpecialDaysPreviewPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  hasPerm: (codename: string) => codename === 'manage_hr',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/accessControl', () => ({ hasRouteAccess: () => true }));

const fetchMock = vi.mocked(authedFetch);
const years: string[] = [];

const calendar2026 = [
  {
    date: '2026-01-01',
    end_date: '2026-01-01',
    kind: 'public_holiday',
    theme: 'national',
    name: 'Yılbaşı',
    key: 'holiday:yilbasi:2026',
    is_half_day: false,
  },
  {
    date: '2026-03-08',
    end_date: '2026-03-08',
    kind: 'special_day',
    theme: 'soft',
    name: 'Dünya Kadınlar Günü',
    category: 'international',
    key: 'special:1:2026',
    id: 1,
  },
  {
    date: '2026-05-26',
    end_date: '2026-05-29',
    kind: 'public_holiday',
    theme: 'religious',
    name: 'Kurban Bayramı',
    key: 'holiday:kurban-bayrami:2026',
    is_half_day: false,
  },
  {
    date: '2026-11-11',
    end_date: '2026-11-11',
    kind: 'special_day',
    theme: 'company',
    name: 'Kuruluş Günü',
    category: 'company',
    key: 'special:2:2026',
    id: 2,
  },
  {
    date: '2026-12-31',
    end_date: '2026-12-31',
    kind: 'special_day',
    theme: 'company',
    name: 'Yılsonu',
    category: 'company',
    key: 'special:4:2026',
    id: 4,
  },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T09:00:00'));
  sessionStorage.clear();
  years.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname !== '/special-days/calendar/') {
      return Promise.resolve(new Response('[]', { status: 200 }));
    }
    const year = searchParams.get('year') ?? '';
    years.push(year);
    const results =
      year === '2026'
        ? calendar2026
        : [
            {
              date: '2027-01-01',
              end_date: '2027-01-01',
              kind: 'public_holiday',
              theme: 'national',
              name: 'Yılbaşı',
              key: 'holiday:yilbasi:2027',
            },
          ];
    return Promise.resolve(new Response(JSON.stringify({ year, results }), { status: 200 }));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

it('lists the whole year by month, mutes past days and previews one', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  const list = await screen.findByTestId('year-calendar');
  expect(years).toEqual(['2026']);

  const may = within(list).getByRole('region', { name: 'Mayıs 2026' });
  expect(within(may).getByText('Kurban Bayramı')).toBeInTheDocument();
  expect(within(may).getByText('Dini bayram')).toBeInTheDocument();
  expect(within(list).getByRole('region', { name: 'Mart 2026' })).toHaveTextContent('Uluslararası');
  expect(
    within(list)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent),
  ).toEqual(['Ocak', 'Mart', 'Mayıs', 'Kasım', 'Aralık']);

  const row = (name: string) => within(list).getByText(name).closest('li');
  expect(row('Yılbaşı')).toHaveAttribute('data-past', 'true');
  expect(row('Kuruluş Günü')).not.toHaveAttribute('data-past');
  expect(row('Kuruluş Günü')).toHaveTextContent('Bugün');
  expect(row('Yılsonu')).not.toHaveAttribute('data-past');

  // Holidays preview, company days also open their editor.
  expect(within(row('Yılbaşı')!).queryByRole('button', { name: /düzenle/ })).toBeNull();
  expect(within(row('Yılsonu')!).getByRole('button', { name: 'Yılsonu 31 Aralık düzenle' }));

  fireEvent.click(within(list).getByRole('button', { name: 'Kurban Bayramı 26 Mayıs önizle' }));
  expect(getOccasionPreview()).toBe('2026-05-26');
});

it('switches to next year', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  await screen.findByTestId('year-calendar');
  fireEvent.click(screen.getByRole('radio', { name: '2027' }));
  await waitFor(() => expect(years).toContain('2027'));
  expect(await screen.findByRole('region', { name: 'Ocak 2027' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Kurban Bayramı')).toBeNull());
});

it('previews the picked day', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  fireEvent.change(screen.getByLabelText(/Gün/), { target: { value: '2026-10-29' } });
  fireEvent.click(screen.getByRole('button', { name: 'Bu Günü Önizle' }));
  await waitFor(() => expect(getOccasionPreview()).toBe('2026-10-29'));
});
