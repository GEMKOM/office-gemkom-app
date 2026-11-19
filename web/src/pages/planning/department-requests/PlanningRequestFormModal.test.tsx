import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PlanningRequestFormModal } from './PlanningRequestFormModal';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isSuperuser: () => true,
  hasPerm: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const MIXED = {
  id: 7,
  title: 'Rulman alımı',
  description: '',
  priority: 'normal',
  needed_date: '2026-12-10',
  check_inventory: false,
  files: [],
  items: [
    {
      id: 101,
      item_code: 'K-1',
      item_name: 'Rulman',
      item_unit: 'adet',
      job_no: '254-01',
      quantity: '4.00',
      quantity_from_inventory: '2',
    },
    {
      id: 102,
      item_code: 'K-2',
      item_name: 'Kayış',
      item_unit: 'metre',
      job_no: '254-02',
      quantity: 1,
    },
    {
      id: 103,
      item_code: 'K-3',
      item_name: 'Somun',
      item_unit: 'adet',
      job_no: '254-01',
      quantity: 3,
      is_converted: true,
      is_deletable: false,
      quantity_in_active_prs: '3',
    },
  ],
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
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
  }));
}
const patches = () =>
  calls().filter((c) => c.method === 'PATCH' && c.url.pathname === '/planning/requests/7/');

const codeInput = (n: number) =>
  screen
    .getAllByLabelText(`Ürün kodu ${n}`)
    .find((el) => (el as HTMLInputElement).type !== 'hidden')!;

const WEIGHT = {
  unit_kg: '706.500' as string | null,
  total_kg: '706.500' as string | null,
  density_g_cm3: '7.850',
  plate_thickness_mm: '10.00',
  kg_per_m: null,
  missing: '',
};
let weightPreview = WEIGHT;

const CARDS = [
  {
    id: 12,
    code: '0100 0000 0010 000 000',
    name: '10 mm ST 37-2 SAC',
    unit: 'KG',
    material_class: 'plate',
  },
  { id: 14, code: 'K-1', name: 'Rulman', unit: 'ADET', material_class: 'normal' },
];

// Mantine's combobox scrolls the active option into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  weightPreview = WEIGHT;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Vinç' },
        { job_no: '254-02', title: 'Konveyör' },
      ]);
    }
    if (method === 'PATCH' && path === '/planning/requests/7/') return json({ id: 7 });
    if (method === 'GET' && path === '/planning/standard-sizes/') {
      return json({
        plate: [
          { width_mm: 1500, length_mm: 6000, label: '1500 × 6000 mm' },
          { width_mm: 2000, length_mm: 12000, label: '2000 × 12000 mm' },
        ],
        bar: [{ length_mm: 6000, label: '6000 mm' }],
      });
    }
    if (method === 'POST' && path === '/warehouse/pieces/weight-preview/') {
      return json(weightPreview);
    }
    if (method === 'GET' && path === '/procurement/items/') {
      const codes = new URL(String(url)).searchParams.get('code__in')?.split(',') ?? [];
      return json(CARDS.filter((card) => codes.includes(card.code)));
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('Tümünü Temizle keeps inventory and PR-locked lines, then PATCH sends those ids', async () => {
  renderWithProviders(
    <PlanningRequestFormModal mode={{ kind: 'edit', request: MIXED }} onClose={() => {}} />,
  );

  expect(await screen.findByText('Planlama Talebi Düzenle')).toBeInTheDocument();
  expect(screen.getAllByTestId('item-row')).toHaveLength(3);
  expect(codeInput(1)).toHaveValue('K-1');
  expect(codeInput(2)).toHaveValue('K-2');
  expect(codeInput(3)).toHaveValue('K-3');

  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Temizle' }));
  expect(notify.info).toHaveBeenCalledWith('Silinemeyen ürünler bırakıldı; diğerleri temizlendi');
  expect(screen.getAllByTestId('item-row')).toHaveLength(2);
  expect(codeInput(1)).toHaveValue('K-1');
  expect(codeInput(2)).toHaveValue('K-3');

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]!.body).toEqual({
    items: [
      {
        id: 101,
        job_no: '254-01',
        quantity: 4,
        item_code: 'K-1',
        item_name: 'Rulman',
        item_unit: 'adet',
      },
      {
        id: 103,
        job_no: '254-01',
        quantity: 3,
        item_code: 'K-3',
        item_name: 'Somun',
        item_unit: 'adet',
      },
    ],
  });
});

