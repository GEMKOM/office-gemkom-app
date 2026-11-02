import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ApprovalsPage } from './ApprovalsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const STAGES = [
  { id: 21, name: 'Müdür', order: 2, required_approvals: 1, role_user_group: 5 },
  { id: 20, name: 'Amir', order: 1, required_approvals: 1, climb_levels: 1, approver_users: [] },
];
const POLICIES = [
  {
    id: 1,
    name: 'Satın alma < 5000',
    subject_type: 'purchase_request',
    is_active: true,
    selection_priority: 10,
    max_amount_eur: '5000',
    stages: STAGES,
    live_workflow_count: 3,
    total_workflow_count: 40,
  },
  { id: 2, name: 'İzin', subject_type: 'vacation_requests.vacationrequest', is_active: false, stages: [] },
];
const SUBJECT_TYPES = [
  { value: 'purchase_request', label: 'Satın Alma Talebi' },
  { value: 'vacation_requests.vacationrequest', label: 'İzin Talebi' },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const writes = () => calls().filter((c) => c.method !== 'GET');

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <ApprovalsPage />
    </ModalsProvider>,
    { route: '/it/approvals/' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/approvals/policies/' && method === 'GET') return json(POLICIES);
    if (path === '/approvals/policies/1/' && method === 'GET') return json(POLICIES[0]);
    if (path === '/approvals/subject-types/') return json(SUBJECT_TYPES);
    if (path === '/organization/groups/') return json([{ id: 5, name: 'satinalma', display_name: 'Satın Alma' }]);
    if (method === 'DELETE') return json(undefined, 204);
    if (method === 'POST' || method === 'PATCH') return json({ id: 99 });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the policies and shows the stages of the clicked one in order', async () => {
  renderPage();
  expect(await screen.findByText('Satın alma < 5000')).toBeInTheDocument();
  expect(screen.getByText('– ≤ €5000')).toBeInTheDocument();
  expect(screen.getByText('İzin Talebi')).toBeInTheDocument();
  // The stage picker's groups load with page_size=1000, as legacy asked.
  const groupsCall = calls().find((c) => c.url.pathname === '/organization/groups/')!;
  expect(groupsCall.url.searchParams.get('page_size')).toBe('1000');

  fireEvent.click(screen.getByText('Satın alma < 5000'));
  const panel = await screen.findByTestId('policy-panel');
  expect(within(panel).getByText('Maks: €5000')).toBeInTheDocument();
  const stageNames = within(panel)
    .getAllByTestId(/^stage-/)
    .map((el) => el.textContent);
  expect(stageNames[0]).toContain('Amir');
  expect(stageNames[0]).toContain('1 kademe yukarı');
  expect(stageNames[1]).toContain('Grup: Satın Alma');
});

it('creates a policy with the legacy payload; bounds only for purchase requests', async () => {
  renderPage();
  await screen.findByText('Satın alma < 5000');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Politika' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Politika' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(within(dialog).getByText('Ad gereklidir.')).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Min. Tutar (€)')).toBeNull();

  fireEvent.click(within(dialog).getByLabelText(/Konu Türü/));
  fireEvent.click(await screen.findByRole('option', { name: 'Satın Alma Talebi', hidden: true }));
  fireEvent.change(within(dialog).getByLabelText(/^Ad/), { target: { value: ' Büyük alımlar ' } });
  fireEvent.change(within(dialog).getByLabelText('Min. Tutar (€)'), { target: { value: '5000' } });
  fireEvent.change(within(dialog).getByLabelText(/Seçim Önceliği/), { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Politika oluşturuldu.'));
  expect(writes()).toEqual([
    {
      url: new URL('https://api.test/approvals/policies/'),
      method: 'POST',
      body: {
        name: 'Büyük alımlar',
        subject_type: 'purchase_request',
        is_active: true,
        selection_priority: 100,
        min_amount_eur: 5000,
        max_amount_eur: null,
      },
    },
  ]);
});

it('adds a stage with the resolver fields of the chosen type', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Satın alma < 5000'));
  const panel = await screen.findByTestId('policy-panel');
  fireEvent.click(within(panel).getByRole('button', { name: 'Aşama Ekle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Aşama Ekle' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect((await within(dialog).findAllByText('Ad ve sıra gereklidir.')).length).toBeGreaterThan(0);

  fireEvent.change(within(dialog).getByLabelText(/^Ad/), { target: { value: 'Genel Müdür' } });
  fireEvent.change(within(dialog).getByLabelText(/^Sıra/), { target: { value: '3' } });
  fireEvent.change(within(dialog).getByLabelText('Sabit Onaylayıcı Kullanıcı ID’leri'), {
    target: { value: '12, 34, x' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Aşama eklendi.'));
  const post = writes()[0]!;
  expect(post.url.pathname).toBe('/approvals/policies/1/stages/');
  expect(post.body).toEqual({
    name: 'Genel Müdür',
    order: 3,
    required_approvals: 1,
    approver_users: [12, 34],
    climb_levels: null,
    role_user_group: null,
  });
});

it('deletes a stage only after the confirm', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Satın alma < 5000'));
  const panel = await screen.findByTestId('policy-panel');
  fireEvent.click(within(panel).getByRole('button', { name: 'Müdür aşamasını sil' }));
  expect(await screen.findByText('"Müdür" aşamasını silmek istediğinize emin misiniz?')).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  const dialog = screen.getByRole('dialog', { name: 'Silme Onayı' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Aşama silindi.'));
  expect(writes().map((c) => [c.method, c.url.pathname])).toEqual([['DELETE', '/approvals/stages/21/']]);
});

it('the subject types tab lists the backend types', async () => {
  renderPage();
  await screen.findByText('Satın alma < 5000');
  fireEvent.click(screen.getByRole('tab', { name: 'Konu Türleri' }));
  expect(await screen.findByText('vacation_requests.vacationrequest')).toBeInTheDocument();
});
