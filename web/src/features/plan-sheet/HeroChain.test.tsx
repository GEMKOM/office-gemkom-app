// Ported from projects/project-tracking/heroChain.test.mjs (the string
// builder became the HeroChain component; the assertions read its DOM).
import { render } from '@testing-library/react';
import { HeroChain, type HeroChainProps } from './HeroChain';
import { formatDateLong, signedWd } from './heroFigures';

const BEHIND: HeroChainProps = {
  start: '2026-03-12',
  termin: '2026-09-30',
  planEnd: '2026-10-16',
  projectedEnd: '2026-11-04',
  planVsTerminWd: 12,
  deviationWd: 13,
  terminGapWd: 25,
};

function chain(props: HeroChainProps) {
  const { container } = render(<HeroChain {...props} />);
  const root = container.firstElementChild as HTMLElement;
  const ck = (n: number) => root.querySelector<HTMLElement>(`[data-ck="${n}"]`)!;
  const fig = (name: string) => root.querySelector<HTMLElement>(`[data-fig="${name}"]`)!;
  return { root, ck, fig, text: root.textContent || '' };
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('signedWd', () => {
  it('signs working days', () => {
    expect(signedWd(12)).toEqual({ text: '+12 iş günü', cls: 'ps-fig-late', kind: 'late' });
    expect(signedWd(-2.5)).toEqual({ text: '−2,5 iş günü', cls: 'ps-fig-early', kind: 'early' });
    expect(signedWd('0')).toEqual({ text: 'tam gününde', cls: 'ps-fig-ok', kind: 'ok' });
    expect(signedWd(0.04)).toEqual({ text: 'tam gününde', cls: 'ps-fig-ok', kind: 'ok' });
    expect(signedWd(-0.04)).toEqual({ text: 'tam gününde', cls: 'ps-fig-ok', kind: 'ok' });
    expect(signedWd(0.06)!.text).toBe('+0,1 iş günü');
    expect(signedWd(12.96)!.text).toBe('+13 iş günü');
    expect(signedWd(null)).toBeNull();
    expect(signedWd(undefined)).toBeNull();
    expect(signedWd('abc')).toBeNull();
  });
});

describe('formatDateLong', () => {
  // A zone west of UTC: a date-only string parsed as UTC would print a day early.
  beforeAll(() => {
    vi.stubEnv('TZ', 'America/Sao_Paulo');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('reads date-only values as calendar days in every time zone', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(180);
    expect(formatDateLong('2026-09-30')).toBe('30 Eylül 2026');
    expect(formatDateLong('2026-01-01')).toBe('1 Ocak 2026');
    expect(formatDateLong(null)).toBe('—');
    expect(formatDateLong('not a date')).toBe('—');
    // Instants keep their instant semantics (created_at carries a time).
    expect(formatDateLong('2026-09-30T15:00:00Z')).toMatch(/30 Eylül 2026/);
  });
});

describe('HeroChain', () => {
  it('writes every number once, on its connector, when behind the plan and past the termin', () => {
    const c = chain(BEHIND);
    expect(c.ck(2)).toHaveAttribute('data-state', 'late');
    expect(c.ck(2)).toHaveTextContent('+12 iş günü');
    expect(c.ck(3)).toHaveAttribute('data-state', 'late');
    expect(c.ck(3)).toHaveTextContent('+13 iş günü');
    const bracket = c.root.firstElementChild as HTMLElement;
    expect(bracket).toHaveAttribute('data-state', 'late');
    expect(bracket).toHaveTextContent('Termine göre +25 iş günü');
    expect(bracket.querySelector('b')).toHaveTextContent('+25 iş günü');
    expect(count(c.text, '+12 iş günü')).toBe(1);
    expect(count(c.text, '+13 iş günü')).toBe(1);
    expect(count(c.text, '+25 iş günü')).toBe(1);
    expect(c.fig('plan')).toHaveAttribute('data-state', 'late');
    expect(c.fig('proj')).toHaveAttribute('data-state', 'late');
    expect(c.fig('start')).toHaveTextContent('12 Mart 2026');
    expect(c.fig('proj')).toHaveTextContent('4 Kasım 2026');
    expect(c.text).not.toContain('!');
  });

  it('keeps the column order fixed regardless of the dates', () => {
    const c = chain({ ...BEHIND, planEnd: '2026-09-18', planVsTerminWd: -8 });
    const order = Array.from(c.root.children)
      .map((el) => el.getAttribute('data-fig') ?? (el.getAttribute('data-ck') && `ck${el.getAttribute('data-ck')}`))
      .filter(Boolean);
    expect(order).toEqual(['start', 'ck1', 'termin', 'ck2', 'plan', 'ck3', 'proj']);
  });

  it('shows a green minus on the termin→plan connector when the plan ends before the termin', () => {
    const c = chain({
      ...BEHIND,
      planEnd: '2026-09-18',
      planVsTerminWd: -8,
      projectedEnd: '2026-10-09',
      deviationWd: 15,
      terminGapWd: 7,
    });
    expect(c.ck(2)).toHaveAttribute('data-state', 'early');
    expect(c.ck(2)).toHaveTextContent('−8 iş günü');
    expect(c.fig('plan')).toHaveAttribute('data-state', 'early');
    expect(c.ck(3)).toHaveAttribute('data-state', 'late');
    expect(c.ck(3)).toHaveTextContent('+15 iş günü');
    expect(c.root.firstElementChild).toHaveAttribute('data-state', 'late');
    expect(c.root.firstElementChild).toHaveTextContent('Termine göre +7 iş günü');
  });

  it('gives a green connector and a red bracket for a forecast ahead of the plan but past the termin', () => {
    const c = chain({ ...BEHIND, projectedEnd: '2026-10-09', deviationWd: -5, terminGapWd: 7 });
    expect(c.ck(3)).toHaveAttribute('data-state', 'early');
    expect(c.ck(3)).toHaveTextContent('−5 iş günü');
    expect(c.fig('proj')).toHaveAttribute('data-state', 'early');
    expect(c.root.firstElementChild).toHaveAttribute('data-state', 'late');
  });

  it('is all green on time, and zero reads "tam gününde"', () => {
    const c = chain({ ...BEHIND, planVsTerminWd: -8, deviationWd: 0, terminGapWd: -8 });
    expect(c.ck(2)).toHaveAttribute('data-state', 'early');
    expect(c.ck(3)).toHaveAttribute('data-state', 'ok');
    expect(c.ck(3)).toHaveTextContent('tam gününde');
    expect(c.fig('proj')).toHaveAttribute('data-state', 'ok');
    expect(c.root.firstElementChild).toHaveAttribute('data-state', 'early');
    expect(c.root.firstElementChild).toHaveTextContent('Termine göre −8 iş günü');
  });

  it('keeps the termin column with a dash when there is no termin; its connector and the bracket go quiet', () => {
    const c = chain({ ...BEHIND, termin: null, planVsTerminWd: null, terminGapWd: null });
    expect(c.fig('termin')).toHaveTextContent(/^Termin—$/);
    expect(c.ck(2)).toHaveAttribute('data-state', 'none');
    expect(c.ck(2)).toBeEmptyDOMElement();
    expect(c.root.firstElementChild).toHaveAttribute('data-fig', 'start');
    expect(c.ck(3)).toHaveTextContent('+13 iş günü');
  });

  it('shows dashes for plan and öngörülen when there is no plan', () => {
    const c = chain({ start: '2026-03-12', termin: '2026-09-30' });
    expect(count(c.text, '—')).toBe(2);
    expect(c.ck(2)).toHaveAttribute('data-state', 'none');
    expect(c.ck(3)).toHaveAttribute('data-state', 'none');
    expect(c.root.firstElementChild).toHaveAttribute('data-fig', 'start');
    expect(c.root.querySelectorAll('[data-state="late"], [data-state="early"], [data-state="ok"]')).toHaveLength(0);
  });

  it('shows ellipses, no pills and no bracket while the sheet is pending', () => {
    const c = chain({ start: '2026-03-12', termin: '2026-09-30', pending: true });
    expect(count(c.text, '…')).toBe(2);
    expect(c.text).not.toContain('—');
    expect(c.root.firstElementChild).toHaveAttribute('data-fig', 'start');
    expect(c.root.querySelectorAll('[data-state="none"]')).toHaveLength(3);
  });

  it('never puts a number on the start→termin connector', () => {
    const c = chain(BEHIND);
    expect(c.ck(1)).toHaveAttribute('data-state', 'none');
    expect(c.ck(1)).toBeEmptyDOMElement();
  });
});
