import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { StatementsPage } from './StatementsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 7, username: 'onayci' } }),
}));

const fetchMock = vi.mocked(authedFetch);

const STATEMENTS = [
  {
    id: 1,
    subcontractor_name: 'Kaya Kaynak',
    year: 2026,
    month: 2,
    status: 'draft',
    employee_count: 4,
    currency: 'TRY',
    work_total: '1000.00',
    adjustment_total: '-50.00',
    grand_total: '950.00',
    current_approvers: [],
  },
  {
    id: 2,
    subcontractor_name: 'Demir Montaj',
    year: 2026,
    month: 2,
    status: 'submitted',
    employee_count: null,
    currency: 'TRY',
    work_total: '2000.00',
    adjustment_total: '0',
    grand_total: '2000.00',
    current_approvers: [{ full_name: 'Ayşe Yılmaz' }],
  },
  {
    id: 3,
    subcontractor_name: 'Eski Taşeron',
    year: 2026,
    month: 1,
    status: 'paid',
    employee_count: 2,
    currency: 'TRY',
    work_total: '500.00',
    adjustment_total: '0',
    grand_total: '500.00',
  },
];

const DETAIL = {
  ...STATEMENTS[0],
  line_items: [
    {
      id: 11,
      job_no: '240-01',
      job_title: 'Kazan',
      price_tier_name: 'Kademe A',
      allocated_weight_kg: '100',
      previous_progress: '10',
      current_progress: '30',
      delta_progress: '20',
      effective_weight_kg: '20',
      price_per_kg: '50',
      cost_amount: '1000',
    },
  ],
  paint_input: { id: 9, year: 2026, month: 2, total_kg: '10', total_cost: '200' },
};

const ADJUSTMENTS = [
  {
    id: 21,
    adjustment_type: 'deduction',
    amount: '-50.00',
    reason: 'Fire',
    job_order: '240-01',
    weight_kg: '0',
  },
];

