// Ported from planning/project-planning/grid.test.mjs (the grid.js helpers
// the plan sheet uses).
import { formatDMY, maskDMY, optionsWithCurrentValue, parseDMY } from './dateEntry';

const editable = [
  { value: 'pending', label: 'Başlamadı' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'completed', label: 'Tamamlandı' },
];

it('keeps the current value in a select', () => {
  const blocked = optionsWithCurrentValue(editable, 'blocked');
  expect(blocked[0]!.value).toBe('blocked');
  expect(blocked).toHaveLength(editable.length + 1);
  expect(blocked[1]!.value).toBe('pending');
  expect(optionsWithCurrentValue(editable, 'pending')).toHaveLength(editable.length);
  expect(optionsWithCurrentValue(editable, '')).toHaveLength(editable.length);
  const lone = optionsWithCurrentValue(undefined, 'skipped');
  expect(lone).toEqual([{ value: 'skipped', label: 'skipped' }]);
});

it('formats ISO dates day-first', () => {
  expect(formatDMY('2026-04-10')).toBe('10.04.2026');
  expect(formatDMY(null)).toBe('');
  expect(formatDMY('')).toBe('');
  expect(formatDMY('10.04.2026')).toBe(''); // not ISO, not a value we store
});

it('parses day-first, always', () => {
  expect(parseDMY('03.04.2026')).toBe('2026-04-03');
  expect(parseDMY('3.4.2026')).toBe('2026-04-03');
  expect(parseDMY('03/04/2026')).toBe('2026-04-03');
  expect(parseDMY('03-04-2026')).toBe('2026-04-03');
  expect(parseDMY('03042026')).toBe('2026-04-03');
  expect(parseDMY('03.04.26')).toBe('2026-04-03');
  expect(parseDMY(' 03.04.2026 ')).toBe('2026-04-03');
  expect(parseDMY('2026-04-03')).toBe('2026-04-03'); // a pasted ISO date
});

it('clears on blank and refuses days that do not exist', () => {
  expect(parseDMY('')).toBe('');
  expect(parseDMY('   ')).toBe('');
  expect(parseDMY(null)).toBe('');
  expect(parseDMY('31.04.2026')).toBeNull();
  expect(parseDMY('29.02.2026')).toBeNull();
  expect(parseDMY('29.02.2024')).toBe('2024-02-29'); // a real leap day
  expect(parseDMY('00.04.2026')).toBeNull();
  expect(parseDMY('10.13.2026')).toBeNull();
  expect(parseDMY('yarin')).toBeNull();
  expect(parseDMY('10.04')).toBeNull();
});

it('cuts straight digits positionally', () => {
  expect(maskDMY('')).toBe('');
  expect(maskDMY('1')).toBe('1');
  expect(maskDMY('10')).toBe('10');
  expect(maskDMY('100')).toBe('10.0');
  expect(maskDMY('1004')).toBe('10.04');
  expect(maskDMY('10042026')).toBe('10.04.2026');
  expect(maskDMY('100420269999')).toBe('10.04.2026'); // capped at 8 digits
});

it('lets a typed separator beat the positional cut', () => {
  expect(maskDMY('3.4.2026')).toBe('3.4.2026');
  expect(maskDMY('3.')).toBe('3.'); // the dot survives the caret
  expect(maskDMY('3.4.')).toBe('3.4.');
  expect(maskDMY('03/04/2026')).toBe('03.04.2026');
  expect(maskDMY('03-04-2026')).toBe('03.04.2026');
  expect(maskDMY('10.04.2026')).toBe('10.04.2026');
  expect(maskDMY('2026-04-03')).toBe('03.04.2026'); // a pasted ISO date
});

it('round-trips whatever is typed to what the cell shows', () => {
  for (const typed of ['10042026', '10.04.2026', '3.4.2026', '2026-04-03', '03/04/2026']) {
    const april10 = typed === '10042026' || typed === '10.04.2026';
    const iso = parseDMY(maskDMY(typed));
    expect(iso).toBe(april10 ? '2026-04-10' : '2026-04-03');
    expect(formatDMY(iso)).toBe(april10 ? '10.04.2026' : '03.04.2026');
  }
});
