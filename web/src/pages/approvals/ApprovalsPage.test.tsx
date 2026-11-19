import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { ApprovalsPage } from './ApprovalsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const access = vi.hoisted(() => ({ open: new Set<string>() }));
vi.mock('@/auth/accessControl', () => ({
  hasRouteAccess: (route: string) => access.open.has(route.replace(/[?#].*$/, '')),
}));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 7, username: 'ayse', department_code: 'imalat' } }),
}));

// The pending pages have tests of their own; here each only says how it was opened.
const page = (name: string) => ({ embedded }: { embedded?: boolean }) => (
  <p data-testid="queue-page">
    {name}
    {embedded ? ' (gömülü)' : ''}
  </p>
);
vi.mock('@/pages/procurement/purchase-requests/pending/PendingRequestsPage', () => ({
  PendingRequestsPage: page('Satın alma sayfası'),
}));
vi.mock('@/pages/general/vacation/pending/VacationPendingPage', () => ({
  VacationPendingPage: page('İzin sayfası'),
}));
vi.mock('@/pages/general/overtime/pending/OvertimePendingPage', () => ({
  OvertimePendingPage: page('Mesai sayfası'),
}));
vi.mock('@/pages/general/department-requests/pending/PendingDepartmentRequestsPage', () => ({
  PendingDepartmentRequestsPage: page('Departman sayfası'),
}));
vi.mock('@/pages/general/crane-requests/pending/CraneRequestsPendingPage', () => ({
  CraneRequestsPendingPage: page('Vinç sayfası'),
}));

const fetchMock = vi.mocked(authedFetch);

/** Waiting rows per pending_approval list; anything else is empty. */
let COUNTS: Record<string, number> = {};
let INBOX: unknown[] = [];

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function Search() {
  return <output aria-label="Adres">{useLocation().search}</output>;
}

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
const tab = (name: RegExp) => screen.getByRole('tab', { name });
/** Each tab as "label count" ("Mesai talepleri 2"), the count gone at 0. */
const tabs = () =>
  screen.getAllByRole('tab').map((t) =>
    [
      t.querySelector('.mantine-Tabs-tabLabel')?.textContent,
      t.querySelector('[data-count-badge] [aria-hidden]')?.textContent,
    ]
      .filter(Boolean)
      .join(' '),
  );

beforeEach(() => {
  COUNTS = {};
  INBOX = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/approvals/inbox/') return json(INBOX);
    const count = COUNTS[path] ?? 0;
    return json({ count, next: null, previous: null, results: [] });
  });
});

function renderPage(route = '/approvals') {
  return renderWithProviders(
    <>
      <ApprovalsPage />
      <Search />
    </>,
    { route },
  );
}

it('has a tab per queue the user can open, each with its count, and opens the first with something waiting', async () => {
  access.open = new Set([
    '/general/vacation/pending',
    '/human_resources/overtime/pending',
    '/general/crane-requests/pending',
  ]);
  COUNTS = {
    '/overtime/requests/pending_approval/': 2,
    '/cranes/requests/pending_approval/': 4,
  };
  renderPage();

  // Leave comes first but waits on nothing: the overtime tab opens.
  expect(await screen.findByText('Mesai sayfası (gömülü)')).toBeInTheDocument();
  expect(tabs()).toEqual(['İzin talepleri', 'Mesai talepleri 2', 'Vinç talepleri 4']);
  expect(tab(/Mesai talepleri/)).toHaveAttribute('aria-selected', 'true');
  expect(tab(/Vinç talepleri/)).toHaveTextContent('4 onay bekliyor');
  expect(document.getElementById('approvals-total')).toHaveTextContent('6');

  // Nothing is asked for the queues the user cannot open.
  expect(calls()).not.toContain('/procurement/purchase-requests/pending_approval/');
  expect(calls()).not.toContain('/planning/department-requests/pending_approval/');
});

