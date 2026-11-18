import { barsProblem, draftBars, sizedBarCount } from './deliveryBars';

it('reads the typed rows, dropping empty ones', () => {
  expect(
    draftBars([
      { length_mm: 6000, quantity: 2 },
      { length_mm: '', quantity: '' },
      { length_mm: '4000', quantity: '1' },
    ]),
  ).toEqual([
    { length_mm: 6000, quantity: 2 },
    { length_mm: 4000, quantity: 1 },
  ]);
});

it('checks the bars against the delivered metres or count', () => {
  const bars = [
    { length_mm: 6000, quantity: 2 },
    { length_mm: 4000, quantity: 1 },
  ];
  expect(barsProblem(bars, 'metre', 16)).toBeNull();
  expect(barsProblem(bars, 'metre', 18)).toBe('Girilen boylar 16 m ediyor; teslim alınan 18 m');
  expect(barsProblem(bars, 'adet', 3)).toBeNull();
  expect(barsProblem(bars, 'adet', 5)).toBe('3 boy girildi; teslim alınan 5 adet');
  expect(barsProblem(bars, 'kg', 999)).toBeNull();
  expect(barsProblem([], 'metre', 6)).toBe('Gelen boyların uzunluğunu ve adedini girin');
  expect(barsProblem([{ length_mm: 6000, quantity: 1.5 }], 'metre', 9)).toMatch(/tam sayı/);
});

it('counts the bars of a line ordered in sizes', () => {
  expect(sizedBarCount(6000, 'metre', 18)).toBe(3);
  expect(sizedBarCount(6000, 'metre', 7)).toBeNull();
  expect(sizedBarCount(6000, 'adet', 4)).toBe(4);
  expect(sizedBarCount(6000, 'kg', 100)).toBeNull();
});
