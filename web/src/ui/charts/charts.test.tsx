import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import {
  BarsChart,
  Delta,
  deltaTone,
  DonutBreakdown,
  foldTail,
  KpiTile,
  movingAverage,
  percentChange,
  sumBy,
  valueFormats,
} from '.';

describe('chart math', () => {
  it('percentChange has no base for 0 or null', () => {
    expect(percentChange(120, 100)).toBeCloseTo(20);
    expect(percentChange(80, 100)).toBeCloseTo(-20);
    expect(percentChange(5, -10)).toBeCloseTo(150);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
  });

  it('movingAverage starts when the window is full', () => {
    expect(movingAverage([4, 8, 12, 16, 20], 4)).toEqual([null, null, null, 10, 14]);
    expect(movingAverage([1, null, 3], 2)).toEqual([null, 1, 3]);
  });

  it('sumBy skips missing values; foldTail folds into one item', () => {
    expect(sumBy([{ v: 1 }, { v: null }, { v: 2.5 }], (r) => r.v)).toBe(3.5);
    const folded = foldTail([5, 4, 3, 2], 2, (rest) => rest.reduce((a, b) => a + b, 0));
    expect(folded).toEqual([5, 4, 5]);
  });
});

describe('Delta', () => {
  it('reads direction from the arrow and sign, tone from what is good', () => {
    expect(deltaTone(5, 'up')).toBe('good');
    expect(deltaTone(5, 'down')).toBe('bad');
    expect(deltaTone(-5, 'down')).toBe('good');
    expect(deltaTone(0, 'up')).toBe('flat');
    renderWithProviders(<Delta value={-4.25} good="down" against="geçen aya göre" />);
    expect(screen.getByText('azalış', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('−4,3%')).toBeInTheDocument();
  });

  it('shows nothing without a value', () => {
    renderWithProviders(<Delta value={null} />);
    expect(screen.queryByText(/artış|azalış/)).toBeNull();
  });
});

describe('KpiTile', () => {
  it('states the target status in words', () => {
    renderWithProviders(
      <KpiTile label="Zamanında" value="%86" status={{ tone: 'good', label: 'Hedefte' }} />,
    );
    expect(screen.getByText('Hedefte')).toBeInTheDocument();
    expect(screen.getByText('%86')).toBeInTheDocument();
  });
});

describe('BarsChart', () => {
  const data = [
    { m: 'Eyl 26', a: 1200.5, b: null },
    { m: 'Eki 26', a: 800, b: 300 },
  ];

  it('has a legend for two series and the same numbers as a table', () => {
    renderWithProviders(
      <BarsChart
        label="Tutarlar"
        data={data}
        categoryKey="m"
        series={[
          { key: 'a', label: 'Kazanılan', color: '#000' },
          { key: 'b', label: 'Kaybedilen', color: '#111' },
        ]}
        format={valueFormats.currency('EUR')}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Tutarlar' });
    expect(within(figure).getAllByText('Kazanılan').length).toBeGreaterThan(0);
    const table = within(figure).getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Eyl 26€1.201—');
    expect(rows[2]).toHaveTextContent('Eki 26€800€300');
  });

  it('says so when there is nothing to plot', () => {
    renderWithProviders(
      <BarsChart
        label="Boş"
        data={[]}
        categoryKey="m"
        series={[{ key: 'a', label: 'A', color: '#000' }]}
      />,
    );
    expect(screen.getByText('Veri yok')).toBeInTheDocument();
  });
});

describe('DonutBreakdown', () => {
  it('lists value and share beside the ring, dropping empty slices', () => {
    renderWithProviders(
      <DonutBreakdown
        label="Maliyet"
        format={valueFormats.number()}
        data={[
          { name: 'İşçilik', value: 75 },
          { name: 'Malzeme', value: 25 },
          { name: 'Taşeron', value: 0 },
        ]}
      />,
    );
    expect(screen.getByText('75,0%')).toBeInTheDocument();
    expect(screen.getByText('25,0%')).toBeInTheDocument();
    expect(screen.queryByText('Taşeron')).toBeNull();
  });
});
