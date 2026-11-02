import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { QcReviewsPage } from './QcReviewsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const auth = vi.hoisted(() => ({ user: { id: 1, username: 'kk' } as Record<string, unknown> }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: auth.user }) }));

const fetchMock = vi.mocked(authedFetch);

const REVIEWS = [
  {
    id: 11,
    job_order: '254-01',
    task_title: 'Flanş kaynağı',
    status: 'pending',
    submitted_by_name: 'Ali Kaya',
  },
  {
    id: 12,
    job_order: '254-02',
    task_title: 'Mil tornalama',
    status: 'rejected',
    ncr_number: 'NCR-7',
    open_ncr_count: 4,
  },
];

const DETAIL = {
  ...REVIEWS[0],
  comment: 'Ölçüler kontrol edildi',
  part_data: [
    { position_no: 'P1', drawing_no: 'D-100', quantity_inspected: 3 },
    { position_no: 'P2', drawing_no: 'D-101', quantity_inspected: 1 },
  ],
  discussion_topic_data: {
    id: 77,
    title: 'KK #11',
    comments: [{ id: 1, content: 'Bu **önemli**', created_by_name: 'Ayşe' }],
  },
};

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
const listCalls = () =>
  calls().filter(
    (c) =>
      c.method === 'GET' &&
      c.url.pathname === '/quality-control/qc-reviews/' &&
      c.url.searchParams.get('page_size') !== '1',
  );

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/quality-control/qc-reviews/') {
  return renderWithProviders(
    <ModalsProvider>
      <QcReviewsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  auth.user = { id: 1, username: 'kk' };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/quality-control/qc-reviews/') {
      return json({ count: 2, next: null, previous: null, results: REVIEWS });
    }
    if (method === 'GET' && path === '/quality-control/qc-reviews/11/') return json(DETAIL);
    if (method === 'POST' && path === '/quality-control/qc-reviews/11/decide/')
      return json({ ...DETAIL, status: 'rejected' });
    if (method === 'POST' && path === '/projects/discussion-comments/') return json({ id: 2 }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists reviews and sends every filter with the legacy keys', async () => {
  renderPage('/quality-control/qc-reviews/?status=pending&task__job_order=254-01&page=2');
  expect(await screen.findByText('Flanş kaynağı')).toBeInTheDocument();
  expect(screen.getByText('NCR-7').closest('a')).toHaveAttribute(
    'href',
    '/quality-control/ncrs/?ncr=NCR-7',
  );
  expect(screen.getByText('#11').closest('a')).toHaveAttribute(
    'href',
    '/quality-control/qc-reviews/?review=11',
  );

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    status: 'pending',
    task__job_order: '254-01',
    ordering: '-submitted_at',
    page: '2',
    page_size: '20',
  });

  fireEvent.change(screen.getByLabelText('Arama'), { target: { value: 'flanş' } });
  fireEvent.keyDown(screen.getByLabelText('Arama'), { key: 'Enter' });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    search: 'flanş',
    status: 'pending',
    task__job_order: '254-01',
    ordering: '-submitted_at',
    page: '1',
    page_size: '20',
  });
});

it('approve and reject are only offered to the QC group, on pending reviews', async () => {
  const view = renderPage();
  await screen.findByText('Flanş kaynağı');
  expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull();
  view.unmount();

  auth.user = { id: 2, username: 'kalite', user_group_ids: [5] };
  renderPage();
  await screen.findByText('Flanş kaynağı');
  // One pending row out of two.
  expect(screen.getAllByRole('button', { name: 'Onayla' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Reddet' })).toHaveLength(1);
});

it('rejecting needs a reason and sends the NCR defaults', async () => {
  auth.user = { id: 2, username: 'kalite', user_groups: ['Kalite-Kontrol'] };
  renderPage();
  await screen.findByText('Flanş kaynağı');
  fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));

  const dialog = await screen.findByRole('dialog', { name: 'KK İnceleme Kararı' });
  expect(within(dialog).getByLabelText('NCR Başlığı')).toHaveValue('KK Red: Flanş kaynağı');
  // The first part's inspected quantity.
  expect(within(dialog).getByLabelText('Etkilenen Miktar')).toHaveValue('3');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Karar Ver' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Yorum/), { target: { value: 'Ölçü dışı' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Karar Ver' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('İnceleme reddedildi ve NCR oluşturuldu'),
  );
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    approve: false,
    comment: 'Ölçü dışı',
    ncr_title: 'KK Red: Flanş kaynağı',
    ncr_defect_type: 'other',
    ncr_severity: 'minor',
    ncr_affected_quantity: 3,
    ncr_disposition: 'pending',
  });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('?review= opens the details with parts and discussion, and adds a comment', async () => {
  renderPage('/quality-control/qc-reviews/?review=11');
  const dialog = await screen.findByRole('dialog', { name: 'KK İnceleme #11' });
  expect(await within(dialog).findByText('Ölçüler kontrol edildi')).toBeInTheDocument();
  expect(within(dialog).getByText('D-101')).toBeInTheDocument();
  expect(within(dialog).getByText('Tartışma Yorumları (1)')).toBeInTheDocument();
  expect(within(dialog).getByText('önemli').tagName).toBe('STRONG');
  // Not in the QC group: no decision buttons.
  expect(within(dialog).queryByRole('button', { name: 'Onayla' })).toBeNull();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Yorum Ekle' }));
  expect(notify.warning).toHaveBeenCalledWith('Lütfen yorum metni girin');

  fireEvent.change(within(dialog).getByLabelText('Yeni Yorum'), { target: { value: 'Tamam' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yorum Ekle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Yorum eklendi'));
  expect(calls().find((c) => c.url.pathname === '/projects/discussion-comments/')!.body).toEqual({
    topic: 77,
    content: 'Tamam',
  });
  // The review is loaded again.
  await waitFor(() =>
    expect(
      calls().filter((c) => c.url.pathname === '/quality-control/qc-reviews/11/').length,
    ).toBeGreaterThan(1),
  );

  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('review'));
});
