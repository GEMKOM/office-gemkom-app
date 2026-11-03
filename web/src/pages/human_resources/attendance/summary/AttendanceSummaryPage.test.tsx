import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { AttendanceSummaryPage } from './AttendanceSummaryPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    user_id: 5,
    user_display: 'Ali Yılmaz',
    date_from: '2026-11-01',
    date_to: '2026-11-02',
    total_working_days: 2,
    days_present: 2,
    total_present_minutes: 1050,
    total_late_minutes: 0,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const summaryCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/attendance/hr/summary/');

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/human_resources/attendance/summary/') {
  return renderWithProviders(
    <>
      <AttendanceSummaryPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/organization/positions/')
      return json([{ id: 7, title: 'Satış', is_active: true }]);
    return json(ROWS);
  });
});

it('asks for today by default and formats the row', async () => {
  renderPage();
  expect(await screen.findByText('Ali Yılmaz')).toBeInTheDocument();
  expect(screen.getByText(`${(1050).toLocaleString('tr-TR')} dk`)).toBeInTheDocument();
  expect(screen.getAllByText('0 dk').length).toBeGreaterThan(0);
  expect(Object.fromEntries(summaryCalls()[0]!.searchParams)).toEqual({
    date_from: today(),
    date_to: today(),
  });
});

it('sends the URL filters and the typed name', async () => {
  renderPage(
    '/human_resources/attendance/summary/?date_from=2026-10-01&date_to=2026-10-31&group_id=7&username=ali',
  );
  await screen.findByText('Ali Yılmaz');
  expect(Object.fromEntries(summaryCalls()[0]!.searchParams)).toEqual({
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    group_id: '7',
    username: 'ali',
  });

  fireEvent.change(screen.getByLabelText('Ad/Soyad'), { target: { value: 'Ali' } });
  fireEvent.keyDown(screen.getByLabelText('Ad/Soyad'), { key: 'Enter' });

  await waitFor(() =>
    expect(new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('name')).toBe(
      'Ali',
    ),
  );
  await waitFor(() => expect(summaryCalls().at(-1)!.searchParams.get('name')).toBe('Ali'));
  expect(summaryCalls().at(-1)!.searchParams.get('group_id')).toBe('7');
});

it('absent=1 (the HR hub check) keeps only people with an absent day, and is not sent', async () => {
  fetchMock.mockImplementation(() =>
    json([...ROWS, { user_id: 6, user_display: 'Ayşe Kara', days_absent: 2 }]),
  );
  renderPage(
    '/human_resources/attendance/summary/?date_from=2026-10-20&date_to=2026-11-02&absent=1',
  );
  expect(await screen.findByText('Ayşe Kara')).toBeInTheDocument();
  expect(screen.queryByText('Ali Yılmaz')).toBeNull();
  expect(Object.fromEntries(summaryCalls()[0]!.searchParams)).toEqual({
    date_from: '2026-10-20',
    date_to: '2026-11-02',
  });
});
