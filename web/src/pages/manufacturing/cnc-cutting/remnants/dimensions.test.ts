import {
  isCanonicalDimensions,
  normalizeDimensions,
  parseDimensions,
  plateWeightKg,
} from './dimensions';
import { summarizeRemnants } from './remnantSummary';

describe('normalizeDimensions', () => {
  it.each([
    ['1200x800', '1200x800'],
    [' 1200 X 800 ', '1200x800'],
    ['1200×800', '1200x800'],
    ['1200*800', '1200x800'],
    ['1200mm x 800mm', '1200x800'],
    ['1500,5x660', '1500.5x660'],
    ['1500.50x0660', '1500.5x660'],
  ])('%j -> %j', (input, output) => {
    expect(normalizeDimensions(input)).toBe(output);
  });

  it.each([
    '',
    '1200',
    '1200x',
    '1200-800',
    '1200x800x10',
    '0x800',
    // A thousands separator or 1.2 mm: left for a person.
    '1.200x800',
    'L 300',
    null,
    undefined,
    1200,
  ])('cannot read %j', (input) => {
    expect(normalizeDimensions(input)).toBeNull();
  });

  it('only the stored canonical form counts as canonical', () => {
    expect(isCanonicalDimensions('1200x800')).toBe(true);
    expect(isCanonicalDimensions('1200 x 800')).toBe(false);
    expect(isCanonicalDimensions('1200X800')).toBe(false);
    expect(isCanonicalDimensions(null)).toBe(false);
  });

  it('parses to numbers', () => {
    expect(parseDimensions('1200 X 800')).toEqual({ width: 1200, height: 800 });
  });
});

describe('plateWeightKg', () => {
  it('is mm³ / 1000 × 7.85 g/cm³ / 1000', () => {
    // 1000 × 1000 × 10 mm = 10 000 cm³ = 78.5 kg of steel.
    expect(plateWeightKg('1000x1000', '10.00')).toBeCloseTo(78.5);
    expect(plateWeightKg('1200 X 800', 10)).toBeCloseTo(75.36);
  });

  it('is null when a dimension or the thickness cannot be read', () => {
    expect(plateWeightKg('L 300', '10')).toBeNull();
    expect(plateWeightKg('1200x800', null)).toBeNull();
    expect(plateWeightKg('1200x800', '0')).toBeNull();
  });
});

describe('summarizeRemnants', () => {
  it('adds up: assigned + unassigned = plates; weight over the pieces left', () => {
    const summary = summarizeRemnants([
      { id: 1, dimensions: '1000x1000', thickness_mm: '10', quantity: 3, available_quantity: 3 },
      // One of two used by a cut.
      { id: 2, dimensions: '1000x1000', thickness_mm: '10', quantity: 2, available_quantity: 1 },
      // Fully used (only listed with the Atanmış filter): no pieces, no weight.
      { id: 3, dimensions: 'bad', thickness_mm: '10', quantity: 1, available_quantity: 0 },
      { id: 4, dimensions: '1000 x 1000', thickness_mm: null, quantity: 1, available_quantity: 1 },
    ]);
    expect(summary).toEqual({
      plates: 4,
      available: 5,
      assigned: 2,
      unassigned: 2,
      weightKg: expect.closeTo(4 * 78.5, 6) as number,
      // #4: no thickness. #3 has no pieces left, so it is not "left out".
      uncounted: 1,
      malformed: 2,
    });
  });

  it('falls back to quantity when the API sends no available_quantity', () => {
    expect(summarizeRemnants([{ id: 1, dimensions: '10x10', quantity: '4' }]).available).toBe(4);
  });
});
