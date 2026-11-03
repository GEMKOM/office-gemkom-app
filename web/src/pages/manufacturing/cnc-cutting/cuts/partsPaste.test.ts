import { parsePartsFromText, planPastedParts } from './partsPaste';

// A nesting report copied from Excel (legacy test-paste-parser.html sample):
// the Geometry cell is empty, so data rows start with a tab.
const HEADER = [
  'Geometry',
  'Part',
  'Assembly',
  'Order',
  'Item',
  'Ordered',
  'Nested',
  'Material',
  'Thickness',
  'Part Area',
  'Weight',
  'Width',
].join('\t');
const row = (part: string, nested: string, weight: string) =>
  [
    '',
    part,
    '<None>',
    '<None>',
    '2pcs',
    '2',
    nested,
    'P265GH',
    '20.00mm',
    '0.2441m²',
    weight,
    '1400.00mm',
  ].join('\t');

describe('parsePartsFromText', () => {
  it('reads job, drawing and position from Part, weight and quantity from Weight / Nested', () => {
    const text = [
      HEADER,
      row('114-09 0124 P8-B', '2', '38.33kg'),
      row('114-09 0124 P8-A', '3', '12,5 kg'),
    ].join('\r\n');
    expect(parsePartsFromText(text)).toEqual([
      { job_no: '114-09', image_no: '0124', position_no: 'P8-B', weight_kg: 38.33, quantity: 2 },
      { job_no: '114-09', image_no: '0124', position_no: 'P8-A', weight_kg: 12.5, quantity: 3 },
    ]);
  });

  it('needs a header row with a Part column and at least one data row', () => {
    expect(parsePartsFromText('')).toEqual([]);
    expect(parsePartsFromText(HEADER)).toEqual([]);
    expect(parsePartsFromText('Name\tWeight\nfoo\t1kg')).toEqual([]);
  });

  it('skips repeated header rows and blank lines', () => {
    const text = [HEADER, '', HEADER, row('200-01 0001 P1', '1', '1kg')].join('\n');
    expect(parsePartsFromText(text)).toHaveLength(1);
  });

  it('finds the Part value in a shifted row', () => {
    // The Part cell is empty; the value sits one column early.
    const shifted = ['114-09 0124 P8-B', '', '1kg'].join('\t');
    expect(parsePartsFromText(`Geometry\tPart\n${shifted}`)[0]).toMatchObject({
      job_no: '114-09',
      image_no: '0124',
      position_no: 'P8-B',
    });
  });

  it('falls back to columns separated by two or more spaces', () => {
    expect(parsePartsFromText('Part  Weight  Nested\n300-1 A1 P2  4.2kg  5')).toEqual([
      { job_no: '300-1', image_no: 'A1', position_no: 'P2', weight_kg: 4.2, quantity: 5 },
    ]);
  });
});

describe('planPastedParts', () => {
  it('updates parts matching on job, drawing and position, creates the rest', () => {
    const existing = [
      {
        id: 1,
        job_no: '114-09',
        image_no: '0124',
        position_no: 'P8-B',
        weight_kg: '10',
        quantity: 1,
      },
      { id: 2, job_no: '114-09', image_no: '0124', position_no: 'P9', weight_kg: '1', quantity: 1 },
    ];
    const plan = planPastedParts(existing, [
      { job_no: '114-09', image_no: '0124', position_no: 'P8-B', weight_kg: 38.33, quantity: 2 },
      { job_no: '114-09', image_no: '0124', position_no: 'P8-A', weight_kg: 0, quantity: null },
    ]);
    expect(plan.updates).toEqual([
      {
        id: 1,
        data: {
          job_no: '114-09',
          image_no: '0124',
          position_no: 'P8-B',
          weight_kg: 38.33,
          quantity: 2,
        },
      },
    ]);
    // Legacy sent `weight || null`.
    expect(plan.creates).toEqual([
      { job_no: '114-09', image_no: '0124', position_no: 'P8-A', weight_kg: null, quantity: null },
    ]);
  });
});
