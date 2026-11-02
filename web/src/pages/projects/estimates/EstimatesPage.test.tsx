import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { EstimatesPage } from './EstimatesPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/navigationStructure.js', () => ({ NAVIGATION_STRUCTURE: {} }));
vi.mock('@legacy/components/estimator-method/estimator-method.js', () => ({
  loadMethodHtml: () => Promise.resolve(''),
}));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    id: 1,
    version: 2,
    status: 'done',
    subject_key: '270-01',
    subject_kind: 'job',
    title: 'Kazan',
    customer: 'İzmir Enerji',
    expected_total_eur: { in_house: 80000, subcontract: 70000 },
    eur_per_kg: { in_house: 4.5 },
    suggested_price_eur: 100000,
    review_decision: '',
    usage_usd: '3.20',
    created_at: '2026-10-20T09:00:00Z',
  },
  {
    id: 2,
    version: 1,
    status: 'running',
    subject_key: 'OF-2026-0265',
    subject_kind: 'offer',
    title: 'Platform',
    usage_usd: '1.05',
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const listCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === '/estimator/estimates/');

function renderPage(route = '/projects/estimates/') {
  return renderWithProviders(
    <ModalsProvider>
      <EstimatesPage />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/estimator/estimates/') return json({ count: 2, results: ROWS });
    if (path === '/estimator/estimates/1/') return json({ ...ROWS[0], markdown: '## 1. Özet\nÖzet metni.', versions: [] });
    return json({ detail: 'not mocked' }, 404);
  });
});

it('lists the reports with their figures and the legacy request', async () => {
  renderPage();
  expect(await screen.findByText('270-01')).toBeInTheDocument();
  expect(screen.getByText('OF-2026-0265')).toBeInTheDocument();
  expect(within(document.getElementById('stat-reports')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('stat-open')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('stat-unreviewed')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('stat-usd')!).getByText('4,25')).toBeInTheDocument();
  expect(screen.getByText('100.000')).toBeInTheDocument();
  expect(listCalls()[0]!.searchParams.get('limit')).toBe('500');
});

it('filters from the URL: status and review go to the API, the subject is filtered here', async () => {
  renderPage('/projects/estimates/?status=done&status=failed&reviewed=0&kind=offer&q=kazan');
  expect(await screen.findByText('OF-2026-0265')).toBeInTheDocument();
  expect(screen.queryByText('270-01')).toBeNull();
  const params = listCalls()[0]!.searchParams;
  expect(params.get('status')).toBe('done,failed');
  expect(params.get('reviewed')).toBe('0');
  expect(params.get('q')).toBe('kazan');
});

it('a row opens its report in a modal and keeps ?report=', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('270-01'));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('270-01 · v2 — Kazan')).toBeInTheDocument();
  await waitFor(() => expect(within(dialog).getAllByText('Özet metni.').length).toBeGreaterThan(0));
});

it('?report= opens the report directly', async () => {
  renderPage('/projects/estimates/?report=1');
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getAllByText('Özet metni.').length).toBeGreaterThan(0));
});
