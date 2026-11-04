import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { HrVacationPage } from './HrVacationPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const YEAR = String(new Date().getFullYear());

const BALANCES = [
  {
    id: 11,
    user_id: 5,
    user_full_name: 'Ayşe Kaya',
    year: Number(YEAR),
    leave_type: 'annual_leave',
    total_days: '14.0',
    used_days: '4.0',
    remaining_days: '10.0',
  },
  {
    id: 12,
    user_full_name: 'Kimliksiz Kişi',
    year: Number(YEAR),
    leave_type: 'annual_leave',
    total_days: '20.0',
    used_days: '0.0',
    remaining_days: '20.0',
  },
];

const INBOX = [
  {
    id: 21,
    kind: 'workflow_approval',
    status: 'submitted',
    requester_username: 'ayse.kaya',
    leave_type: 'annual_leave',
    start_date: '2026-11-10',
    end_date: '2026-11-12',
    duration_days: '3.0',
  },
  {
    id: 22,
    kind: 'cancellation_request',
    status: 'cancellation_requested',
    requester_username: 'ali.can',
    leave_type: 'sick_leave',
    start_date: '2026-11-03',
    start_time: '09:00:00',
    end_date: '2026-11-03',
    end_time: '12:30:00',
    duration_days: '0.5',
    cancellation_reason: 'Plan değişti',
  },
];

