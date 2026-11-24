import { screen } from '@testing-library/react';
import { useState } from 'react';
import { areaLabel, shapeLabel, SHAPE_OPTIONS, sizeLabel } from '@/api/warehouse/pieces';
import { pickShape } from '@/test/plateShape';
import { renderWithProviders } from '@/test/render';
import {
  emptyPlateSize,
  plateSizeChanged,
  plateSizeError,
  plateSizeInput,
  plateSizeOf,
  PlateSizeFields,
  type PlateSizeDraft,
} from './PlateSizeFields';
import { sheetSize } from './SheetCodes';

const size = (patch: Partial<PlateSizeDraft>): PlateSizeDraft => ({
  ...emptyPlateSize(),
  ...patch,
});

describe('plate size labels', () => {
  it('reads a plate by its shape and leaves bars in metres', () => {
    expect(sizeLabel({ width_mm: '1500.0', length_mm: '3000.0' })).toBe('1500 × 3000 mm');
    expect(sizeLabel({ width_mm: '1500.0', length_mm: '3000.0', shape: 'rectangle' })).toBe(
      '1500 × 3000 mm',
    );
    expect(sizeLabel({ width_mm: '600.0', length_mm: '800.0', shape: 'triangle' })).toBe(
      'Üçgen 600 × 800 mm',
    );
    expect(sizeLabel({ width_mm: '600.0', length_mm: '600.0', shape: 'circle' })).toBe('Ø 600 mm');
    expect(
      sizeLabel({ width_mm: '800.0', length_mm: '900.0', shape: 'irregular', area_m2: '0.4500' }),
    ).toBe('Şekilsiz 800 × 900 mm · ~0,45 m²');
    expect(sizeLabel({ width_mm: null, length_mm: '6000.0' })).toBe('6 m');
    expect(sizeLabel({ width_mm: null, length_mm: '2500.0', shape: 'rectangle' })).toBe('2,5 m');
  });

  it('names the shapes in Turkish', () => {
    expect(SHAPE_OPTIONS.map((o) => o.label)).toEqual(['Dikdörtgen', 'Üçgen', 'Daire', 'Şekilsiz']);
    expect(SHAPE_OPTIONS[0]!.value).toBe('rectangle');
    expect(shapeLabel('irregular')).toBe('Şekilsiz');
    expect(shapeLabel(null)).toBe('Dikdörtgen');
    expect(areaLabel('3.0000')).toBe('3 m²');
    expect(areaLabel('0.4512')).toBe('0,4512 m²');
  });

  it('prints a sheet code list by its shape', () => {
    const sheet = { code: 'S26-00001', item_code: 'X', width_mm: '600.0', length_mm: '600.0' };
    expect(sheetSize({ ...sheet, shape: 'circle' })).toBe('Ø 600 mm');
    expect(sheetSize(sheet)).toBe('600 × 600 mm');
  });
});

describe('plate size validation and payload', () => {
  it('asks for each input of the shape, above 0', () => {
    expect(plateSizeError(size({}))).toBe('En (mm) girin');
    expect(plateSizeError(size({ width: 1000 }))).toBe('Boy (mm) girin');
    expect(plateSizeError(size({ width: 0, length: 10 }))).toBe("En (mm) 0'dan büyük olmalı");
    expect(plateSizeError(size({ width: 1000, length: 2000 }))).toBeNull();
    expect(plateSizeError(size({ shape: 'triangle', width: 600 }))).toBe('Yükseklik (mm) girin');
    expect(plateSizeError(size({ shape: 'circle' }))).toBe('Çap (mm) girin');
    expect(plateSizeError(size({ shape: 'circle', width: 600 }))).toBeNull();
  });

  it('wants an irregular piece area, at most its box', () => {
    const box = { shape: 'irregular' as const, width: 800, length: 900 };
    expect(plateSizeError(size(box))).toBe('Tahmini alan (m²) girin');
    expect(plateSizeError(size({ ...box, area: 0 }))).toBe("Tahmini alan (m²) 0'dan büyük olmalı");
    expect(plateSizeError(size({ ...box, area: 0.8 }))).toBe(
      'Tahmini alan en × boydan (0,72 m²) büyük olamaz',
    );
    expect(plateSizeError(size({ ...box, area: '0,72' }))).toBeNull();
  });

  it("sends a circle's diameter as width and length, and the area only when irregular", () => {
    expect(plateSizeInput(size({ shape: 'circle', width: 600, length: 1200 }))).toEqual({
      width_mm: '600',
      length_mm: '600',
      shape: 'circle',
    });
    expect(plateSizeInput(size({ shape: 'triangle', width: 600, length: 800 }))).toEqual({
      width_mm: '600',
      length_mm: '800',
      shape: 'triangle',
    });
    expect(
      plateSizeInput(size({ shape: 'irregular', width: 800, length: 900, area: '0,45' })),
    ).toEqual({ width_mm: '800', length_mm: '900', shape: 'irregular', area_m2: '0.45' });
    expect(plateSizeInput(size({ width: 1500, length: 3000, area: 2 }))).toEqual({
      width_mm: '1500',
      length_mm: '3000',
      shape: 'rectangle',
    });
  });

  it('tells a corrected size from the piece it started from', () => {
    const was = plateSizeOf({ width_mm: '800.0', length_mm: '900.0', shape: 'rectangle' });
    expect(was).toEqual({ shape: 'rectangle', width: 800, length: 900, area: '' });
    expect(plateSizeChanged(was, was)).toBe(false);
    expect(plateSizeChanged(was, { ...was, shape: 'irregular', area: 0.5 })).toBe(true);
    expect(plateSizeChanged(was, { ...was, length: 950 })).toBe(true);
    const circle = plateSizeOf({ width_mm: '600.0', length_mm: '600.0', shape: 'circle' });
    expect(plateSizeChanged(circle, { ...circle, length: 900 })).toBe(false);
  });
});

function Harness({ onChange }: { onChange: (value: PlateSizeDraft) => void }) {
  const [value, setValue] = useState<PlateSizeDraft>(emptyPlateSize);
  return (
    <PlateSizeFields
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

it('the size inputs follow the shape picked', async () => {
  const onChange = vi.fn();
  const { container } = renderWithProviders(<Harness onChange={onChange} />);
  const labels = () =>
    ['En (mm)', 'Boy (mm)', 'Taban (mm)', 'Yükseklik (mm)', 'Çap (mm)', 'Tahmini alan (m²)'].filter(
      (label) => screen.queryByLabelText(label),
    );
  // Dikdörtgen is the default.
  expect(screen.getByRole('combobox', { name: 'Şekil' })).toHaveValue('Dikdörtgen');
  expect(labels()).toEqual(['En (mm)', 'Boy (mm)']);

  await pickShape(container, 'Şekil', 'Üçgen');
  expect(labels()).toEqual(['Taban (mm)', 'Yükseklik (mm)']);

  await pickShape(container, 'Şekil', 'Daire');
  expect(labels()).toEqual(['Çap (mm)']);

  await pickShape(container, 'Şekil', 'Şekilsiz');
  expect(labels()).toEqual(['En (mm)', 'Boy (mm)', 'Tahmini alan (m²)']);
  expect(screen.getByText('Ağırlık bu alandan hesaplanır')).toBeInTheDocument();
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shape: 'irregular' }));
});
