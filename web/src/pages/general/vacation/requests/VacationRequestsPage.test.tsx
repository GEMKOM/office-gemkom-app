import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { vacationRequestIdFromNotes } from './AttendanceCalendar';
import { VacationRequestsPage } from './VacationRequestsPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const REQUESTS = [
  {
    id: 11,
    leave_type: 'annual_leave',
    status: 'submitted',
    status_label: 'Onay Bekliyor',
    start_date: '2026-11-10',
    end_date: '2026-11-12',
    duration_days: '3.0',
    created_at: '2026-11-01T09:00:00Z',
  },
  {
    id: 12,
    leave_type: 'compensatory_leave',
    status: 'approved',
    status_label: 'Onaylandı',
    start_date: '2026-11-20',
    end_date: '2026-11-20',
    start_time: '09:00:00',
    end_time: '11:30:00',
    created_at: '2026-11-02T09:00:00Z',
  },
  {
    id: 13,
    leave_type: 'sick_leave',
    status: 'rejected',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
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
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/vacation-requests/requests/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/vacation/requests') {
  return renderWithProviders(
    <ModalsProvider>
      <VacationRequestsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeAll(() => {
  // Mantine's combobox scrolls the active option into view; jsdom lacks it.
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const { pathname } = new URL(String(url));
    if (method === 'GET') {
      if (pathname === '/vacation-requests/requests/')
        return json({ count: 3, next: null, previous: null, results: REQUESTS });
      if (pathname === '/vacation-requests/my-summary/') {
        return json({
          annual_leave: { remaining_days: '12.5', used_days: '2.0', last_credited: '2026-03-01' },
          years_of_service: 4,
          hire_date: '2022-03-01',
        });
      }
      if (pathname === '/vacation-requests/upcoming-leaves/') {
        return json({
          from_date: '2026-11-02',
          to_date: '2026-11-16',
          results: [{ full_name: 'Ayşe Kaya', start_date: '2026-11-05', end_date: '2026-11-06' }],
        });
      }
      if (pathname === '/vacation-requests/preview/') {
        return json({
          start_date: '2026-11-13',
          end_date: '2026-11-16',
          duration_days: 2,
          excluded: [{ date: '2026-11-14', reason: 'weekend' }],
        });
      }
      if (pathname === '/vacation-requests/requests/12/') {
        return json({
          ...REQUESTS[1],
          reason: 'Doktor',
          approval: {
            stage_instances: [
              {
                name: 'Yönetici Onayı',
                is_complete: true,
                decisions: [
                  { decision: 'approve', approver_detail: { full_name: 'Mehmet Demir' } },
                ],
              },
            ],
          },
        });
      }
    }
    if (method === 'POST') return json({ id: 99 }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads my requests with the legacy params and shows the summary', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'İzin Taleplerim' })).toBeInTheDocument();
  expect(await screen.findByText('10.11.2026 - 12.11.2026')).toBeInTheDocument();
  expect(screen.getByText('3.0 gün')).toBeInTheDocument();
  // Mazeret izni shows the hours instead of a range and a day count.
  expect(screen.getByText('20.11.2026, 09:00 - 11:30')).toBeInTheDocument();
  expect(screen.getByText('Onay Bekliyor')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-created_at',
    mine: 'true',
  });

  expect(
    await within(document.getElementById('remaining-annual-leave')!).findByText('12.5 gün'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('years-of-service')!).getByText('4 yıl'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Ayşe Kaya')).toBeInTheDocument();
  expect(screen.getByText('02.11.2026 - 16.11.2026')).toBeInTheDocument();
  expect(screen.getByText('Son kredi: 01.03.2026 · İşe giriş: 01.03.2022')).toBeInTheDocument();

  // İptal only for submitted and approved requests.
  expect(screen.getAllByRole('button', { name: 'İptal' })).toHaveLength(2);
});

it('does not crash on empty responses', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('İzin talebi bulunamadı.')).toBeInTheDocument();
  expect(await screen.findByText('Yaklaşan izin kaydı bulunamadı.')).toBeInTheDocument();
  expect(
    within(document.getElementById('remaining-annual-leave')!).getByText('0.0 gün'),
  ).toBeInTheDocument();
});

it('validates the create form, previews working days and posts the request', async () => {
  renderPage();
  await screen.findByText('10.11.2026 - 12.11.2026');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni İzin Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni İzin Talebi' });

  fireEvent.change(within(dialog).getByLabelText(/Başlangıç Tarihi/), {
    target: { value: '2026-11-13' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Bitiş Tarihi/), {
    target: { value: '2026-11-12' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  expect(
    await within(dialog).findByText('Bitiş tarihi başlangıç tarihinden önce olamaz.'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Bitiş Tarihi/), {
    target: { value: '2026-11-16' },
  });
  await waitFor(() => expect(within(dialog).getByTestId('preview-days')).toHaveTextContent('2'));
  expect(within(dialog).getByText(/14\.11\.2026 - Hafta Sonu/)).toBeInTheDocument();
  const preview = calls()
    .filter((c) => c.url.pathname === '/vacation-requests/preview/')
    .at(-1)!;
  expect(Object.fromEntries(preview.url.searchParams)).toEqual({
    start_date: '2026-11-13',
    end_date: '2026-11-16',
  });

  fireEvent.change(within(dialog).getByLabelText('Gerekçe (opsiyonel)'), {
    target: { value: 'Tatil' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin talebi oluşturuldu.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/vacation-requests/requests/');
  expect(post.body).toEqual({
    leave_type: 'annual_leave',
    start_date: '2026-11-13',
    end_date: '2026-11-16',
    reason: 'Tatil',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('mazeret izni needs both hours, in order, and sends a single day', async () => {
  renderPage();
  await screen.findByText('10.11.2026 - 12.11.2026');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni İzin Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni İzin Talebi' });

  fireEvent.click(within(dialog).getByLabelText(/İzin Türü/));
  fireEvent.click(await screen.findByRole('option', { name: 'Mazeret İzni', hidden: true }));
  expect(within(dialog).queryByLabelText(/Bitiş Tarihi/)).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText(/Başlangıç Tarihi/), {
    target: { value: '2026-11-18' },
  });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  expect(
    await within(dialog).findAllByText('Mazeret izni için başlangıç ve bitiş saati zorunludur.'),
  ).toHaveLength(2);

  fireEvent.change(within(dialog).getByLabelText(/Başlangıç Saati/), {
    target: { value: '14:00' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Bitiş Saati/), { target: { value: '10:00' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  expect(
    await within(dialog).findByText('Bitiş saati başlangıç saatinden sonra olmalıdır.'),
  ).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Bitiş Saati/), { target: { value: '16:30' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin talebi oluşturuldu.'));
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    leave_type: 'compensatory_leave',
    start_date: '2026-11-18',
    end_date: '2026-11-18',
    start_time: '14:00',
    end_time: '16:30',
    reason: '',
  });
  // No preview call for mazeret izni.
  expect(
    calls().some(
      (c) => c.url.pathname === '/vacation-requests/preview/' && c.url.search.includes('11-18'),
    ),
  ).toBe(false);
});

it('shows the backend message when create fails', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'POST'
      ? json({ non_field_errors: ['Yetersiz bakiye.'] }, 400)
      : base(url, init),
  );
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni İzin Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni İzin Talebi' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(vi.mocked(notify.error).mock.calls[0]![0]).toMatchObject({ message: 'Yetersiz bakiye.' });
  expect(screen.getByRole('dialog', { name: 'Yeni İzin Talebi' })).toBeInTheDocument();
});

it('cancels a submitted request at once and sends an approved one to HR', async () => {
  renderPage();
  await screen.findByText('10.11.2026 - 12.11.2026');
  const [submittedCancel, approvedCancel] = screen.getAllByRole('button', { name: 'İptal' });

  fireEvent.click(submittedCancel!);
  expect(await screen.findByText('#11 numaralı izin talebi iptal edilsin mi?')).toBeInTheDocument();
  expect(screen.getByText('Bu işlem talebi anında iptal eder.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin talebi iptal edildi.'));
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/vacation-requests/requests/11/cancel/',
  );

  fireEvent.click(approvedCancel!);
  expect(
    await screen.findByText('#12 numaralı izin için iptal talebi gönderilsin mi?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('İptal talebi İK onayına gönderildi.'),
  );
  const post = calls().filter((c) => c.method === 'POST')[1]!;
  expect(post.url.pathname).toBe('/vacation-requests/requests/12/request-cancellation/');
  expect(post.body).toEqual({});
});

it('opens the detail from ?request_id= (the calendar link) and closes back to the list URL', async () => {
  renderPage('/general/vacation/requests?request_id=12');
  const dialog = await screen.findByRole('dialog', { name: 'İzin Talebi Detayı' });
  expect(within(dialog).getByText('Doktor')).toBeInTheDocument();
  expect(within(dialog).getByText('09:00 - 11:30')).toBeInTheDocument();
  expect(within(dialog).getByText('Yönetici Onayı')).toBeInTheDocument();
  expect(within(dialog).getByText(/Mehmet Demir/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(''));
});

it('reads the vacation request id from a leave record note', () => {
  expect(vacationRequestIdFromNotes('vr:42')).toBe('42');
  expect(vacationRequestIdFromNotes(' VR:7 ')).toBe('7');
  expect(vacationRequestIdFromNotes('raporlu')).toBeNull();
  expect(vacationRequestIdFromNotes(null)).toBeNull();
});
