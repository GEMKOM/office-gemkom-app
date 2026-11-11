import type {
  DesignLayout,
  Occasion,
  OccasionDesign,
  OccasionTheme,
} from '@/api/general/specialDays';
import { formatDate } from '@/lib/format';
import { addDaysIso } from '@/lib/workdays';
import { isTitleFont } from './fonts';
import { isMotif, motifCssUrl } from './motifs';

/**
 * Per-day designs: one welcome template (WelcomeTemplate) and these settings
 * per day. The backend sends a full design with each occasion; an older
 * backend sends none, and the day's theme picks one of these.
 */

export const LAYOUTS: { value: DesignLayout; label: string }[] = [
  { value: 'celebration', label: 'Kutlama' },
  { value: 'flag', label: 'Bayrak' },
  { value: 'solemn', label: 'Anma' },
  { value: 'split', label: 'İkiye bölünmüş' },
];

const BASE: OccasionDesign = {
  layout: 'flag',
  tone: '#8b0000',
  ink: '#ffffff',
  accent: '#ffd1d1',
  accent_on_ink: '',
  paper: '#fff8f4',
  font: 'IBM Plex Sans',
  motif: 'kivilcim',
  numeral: '',
  cta: 'Uygulamaya Geç',
};

export const THEME_DESIGN: Record<OccasionTheme, OccasionDesign> = {
  birthday: {
    ...BASE,
    layout: 'celebration',
    tone: '#4a2366',
    accent: '#f3d1ff',
    font: 'Fraunces',
    motif: 'pasta',
  },
  anniversary: {
    ...BASE,
    tone: '#1f3a5f',
    accent: '#bcd3ff',
    font: 'Playfair Display',
    motif: 'rozet',
    numeral: '{years}',
  },
  national: { ...BASE, tone: '#c8102e', accent: '#ffffff', font: 'Bebas Neue', motif: 'ayyildiz' },
  religious: {
    ...BASE,
    layout: 'celebration',
    tone: '#0d5e58',
    accent: '#e9d8a6',
    accent_on_ink: '#b08a3e',
    font: 'Amiri',
    motif: 'geometrik',
  },
  company: BASE,
  soft: {
    ...BASE,
    layout: 'split',
    tone: '#8a2852',
    accent: '#ffd6e4',
    paper: '#fff6f9',
    font: 'Fraunces',
    motif: 'cicek',
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const LAYOUT_VALUES = new Set(LAYOUTS.map((l) => l.value));

/** A complete, valid design: bad or missing values fall back to `fallback`. */
export function normalizeDesign(
  design: Partial<OccasionDesign> | null | undefined,
  fallback: OccasionDesign = BASE,
): OccasionDesign {
  const d = design ?? {};
  const hex = (value: unknown, alt: string) =>
    typeof value === 'string' && HEX.test(value) ? value : alt;
  return {
    layout: d.layout && LAYOUT_VALUES.has(d.layout) ? d.layout : fallback.layout,
    tone: hex(d.tone, fallback.tone),
    ink: hex(d.ink, fallback.ink),
    accent: hex(d.accent, fallback.accent),
    accent_on_ink: d.accent_on_ink === '' ? '' : hex(d.accent_on_ink, fallback.accent_on_ink),
    paper: hex(d.paper, fallback.paper),
    font: isTitleFont(d.font) ? d.font : fallback.font,
    motif: isMotif(d.motif) ? d.motif : fallback.motif,
    numeral: typeof d.numeral === 'string' ? d.numeral : fallback.numeral,
    cta: typeof d.cta === 'string' && d.cta.trim() ? d.cta : fallback.cta,
  };
}

export function occasionDesign(occasion: Occasion): OccasionDesign {
  return normalizeDesign(occasion.design, THEME_DESIGN[occasion.theme] ?? BASE);
}

/** The big number: the backend renders it; an older one only sends years. */
export function occasionNumeral(occasion: Occasion, design: OccasionDesign): string {
  if (typeof occasion.numeral === 'string') return occasion.numeral;
  if (design.numeral.includes('{years}') && occasion.years) {
    return design.numeral.replace('{years}', String(occasion.years));
  }
  return '';
}

const long = { day: 'numeric', month: 'long' } as const;

/** "20-22 Mart" / "31 Ekim - 2 Kasım". */
export function rangeLabel(start: string, end: string): string {
  if (!end || end === start) return formatDate(start, long);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8, 10))}-${formatDate(end, long)}`;
  }
  return `${formatDate(start, long)} - ${formatDate(end, long)}`;
}

/**
 * The small line above the title, as in the designs:
 *   before, the day after: "Yarın · 19 Mayıs Salı"
 *   before, a span:        "Kurban Bayramı · 27-30 Mayıs"
 *   before:                "Perşembe · 29 Ekim"
 *   on, a span:            "4-10 Mayıs 2026"
 *   on:                    "10 Kasım 2026 Salı"
 *   return:                "Pazartesi · 23 Mart 2026"
 */
export function occasionKicker(occasion: Occasion, today: string): string {
  if (occasion.kicker) return occasion.kicker;
  const date = occasion.date || today;
  const end = occasion.end_date || date;
  const shown = occasion.display_date || today;
  const weekday = (iso: string) => formatDate(iso, { weekday: 'long' });
  if (occasion.phase === 'return') {
    return `${weekday(shown)} · ${formatDate(shown, { ...long, year: 'numeric' })}`;
  }
  if (occasion.phase === 'before') {
    if (end !== date) return `${occasion.name} · ${rangeLabel(date, end)}`;
    if (addDaysIso(shown, 1) === date) return `Yarın · ${formatDate(date, long)} ${weekday(date)}`;
    return `${weekday(date)} · ${formatDate(date, long)}`;
  }
  if (end !== date) return `${rangeLabel(date, end)} ${date.slice(0, 4)}`;
  return formatDate(date, { ...long, year: 'numeric', weekday: 'long' });
}

export interface BandLook {
  tone: string;
  ink: string;
  /** CSS url() of the motif at band strength. */
  motif: string;
}

/** The band's colour and motif, or null when the day leaves the band red. */
export function bandLook(design: OccasionDesign, colorBand = true): BandLook | null {
  if (!colorBand) return null;
  const motif = isMotif(design.motif) ? design.motif : 'kivilcim';
  return {
    tone: design.tone,
    ink: design.ink,
    motif: motifCssUrl(motif, design.ink, design.accent, 0.2),
  };
}
