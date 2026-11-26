import { authedFetch } from '@/auth/authService';
import { fetchLineSheets, LINE_SHEETS_PAGE_SIZE } from './pieces';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const sheet = (id: number) => ({ id, code: `S26-${String(id).padStart(5, '0')}` });

beforeEach(() => {
  fetchMock.mockReset();
});

it('follows every page of a plate line so sheets past the first 50 are not dropped', async () => {
  fetchMock.mockImplementation((url) => {
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('planning_item')).toBe('12');
    expect(parsed.searchParams.get('kind')).toBe('plate');
    expect(parsed.searchParams.get('page_size')).toBe(String(LINE_SHEETS_PAGE_SIZE));
    const page = parsed.searchParams.get('page');
    if (page === '1') {
      return json({
        count: 51,
        next: 'https://api.test/warehouse/pieces/?page=2',
        previous: null,
        results: Array.from({ length: 50 }, (_, i) => sheet(i + 1)),
      });
    }
    if (page === '2') {
      return json({
        count: 51,
        next: null,
        previous: 'https://api.test/warehouse/pieces/?page=1',
        results: [sheet(51)],
      });
    }
    throw new Error(`unexpected page ${page}`);
  });

  const rows = await fetchLineSheets(12);
  expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
  expect(rows.at(-1)?.code).toBe('S26-00051');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
