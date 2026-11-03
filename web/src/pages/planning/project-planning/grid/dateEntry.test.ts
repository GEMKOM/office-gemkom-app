// Port of planning/project-planning/grid.test.mjs.

import { assert } from '@/test/legacyAssert';
import { formatDMY, maskDMY, optionsWithCurrentValue, parseDMY } from './dateEntry';

const editable = [
  { value: 'pending', label: 'Başlamadı' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'completed', label: 'Tamamlandı' },
];

it('keeps a current value that is not in the editable list', () => {
  const opts = optionsWithCurrentValue(editable, 'blocked');
  assert.equal(opts[0]!.value, 'blocked');
  assert.equal(opts.length, editable.length + 1);
  assert.equal(opts[1]!.value, 'pending');

  const same = optionsWithCurrentValue(editable, 'pending');
  assert.equal(same.length, editable.length);
  assert.equal(same[0]!.value, 'pending');

  assert.equal(optionsWithCurrentValue(editable, '').length, editable.length);

  const none = optionsWithCurrentValue(undefined, 'skipped');
  assert.equal(none.length, 1);
  assert.equal(none[0]!.value, 'skipped');
});

it('formats ISO dates day-first', () => {
  assert.equal(formatDMY('2026-04-10'), '10.04.2026');
  assert.equal(formatDMY(null), '');
  assert.equal(formatDMY(''), '');
  assert.equal(formatDMY('10.04.2026'), ''); // not ISO, not a value we store
});

it('parses day-first, always: never read as 4 March', () => {
  assert.equal(parseDMY('03.04.2026'), '2026-04-03');
  assert.equal(parseDMY('3.4.2026'), '2026-04-03');
  assert.equal(parseDMY('03/04/2026'), '2026-04-03');
  assert.equal(parseDMY('03-04-2026'), '2026-04-03');
  assert.equal(parseDMY('03042026'), '2026-04-03');
  assert.equal(parseDMY('03.04.26'), '2026-04-03');
  assert.equal(parseDMY(' 03.04.2026 '), '2026-04-03');
  assert.equal(parseDMY('2026-04-03'), '2026-04-03'); // a pasted ISO date
});

it('clears on blank and refuses garbage and days that do not exist', () => {
  // Rolling 31.04 into 1 May would silently plan the wrong day.
  assert.equal(parseDMY(''), '');
  assert.equal(parseDMY('   '), '');
  assert.equal(parseDMY(null), '');
  assert.equal(parseDMY('31.04.2026'), null);
  assert.equal(parseDMY('29.02.2026'), null);
  assert.equal(parseDMY('29.02.2024'), '2024-02-29'); // a real leap day
  assert.equal(parseDMY('00.04.2026'), null);
  assert.equal(parseDMY('10.13.2026'), null);
  assert.equal(parseDMY('yarin'), null);
  assert.equal(parseDMY('10.04'), null);
});

it('masks straight digits positionally', () => {
  assert.equal(maskDMY(''), '');
  assert.equal(maskDMY('1'), '1');
  assert.equal(maskDMY('10'), '10');
  assert.equal(maskDMY('100'), '10.0');
  assert.equal(maskDMY('1004'), '10.04');
  assert.equal(maskDMY('10042026'), '10.04.2026');
  assert.equal(maskDMY('100420269999'), '10.04.2026'); // capped at 8 digits
});

it('lets a typed separator beat the positional cut', () => {
  assert.equal(maskDMY('3.4.2026'), '3.4.2026');
  assert.equal(maskDMY('3.'), '3.'); // the dot survives the caret
  assert.equal(maskDMY('3.4.'), '3.4.');
  assert.equal(maskDMY('03/04/2026'), '03.04.2026');
  assert.equal(maskDMY('03-04-2026'), '03.04.2026');
  assert.equal(maskDMY('10.04.2026'), '10.04.2026');
  assert.equal(maskDMY('2026-04-03'), '03.04.2026'); // a pasted ISO date
});

it('round-trips whatever the planner types to what the cell displays', () => {
  ['10042026', '10.04.2026', '3.4.2026', '2026-04-03', '03/04/2026'].forEach((typed) => {
    const april10 = typed === '10042026' || typed === '10.04.2026';
    const iso = parseDMY(maskDMY(typed));
    assert.equal(iso, april10 ? '2026-04-10' : '2026-04-03');
    assert.equal(formatDMY(iso), april10 ? '10.04.2026' : '03.04.2026');
  });
});
