import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { WarehouseBarStockPage, WarehousePlateStockPage } from './PiecesPage';

// Sac Stoğu: "Kullanılmış sacları da göster" and the Kullanılan Saclar view.

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
  getGrantedPageRoutes: () => new Set<string>(),
  getPermissions: () => ({}),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const SHEET = {
  item: 10,
  item_code: '0100 0000 0010 000 000',
  item_name: '10 mm ST 37-2 SAC',
  item_unit: 'kg',
  item_is_active: true,
  category_code: '0100',
  kind: 'plate',
  width_mm: '1500.0',
  length_mm: '3000.0',
  shape: 'rectangle',
  area_m2: null,
  unit_kg: '353.250',
  heat_number: 'H-1',
  certificate_no: '',
  warehouse: 1,
  warehouse_code: 'HAMMADDE',
  warehouse_name: 'Hammadde Deposu',
  job_no: '',
  supplier: null,
  supplier_name: null,
  origin: 'receipt',
  origin_label: 'Mal kabul',
  parent: null,
  parent_code: null,
  needs_review: false,
  review_note: '',
  note: '',
  created_by_username: null,
  created_at: '2026-11-11T09:00:00Z',
  updated_at: '2026-11-11T09:00:00Z',
};
const IN_STOCK = { ...SHEET, id: 1, code: 'S26-00001', quantity: 1, total_kg: '353.250' };
const USED = { ...SHEET, id: 2, code: 'S26-00002', quantity: 0, total_kg: '0.000' };

const USED_ROW = {
  id: 90,
  piece: 2,
  piece_code: 'S26-00002',
  lot_remaining: 0,
  reason: 'cut',
  movement_type: 'cnc_issue',
  quantity: 1,
  unit_kg: '353.250',
  total_kg: '353.250',
  item: 10,
  item_code: SHEET.item_code,
  item_name: SHEET.item_name,
  item_is_active: true,
  plate_thickness_mm: '10.00',
  shape: 'rectangle',
  width_mm: '1500.0',
  length_mm: '3000.0',
  area_m2: null,
  heat_number: 'H-1',
  origin_label: 'Mal kabul',
  from_warehouse_code: 'HAMMADDE',
  from_job_no: '',
  cnc_task: 'CNC-2310',
  cnc_task_name: 'Kesim',
  job_nos: ['254-01', '254-02'],
  note: 'CNC-2310 kesimi',
  created_by_username: 'depo',
  created_by_name: 'Ali Veli',
  created_at: '2026-11-20T12:31:56Z',
};
const SCRAP_ROW = {
  ...USED_ROW,
  id: 91,
  piece: 3,
  piece_code: null,
  lot_remaining: 2,
  reason: 'scrap',
  movement_type: 'scrap',
  cnc_task: null,
  cnc_task_name: null,
  job_nos: [],
  note: 'paslı',
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function calls(path: string): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([url]) => new URL(String(url), 'https://api.test'))
    .filter((u) => u.pathname === path)
    .map((u) => u.searchParams);
}

