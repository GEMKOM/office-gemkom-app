import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          start: '2026-11-11',
          days: 60,
          results: [
            {
              date: '2026-11-20',
              end_date: '2026-11-20',
              kind: 'birthday',
              theme: 'birthday',
              name: 'Doğum günü',
              user_id: 3,
              full_name: 'Selin Yıldız',
            },
            {
              date: '2026-12-31',
              end_date: '2026-12-31',
              kind: 'special_day',
              theme: 'company',
              name: 'Yılsonu',
              key: 'special:4:2026',
            },
            {
              date: '2026-12-20',
              end_date: '2026-12-23',
              kind: 'public_holiday',
              theme: 'religious',
              name: 'Kurban Bayramı',
              key: 'holiday:kurban-bayrami:2026',
              is_half_day: false,
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
});

it('lists the coming holidays and company days, not birthdays, and previews one', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  expect(await screen.findByText('Kurban Bayramı')).toBeInTheDocument();
  expect(screen.getByText('Dini bayram')).toBeInTheDocument();
  expect(screen.getByText('Yılsonu')).toBeInTheDocument();
  expect(screen.queryByText(/Selin Yıldız/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Kurban Bayramı önizle' }));
  expect(getOccasionPreview()).toBe('2026-12-20');
});

it('previews the picked day', async () => {
  renderWithProviders(<SpecialDaysPreviewPage />, { route: '/human_resources/special-days' });
  fireEvent.change(screen.getByLabelText(/Gün/), { target: { value: '2026-10-29' } });
  fireEvent.click(screen.getByRole('button', { name: 'Bu Günü Önizle' }));
  await waitFor(() => expect(getOccasionPreview()).toBe('2026-10-29'));
});
