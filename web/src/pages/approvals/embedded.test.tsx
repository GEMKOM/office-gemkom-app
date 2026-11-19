import { authedFetch } from '@/auth/authService';
import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { renderWithProviders } from '@/test/render';
import { ReleaseApprovalsPage } from '@/pages/design/release-approvals/ReleaseApprovalsPage';
import { CraneRequestsPendingPage } from '@/pages/general/crane-requests/pending/CraneRequestsPendingPage';
import { PendingDepartmentRequestsPage } from '@/pages/general/department-requests/pending/PendingDepartmentRequestsPage';
import { OvertimePendingPage } from '@/pages/general/overtime/pending/OvertimePendingPage';
import { VacationPendingPage } from '@/pages/general/vacation/pending/VacationPendingPage';
import { PendingOverridesPage } from '@/pages/human_resources/attendance/pending-overrides/PendingOverridesPage';
import { PendingRequestsPage } from '@/pages/procurement/purchase-requests/pending/PendingRequestsPage';
import type { EmbeddableProps } from './embedded';

// Every pending page Onaylar shows: inside a tab it leaves out its own band
// (title, figures, back arrow) and keeps its tables, past decisions included.

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 7, username: 'onayci', department_code: 'design' } }),
}));
vi.mock('@/auth/accessControl', () => ({ hasRouteAccess: () => true }));
vi.setConfig({ testTimeout: 20_000 });

const fetchMock = vi.mocked(authedFetch);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

const PAGES: [string, ComponentType<EmbeddableProps>, string][] = [
  ['Satın alma', PendingRequestsPage, 'Onayladığınız Talepler'],
  ['İzin', VacationPendingPage, 'Karar Verdiğim Talepler'],
  ['Mesai', OvertimePendingPage, 'Onayladığım Mesai Talepleri'],
  ['Departman', PendingDepartmentRequestsPage, 'Onay Bekleyen Departman Talepleri'],
  ['Vinç', CraneRequestsPendingPage, 'Onay Bekleyen Vinç Talepleri'],
  ['Çizim', ReleaseApprovalsPage, 'İnceleme Bekleyen Yayınlar'],
  ['PDKS', PendingOverridesPage, 'Bekleyen Talepler'],
];

it.each(PAGES)('%s: its band only on its own page', async (_name, Page, table) => {
  const { unmount } = renderWithProviders(<Page />);
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(await screen.findAllByText(table)).not.toHaveLength(0);
  unmount();

  renderWithProviders(<Page embedded />);
  expect(await screen.findAllByText(table)).not.toHaveLength(0);
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
});
