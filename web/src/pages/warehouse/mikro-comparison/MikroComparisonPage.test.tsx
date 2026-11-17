import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MikroComparisonPage } from './MikroComparisonPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: () => true,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const ROW = {
  code: '0100 0000 0010 000 000',
  name: '10 mm ST 37-2 SAC',
  unit: 'kg',
  kind: 'plate',
  category_code: '0100',
  pieces: 4,
  kg: '1413.000',
  metre: '0',
  basis: 'kg',
  stock: '1413.000',
  mikro: '1500.000',
  difference: '-87.000',
  missing: '',
  in_app: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const u = new URL(String(url), 'https://api.test');
    if (u.pathname === '/warehouse/pieces/mikro-comparison/') return json({ count: 1, results: [ROW] });
    return json({});
  });
});

it('compares piece stock with Mikro on its own page', async () => {
  renderWithProviders(<MikroComparisonPage />, { route: '/warehouse/mikro-comparison' });
  expect(await screen.findByText('10 mm ST 37-2 SAC')).toBeInTheDocument();
  expect(screen.getAllByText('Sac ve Boy · Mikro Karşılaştırması').length).toBeGreaterThan(0);
  expect(screen.getByText('-87,00 kg')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Sadece farklı'));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('only_diff=true')),
    ).toBe(true),
  );
});
