import {
  barMetres,
  metresToMm,
  mmToMetres,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from './format';

// Intl output may use narrow no-break spaces; compare on plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('format', () => {
  it('returns "-" for empty values', () => {
    for (const fn of [formatDate, formatDateTime, formatNumber, formatCurrency, formatPercent]) {
      expect(fn(null)).toBe('-');
      expect(fn(undefined)).toBe('-');
    }
  });

  it('formats dates like toLocaleDateString("tr-TR")', () => {
    expect(formatDate('2026-10-30')).toBe('30.10.2026');
    expect(formatDateTime(new Date(2026, 9, 30, 14, 5))).toBe('30.10.2026 14:05');
  });

  it('formats numbers, money and percents in tr-TR', () => {
    expect(formatNumber(1234567.5)).toBe('1.234.567,5');
    expect(formatNumber('1234.5', 2)).toBe('1.234,50');
    expect(plain(formatCurrency(1234.5))).toBe('₺1.234,50');
    expect(plain(formatCurrency('99', 'EUR'))).toBe('€99,00');
    expect(formatPercent(41.44)).toBe('41,4%');
  });

  it('reads bar lengths (stored in mm) in metres', () => {
    expect(barMetres(6000)).toBe('6 m');
    expect(barMetres('2500.0')).toBe('2,5 m');
    expect(barMetres(750)).toBe('0,75 m');
    expect(barMetres(12000)).toBe('12 m');
    expect(barMetres(null)).toBe('-');
    expect(mmToMetres('2500.0')).toBe(2.5);
    expect(mmToMetres('')).toBe('');
  });

  it('turns metres typed for a bar into whole mm', () => {
    expect(metresToMm(2.5)).toBe(2500);
    expect(metresToMm('2,5')).toBe(2500);
    expect(metresToMm(0.7506)).toBe(751);
    expect(metresToMm('')).toBe('');
    expect(metresToMm('abc')).toBe('');
  });
});
