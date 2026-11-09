import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderWithProviders } from '@/test/render';
import { FilterBar, type FilterConfig } from './FilterBar';

type Values = { q: string; job: string; user: string; team: string[]; tags: string[] };
const EMPTY: Values = { q: '', job: '', user: '', team: [], tags: [] };

const USERS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `Kişi ${i + 1}`,
}));
const JOBS = [
  { value: '254-01', label: '254-01 — Kazan' },
  { value: '254-05', label: '254-05 — Tank' },
  { value: '260-02', label: '260-02 — Silo' },
];

const FILTERS: FilterConfig<keyof Values>[] = [
  { type: 'text', key: 'q', label: 'Ara' },
  { type: 'text', key: 'job', label: 'İş No', suggestions: JOBS },
  { type: 'select', key: 'user', label: 'Kullanıcı', options: USERS },
  { type: 'multiselect', key: 'team', label: 'Ekip', options: USERS },
  { type: 'multiselect', key: 'tags', label: 'Etiket', options: USERS.slice(0, 3) },
];

const applied: Values[] = [];

function Harness() {
  const [values, setValues] = useState(EMPTY);
  return (
    <FilterBar
      inline
      filters={FILTERS}
      values={values}
      onApply={(next) => {
        applied.push(next);
        setValues(next);
      }}
    />
  );
}

beforeEach(() => {
  applied.length = 0;
});

it('a long select gets a search box', async () => {
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Kullanıcı' }));
  const search = await screen.findByRole('textbox', { name: 'Seçeneklerde ara', hidden: true });
  fireEvent.change(search, { target: { value: 'kisi 12' } });
  const match = await screen.findByRole('menuitem', { name: 'Kişi 12', hidden: true });
  expect(screen.queryByRole('menuitem', { name: 'Kişi 2', hidden: true })).not.toBeInTheDocument();
  fireEvent.click(match);
  await waitFor(() => expect(applied.at(-1)?.user).toBe('12'));
});

it('a long multiselect gets a search box that keeps picks reachable', async () => {
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Ekip' }));
  const teamSearch = await screen.findByRole('textbox', { name: 'Seçeneklerde ara', hidden: true });
  fireEvent.change(teamSearch, { target: { value: '11' } });
  const box = await screen.findByRole('checkbox', { name: 'Kişi 11', hidden: true });
  expect(screen.queryByRole('checkbox', { name: 'Kişi 3', hidden: true })).not.toBeInTheDocument();
  fireEvent.click(box);
  await waitFor(() => expect(applied.at(-1)?.team).toEqual(['11']));
});

it('a short multiselect has no search box', async () => {
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Etiket' }));
  await screen.findByRole('checkbox', { name: 'Kişi 1', hidden: true });
  expect(
    screen.queryByRole('textbox', { name: 'Seçeneklerde ara', hidden: true }),
  ).not.toBeInTheDocument();
});

it('a suggestion filter lists matches while typing and filters on the pick', async () => {
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'İş No' }));
  const input = await screen.findByRole('textbox', { name: 'İş No', hidden: true });
  fireEvent.change(input, { target: { value: 'tank' } });
  const option = await screen.findByRole('option', { name: '254-05 — Tank', hidden: true });
  expect(screen.queryByRole('option', { name: /254-01/, hidden: true })).not.toBeInTheDocument();
  // Typing alone applies nothing, even after the search pause.
  await new Promise((r) => setTimeout(r, 500));
  expect(applied).toHaveLength(0);
  fireEvent.click(option);
  expect(applied.at(-1)?.job).toBe('254-05');
});

it('Enter takes the highlighted match, or the typed text when none is highlighted', async () => {
  renderWithProviders(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'İş No' }));
  const input = await screen.findByRole('textbox', { name: 'İş No', hidden: true });
  fireEvent.change(input, { target: { value: '254' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(applied.at(-1)?.job).toBe('254');

  fireEvent.click(screen.getByRole('button', { name: /İş No/ }));
  const again = await screen.findByRole('textbox', { name: 'İş No', hidden: true });
  fireEvent.change(again, { target: { value: '254' } });
  fireEvent.keyDown(again, { key: 'ArrowDown' });
  fireEvent.keyDown(again, { key: 'ArrowDown' });
  fireEvent.keyDown(again, { key: 'Enter' });
  expect(applied.at(-1)?.job).toBe('254-05');
});