const APPROVED = [
  {
    id: 31,
    status: 'approved',
    status_label: 'Onaylandı',
    requester_full_name: 'Veli Ok',
    requester_username: 'veli.ok',
    team_label: 'Satış',
    leave_type: 'paid_leave',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    duration_days: '2.0',
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const gets = (path: string) => calls().filter((c) => c.method === 'GET' && c.url.pathname === path);
const lastGet = (path: string) => gets(path).at(-1)!;
const posts = () => calls().filter((c) => c.method === 'POST');

function renderPage(route = '/human_resources/vacation') {
  return renderWithProviders(
    <ModalsProvider>
      <HrVacationPage />
    </ModalsProvider>,
    { route },
  );
}

function cell(rowId: string, col: string): HTMLElement {
  const td = document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-col="${col}"]`);
  if (!td) throw new Error(`no cell ${rowId}/${col}`);
  return td;
}

let patchResponse: () => Promise<Response>;

beforeEach(() => {
  patchResponse = () =>
    json({ id: 11, total_days: '16.0', used_days: '4.0', remaining_days: '12.0' });
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const { pathname } = new URL(String(url));
    if (method === 'GET' && pathname === '/vacation-requests/balances/') return json(BALANCES);
    if (method === 'GET' && pathname === '/vacation-requests/requests/approvals-inbox/')
      return json({ count: 2, results: INBOX });
    if (method === 'GET' && pathname === '/vacation-requests/requests/')
      return json({ count: 41, results: APPROVED });
    if (method === 'GET' && pathname === '/vacation-requests/requests/21/')
      return json({
        ...INBOX[0],
        requester_full_name: 'Ayşe Kaya',
        team_label: 'Üretim',
        reason: 'Aile ziyareti',
        approval: {
          stage_instances: [
            {
              name: 'Yönetici Onayı',
              required_approvals: 2,
              approved_count: 1,
              approvers: [{ id: 3, full_name: 'Mehmet Şef' }],
              decisions: [
                {
                  decision: 'approve',
                  approver_detail: { full_name: 'Mehmet Şef' },
                  comment: 'Uygundur',
                },
              ],
            },
          ],
        },
      });
    if (method === 'GET' && pathname === '/vacation-requests/users/5/leave-ledger/')
      return json({
        username: 'ayse.kaya',
        current_balance: { total_days: '14.0', used_days: '4.0', remaining_days: '10.0' },
        entries: [
          {
            date: '2026-01-01',
            kind_label: 'Yıllık hak ediş',
            delta: '+14.0',
            balance_after: '14.0',
            created_by: 'sistem',
            request: null,
          },
          {
            date: '2026-03-02',
            kind_label: 'İzin kullanımı',
            delta: '-4.0',
            balance_after: '10.0',
            request: { id: 9, start_date: '2026-03-02', end_date: '2026-03-05' },
          },
        ],
      });
    if (method === 'PATCH' && pathname === '/vacation-requests/balances/11/') return patchResponse();
    if (method === 'POST') return json({ status: 'ok' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads balances for the current year, the inbox and the approved leaves', async () => {
  renderPage();
  expect(await screen.findByText('Ayşe Kaya')).toBeInTheDocument();
  expect(await screen.findByText('ali.can')).toBeInTheDocument();
  expect(await screen.findByText('Veli Ok')).toBeInTheDocument();

  expect(lastGet('/vacation-requests/balances/').url.searchParams.get('year')).toBe(YEAR);
  expect(lastGet('/vacation-requests/requests/approvals-inbox/').url.search).toBe('');
  const approved = lastGet('/vacation-requests/requests/').url.searchParams;
  expect(Object.fromEntries(approved)).toEqual({
    status: 'approved',
    ordering: '-start_date',
    page: '1',
    page_size: '20',
  });

  // Inbox: the time of an hourly leave, the cancellation reason and the kind badges.
  expect(screen.getByText('03.11.2026 09:00')).toBeInTheDocument();
  expect(screen.getByText('Plan değişti')).toBeInTheDocument();
  expect(screen.getByText('Onay Süreci')).toBeInTheDocument();
  expect(screen.getByText('İptal Talebi')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Onayla' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Reddet' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'İptali Onayla' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'İptali Reddet' })).toHaveLength(1);

  expect(within(document.getElementById('inbox-count')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('approved-count')!).getByText('41')).toBeInTheDocument();
});

it('sends the balance and approved filters from the URL', async () => {
  renderPage(
    '/human_resources/vacation?user_id=5&year=2025&search=veli&leave_type=paid_leave&start_date_from=2026-01-01&page=2',
  );
  await screen.findByText('Veli Ok');
  const balance = lastGet('/vacation-requests/balances/').url.searchParams;
  expect(balance.get('user_id')).toBe('5');
  expect(balance.get('year')).toBe('2025');
  const approved = lastGet('/vacation-requests/requests/').url.searchParams;
  expect(approved.get('search')).toBe('veli');
  expect(approved.get('leave_type')).toBe('paid_leave');
  expect(approved.get('start_date_from')).toBe('2026-01-01');
  expect(approved.has('start_date_to')).toBe(false);
  expect(approved.get('page')).toBe('2');
});

it('edits Toplam Gün inline and shows the server balance', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');

  fireEvent.click(cell('11', 'total_days'));
  const input = screen.getByRole('textbox', { name: 'Toplam Gün' });
  expect(input).toHaveValue('14');
  fireEvent.change(input, { target: { value: '16' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin bakiyesi güncellendi.'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/vacation-requests/balances/11/');
  expect(patch.body).toEqual({ total_days: '16.0' });
  // Kalan comes from the server's answer.
  const row = document.querySelector<HTMLElement>('tr[data-row-id="11"]')!;
  await waitFor(() => expect(within(row).getByText('12.0')).toBeInTheDocument());
  expect(cell('11', 'total_days')).toHaveTextContent('16.0');
});

it('refuses a negative total and rolls back a failed save with the server message', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');

  fireEvent.click(cell('11', 'total_days'));
  let input = screen.getByRole('textbox', { name: 'Toplam Gün' });
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(notify.error).toHaveBeenCalledWith('Toplam gün 0 veya daha büyük olmalıdır.');
  expect(calls().some((c) => c.method === 'PATCH')).toBe(false);

  patchResponse = () => json({ total_days: ['Kullanılan günden az olamaz.'] }, 400);
  fireEvent.click(cell('11', 'total_days'));
  input = screen.getByRole('textbox', { name: 'Toplam Gün' });
  fireEvent.change(input, { target: { value: '2' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(cell('11', 'total_days')).toHaveAttribute('data-cell-state', 'error'));
  expect(cell('11', 'total_days')).toHaveTextContent('14.0');
  expect(notify.error).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Kullanılan günden az olamaz.' }),
    expect.anything(),
  );
});

it('opens the leave ledger of a row, or warns when the row has no user', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');
  const ledgerButtons = screen.getAllByRole('button', { name: 'İzin Defteri' });

  fireEvent.click(ledgerButtons[1]!);
  expect(notify.warning).toHaveBeenCalledWith(
    'Kullanıcı ID bulunamadı. Lütfen üstteki filtreye kullanıcı ID girip tekrar deneyin.',
  );

  fireEvent.click(ledgerButtons[0]!);
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Yıllık hak ediş')).toBeInTheDocument();
  expect(within(dialog).getByText('ayse.kaya')).toBeInTheDocument();
  expect(within(dialog).getByText('#9 (2026-03-02 → 2026-03-05)')).toBeInTheDocument();
  expect(within(dialog).getByText('-4.0')).toBeInTheDocument();
});

it('shows the request detail with the approval flow', async () => {
  renderPage();
  await screen.findByText('ayse.kaya');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="21"]')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Detay' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('İzin Talebi Detayı')).toBeInTheDocument();
  expect(within(dialog).getByText('#21')).toBeInTheDocument();
  expect(within(dialog).getByText('Üretim')).toBeInTheDocument();
  expect(within(dialog).getByText('Aile ziyareti')).toBeInTheDocument();
  expect(within(dialog).getAllByText('Yönetici Onayı').length).toBeGreaterThan(0);
  expect(within(dialog).getByText('1 onay bekleniyor')).toBeInTheDocument();
  expect(within(dialog).getAllByText('Mehmet Şef').length).toBeGreaterThan(0);
  expect(within(dialog).getByText('"Uygundur"')).toBeInTheDocument();
});

it('approves a workflow request after confirming and refreshes the lists', async () => {
  renderPage('/human_resources/vacation?page=3');
  await screen.findByText('ayse.kaya');
  const inboxLoads = gets('/vacation-requests/requests/approvals-inbox/').length;

  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  expect(await screen.findByText('#21 numaralı izin talebi onaylansın mı?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Onayla' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin talebi onaylandı.'));
  expect(posts().map((c) => [c.url.pathname, c.body])).toEqual([
    ['/vacation-requests/requests/21/approve/', { comment: '' }],
  ]);
  await waitFor(() =>
    expect(gets('/vacation-requests/requests/approvals-inbox/').length).toBeGreaterThan(
      inboxLoads,
    ),
  );
  // Back to page 1 of the approved list.
  await waitFor(() =>
    expect(lastGet('/vacation-requests/requests/').url.searchParams.get('page')).toBe('1'),
  );
});

it('approves a cancellation request on its own endpoint', async () => {
  renderPage();
  await screen.findByText('ali.can');
  fireEvent.click(screen.getByRole('button', { name: 'İptali Onayla' }));
  expect(
    await screen.findByText('#22 numaralı izin iptal talebi onaylansın mı?'),
  ).toBeInTheDocument();
  expect(screen.getByText('İptal Gerekçesi: Plan değişti')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İptal talebi onaylandı.'));
  expect(posts()[0]!.url.pathname).toBe('/vacation-requests/requests/22/approve-cancellation/');
});

it('rejects with a comment, and keeps the modal usable after a failure', async () => {
  renderPage();
  await screen.findByText('ali.can');
  fireEvent.click(screen.getByRole('button', { name: 'İptali Reddet' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('İptal Talebini Reddet')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Yorum (opsiyonel)'), {
    target: { value: '  Uygun değil ' },
  });

  fetchMock.mockImplementationOnce(() => json({ detail: 'Yetkiniz yok.' }, 403));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Yetkiniz yok.' }),
      expect.anything(),
    ),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İptal talebi reddedildi.'));
  const rejects = posts();
  expect(rejects).toHaveLength(2);
  expect(rejects[1]!.url.pathname).toBe('/vacation-requests/requests/22/reject-cancellation/');
  expect(rejects[1]!.body).toEqual({ comment: 'Uygun değil' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
