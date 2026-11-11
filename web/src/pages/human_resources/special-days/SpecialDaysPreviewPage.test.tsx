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

const yilsonuDesign = {
  layout: 'flag',
  tone: '#14213d',
  ink: '#ffffff',
  accent: '#9fb7ff',
  accent_on_ink: '',
  paper: '#fff8f4',
  font: 'Fraunces',
  motif: 'kar',
  numeral: '{year}',
  cta: 'Uygulamaya Geç',
};

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
    date: '2026-10-29',
    end_date: '2026-10-29',
    kind: 'public_holiday',
    theme: 'national',
    name: 'Cumhuriyet Bayramı',
    key: 'holiday:cumhuriyet-bayrami:2026',
    id: 12,
    before_date: '2026-10-27',
    display_date: '2026-10-27',
    is_active: true,
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
    date: '2026-12-10',
    end_date: '2026-12-10',
    kind: 'special_day',
    theme: 'religious',
    name: 'Regaip Kandili',
    category: 'religious',
    key: 'special:20:2026-12-10',
    id: 20,
    is_active: false,
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
    before_date: '2026-12-31',
    display_date: '2026-12-31',
    is_active: true,
    design: yilsonuDesign,
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

it('lists the whole year by month with each look, mutes past and switched-off days', async () => {
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
  ).toEqual(['Ocak', 'Mart', 'Mayıs', 'Ekim', 'Kasım', 'Aralık']);

  const row = (name: string) => within(list).getByText(name).closest('li') as HTMLElement;
  expect(row('Yılbaşı')).toHaveAttribute('data-past', 'true');
  expect(row('Kuruluş Günü')).not.toHaveAttribute('data-past');
  expect(row('Kuruluş Günü')).toHaveTextContent('Bugün');

  // Each day shows its look; a holiday shows when its welcome opens.
  const chip = within(row('Yılsonu')).getByTestId('design-chip');
  expect(chip).toHaveStyle({ background: '#14213d' });
  expect(chip.querySelector('svg')).toHaveAttribute('data-motif', 'kar');
  expect(row('Cumhuriyet Bayramı')).toHaveTextContent('Karşılama 27 Ekim Salı');
  expect(row('Yılsonu')).not.toHaveTextContent('Karşılama');

  // Switched-off days are listed, muted, and cannot be previewed.
  expect(row('Regaip Kandili')).toHaveAttribute('data-off', 'true');
  expect(row('Regaip Kandili')).toHaveTextContent('Kapalı');
  expect(within(row('Regaip Kandili')).getByRole('button', { name: /önizle/ })).toBeDisabled();

  // Days with a design row open it in Tasarım; holidays without one only preview.
  expect(within(row('Yılbaşı')).queryByRole('button', { name: /tasarımı/ })).toBeNull();
  fireEvent.click(
    within(row('Yılsonu')).getByRole('button', { name: 'Yılsonu 31 Aralık tasarımı' }),
  );
  expect(await screen.findByRole('tab', { name: 'Tasarım' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

it('previews a holiday on the day its welcome shows', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  const list = await screen.findByTestId('year-calendar');
  fireEvent.click(within(list).getByRole('button', { name: 'Cumhuriyet Bayramı 29 Ekim önizle' }));
  expect(getOccasionPreview()).toBe('2026-10-27');
});

it('switches to next year', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  await screen.findByTestId('year-calendar');
  fireEvent.click(screen.getByRole('radio', { name: '2027' }));
  await waitFor(() => expect(years).toContain('2027'));
  expect(await screen.findByRole('region', { name: 'Ocak 2027' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Kurban Bayramı')).toBeNull());
});

it('switches between Takvim, Tasarım and Önizleme on the band', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  await screen.findByTestId('year-calendar');
  expect(screen.getByRole('tab', { name: 'Takvim' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Tasarım' }));
  expect(await screen.findByText('Düzenlenecek gün yok.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Önizleme' }));
  expect(screen.getByRole('button', { name: 'Bu Günü Önizle' })).toBeInTheDocument();
  expect(screen.queryByTestId('year-calendar')).toBeNull();
});

it('previews the picked day', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, {
    route: '/human_resources/special-days?bolum=onizleme',
  });
  fireEvent.change(screen.getByLabelText(/^Gün/), { target: { value: '2026-10-29' } });
  fireEvent.click(screen.getByRole('button', { name: 'Bu Günü Önizle' }));
  await waitFor(() => expect(getOccasionPreview()).toBe('2026-10-29'));
});
