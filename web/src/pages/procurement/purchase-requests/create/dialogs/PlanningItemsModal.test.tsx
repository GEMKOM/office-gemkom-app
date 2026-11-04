import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { json } from '../../testUtils';
import { PlanningItemsModal } from './PlanningItemsModal';

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