function renderPage(route = '/warehouse/plate-stock', page = <WarehousePlateStockPage />) {
  return renderWithProviders(<ModalsProvider>{page}</ModalsProvider>, { route });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const u = new URL(String(url), 'https://api.test');
    const empty = u.searchParams.get('include_empty') === 'true';
    const sheets = empty ? [USED, IN_STOCK] : [IN_STOCK];
    if (u.pathname === '/warehouse/pieces/groups/') {
      return json({
        count: 1,
        results: [
          {
            key: '10:1500.0:3000.0:rectangle',
            item: 10,
            item_code: SHEET.item_code,
            width_mm: '1500.0',
            length_mm: '3000.0',
            shape: 'rectangle',
            lots: sheets.length,
            quantity: 1,
            pieces: sheets,
          },
        ],
      });
    }
    if (u.pathname === '/warehouse/pieces/') return json({ count: 0, results: [] });
    if (u.pathname === '/warehouse/pieces/cards/') return json({ count: 0, results: [] });
    if (u.pathname === '/warehouse/pieces/used/') {
      return json({
        count: 2,
        results: [USED_ROW, SCRAP_ROW],
        summary: { sheets: 2, kg: '706.500' },
      });
    }
    if (u.pathname === '/warehouse/pieces/2/') return json(USED);
    if (u.pathname === '/warehouse/pieces/2/movements/') {
      return json([
        {
          id: 90,
          piece: 2,
          movement_type: 'cnc_issue',
          movement_type_label: 'CNC kesime çıkış',
          quantity: -1,
          unit_kg: '353.250',
          from_warehouse_code: 'HAMMADDE',
          from_job_no: '',
          from_supplier: null,
          from_supplier_name: null,
          to_warehouse_code: null,
          to_job_no: '',
          to_supplier: null,
          to_supplier_name: null,
          related_piece: null,
          note: 'CNC-2310 kesimi',
          created_by_username: 'depo',
          created_at: '2026-11-20T12:31:56Z',
        },
      ]);
    }
    if (u.pathname === '/warehouse/pieces/2/changes/') return json([]);
    return json({ detail: 'not mocked' }, 404);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('Kullanılmış sacları da göster', () => {
  it('asks for used sheets, keeps it in the URL and shows them dimmed, not counted', async () => {
    renderPage();
    const box = await screen.findByRole('checkbox', { name: 'Kullanılmış sacları da göster' });
    await waitFor(() => expect(calls('/warehouse/pieces/groups/')).not.toHaveLength(0));
    expect(calls('/warehouse/pieces/groups/').every((p) => !p.has('include_empty'))).toBe(true);
    expect(screen.queryByText('Kullanıldı')).not.toBeInTheDocument();

    fireEvent.click(box);
    await waitFor(() =>
      expect(
        calls('/warehouse/pieces/groups/').some((p) => p.get('include_empty') === 'true'),
      ).toBe(true),
    );
    expect(box).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(await screen.findByRole('button', { name: 'Grubu genişlet' }));
    expect(await screen.findByText('Kullanıldı')).toBeInTheDocument();
    // The group header counts the sheet in stock only; the used one is said apart.
    expect(screen.getByText('(+1 kullanıldı)')).toBeInTheDocument();
    expect(screen.getByText(/^1 plaka/)).toBeInTheDocument();
    // The used sheet's row is dimmed.
    const usedRow = screen.getByText('S26-00002').closest('tr')!;
    expect(usedRow.style.opacity).toBe('0.55');
    expect(screen.getByText('S26-00001').closest('tr')!.style.opacity).toBe('');
  });

  it('reads the checkbox from the URL', async () => {
    renderPage('/warehouse/plate-stock?used=true');
    expect(
      await screen.findByRole('checkbox', { name: 'Kullanılmış sacları da göster' }),
    ).toHaveAttribute('aria-checked', 'true');
    await waitFor(() =>
      expect(calls('/warehouse/pieces/groups/')[0]?.get('include_empty')).toBe('true'),
    );
  });

  it('opens a used sheet to its history', async () => {
    renderPage('/warehouse/plate-stock?used=true');
    fireEvent.click(await screen.findByRole('button', { name: 'Grubu genişlet' }));
    fireEvent.click(await screen.findByText('S26-00002'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('CNC kesime çıkış')).toBeInTheDocument();
    expect(within(dialog).getByText('Kullanıldı')).toBeInTheDocument();
    // Nothing left to move or scrap.
    expect(within(dialog).queryByRole('button', { name: 'Hurdaya Ayır' })).not.toBeInTheDocument();
  });

  it('is not on Boy Stoğu, nor is the Kullanılan Saclar view', async () => {
    renderPage('/warehouse/bar-stock', <WarehouseBarStockPage />);
    expect(await screen.findByRole('radio', { name: 'Kartlar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Kullanılmış sacları da göster' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Kullanılan Saclar' })).not.toBeInTheDocument();
  });
});

describe('Kullanılan Saclar', () => {
  it('lists used sheets with the cut, jobs, reason and who', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'Kullanılan Saclar' }));
    await screen.findByText('S26-00002');
    // The filtered rows' sheets and kg, from the backend.
    expect(screen.getByText('2 sac · 706,50 kg')).toBeInTheDocument();
    const params = calls('/warehouse/pieces/used/')[0]!;
    expect([params.get('page'), params.get('page_size')]).toEqual(['1', '50']);

    const cutRow = screen.getByText('S26-00002').closest('tr')!;
    const cut = within(cutRow).getByRole('link', { name: 'CNC-2310' });
    expect(cut).toHaveAttribute('href', '/planning/cnc-cutting/cuts?cut=CNC-2310');
    expect(within(cutRow).getByText('254-01, 254-02')).toBeInTheDocument();
    expect(within(cutRow).getByText('Kesim')).toBeInTheDocument();
    expect(within(cutRow).getByText('Ali Veli')).toBeInTheDocument();
    expect(within(cutRow).getByText('1500 × 3000 mm')).toBeInTheDocument();
    expect(within(cutRow).getByText('353,25 kg')).toBeInTheDocument();

    // Hurda: no cut; a sheet from an old lot has no code of its own.
    const scrapRow = screen.getByText('Hurda').closest('tr')!;
    expect(within(scrapRow).getByText('Lot #3')).toBeInTheDocument();
    expect(within(scrapRow).queryByRole('link')).not.toBeInTheDocument();
  });

  it('sends the date, search, job and reason filters from the URL', async () => {
    renderPage(
      '/warehouse/plate-stock?view=used&used_date_start=2026-11-18&used_date_end=2026-11-24' +
        '&search=S26-00002&job_no=254&used_reason=scrap',
    );
    await waitFor(() => expect(calls('/warehouse/pieces/used/')).not.toHaveLength(0));
    const p = calls('/warehouse/pieces/used/')[0]!;
    expect([
      p.get('date_from'),
      p.get('date_to'),
      p.get('search'),
      p.get('job_no'),
      p.get('reason'),
    ]).toEqual(['2026-11-18', '2026-11-24', 'S26-00002', '254', 'scrap']);
    // The pieces list is not asked for while this view is open.
    expect(calls('/warehouse/pieces/groups/')).toHaveLength(0);
  });

  it('changes the page size on the server', async () => {
    renderPage('/warehouse/plate-stock?view=used');
    await screen.findByText('S26-00002');
    fireEvent.change(screen.getByLabelText('Sayfa başına'), { target: { value: '100' } });
    await waitFor(() =>
      expect(calls('/warehouse/pieces/used/').some((p) => p.get('page_size') === '100')).toBe(true),
    );
  });

  it('opens the sheet it used, fetched by id, to its Hareketler', async () => {
    renderPage('/warehouse/plate-stock?view=used');
    fireEvent.click(await screen.findByText('S26-00002'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('CNC kesime çıkış')).toBeInTheDocument();
    expect(within(dialog).getByText('CNC-2310 kesimi')).toBeInTheDocument();
  });
});
