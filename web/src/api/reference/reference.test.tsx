import { authedFetch } from '@legacy/authService.js';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { useJobOrderOptions, useMachines, useTeams, useUsers } from './index';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  fetchMock.mockReset();
});

function UserCount({ label }: { label: string }) {
  const { data } = useUsers({ is_active: true });
  return <div>{data ? `${label}: ${data.length}` : `${label}: loading`}</div>;
}

it('two components using useUsers share one request', async () => {
  fetchMock.mockImplementation(() => json([{ id: 1, username: 'ali' }, { id: 2, username: 'ayse' }]));
  renderWithProviders(
    <>
      <UserCount label="a" />
      <UserCount label="b" />
    </>,
  );
  expect(await screen.findByText('a: 2')).toBeInTheDocument();
  expect(screen.getByText('b: 2')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://api.test/users/dropdown/?is_active=true');
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});

it('useTeams fills value and label', async () => {
  fetchMock.mockImplementation(() => json({ results: [{ id: 3, name: 'kaynak', display_name: 'Kaynak' }] }));
  function Teams() {
    const { data } = useTeams();
    return <div>{data?.map((t) => `${t.value}=${t.label}`).join(',') ?? 'loading'}</div>;
  }
  renderWithProviders(<Teams />);
  expect(await screen.findByText('kaynak=Kaynak')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/organization/groups/');
});

it('useMachines and useJobOrderOptions send the legacy params', async () => {
  fetchMock.mockImplementation((url) =>
    String(url).includes('/machines/') ? json({ count: 1, next: null, previous: null, results: [{ id: 1, name: 'M1' }] }) : json([]),
  );
  function Both() {
    const machines = useMachines({ used_in: 'machining' });
    const jobs = useJobOrderOptions({ rootOnly: true, withCustomer: true, includeAll: false });
    return <div>{machines.data && jobs.data ? `machines: ${machines.data.count}` : 'loading'}</div>;
  }
  renderWithProviders(<Both />);
  expect(await screen.findByText('machines: 1')).toBeInTheDocument();
  const urls = fetchMock.mock.calls.map(([url]) => url).sort();
  expect(urls).toEqual([
    'https://api.test/machines/?page=1&page_size=100&used_in=machining',
    'https://api.test/projects/job-orders/dropdown/?root_only=true&with_customer=true',
  ]);
});
