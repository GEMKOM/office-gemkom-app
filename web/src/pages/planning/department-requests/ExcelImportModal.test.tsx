import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ExcelImportModal } from './ExcelImportModal';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const PLATE = '0100 0000 0010 000 000';
const BAR = '0010 0114 0015 000 000';
const BOLT = '0018 0012 0040 000 001';
const cards = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('@/api/procurement/items', async (original) => ({
  ...(await original<object>()),
  lookupCardsByCode: cards.lookup,
}));

const CSV = [
  'Kodu;İsmi;Srm. Mrk.;Miktar;Birim',
  `${PLATE};10 MM SAC;304-01;850;kg`,
  `${BAR};114,3*15 BORU;304-01;500;mm`,
  `${BOLT};CIVATA M12x40;304-01;20;adet`,
].join('\n');

beforeEach(() => {
  cards.lookup.mockResolvedValue(
    new Map([
      [PLATE, { id: 1, code: PLATE, unit: 'kg', material_class: 'plate', is_active: true }],
      [BAR, { id: 2, code: BAR, unit: 'METRE', material_class: 'boy', is_active: true }],
      [BOLT, { id: 3, code: BOLT, unit: 'adet', material_class: 'normal', is_active: true }],
    ]),
  );
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

it('brings bar rows in with a warning (length in m and count to pick); plate rows stay out', async () => {
  const onImport = vi.fn();
  renderWithProviders(<ExcelImportModal onClose={() => {}} onImport={onImport} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([CSV], 'liste.csv', { type: 'text/csv' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Önizleme' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Eşleştirmeyi Onayla' }));

  // The preview flags each kind of row.
  expect(await screen.findByText('Boy: ölçü seçilecek')).toBeInTheDocument();
  expect(screen.getByText('Sac: alınmaz')).toBeInTheDocument();
  expect(screen.getByText('Boy satırları ölçüsüz gelecek')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Ürünü İçe Aktar/ }));
  await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  const items = onImport.mock.calls[0]![0] as { item_code: string; card?: unknown }[];
  expect(items.map((i) => i.item_code)).toEqual([BAR, BOLT]);
  // The bar row carries its card: the form makes it a sized line.
  expect(items[0]!.card).toEqual({ id: 2, unit: 'METRE', material_class: 'boy' });
  expect(items[1]!.card).toBeUndefined();
  expect(notify.warning).toHaveBeenCalledWith(
    expect.stringContaining('Sac satırları içe aktarılmadı'),
  );
  expect(notify.warning).toHaveBeenCalledWith(
    expect.stringContaining('1 boy satırı listeye alındı: her biri için boy (m) ve adet seçin'),
  );
});
