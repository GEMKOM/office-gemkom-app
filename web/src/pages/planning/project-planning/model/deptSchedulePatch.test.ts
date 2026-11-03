/**
 * Tests for which schedule keys a dirty department row sends on bulk-save.
 */

import { assert } from '@/test/legacyAssert';
import { deptSchedulePatch } from './deptSchedulePatch';

const imalat = {
  duration_wd: 8,
  entered_duration_wd: 20,
  start_date: '2026-08-03',
  entered_start_date: '2026-08-03',
  end_date: '2026-08-14',
};

it('child-date reflow does not send manufacturing duration or end', () => {
  const patch = deptSchedulePatch('manufacturing', new Set(['start_date']), imalat);
  assert.deepEqual(patch, { start_date: '2026-08-03' });
  assert.equal('duration_wd' in patch, false);
  assert.equal('end_date' in patch, false);
});
it('İmalat duration edit sends the entered number, not the date-span', () => {
  const patch = deptSchedulePatch('manufacturing', new Set(['duration_wd']), imalat);
  assert.deepEqual(patch, { duration_wd: 20 });
  assert.equal('start_date' in patch, false);
  assert.equal('end_date' in patch, false);
});
it('İmalat duration falls back to duration_wd when nothing was entered', () => {
  const patch = deptSchedulePatch('manufacturing', new Set(['duration_wd']), {
    duration_wd: 12,
    entered_duration_wd: null,
    start_date: null,
    end_date: null,
  });
  assert.deepEqual(patch, { duration_wd: 12 });
});
it('welding date edit never sends schedule keys', () => {
  assert.deepEqual(deptSchedulePatch('welding', new Set(['start_date', 'end_date']), imalat), {});
});
it('status-only dirty sends no schedule keys', () => {
  assert.deepEqual(deptSchedulePatch('manufacturing', new Set(['status']), imalat), {});
});
it('İmalat start edit sends the entered date, not a child-pin covering window', () => {
  const patch = deptSchedulePatch('manufacturing', new Set(['start_date']), {
    start_date: '2026-09-01',
    entered_start_date: '2026-10-01',
    duration_wd: 40,
    entered_duration_wd: 40,
  });
  assert.deepEqual(patch, { start_date: '2026-10-01' });
});
it('İmalat start falls back to start_date when nothing was entered', () => {
  const patch = deptSchedulePatch('manufacturing', new Set(['start_date']), {
    start_date: '2026-08-03',
    entered_start_date: null,
    duration_wd: 8,
  });
  assert.deepEqual(patch, { start_date: '2026-08-03' });
});
