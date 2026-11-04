import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { FaultRequestsPage } from './FaultRequestsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const auth = vi.hoisted(() => ({
  user: { id: 7, username: 'operator' } as Record<string, unknown>,
  isAdmin: false,
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const fetchMock = vi.mocked(authedFetch);

const FAULTS = [
  {
    id: 101,
    machine: 3,
    machine_name: 'CNC Torna 1',
    description: 'Mil sesi geliyor',
    is_breaking: true,
    is_maintenance: false,
    reported_by: 7,
    reported_by_full_name: 'Ali Yılmaz',
    reported_at: '2026-10-30T08:00:00Z',
    resolved_at: null,
  },
  {
    id: 102,
    machine_name: '',
    asset_name: 'Kompresör',
    location: 'Bahçe',
    description: 'Basınç düşük',
    is_breaking: false,
    is_maintenance: true,
    reported_by: 8,
    reported_by_username: 'veli',
    reported_at: '2026-10-29T08:00:00Z',
    resolved_by_full_name: 'Usta Bey',
    resolved_at: '2026-10-29T10:30:00Z',
  },
  {
    id: 103,
    machine_name: 'Pres 2',
    description: 'Yağ kaçağı',
    is_breaking: false,
    is_maintenance: false,
    reported_by: 8,
    reported_at: '2026-10-28T08:00:00Z',
    resolved_at: null,
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/machines/faults/');
const lastListParams = () => Object.fromEntries(listCalls().at(-1)!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/maintenance/fault-requests') {
  return renderWithProviders(
    <ModalsProvider>
      <FaultRequestsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  auth.user = { id: 7, username: 'operator' };
  auth.isAdmin = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/machines/faults/') {
      return json({ count: 57, next: null, previous: null, results: FAULTS });
    }
    if (path === '/machines/dropdown/') {
      return json([
        { id: 3, name: 'CNC Torna 1' },
        { id: 4, name: 'Pres 2' },
      ]);
    }
    if (path === '/machines/reports/staff/') {
      return json([
        { user_id: 20, username: 'usta', full_name: 'Usta Bey', faults_resolved_count: 4 },
        { user_id: 21, username: 'cirak', full_name: 'Çırak', faults_resolved_count: 0 },
      ]);
    }
    if (method === 'POST') return json({ id: 200 }, 201);
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('opens on unresolved faults and shows the rows and figures', async () => {
  renderPage();
  expect(screen.getByText('Tüm arıza taleplerini görüntüleyin ve yönetin')).toBeInTheDocument();
  expect(await screen.findByText('CNC Torna 1')).toBeInTheDocument();
  // A typed-in asset shows with its location.
  expect(screen.getByText('Kompresör — Bahçe')).toBeInTheDocument();
  expect(screen.getByText('Makine Duruşta')).toBeInTheDocument();
  expect(screen.getAllByText('Bekleyen').length).toBeGreaterThan(0);
  expect(screen.getByText('Usta Bey')).toBeInTheDocument();

  expect(lastListParams()).toEqual({ page: '1', page_size: '20', unresolved: 'true' });

  // Toplam is the server count; the rest are counted on the page as legacy did.
  expect(within(document.getElementById('faults-total')!).getByText('57')).toBeInTheDocument();
  expect(within(document.getElementById('faults-pending')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('faults-breaking')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('faults-resolved')!).getByText('1')).toBeInTheDocument();
});

it('maps the filter pills in the URL to the legacy API params', async () => {
  renderPage(
    '/manufacturing/maintenance/fault-requests?status=true&type=fault&machine_id=3&resolved_by=20&reported_after=2026-10-01&reported_before=2026-10-31&page=2',
  );
  await screen.findByText('CNC Torna 1');
  expect(lastListParams()).toEqual({
    page: '2',
    page_size: '20',
    unresolved: 'false',
    is_breaking: 'false',
    is_maintenance: 'false',
    machine_id: '3',
    resolved_by: '20',
    reported_after: '2026-10-01',
    reported_before: '2026-10-31',
  });
});

it('picking a pill writes the URL, goes back to page 1 and refetches', async () => {
  renderPage('/manufacturing/maintenance/fault-requests?page=3');
  await screen.findByText('CNC Torna 1');

  fireEvent.click(screen.getByRole('button', { name: /^Tür/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Makine Duruşu' }));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('type')).toBe('breaking');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() =>
    expect(lastListParams()).toEqual({
      page: '1',
      page_size: '20',
      unresolved: 'true',
      is_breaking: 'true',
    }),
  );

  // Only staff who resolved something are offered in Çözen Kişi.
  fireEvent.click(screen.getByRole('button', { name: /^Çözen Kişi/ }));
  expect(await screen.findByRole('menuitem', { name: 'Usta Bey' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Çırak' })).toBeNull();
});

it('Temizle drops every filter, unresolved included, as legacy clearFilters did', async () => {
  renderPage('/manufacturing/maintenance/fault-requests?type=maintenance');
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByText('Temizle'));
  await waitFor(() => expect(lastListParams()).toEqual({ page: '1', page_size: '20' }));
});

it('the create form validates with the legacy messages and posts a typed-in asset', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Arıza Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Arıza Talebi' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));
  expect(await within(dialog).findByText('Açıklama zorunludur')).toBeInTheDocument();
  expect(within(dialog).getByText('Tür seçimi zorunludur')).toBeInTheDocument();
  expect(within(dialog).getByText('Kayıtlı ekipman seçimi zorunludur')).toBeInTheDocument();

  // Custom equipment swaps the machine picker for name + location.
  fireEvent.click(within(dialog).getByLabelText('Özel Ekipman Bilgisi Gir'));
  expect(within(dialog).queryByLabelText(/Kayıtlı Ekipman/)).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));
  expect(await within(dialog).findByText('Ekipman adı zorunludur')).toBeInTheDocument();
  expect(within(dialog).getByText('Konum bilgisi zorunludur')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Ekipman Adı/), {
    target: { value: ' Kompresör ' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Konum/), { target: { value: 'Bahçe' } });
  fireEvent.change(within(dialog).getByLabelText(/Açıklama/), {
    target: { value: 'Basınç düşük ' },
  });
  fireEvent.click(within(dialog).getByLabelText(/^Tür/));
  fireEvent.click(await screen.findByRole('option', { name: 'Arıza', hidden: true }));
  fireEvent.click(within(dialog).getByLabelText('Makine durdu'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Arıza talebi başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/machines/faults/');
  expect(post.body).toEqual({
    description: 'Basınç düşük',
    is_maintenance: false,
    is_breaking: true,
    asset_name: 'Kompresör',
    location: 'Bahçe',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('a maintenance request posts the machine and never "Makine durdu"', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Arıza Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Arıza Talebi' });

  fireEvent.click(within(dialog).getByLabelText(/Kayıtlı Ekipman/));
  fireEvent.click(await screen.findByRole('option', { name: 'Pres 2', hidden: true }));
  fireEvent.change(within(dialog).getByLabelText(/Açıklama/), {
    target: { value: 'Periyodik bakım' },
  });
  fireEvent.click(within(dialog).getByLabelText(/^Tür/));
  fireEvent.click(await screen.findByRole('option', { name: 'Bakım', hidden: true }));
  expect(within(dialog).queryByLabelText('Makine durdu')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));

  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    description: 'Periyodik bakım',
    is_maintenance: true,
    is_breaking: false,
    machine: 4,
  });
});

it('the reporter may delete an open fault only; deleting asks first', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  // Row 101 is ours and open; 102 and 103 belong to someone else.
  expect(screen.getAllByRole('button', { name: 'Arıza talebini sil' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Detayları görüntüle' })).toHaveLength(3);

  fireEvent.click(screen.getByRole('button', { name: 'Arıza talebini sil' }));
  const dialog = await screen.findByRole('dialog', { name: 'Arıza Talebi Silme Onayı' });
  expect(
    within(dialog).getByText('Bu arıza talebini silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('Mil sesi geliyor')).toBeInTheDocument();
  expect(within(dialog).getByText('Bu işlem geri alınamaz.')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Arıza talebi başarıyla silindi'),
  );
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/machines/faults/101/');
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('cancelling the confirm deletes nothing', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: 'Arıza talebini sil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
  await waitFor(() =>
    expect(screen.queryByText('Bu arıza talebini silmek istediğinize emin misiniz?')).toBeNull(),
  );
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
});

it('admins may delete every fault', async () => {
  auth.user = { id: 1, username: 'admin', is_admin: true };
  auth.isAdmin = true;
  renderPage();
  await screen.findByText('CNC Torna 1');
  expect(screen.getAllByRole('button', { name: 'Arıza talebini sil' })).toHaveLength(3);
});

it('the eye button opens the fault as a GEMKOM report that prints on its own', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detayları görüntüle' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Arıza Talebi #102' });

  expect(within(dialog).getByText('Bakım Talep Formu')).toBeInTheDocument();
  expect(within(dialog).getByText('GEMKOM · Bakım Onarım')).toBeInTheDocument();
  expect(within(dialog).getByText('#102')).toBeInTheDocument();
  // Equipment, timeline, people and resolution.
  expect(within(dialog).getByText('Kompresör', { selector: 'strong' })).toBeInTheDocument();
  expect(within(dialog).getByText('Bahçe')).toBeInTheDocument();
  expect(within(dialog).getByText('Elle girilen ekipman')).toBeInTheDocument();
  expect(within(dialog).getByText('Talep bildirildi')).toBeInTheDocument();
  expect(within(dialog).getAllByText('Çözüldü').length).toBeGreaterThan(0);
  expect(within(dialog).getByText('2 saat 30 dakika')).toBeInTheDocument();
  expect(within(dialog).getAllByText('Usta Bey').length).toBeGreaterThan(0);
  expect(within(dialog).getAllByText('veli').length).toBeGreaterThan(0);
  expect(within(dialog).getByText('Çözüm açıklaması girilmedi.')).toBeInTheDocument();

  // Yazdır / PDF prints a top-level copy named after the fault (the PDF's file name).
  const title = document.title;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yazdır / PDF' }));
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  expect(document.body.classList.contains('paper-printing')).toBe(true);
  expect(document.title).toBe('Ariza-Talebi-102');
  expect(screen.getAllByText('Bakım Talep Formu')).toHaveLength(2);
  expect(screen.getByText(/^Rapor tarihi:/)).toBeInTheDocument();

  fireEvent(window, new Event('afterprint'));
  await waitFor(() => expect(document.body.classList.contains('paper-printing')).toBe(false));
  expect(document.title).toBe(title);
  expect(screen.getAllByText('Bakım Talep Formu')).toHaveLength(1);
});

it('an open fault shows the pending step and no resolution yet', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detayları görüntüle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Arıza Talebi #101' });
  expect(within(dialog).getByText('Arıza Talep Formu')).toBeInTheDocument();
  expect(within(dialog).getByText('Çözüm bekleniyor')).toBeInTheDocument();
  expect(within(dialog).getByText('Henüz çözülmedi.')).toBeInTheDocument();
  expect(within(dialog).getByText(/\(hâlâ açık\)$/)).toBeInTheDocument();
  expect(within(dialog).getByText('Kayıtlı makine')).toBeInTheDocument();
});

it('the Ekipman pill searches the machines', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: /^Ekipman/ }));
  // jsdom gives the dropdown no size, so Mantine soon hides it: query hidden items too.
  const search = await screen.findByRole('textbox', { name: 'Seçeneklerde ara', hidden: true });
  const item = (name: string) => screen.queryByRole('menuitem', { name, hidden: true });
  await waitFor(() => expect(item('CNC Torna 1')).not.toBeNull());

  fireEvent.change(search, { target: { value: 'PRES' } });
  expect(item('CNC Torna 1')).toBeNull();
  expect(item('Tümü')).toBeNull();
  fireEvent.click(item('Pres 2')!);

  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('machine_id'),
    ).toBe('4'),
  );
  await waitFor(() => expect(lastListParams().machine_id).toBe('4'));
});

it('a search with no match says so', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: /^Ekipman/ }));
  const search = await screen.findByRole('textbox', { name: 'Seçeneklerde ara', hidden: true });
  fireEvent.change(search, { target: { value: 'kaynak' } });
  expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument();
  expect(screen.queryAllByRole('menuitem', { hidden: true })).toHaveLength(0);
});

it('long text is cut to one line and shown whole on hover', async () => {
  const long = 'Hidrolik ünitede basınç düşüyor, pompa sesi var ve yağ sıcaklığı normalin üstünde';
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/machines/faults/') {
      return json({ count: 1, results: [{ ...FAULTS[0], description: long }] });
    }
    return json([]);
  });
  renderPage();
  const cell = await screen.findByText(long);
  expect(cell).toHaveAttribute('data-truncate', 'end');
  fireEvent.mouseEnter(cell);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(long);
});