it('Tümünü Temizle does not drop a request that is only locked lines', async () => {
  renderWithProviders(
    <PlanningRequestFormModal
      mode={{
        kind: 'edit',
        request: { ...MIXED, items: [MIXED.items[0]!, MIXED.items[2]!] },
      }}
      onClose={() => {}}
    />,
  );

  expect(await screen.findByText('Planlama Talebi Düzenle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Temizle' }));
  expect(notify.warning).toHaveBeenCalledWith(
    'Envanterden verilmiş veya satın alma talebine bağlı ürünler silinemez; önce stoğa iade edin veya bağlı talebi iptal edin.',
  );
  expect(screen.getAllByTestId('item-row')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Değişiklik yapılmadı'));
  expect(patches()).toHaveLength(0);
});

it('a plate line is asked for in sizes and its kg follows the pieces', async () => {
  const request = {
    ...MIXED,
    items: [
      {
        id: 201,
        item: 12,
        item_code: '0100 0000 0010 000 000',
        item_name: '10 mm ST 37-2 SAC',
        item_unit: 'kg',
        item_material_class: 'plate',
        job_no: '254-01',
        quantity: '706.50',
        size_mode: 'standard' as const,
        piece_width_mm: '1500.0',
        piece_length_mm: '6000.0',
        piece_count: 1,
      },
    ],
  };
  renderWithProviders(
    <PlanningRequestFormModal mode={{ kind: 'edit', request }} onClose={() => {}} />,
  );
  // One line: size × adet and the one weight; no Miktar / Birim to type.
  expect(await screen.findByRole('combobox', { name: 'Ölçü 1' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Miktar 1')).toHaveTextContent('706,50 kg'));
  expect(screen.queryByRole('textbox', { name: 'Miktar 1' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Birim 1')).not.toBeInTheDocument();
  expect(screen.queryByText(/\/ sac/)).not.toBeInTheDocument(); // the weight shows once

  fireEvent.change(screen.getByLabelText('Parça adedi 1'), { target: { value: '2' } });
  await waitFor(() => expect(screen.getByLabelText('Miktar 1')).toHaveTextContent('1.413,00 kg'));

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]!.body).toMatchObject({
    items: [
      {
        id: 201,
        quantity: 1413,
        size_mode: 'standard' as const,
        piece_width_mm: '1500',
        piece_length_mm: '6000',
        piece_count: 2,
      },
    ],
  });
});

it('PATCHes when only the plate size changes (adet, same count)', async () => {
  const request = {
    ...MIXED,
    items: [
      {
        id: 201,
        item: 12,
        item_code: '0100 0000 0010 000 000',
        item_name: '10 mm ST 37-2 SAC',
        item_unit: 'adet',
        item_material_class: 'plate',
        job_no: '254-01',
        quantity: 4,
        size_mode: 'standard' as const,
        piece_width_mm: '1500.0',
        piece_length_mm: '6000.0',
        piece_count: 4,
      },
    ],
  };
  renderWithProviders(
    <PlanningRequestFormModal mode={{ kind: 'edit', request }} onClose={() => {}} />,
  );
  // "Özel ölçü…" sits in the size dropdown and switches to W × L.
  fireEvent.click(await screen.findByRole('combobox', { name: 'Ölçü 1' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Özel ölçü…', hidden: true }));
  fireEvent.change(screen.getByLabelText('En (mm) 1'), { target: { value: '2000' } });
  fireEvent.change(screen.getByLabelText('Boy (mm) 1'), { target: { value: '12000' } });
  expect(screen.getByLabelText('Parça adedi 1')).toHaveValue('4');

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]!.body).toMatchObject({
    items: [
      {
        id: 201,
        quantity: 4,
        size_mode: 'custom',
        piece_width_mm: '2000',
        piece_length_mm: '12000',
        piece_count: 4,
      },
    ],
  });
});

const BAR_LINE = {
  id: 202,
  item: 13,
  item_code: '0010 0114 0015 000 000',
  item_name: '114,3*15 ST 44 ÇELİK ÇEKME BORU',
  item_unit: 'metre',
  item_material_class: 'boy',
  job_no: '254-01',
  quantity: '18.00',
  size_mode: 'standard' as const,
  piece_width_mm: null,
  piece_length_mm: '6000.0',
  piece_count: 3,
};

it('a bar line shows its total metres and kg on one row', async () => {
  weightPreview = { ...WEIGHT, unit_kg: '220.380', total_kg: '220.380' };
  renderWithProviders(
    <PlanningRequestFormModal
      mode={{ kind: 'edit', request: { ...MIXED, items: [BAR_LINE] } }}
      onClose={() => {}}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Miktar 1')).toHaveTextContent('18,00 m · 661,14 kg'),
  );
  expect(screen.queryByLabelText('Birim 1')).not.toBeInTheDocument();
});

it('a bar length is chosen and typed in metres, and saved in mm', async () => {
  weightPreview = { ...WEIGHT, unit_kg: '91.825', total_kg: '91.825' };
  renderWithProviders(
    <PlanningRequestFormModal
      mode={{ kind: 'edit', request: { ...MIXED, items: [BAR_LINE] } }}
      onClose={() => {}}
    />,
  );
  // The standard lengths read in metres (never "6000 mm" next to a quantity in m).
  fireEvent.click(await screen.findByRole('combobox', { name: 'Ölçü 1' }));
  expect(await screen.findByRole('option', { name: '6 m', hidden: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Özel ölçü…', hidden: true }));
  fireEvent.change(screen.getByLabelText('Boy (m) 1'), { target: { value: '2,5' } });
  fireEvent.change(screen.getByLabelText('Parça adedi 1'), { target: { value: '4' } });
  await waitFor(() => expect(screen.getByLabelText('Miktar 1')).toHaveTextContent('10,00 m'));

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]!.body).toMatchObject({
    items: [{ id: 202, quantity: 10, size_mode: 'custom', piece_length_mm: '2500', piece_count: 4 }],
  });
});

it('a kg plate card without a thickness asks for the kg and says why', async () => {
  weightPreview = {
    ...WEIGHT,
    unit_kg: null,
    total_kg: null,
    missing: 'Kartta sac kalınlığı yok.',
  };
  const request = {
    ...MIXED,
    items: [
      {
        id: 201,
        item: 12,
        item_code: '0100 0000 0010 000 000',
        item_name: '10 mm ST 37-2 SAC',
        item_unit: 'kg',
        item_material_class: 'plate',
        job_no: '254-01',
        quantity: '500.00',
        size_mode: 'standard' as const,
        piece_width_mm: '1500.0',
        piece_length_mm: '6000.0',
        piece_count: 1,
      },
    ],
  };
  renderWithProviders(
    <PlanningRequestFormModal mode={{ kind: 'edit', request }} onClose={() => {}} />,
  );
  expect(await screen.findByText('Ağırlık yok')).toBeInTheDocument();
  const kgInput = screen.getByLabelText('Miktar (kg) 1');
  expect(kgInput).toHaveValue('500.00');
  fireEvent.change(kgInput, { target: { value: '520' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]!.body).toMatchObject({ items: [{ id: 201, quantity: 520 }] });
});

it('resolves the cards of department request rows so a plate line asks for sizes', async () => {
  const departmentRequest = {
    id: 9,
    title: 'Sac talebi',
    needed_date: '2026-12-10',
    items: [
      {
        item_code: '0100 0000 0010 000 000',
        item_id: 12,
        item_name: '10 mm ST 37-2 SAC',
        item_unit: 'kg',
        job_no: '254-01',
        quantity: 100,
      },
      { item_code: 'K-1', item_name: 'Rulman', item_unit: 'adet', job_no: '254-01', quantity: 2 },
      { item_code: 'MIKRO-9', item_name: 'Eski kod', item_unit: 'adet', quantity: 1 },
      { item_code: null, item_name: 'Özel conta', item_unit: 'adet', quantity: 2, no_card: true },
    ],
  };
  const onCreateReady = vi.fn();
  renderWithProviders(
    <PlanningRequestFormModal
      mode={{ kind: 'create', departmentRequest }}
      onClose={() => {}}
      onCreateReady={onCreateReady}
    />,
  );

  // The plate card arrives with the size editor; no re-pick.
  expect(await screen.findByRole('combobox', { name: 'Ölçü 1' })).toBeInTheDocument();
  const lookups = calls().filter((c) => c.url.pathname === '/procurement/items/');
  expect(lookups).toHaveLength(1);
  expect(lookups[0]!.url.searchParams.get('code__in')).toBe('0100 0000 0010 000 000,K-1,MIKRO-9');
  // A normal card, a code with no card and a "Kart yok" row keep Miktar / Birim.
  for (const n of [2, 3, 4]) {
    expect(screen.getAllByLabelText(`Birim ${n}`).length).toBeGreaterThan(0);
  }
  expect(screen.queryByRole('combobox', { name: 'Ölçü 2' })).not.toBeInTheDocument();
});
