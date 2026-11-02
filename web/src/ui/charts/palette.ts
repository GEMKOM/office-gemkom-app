// Chart colours for direction B. Text never wears these: values, labels and
// legends stay in the ink tokens; a coloured mark beside them carries identity.
//
// The categorical order is checked with the data-viz palette validator
// (lightness band, chroma floor, adjacent-pair colour-blind separation >= 12
// ΔE, contrast >= 3:1 on white). Keep the order: it is what keeps neighbours
// apart. Past five series, fold the tail into "Diğer".

/** GEMKOM red: the one series a chart is about (this period, the total). */
export const ACCENT = '#8b0000';

/** Graphite: the comparison series (previous period, average, target). */
export const GRAPHITE = '#4a525b';
/** Light graphite: context bars (partial periods, "Diğer", too little data). */
export const NEUTRAL = '#8a929b';
export const NEUTRAL_LIGHT = '#c4cad1';

/** Identity colours, in fixed order. Colour follows the entity, never its rank. */
export const CATEGORICAL = ['#2f6fd0', '#d0731c', '#1f9d84', '#7048c8', '#b3261e'] as const;

export const SERIES = {
  blue: CATEGORICAL[0],
  orange: CATEGORICAL[1],
  teal: CATEGORICAL[2],
  violet: CATEGORICAL[3],
  red: CATEGORICAL[4],
} as const;

/**
 * Reserved for state (on time / late, in / out, over / under target). Always
 * shipped with a word or an arrow as well; never used for "series 4".
 */
export const STATUS = {
  good: '#1f8a57',
  warning: '#b7791f',
  bad: '#c92a2a',
  neutral: NEUTRAL,
} as const;

export type StatusTone = keyof typeof STATUS;

/** The n-th categorical colour; past the palette it repeats graphite rather than inventing a hue. */
export function categorical(index: number): string {
  return CATEGORICAL[index] ?? NEUTRAL;
}

/** Id of the diagonal hatch pattern for a colour (see <ChartPatterns>). */
export function hatchId(color: string): string {
  return `gk-hatch-${color.replace(/[^a-z0-9]/gi, '')}`;
}

/** A fill that hatches a bar in that colour: partial periods, estimates. */
export function hatchFill(color: string): string {
  return `url(#${hatchId(color)})`;
}
