import { act, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { FilterBar, type FilterConfig } from './FilterBar';
import { useUrlFilters, type UrlFilters } from './useUrlFilters';

const defaults = {
  search: '',
  status: [] as string[],
  active: false,
  created: { start: '', end: '' },
};

type Probe = (filters: UrlFilters<typeof defaults>, search: string) => void;

// The latest hook result and URL query, captured by the probe each render.
let filters: UrlFilters<typeof defaults>;
let search = '';
const capture: Probe = (f, s) => {
  filters = f;
  search = s;
};

function Harness({ probe }: { probe: Probe }) {
  probe(useUrlFilters(defaults), useLocation().search);
  return null;
}

describe('useUrlFilters', () => {
  it('reads the defaults when the URL has no filters', () => {
    renderWithProviders(<Harness probe={capture} />, { route: '/list?page=3' });
    expect(filters.values).toEqual(defaults);
  });

  it('round-trips every value type through the URL', () => {
    renderWithProviders(<Harness probe={capture} />, { route: '/list?page=3' });
    act(() =>
      filters.apply({
        search: 'çelik',
        status: ['open', 'closed'],
        active: true,
        created: { start: '2026-01-01', end: '2026-01-31' },
      }),
    );
    const params = new URLSearchParams(search);
    expect(params.get('search')).toBe('çelik');
    expect(params.getAll('status')).toEqual(['open', 'closed']);
    expect(params.get('active')).toBe('true');
    expect(params.get('created_start')).toBe('2026-01-01');
    expect(params.get('created_end')).toBe('2026-01-31');
    // Unrelated params are kept.
    expect(params.get('page')).toBe('3');

    expect(filters.values).toEqual({
      search: 'çelik',
      status: ['open', 'closed'],
      active: true,
      created: { start: '2026-01-01', end: '2026-01-31' },
    });
  });

  it('parses a URL it did not write itself', () => {
    renderWithProviders(<Harness probe={capture} />, {
      route: '/list?search=boru&status=a&status=b&active=1&created_end=2026-02-01',
    });
    expect(filters.values).toEqual({
      search: 'boru',
      status: ['a', 'b'],
      active: true,
      created: { start: '', end: '2026-02-01' },
    });
  });

  it('merges partial updates and keeps values stable between renders', () => {
    renderWithProviders(<Harness probe={capture} />, { route: '/list?search=boru' });
    const before = filters.values;
    act(() => filters.apply({ active: true }));
    expect(filters.values).toEqual({ ...defaults, search: 'boru', active: true });
    expect(filters.values).not.toBe(before);
  });

  it('reset drops the filter params', () => {
    renderWithProviders(<Harness probe={capture} />, { route: '/list?search=boru&status=a&page=2' });
    act(() => filters.reset());
    expect(search).toBe('?page=2');
    expect(filters.values).toEqual(defaults);
  });
});

describe('FilterBar', () => {
  const config: FilterConfig<keyof typeof defaults>[] = [
    { type: 'text', key: 'search', label: 'Ara' },
    { type: 'checkbox', key: 'active', label: 'Aktif' },
  ];

  function Page({ probe }: { probe: Probe }) {
    const urlFilters = useUrlFilters(defaults);
    probe(urlFilters, '');
    return (
      <FilterBar
        filters={config}
        values={urlFilters.values}
        onApply={urlFilters.apply}
        onClear={urlFilters.reset}
      />
    );
  }

  it('applies the search on Enter, pills at once, clears on Temizle', () => {
    renderWithProviders(<Page probe={capture} />, { route: '/list' });
    const input = screen.getByLabelText('Ara');

    fireEvent.change(input, { target: { value: 'vana' } });
    // Typing waits for a pause; Enter applies straight away.
    expect(filters.values.search).toBe('');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(filters.values.search).toBe('vana');

    fireEvent.click(screen.getByLabelText('Aktif'));
    expect(filters.values.active).toBe(true);
    expect(filters.values.search).toBe('vana');

    fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
    expect(filters.values).toEqual(defaults);
    expect(screen.getByLabelText('Ara')).toHaveValue('');
  });

  it('applies the search 400ms after typing stops', () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<Page probe={capture} />, { route: '/list' });
      fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'pom' } });
      act(() => vi.advanceTimersByTime(300));
      fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'pompa' } });
      act(() => vi.advanceTimersByTime(300));
      expect(filters.values.search).toBe('');
      act(() => vi.advanceTimersByTime(100));
      expect(filters.values.search).toBe('pompa');
    } finally {
      vi.useRealTimers();
    }
  });
});
