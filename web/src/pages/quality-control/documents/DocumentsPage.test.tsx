import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DocumentsPage } from './DocumentsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const DOCUMENTS = [
  {
    id: 1,
    title: 'Kaynak Prosedürü',
    document_type: 'wps',
    document_number: 'WPS-01',
    revision: 'B',
    job_order_no: '254-01',
    valid_until: '2026-11-10',
    is_active: true,
    expiry_status: 'expiring',
    days_until_expiry: 8,
    created_at: '2026-01-05T10:00:00Z',
    url: 'https://files.test/wps.pdf',
  },
  {
    id: 2,
    title: 'Eski Sertifika',
    document_type: 'certificate',
    is_active: true,
    expiry_status: 'expired',
    valid_until: '2026-01-01',
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
    body:
      init?.body instanceof FormData
        ? init.body
        : typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : undefined,
  }));
}
const listCalls = () =>
  calls().filter(
    (c) =>
      c.method === 'GET' &&
      c.url.pathname === '/quality-control/documents/' &&
      c.url.searchParams.get('page_size') === '20',
  );

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/quality-control/documents/') {
  return renderWithProviders(
    <ModalsProvider>
      <DocumentsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url));
    if (method === 'GET' && u.pathname === '/quality-control/documents/') {
      if (u.searchParams.get('page_size') === '1') {
        const count = u.searchParams.get('expiry_status') === 'expiring' ? 4 : 2;
        return json({ count, next: null, previous: null, results: [] });
      }
      return json({ count: 2, next: null, previous: null, results: DOCUMENTS });
    }
    if (method === 'POST') return json({ id: 9 }, 201);
    if (method === 'PATCH') return json({ id: 1 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists documents with the expiry pills and the banner counts', async () => {
  renderPage();
  expect(await screen.findByText('Kaynak Prosedürü')).toBeInTheDocument();
  expect(screen.getByText('Kaynak Prosedürü (WPS)')).toBeInTheDocument();
  expect(screen.getByText('8 Gün Kaldı')).toBeInTheDocument();
  expect(screen.getByText('Süresi Doldu')).toBeInTheDocument();
  expect(await screen.findByText('4 evrak')).toBeInTheDocument();
  expect(screen.getByText('2 evrak')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: '-created_at',
    page: '1',
    page_size: '20',
  });
});

it('reads ?expiry_status from the URL and the banner applies it', async () => {
  renderPage('/quality-control/documents/?expiry_status=expired');
  await screen.findByText('Kaynak Prosedürü');
  expect(listCalls()[0]!.url.searchParams.get('expiry_status')).toBe('expired');

  fireEvent.click(await screen.findByText('30 gün içinde süresi doluyor'));
  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('expiry_status'),
    ).toBe('expiring'),
  );
  await waitFor(() =>
    expect(listCalls().at(-1)!.url.searchParams.get('expiry_status')).toBe('expiring'),
  );
});

it('upload needs a title and a file, then posts multipart', async () => {
  renderPage();
  await screen.findByText('Kaynak Prosedürü');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Evrak' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Kalite Evrağı' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Yükle' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(2);

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), {
    target: { value: '  Kontrol Planı A ' },
  });
  fireEvent.change(within(dialog).getByLabelText('İş Emri No'), { target: { value: '254-01' } });
  const file = new File(['pdf'], 'plan.pdf', { type: 'application/pdf' });
  fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yükle' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Evrak yüklendi.'));
  const body = calls().find((c) => c.method === 'POST')!.body as FormData;
  expect(body.get('file')).toBe(file);
  expect(body.get('title')).toBe('Kontrol Planı A');
  expect(body.get('document_type')).toBe('other');
  expect(body.get('job_order')).toBe('254-01');
  // Empty and null fields are left out.
  expect(body.has('valid_until')).toBe(false);
  expect(body.has('revision')).toBe(false);
});

it('edit without a new file patches JSON with nulls for cleared fields', async () => {
  renderPage();
  await screen.findByText('Kaynak Prosedürü');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Kalite Evrağını Düzenle' });
  expect(within(dialog).getByLabelText('İş Emri No')).toHaveValue('254-01');

  fireEvent.change(within(dialog).getByLabelText('İş Emri No'), { target: { value: '' } });
  fireEvent.change(within(dialog).getByLabelText('Geçerlilik Tarihi'), { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Evrak güncellendi.'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/quality-control/documents/1/');
  expect(patch.body).toEqual({
    title: 'Kaynak Prosedürü',
    document_type: 'wps',
    document_number: 'WPS-01',
    revision: 'B',
    description: '',
    valid_until: null,
    job_order: null,
  });
});

it('deletes only after the confirm', async () => {
  renderPage();
  await screen.findByText('Kaynak Prosedürü');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('"Kaynak Prosedürü" evrağını silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Evrak silindi.'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/quality-control/documents/1/',
  );
});

it('download warns when the document has no file', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  renderPage();
  await screen.findByText('Kaynak Prosedürü');
  const [first, second] = screen.getAllByRole('button', { name: 'İndir' });
  fireEvent.click(first!);
  expect(open).toHaveBeenCalledWith('https://files.test/wps.pdf', '_blank');
  fireEvent.click(second!);
  expect(notify.warning).toHaveBeenCalledWith('Bu evrağa ait dosya bulunamadı.');
});
