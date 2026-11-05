import { authedFetch } from '@/auth/authService';
import { cardFromSearch, lookupCardsByCode, searchStockCards } from './items';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isSuperuser: () => false,
  hasPerm: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url), 'https://api.test'));

beforeEach(() => fetchMock.mockReset());

it('searches active cards first, then inactive ones marked Pasif, and remembers them', async () => {
  fetchMock.mockImplementation((url) => {
    const active =
      new URL(String(url), 'https://api.test').searchParams.get('is_active') === 'true';
    return json({
      count: 1,
      results: active
        ? [
            {
              id: 1,
              code: '0018 0012 0040 000 001',
              name: 'CİVATA M12x40',
              unit: 'adet',
              is_active: true,
            },
          ]
        : [
            {
              id: 2,
              code: '0100 0000 0010 000 000',
              name: '10 mm ST 37-2 SAC',
              unit: 'kg',
              is_active: false,
            },
          ],
    });
  });

  const options = await searchStockCards('m12');

  expect(options).toEqual([
    { value: '0018 0012 0040 000 001', label: '0018 0012 0040 000 001 — CİVATA M12x40 • adet' },
    {
      value: '0100 0000 0010 000 000',
      label: '0100 0000 0010 000 000 — 10 mm ST 37-2 SAC • kg (Pasif)',
    },
  ]);
  expect(urls().map((u) => u.searchParams.get('search'))).toEqual(['m12', 'm12']);
  expect(cardFromSearch('0100 0000 0010 000 000')?.unit).toBe('kg');
});

it('looks codes up exactly, de-duplicated and in chunks of 100', async () => {
  fetchMock.mockImplementation((url) => {
    const codes = (
      new URL(String(url), 'https://api.test').searchParams.get('code__in') ?? ''
    ).split(',');
    return json({
      count: 1,
      results: codes
        .filter((c) => c === 'A' || c === 'C-150')
        .map((code, id) => ({ id, code, name: code })),
    });
  });
  const many = Array.from({ length: 150 }, (_, i) => `C-${i + 1}`);

  const found = await lookupCardsByCode(['A', ' A ', 'B', '', ...many]);

  expect([...found.keys()].sort()).toEqual(['A', 'C-150']);
  expect(urls()).toHaveLength(2);
  expect(urls()[0]!.searchParams.get('code__in')!.split(',')).toHaveLength(100);
  expect(urls()[1]!.searchParams.get('page_size')).toBe('52');
});