const SUBMITTED_DETAIL = {
  ...STATEMENTS[1],
  line_items: [],
  approval_workflow: {
    current_stage_order: 1,
    stage_instances: [{ order: 1, approver_user_ids: [7] }],
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/subcontracting/statements/');
const writes = () => calls().filter((c) => c.method !== 'GET');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/subcontracting/statements') {
  return renderWithProviders(
    <ModalsProvider>
      <StatementsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET') {
      if (path === '/subcontracting/statements/')
        return json({ count: 3, next: null, previous: null, results: STATEMENTS });
      if (path === '/subcontracting/subcontractors/')
        return json({ count: 1, results: [{ id: 5, name: 'Kaya Kaynak' }] });
      if (path === '/subcontracting/statements/1/') return json(DETAIL);
      if (path === '/subcontracting/statements/1/adjustments/') return json(ADJUSTMENTS);
      if (path === '/subcontracting/statements/2/') return json(SUBMITTED_DETAIL);
      if (path === '/subcontracting/statements/2/adjustments/') return json([]);
      if (path === '/subcontracting/paint-inputs/')
        return json([{ id: 9, year: 2026, month: 2, total_kg: '10.000', total_cost: '200.00' }]);
      if (path === '/projects/job-orders/dropdown/')
        return json([{ job_no: '240-01', title: 'Kazan' }]);
    }
    if (method === 'DELETE') return json(undefined, 204);
    if (method === 'PATCH' && path === '/subcontracting/statements/1/')
      return json({ ...STATEMENTS[0], employee_count: 7 });
    return json({ id: 99 });
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

const groupRow = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('tr[data-group-row="header"]')].find((tr) =>
    tr.textContent?.includes(text),
  )!;
const cell = (rowId: string, col: string) =>
  document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-col="${col}"]`)!;

it('lists the statements by period, newest open, with the legacy params', async () => {
  renderPage();
  expect(await screen.findByText('Kaya Kaynak')).toBeInTheDocument();
  const params = listCalls()[0]!.url.searchParams;
  expect(params.get('ordering')).toBe('-year,-month');
  expect(params.get('page')).toBe('1');
  expect(params.get('page_size')).toBe('20');

  const february = groupRow('Şubat 2026');
  expect(february).toHaveTextContent('2 hakediş');
  expect(groupRow('Ocak 2026')).toHaveTextContent('1 hakediş');
  // Groups newest first; only the latest period starts open.
  const headers = [...document.querySelectorAll('tr[data-group-row="header"]')];
  expect(headers[0]).toBe(february);
  expect(screen.queryByText('Eski Taşeron')).toBeNull();
  fireEvent.click(groupRow('Ocak 2026'));
  expect(await screen.findByText('Eski Taşeron')).toBeInTheDocument();

  // Status with the current approvers, signed adjustment total.
  expect(screen.getByText('Ayşe Yılmaz', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('-50,00 TRY')).toBeInTheDocument();
  expect(screen.getAllByText('+0,00 TRY').length).toBeGreaterThan(0);
});

it('filters and sorting reach the request and the URL', async () => {
  renderPage();
  await screen.findByText('Kaya Kaynak');
  fireEvent.click(screen.getAllByRole('button', { name: 'Durum' })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Onaylandı' }));
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('status')).toBe('approved'));
  expect(screen.getByTestId('location')).toHaveTextContent('status=approved');

  fireEvent.click(
    within(screen.getByRole('columnheader', { name: /Taşeron/ })).getByRole('button'),
  );
  await waitFor(() =>
    expect(listCalls().at(-1)!.url.searchParams.get('ordering')).toBe('subcontractor_name'),
  );
  expect(listCalls().at(-1)!.url.searchParams.get('page')).toBe('1');
});

it('edits Çalışan Sayısı inline with a PATCH', async () => {
  renderPage();
  await screen.findByText('Kaya Kaynak');
  fireEvent.click(cell('1', 'employee_count'));
  let input = screen.getByRole('textbox', { name: 'Çalışan Sayısı' });
  fireEvent.change(input, { target: { value: '2,5' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  // Legacy validate: whole numbers only.
  expect(writes()).toHaveLength(0);
  expect(cell('1', 'employee_count')).toHaveAttribute('data-cell-state', 'error');

  fireEvent.click(cell('1', 'employee_count'));
  input = screen.getByRole('textbox', { name: 'Çalışan Sayısı' });
  fireEvent.change(input, { target: { value: '7' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0]!.url.pathname).toBe('/subcontracting/statements/1/');
  expect(writes()[0]!.body).toEqual({ employee_count: 7 });
  await waitFor(() => expect(cell('1', 'employee_count')).toHaveTextContent('7'));
});

it('opens the detail from ?statement= with items, adjustments and totals', async () => {
  renderPage('/manufacturing/subcontracting/statements?statement=1');
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Hakediş Detayı - Kaya Kaynak')).toBeInTheDocument();
  expect(within(dialog).getByText('Şubat 2026')).toBeInTheDocument();
  expect(within(dialog).getByText('Kademe A')).toBeInTheDocument();
  expect(within(dialog).getByText('Boya')).toBeInTheDocument();
  expect(within(dialog).getByText('Fire')).toBeInTheDocument();
  // 1000 work − 50 deduction + 200 paint = 1150; + %20 KDV = 1380.
  const totals = within(dialog).getByTestId('statement-totals');
  expect(totals).toHaveTextContent('Ara Toplam:1.150,00 TRY');
  expect(totals).toHaveTextContent('KDV (%20):230,00 TRY');
  expect(totals).toHaveTextContent('Genel Toplam (KDV Dahil):1.380,00 TRY');

  // Closing drops the deep link.
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('statement='));
});

it('row click opens the detail; a draft deletes adjustments after the confirm and submits', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaya Kaynak'));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('statement=1'));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('Fire');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Düzeltmeyi sil' }));
  expect(
    await screen.findByText('Düzeltmeyi silmek istediğinizden emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Düzeltme silindi'));
  expect(writes()[0]).toMatchObject({ method: 'DELETE' });
  expect(writes()[0]!.url.pathname).toBe('/subcontracting/statements/1/adjustments/21/');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Onaya Gönder' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Hakediş onaya gönderildi'));
  expect(writes()[1]!.url.pathname).toBe('/subcontracting/statements/1/submit/');
});

it('adds an adjustment with the legacy payload', async () => {
  renderPage('/manufacturing/subcontracting/statements?statement=1');
  const detail = await screen.findByRole('dialog');
  fireEvent.click(await within(detail).findByRole('button', { name: 'Düzeltme Ekle' }));
  const form = await screen.findByRole('dialog', { name: 'Düzeltme Ekle' });

  fireEvent.click(within(form).getByRole('button', { name: 'Düzeltme Ekle' }));
  expect(await within(form).findAllByText('Bu alan gereklidir')).toHaveLength(4);

  fireEvent.click(within(form).getByLabelText(/Tür/));
  fireEvent.click(await screen.findByRole('option', { name: 'Ek Ödeme', hidden: true }));
  fireEvent.change(within(form).getByLabelText(/Tutar/), { target: { value: '150' } });
  fireEvent.change(within(form).getByLabelText(/Neden/), { target: { value: 'Ek iş' } });
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/projects/job-orders/dropdown/')).toBe(true),
  );
  expect(
    calls()
      .find((c) => c.url.pathname === '/projects/job-orders/dropdown/')!
      .url.searchParams.get('all'),
  ).toBe('true');
  fireEvent.click(within(form).getByLabelText(/İş Emri/));
  fireEvent.click(await screen.findByRole('option', { name: '240-01 - Kazan', hidden: true }));
  fireEvent.click(within(form).getByRole('button', { name: 'Düzeltme Ekle' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Düzeltme eklendi'));
  const post = writes().find(
    (c) => c.url.pathname === '/subcontracting/statements/1/adjustments/',
  )!;
  expect(post.body).toEqual({
    adjustment_type: 'addition',
    amount: 150,
    reason: 'Ek iş',
    job_order: '240-01',
    weight_kg: 0,
  });
});

it('an approver of the current stage approves; a reject needs a comment', async () => {
  renderPage('/manufacturing/subcontracting/statements?statement=2');
  const detail = await screen.findByRole('dialog');
  fireEvent.click(await within(detail).findByRole('button', { name: 'Reddet' }));
  const reject = await screen.findByRole('dialog', { name: 'Hakediş Kararı' });
  expect(within(reject).getByText('Red nedeni (zorunlu)')).toBeInTheDocument();
  fireEvent.click(within(reject).getByRole('button', { name: 'Karar Ver' }));
  expect(await within(reject).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  fireEvent.click(within(reject).getByRole('button', { name: 'İptal' }));

  fireEvent.click(within(detail).getByRole('button', { name: 'Onayla' }));
  const approve = await screen.findByRole('dialog', { name: 'Hakediş Kararı' });
  fireEvent.click(within(approve).getByRole('button', { name: 'Karar Ver' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Hakediş onaylandı'));
  expect(writes()[0]!.url.pathname).toBe('/subcontracting/statements/2/decide/');
  expect(writes()[0]!.body).toEqual({ approve: true, comment: '' });
  // Every modal closes and the deep link goes.
  await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('statement='));
});

it('Boya Girişi edits the period paint input', async () => {
  renderPage();
  await screen.findByText('Kaya Kaynak');
  fireEvent.click(within(groupRow('Şubat 2026')).getByRole('button', { name: /Boya Girişi/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Aylık Boya Girişi - Şubat 2026' });
  const kg = within(dialog).getByLabelText(/Toplam \(kg\)/);
  await waitFor(() => expect(kg).toHaveValue(10));
  const paintGet = calls().find((c) => c.url.pathname === '/subcontracting/paint-inputs/')!;
  expect(paintGet.url.searchParams.get('year')).toBe('2026');
  expect(paintGet.url.searchParams.get('month')).toBe('2');
  // The group did not toggle.
  expect(screen.getByText('Kaya Kaynak')).toBeInTheDocument();

  fireEvent.change(kg, { target: { value: '12.5' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Boya girişi güncellendi'));
  const patch = writes()[0]!;
  expect(patch.url.pathname).toBe('/subcontracting/paint-inputs/9/');
  expect(patch.body).toEqual({ year: 2026, month: 2, total_kg: 12.5, total_cost: 200 });
});

it('Yeni Hakediş Oluştur generates the period for every subcontractor', async () => {
  renderPage();
  await screen.findByText('Kaya Kaynak');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Hakediş Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Hakediş Oluştur' });
  fireEvent.change(within(dialog).getByLabelText(/Yıl/), { target: { value: '2026' } });
  fireEvent.change(within(dialog).getByLabelText(/Ay/), { target: { value: '13' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hakediş Oluştur' }));
  expect(await within(dialog).findByText('En fazla 12 olmalıdır')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText(/Ay/), { target: { value: '3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hakediş Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Hakedişler oluşturuldu'));
  expect(writes()[0]!.url.pathname).toBe('/subcontracting/statements/generate-bulk/');
  expect(writes()[0]!.body).toEqual({ year: 2026, month: 3 });
});