it('opens the tab in the URL, and a tab change starts the next page clean', async () => {
  access.open = new Set(['/general/vacation/pending', '/human_resources/overtime/pending']);
  COUNTS = { '/overtime/requests/pending_approval/': 1 };
  renderPage('/approvals?queue=vacation&request=5');

  expect(await screen.findByText('İzin sayfası (gömülü)')).toBeInTheDocument();
  expect(screen.getByLabelText('Adres')).toHaveTextContent('?queue=vacation&request=5');

  fireEvent.click(tab(/Mesai talepleri/));
  expect(await screen.findByText('Mesai sayfası (gömülü)')).toBeInTheDocument();
  expect(screen.getByLabelText('Adres')).toHaveTextContent(/^\?queue=overtime$/);
});

it('falls back to the first queue when nothing waits, or the URL names one the user cannot open', async () => {
  access.open = new Set(['/general/vacation/pending', '/human_resources/overtime/pending']);
  renderPage('/approvals?queue=purchase');

  expect(await screen.findByText('İzin sayfası (gömülü)')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /Satın alma/ })).not.toBeInTheDocument();
  expect(document.getElementById('approvals-total')).toHaveTextContent('0');
});

it('lists the waiting records of an inbox kind, each opening on its own page', async () => {
  access.open = new Set(['/procurement/payment-lists']);
  INBOX = [
    {
      workflow_id: 1,
      subject_type: 'procurement.paymentlist',
      subject_id: 31,
      stage_name: 'Finans Onayı',
      created_at: '2026-11-18T09:00:00Z',
      snapshot: { payment_list: { title: 'Kasım 2. hafta' } },
    },
    // A kind whose page the user cannot open gets no tab.
    { workflow_id: 2, subject_type: 'sales.salesoffer', subject_id: 9, snapshot: { offer_no: 'T-9' } },
  ];
  renderPage();

  const row = await screen.findByRole('link', { name: /Kasım 2\. hafta/ });
  expect(row).toHaveAttribute('href', '/procurement/payment-lists?status=submitted');
  expect(tabs()).toEqual(['Ödeme listeleri 1']);
  expect(screen.getByRole('link', { name: /Sayfasına git/ })).toHaveAttribute(
    'href',
    '/procurement/payment-lists',
  );
});

it('says so to a user who approves nothing', async () => {
  access.open = new Set();
  renderPage();
  expect(await screen.findByText('Onay verdiğiniz bir süreç yok.')).toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  await waitFor(() => expect(calls()).toEqual(['/approvals/inbox/']));
});

it('follows a decision on a tab: the counts follow, and the tab stays when its queue empties', async () => {
  access.open = new Set(['/general/vacation/pending', '/human_resources/overtime/pending']);
  COUNTS = { '/overtime/requests/pending_approval/': 2 };
  const { queryClient } = renderPage();
  await waitFor(() => expect(tabs()).toEqual(['İzin talepleri', 'Mesai talepleri 2']));
  expect(await screen.findByText('Mesai sayfası (gömülü)')).toBeInTheDocument();

  COUNTS = { '/overtime/requests/pending_approval/': 1 };
  // What a pending page does after a decision: its own lists go stale.
  queryClient.setQueryData(['overtime', 'pending'], { count: 1 });
  await queryClient.invalidateQueries({ queryKey: ['overtime'] });
  await waitFor(() => expect(tabs()).toEqual(['İzin talepleri', 'Mesai talepleri 1']));
  expect(document.getElementById('approvals-total')).toHaveTextContent('1');

  COUNTS = {};
  queryClient.setQueryData(['overtime', 'pending'], { count: 0 });
  await queryClient.invalidateQueries({ queryKey: ['overtime'] });
  await waitFor(() => expect(tabs()).toEqual(['İzin talepleri', 'Mesai talepleri']));
  expect(tab(/Mesai talepleri/)).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Mesai sayfası (gömülü)')).toBeInTheDocument();
});
