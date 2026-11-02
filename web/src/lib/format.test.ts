import {
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
});
