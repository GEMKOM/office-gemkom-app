import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { json } from '../../testUtils';
import { daysBetween, daysWaiting, filterParams, PlanningItemsModal } from './PlanningItemsModal';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => false),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const item = (id: number, code: string) => ({
  id,
  item_code: code,
  item_name: `Malzeme ${code}`,
  quantity_to_purchase: 5,
  quantity_remaining_for_purchase: 5,
  item_unit: 'adet',
});

beforeEach(() => {
  vi.mocked(authedFetch).mockReset();
  vi.mocked(authedFetch).mockImplementation((url) => {
    const u = new URL(String(url));
    if (u.pathname === '/planning/items/') {
      const results = [item(1, 'A'), item(2, 'B'), item(3, 'C'), item(4, 'D')];
      return json({ count: results.length, next: null, previous: null, results });
    }
    return json({ detail: 'not mocked' }, 404);
  });
});

const order = () =>
  screen.getAllByRole('checkbox', { name: / seç$/ }).map((c) => c.getAttribute('aria-label')!.replace(' seç', ''));
const box = (code: string) => screen.getByRole('checkbox', { name: `${code} seç` });

test('a ticked row moves up and keeps its place when it is unticked and ticked again', async () => {
  renderWithProviders(<PlanningItemsModal pageItems={[]} onClose={() => {}} onAdd={() => {}} onAttached={() => {}} />);
  await waitFor(() => expect(order()).toEqual(['A', 'B', 'C', 'D']));

  fireEvent.click(box('C'));
  expect(order()).toEqual(['C', 'A', 'B', 'D']);
  fireEvent.click(box('B'));
  expect(order()).toEqual(['C', 'B', 'A', 'D']);

  // Unticking and re-ticking a pinned row used to drop it back into the list
  // and then re-pin it last, swapping it with the row below.
  fireEvent.click(box('C'));
  expect(box('C')).not.toBeChecked();
  expect(order()).toEqual(['C', 'B', 'A', 'D']);
  fireEvent.click(box('C'));
  expect(order()).toEqual(['C', 'B', 'A', 'D']);
  expect(screen.getByTestId('planning-selected-count')).toHaveTextContent('2 malzeme seçildi');
});

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

test('the needed-by range becomes after / before params; one day fills both ends', () => {
  const base = {
    planning_request_number: '',
    item_code: 'AB',
    item_name: '',
    job_no: '',
    request_priority: 'urgent',
  };
  expect(filterParams({ ...base, needed: { start: '2026-11-01', end: '2026-11-30' } })).toEqual({
    item_code: 'AB',
    request_priority: 'urgent',
    needed_date_after: '2026-11-01',
    needed_date_before: '2026-11-30',
  });
  expect(filterParams({ ...base, needed: { start: '2026-11-05', end: '' } })).toMatchObject({
    needed_date_after: '2026-11-05',
    needed_date_before: '2026-11-05',
  });
  expect(filterParams({ ...base, needed: { start: '', end: '' } })).not.toHaveProperty(
    'needed_date_after',
  );
});

test('days are counted on calendar days; waiting runs from release, else from the request', () => {
  const now = new Date(2026, 10, 9, 8, 30);
  expect(daysBetween('2026-11-06', now)).toBe(3);
  expect(daysBetween('2026-11-12', now)).toBe(-3);
  expect(daysWaiting({ id: 1, ready_at: '2026-11-02T23:00:00', request_created_at: '2026-10-01T09:00:00' }, now)).toBe(7);
  expect(daysWaiting({ id: 1, ready_at: null, request_created_at: '2026-11-08T09:00:00' }, now)).toBe(1);
  expect(daysWaiting({ id: 1 }, now)).toBeNull();
});

test('rows show the needed-by date (late ones flagged), priority, department and waiting days', async () => {
  vi.mocked(authedFetch).mockImplementation((url) => {
    const u = new URL(String(url));
    if (u.pathname === '/planning/items/') {
      const results = [
        {
          ...item(1, 'LATE'),
          needed_date: daysFromToday(-4),
          request_priority: 'critical',
          request_priority_label: 'Kritik',
          department: 'maintenance',
          department_source: 'department_request',
          ready_at: `${daysFromToday(-2)}T10:00:00`,
        },
        {
          ...item(2, 'LATER'),
          needed_date: daysFromToday(20),
          request_priority: 'normal',
          department: 'planning',
          department_source: 'creator',
          request_created_at: `${daysFromToday(-5)}T10:00:00`,
        },
      ];
      return json({ count: results.length, next: null, previous: null, results });
    }
    return json({ detail: 'not mocked' }, 404);
  });
  renderWithProviders(<PlanningItemsModal pageItems={[]} onClose={() => {}} onAdd={() => {}} onAttached={() => {}} />);
  const late = (await screen.findByRole('checkbox', { name: 'LATE seç' })).closest('tr')!;
  expect(within(late).getByText('4 gün gecikti')).toBeInTheDocument();
  expect(within(late).getByText('Kritik')).toBeInTheDocument();
  expect(within(late).getByText('2 gün')).toBeInTheDocument();
  const later = screen.getByRole('checkbox', { name: 'LATER seç' }).closest('tr')!;
  expect(within(later).queryByText(/gecikti/)).toBeNull();
  expect(within(later).getByText('Normal')).toBeInTheDocument();
  expect(within(later).getByTitle('Departman talebi yok: talebi oluşturanın birimi')).toBeInTheDocument();
  expect(within(later).getByText('5 gün')).toBeInTheDocument();
});

test('sorting by İhtiyaç Tarihi asks the backend for ordering=needed_date', async () => {
  renderWithProviders(<PlanningItemsModal pageItems={[]} onClose={() => {}} onAdd={() => {}} onAttached={() => {}} />);
  await waitFor(() => expect(order()).toEqual(['A', 'B', 'C', 'D']));
  const header = screen.getByRole('columnheader', { name: /İhtiyaç Tarihi/ });
  fireEvent.click(within(header).getByRole('button'));
  await waitFor(() =>
    expect(
      vi
        .mocked(authedFetch)
        .mock.calls.map(([url]) => new URL(String(url)))
        .some((u) => u.pathname === '/planning/items/' && u.searchParams.get('ordering') === 'needed_date'),
    ).toBe(true),
  );
});
