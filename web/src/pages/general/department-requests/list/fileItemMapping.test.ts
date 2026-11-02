import { shiftAttachTargets } from './fileItemMapping';

// Ported from the legacy fileItemMapping.test.mjs.
describe('shiftAttachTargets', () => {
  it('delete first of three keeps a file on the last item (index 2 → 1)', () => {
    expect(shiftAttachTargets([2], 0)).toEqual([1]);
  });

  it('delete middle of three keeps a file on the last item (index 2 → 1)', () => {
    expect(shiftAttachTargets([2], 1)).toEqual([1]);
  });

  it('delete first of three keeps a file on the second item (index 1 → 0)', () => {
    expect(shiftAttachTargets([1], 0)).toEqual([0]);
  });

  it('delete the mapped item drops it', () => {
    expect(shiftAttachTargets([0], 0)).toEqual([]);
    expect(shiftAttachTargets([1], 1)).toEqual([]);
  });

  it('delete first keeps both later items as 0 and 1', () => {
    expect(shiftAttachTargets([1, 2], 0)).toEqual([0, 1]);
  });

  it('delete middle keeps first and shifts last (0 and 2 → 0 and 1)', () => {
    expect(shiftAttachTargets([0, 2], 1)).toEqual([0, 1]);
  });

  it('request-level target is left alone', () => {
    expect(shiftAttachTargets(['request', 2], 0)).toEqual(['request', 1]);
    expect(shiftAttachTargets(['request'], 1)).toEqual(['request']);
  });

  it('empty / missing attachTo is safe', () => {
    expect(shiftAttachTargets([], 0)).toEqual([]);
    expect(shiftAttachTargets(null, 0)).toEqual([]);
  });

  it('shifts once, not twice (the remap-then-shift bug this replaced)', () => {
    const remapped = [2].map((t) => (t === 2 ? 1 : t));
    expect(shiftAttachTargets(remapped, 0)).toEqual([0]);
    expect(shiftAttachTargets([2], 0)).toEqual([1]);
    expect(shiftAttachTargets(remapped, 1)).toEqual([]);
    expect(shiftAttachTargets([2], 1)).toEqual([1]);
  });
});
