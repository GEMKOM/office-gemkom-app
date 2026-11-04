import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { OrgChartPage, treeStats } from './OrgChartPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TREE = [
  {
    id: 1,
    title: 'Genel Müdür',
    level: 1,
    department_code: 'management',
    holder_count: 1,
    children: [
      {
        id: 2,
        title: 'Satış Müdürü',
        level: 2,
        department_code: 'sales',
        holder_count: 0,
        children: [{ id: 3, title: 'Satış Uzmanı', level: 3, department_code: 'sales', holder_count: 2, children: [] }],
      },
      { id: 4, title: 'İK Uzmanı', level: 3, department_code: 'human_resources', holder_count: 1, children: [] },
    ],
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/organization/positions/tree/') return json(TREE);
    if (path === '/organization/positions/2/') {
      return json({
        id: 2,
        title: 'Satış Müdürü',
        level: 2,
        department_code: 'sales',
        parent_title: 'Genel Müdür',
        permission_codenames: ['access_sales', 'office_access'],
      });
    }
    if (path === '/organization/positions/2/holders/') return json([]);
    return json({ detail: 'not mocked' }, 404);
  });
});

it('counts positions, holders, vacant seats and depth', () => {
  expect(treeStats(TREE)).toEqual({ positions: 4, holders: 4, vacant: 1, maxDepth: 3 });
});

it('draws the chart with the figures and opens a position', async () => {
  renderWithProviders(<OrgChartPage />, { route: '/human_resources/org/' });
  expect(await screen.findByText('Satış Uzmanı')).toBeInTheDocument();
  await waitFor(() => expect(document.getElementById('stat-positions')).toHaveTextContent('4'));
  expect(document.getElementById('stat-vacant')).toHaveTextContent('1');
  expect(document.getElementById('stat-depth')).toHaveTextContent('3');

  fireEvent.click(screen.getByRole('button', { name: 'Satış Müdürü (0 kişi)' }));
  const detail = await screen.findByTestId('org-position-detail');
  expect(within(detail).getByText('Seviye 2 · Proje Taahhüt · Bağlı: Genel Müdür')).toBeInTheDocument();
  expect(within(detail).getByText('Atanmış kullanıcı yok (boş pozisyon).')).toBeInTheDocument();
  expect(within(detail).getByText('Yetkiler (2)')).toBeInTheDocument();
  expect(within(detail).getByText('access_sales')).toBeInTheDocument();
});

it('collapses a subtree and "Tümünü Kapat" keeps the roots open', async () => {
  renderWithProviders(<OrgChartPage />, { route: '/human_resources/org/' });
  await screen.findByText('Satış Uzmanı');
  fireEvent.click(screen.getByRole('button', { name: 'Satış Müdürü kapat' }));
  expect(screen.queryByText('Satış Uzmanı')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Aç' }));
  expect(screen.getByText('Satış Uzmanı')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Kapat' }));
  expect(screen.getByText('Satış Müdürü')).toBeInTheDocument();
  expect(screen.queryByText('Satış Uzmanı')).toBeNull();
});

it('search outlines matches and dims the rest', async () => {
  renderWithProviders(<OrgChartPage />, { route: '/human_resources/org/' });
  await screen.findByText('Satış Uzmanı');
  fireEvent.change(screen.getByLabelText('Pozisyon ara'), { target: { value: 'ik' } });
  // Turkish casing: "İK Uzmanı" matches "ik".
  expect(screen.getByRole('button', { name: 'İK Uzmanı (1 kişi)' })).toHaveAttribute('data-match');
  expect(screen.getByRole('button', { name: 'Genel Müdür (1 kişi)' })).toHaveAttribute('data-dimmed');
});
