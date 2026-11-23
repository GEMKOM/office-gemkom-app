import { apiFetch } from '@/api/client';
import {
  arrangeColumns,
  buildLayout,
  getColumnLayout,
  layoutChoices,
  moveKey,
  parseLayouts,
  resetColumnLayoutStore,
  setColumnLayout,
  useColumnLayout,
} from './columnLayout';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../notify', () => ({ notify: { warning: vi.fn() } }));

const fetchMock = vi.mocked(apiFetch);
const cols = (...keys: string[]) => keys.map((key) => ({ key }));
const keysOf = (list: readonly { key: string }[]) => list.map((c) => c.key);

function signIn(id: number) {
  localStorage.setItem('user', JSON.stringify({ id, username: `u${id}` }));
  localStorage.setItem('accessToken', 'token');
}

beforeEach(() => {
  localStorage.clear();
  resetColumnLayoutStore();
  fetchMock.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('arrangeColumns', () => {
  it('keeps the default order without a layout', () => {
    expect(keysOf(arrangeColumns(cols('a', 'b', 'c'), undefined))).toEqual(['a', 'b', 'c']);
  });

  it('follows the layout, skips columns the page dropped and slots new ones in', () => {
    const layout = [{ key: 'c' }, { key: 'gone' }, { key: 'a' }];
    // 'b' follows 'a' by default; 'x' is first by default.
    expect(keysOf(arrangeColumns(cols('x', 'a', 'b', 'c'), layout))).toEqual(['x', 'c', 'a', 'b']);
  });
});

describe('layout helpers', () => {
  it('keeps only explicit choices', () => {
    const layout = buildLayout(cols('a', 'b', 'c'), { b: false, c: true });
    expect(layout).toEqual([
      { key: 'a' },
      { key: 'b', visible: false },
      { key: 'c', visible: true },
    ]);
    expect(layoutChoices(layout)).toEqual({ b: false, c: true });
  });

  it('moves a key', () => {
    expect(moveKey(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveKey(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveKey(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
  });

  it('reads the list answer and ignores odd shapes', () => {
    expect(parseLayouts({})).toEqual({});
    expect(parseLayouts([])).toBeNull();
    expect(
      parseLayouts({
        offers: {
          columns: [{ key: 'a', visible: false }, { nope: 1 }, { key: 'b', visible: 'x' }],
        },
        broken: { columns: 'x' },
      }),
    ).toEqual({ offers: [{ key: 'a', visible: false }, { key: 'b' }] });
  });
});

describe('the store', () => {
  it('loads the signed-in user’s layouts from the backend', async () => {
    signIn(7);
    fetchMock.mockResolvedValueOnce({ offers: { columns: [{ key: 'b' }, { key: 'a' }] } });
    const { result } = renderHook(() => useColumnLayout('offers'));
    await waitFor(() => expect(result.current[0]).toEqual([{ key: 'b' }, { key: 'a' }]));
    expect(fetchMock).toHaveBeenCalledWith('/users/me/table-preferences/');
    // A copy stays in the browser for the next visit.
    expect(JSON.parse(localStorage.getItem('gk.tableLayouts.7') ?? '{}')).toEqual({
      offers: { columns: [{ key: 'b' }, { key: 'a' }] },
    });
  });

  it('saves changes as one request and resets with DELETE', async () => {
    vi.useFakeTimers();
    signIn(7);
    fetchMock.mockResolvedValue({});
    setColumnLayout('offers', [{ key: 'a' }]);
    setColumnLayout('offers', [{ key: 'b' }, { key: 'a', visible: false }]);
    expect(getColumnLayout('offers')).toEqual([{ key: 'b' }, { key: 'a', visible: false }]);
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/users/me/table-preferences/offers/', {
      method: 'PUT',
      body: { columns: [{ key: 'b' }, { key: 'a', visible: false }] },
    });

    setColumnLayout('offers', null);
    expect(getColumnLayout('offers')).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenLastCalledWith('/users/me/table-preferences/offers/', {
      method: 'DELETE',
    });
  });

  it('keeps a change made while the load is in flight', async () => {
    signIn(7);
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    fetchMock.mockResolvedValue({});
    const { result } = renderHook(() => useColumnLayout('offers'));
    act(() => result.current[1]([{ key: 'z' }]));
    await act(async () => answer({ offers: { columns: [{ key: 'old' }] }, ncrs: { columns: [] } }));
    expect(result.current[0]).toEqual([{ key: 'z' }]);
  });

  it('does not show one user’s layout to the next', () => {
    signIn(7);
    fetchMock.mockReturnValue(new Promise(() => {}));
    setColumnLayout('offers', [{ key: 'b' }]);
    signIn(8);
    expect(getColumnLayout('offers')).toBeUndefined();
    signIn(7);
    expect(getColumnLayout('offers')).toEqual([{ key: 'b' }]);
  });

  it('does not call the backend when nobody is signed in', async () => {
    vi.useFakeTimers();
    renderHook(() => useColumnLayout('offers'));
    setColumnLayout('offers', [{ key: 'a' }]);
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getColumnLayout('offers')).toEqual([{ key: 'a' }]);
  });
});
