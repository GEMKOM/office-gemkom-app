import {
  applySetback,
  copyRow,
  effectiveHeight,
  emptyRow,
  nextOrder,
  partToRow,
  pickItem,
  reapplySetbacks,
  toPayload,
  typeAngle,
  validatePayload,
  type PartRow,
} from './partRows';

function row(over: Partial<PartRow> = {}): PartRow {
  return { ...emptyRow([]), item: '5', nominal_length_mm: '1000', ...over };
}

it('turns a saved part into input text the way the legacy inputs held it', () => {
  const r = partToRow({
    id: 3,
    item: 5,
    item_name: 'Boru 40x40',
    item_code: 'BR-40',
    item_unit: 'adet',
    nominal_length_mm: '1250.50',
    quantity: 4,
    profile_height_mm: null,
    angle_left_deg: 45,
    setback_left_mm: '40.00',
    order: 2,
  });
  expect(r).toMatchObject({
    rowId: 'p-3',
    item: '5',
    itemLabel: 'Boru 40x40 — BR-40 (adet)',
    nominal_length_mm: '1250.50',
    quantity: '4',
    profile_height_mm: '0',
    angle_left_deg: '45',
    angle_right_deg: '0',
    setback_left_mm: 40,
    setback_right_mm: null,
    allow_rotation: true,
    requires_bending: false,
    order: '2',
  });
});

it('numbers new rows after the highest order and copies keep the values', () => {
  const rows = [row({ order: '3' }), row({ order: '' })];
  expect(nextOrder(rows)).toBe(4);
  expect(nextOrder([])).toBe(1);
  const copy = copyRow({ ...rows[0]!, id: 9, label: 'Dikme' }, rows);
  expect(copy).toMatchObject({ id: null, label: 'Dikme', order: '4' });
  expect(copy.rowId).not.toBe(rows[0]!.rowId);
});

it('builds the legacy payload: casts, defaults and an explicit null setback', () => {
  const payload = toPayload(
    row({
      label: '',
      image_no: ' R-1 ',
      jobNo: '254-01',
      stock_length_mm: '',
      quantity: '',
      angle_left_deg: '',
      order: '',
    }),
    'LC-0001',
  );
  expect(payload).toEqual({
    session: 'LC-0001',
    item: 5,
    stock_length_mm: null,
    label: '',
    image_no: 'R-1',
    job_no: '254-01',
    nominal_length_mm: 1000,
    quantity: 1,
    angle_left_deg: 0,
    angle_right_deg: 0,
    profile_height_mm: 0,
    setback_left_mm: null,
    setback_right_mm: null,
    allow_rotation: true,
    requires_bending: false,
    order: 1,
  });
});

describe('validatePayload', () => {
  const check = (r: PartRow, rows: PartRow[] = [r], label = '') =>
    validatePayload(toPayload(r, 'LC-1'), rows, label);

  it('needs a material, a length and a quantity', () => {
    expect(check(row({ item: '' }), [], 'Satır 2')).toBe('Satır 2: Malzeme seçilmelidir.');
    expect(check(row({ nominal_length_mm: '0' }))).toBe('Uzunluk ve Adet sıfırdan büyük olmalı.');
    expect(check(row({ quantity: '0' }))).toBe('Uzunluk ve Adet sıfırdan büyük olmalı.');
    expect(check(row())).toBeNull();
  });

  it('refuses decimals in the whole-millimetre fields', () => {
    expect(check(row({ profile_height_mm: '40.5' }))).toBe(
      'Kesit tam sayı (mm) olmalı — 40.5 yerine 41 girin.',
    );
    expect(check(row({ quantity: '2.5' }))).toBe('Adet tam sayı (mm) olmalı — 2.5 yerine 3 girin.');
    // Cut lengths are fractional.
    expect(check(row({ nominal_length_mm: '1000.25' }))).toBeNull();
  });

  it('refuses angles that do not fit the length or exceed the maximum', () => {
    expect(
      check(
        row({
          nominal_length_mm: '50',
          profile_height_mm: '40',
          angle_left_deg: '45',
          angle_right_deg: '45',
        }),
      ),
    ).toBe(
      'Açılar bu boya sığmıyor — 40 mm kesitte bu açılar için en az 80 mm gerekir (girilen: 50 mm).',
    );
    expect(check(row({ profile_height_mm: '40', angle_right_deg: '-86' }))).toBe(
      'Sağ açı -86° — en fazla ±85° olabilir.',
    );
  });

  it('wants a kesit for an angled cut unless a row of the same material has one', () => {
    const angled = row({ angle_left_deg: '30' });
    expect(check(angled)).toBe(
      'Açılı kesim için Kesit (mm) girin — malzeme başına bir satırda girilmesi yeterlidir.',
    );
    expect(check(angled, [angled, row({ profile_height_mm: '40' })])).toBeNull();
    expect(check(angled, [angled, row({ item: '6', profile_height_mm: '40' })])).not.toBeNull();
  });
});

describe('geometry', () => {
  it('inherits the kesit from a sibling of the same material', () => {
    const a = row({ profile_height_mm: '40' });
    const b = row();
    expect(effectiveHeight(b, [a, b])).toBe(40);
    expect(effectiveHeight(row({ item: '7' }), [a])).toBe(0);
  });

  it('derives the angle from a corner offset and its sign', () => {
    const r = row({ profile_height_mm: '40' });
    const near = applySetback(r, [r], 'left', '40', 'near');
    expect(near).toMatchObject({ setback_left_mm: 40, angle_left_deg: '45' });
    const far = applySetback(r, [r], 'right', '40', 'far');
    expect(far).toMatchObject({ setback_right_mm: -40, angle_right_deg: '-45' });
    // Emptied: the measurement goes, the angle stays.
    expect(applySetback(near, [near], 'left', '', 'near')).toMatchObject({
      setback_left_mm: null,
      angle_left_deg: '45',
    });
    // Without a kesit the angle cannot be derived yet.
    const noKesit = applySetback(row(), [row()], 'left', '10', 'near');
    expect(noKesit).toMatchObject({ setback_left_mm: 10, angle_left_deg: '0' });
  });

  it('a typed angle drops the measurement; a new kesit moves derived angles', () => {
    const r = row({ profile_height_mm: '40', setback_left_mm: 40, angle_left_deg: '45' });
    expect(typeAngle(r, 'left', '30')).toMatchObject({
      angle_left_deg: '30',
      setback_left_mm: null,
    });
    const taller = { ...r, profile_height_mm: '80' };
    expect(reapplySetbacks(taller, [taller]).angle_left_deg).toBe('26.57');
  });

  it('picking a material brings its kesit and re-derives the angles', () => {
    const sibling = row({ item: '8', profile_height_mm: '40' });
    const r = row({ item: '', setback_left_mm: 40 });
    const picked = pickItem(r, [sibling, r], '8', 'Lama');
    expect(picked).toMatchObject({
      item: '8',
      itemLabel: 'Lama',
      profile_height_mm: '40',
      angle_left_deg: '45',
    });
  });
});
