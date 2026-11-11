import type {
  CalendarDay,
  CelebrationTemplate,
  CelebrationTemplateInput,
  Occasion,
  OccasionDesign,
  OccasionPhase,
  ShowOn,
  SpecialDay,
  SpecialDayInput,
  TemplateKind,
} from '@/api/general/specialDays';
import { formatDate } from '@/lib/format';
import { addDaysIso } from '@/lib/workdays';
import { THEME_DESIGN, normalizeDesign, occasionKicker, rangeLabel } from '@/shell/occasion/design';
import { renderTemplate, SAMPLE_PERSON } from '../specialDayText';

/**
 * The Tasarım editor's rules: which days it lists, the form it edits, what
 * it sends, and the sample values its live preview fills in.
 */

export type DesignItem =
  | { type: 'day'; id: number; name: string; tone: string; active: boolean; day: SpecialDay }
  | {
      type: 'template';
      kind: TemplateKind;
      name: string;
      tone: string;
      active: boolean;
      template: CelebrationTemplate;
    };

export const itemKey = (item: Pick<DesignItem, 'type'> & { id?: number; kind?: string }) =>
  item.type === 'day' ? `day:${item.id}` : `template:${item.kind}`;

/** The seeded days in the designs' order; custom days follow by date. */
const SLUG_ORDER = [
  'yilbasi',
  'ulusal-egemenlik-ve-cocuk-bayrami',
  'emek-ve-dayanisma-gunu',
  'ataturku-anma-genclik-ve-spor-bayrami',
  'demokrasi-ve-milli-birlik-gunu',
  'zafer-bayrami',
  'cumhuriyet-bayrami',
  'ramazan-bayrami',
  'kurban-bayrami',
  '18-mart',
  '10-kasim',
  '8-mart',
  'anneler-gunu',
  'babalar-gunu',
  'ogretmenler-gunu',
  'isg-haftasi',
  'ramazan-ayi',
  'kandiller',
];

const TEMPLATE_NAME: Record<TemplateKind, string> = {
  birthday: 'Doğum günü',
  work_anniversary: 'İş yıl dönümü',
  public_holiday: 'Diğer resmi tatiller',
};

/** The birthday and anniversary looks from the designs; the backend's own defaults win once it has them. */
export const TEMPLATE_DEFAULT_DESIGN: Record<TemplateKind, OccasionDesign> = {
  birthday: THEME_DESIGN.birthday,
  work_anniversary: THEME_DESIGN.anniversary,
  public_holiday: THEME_DESIGN.national,
};

function dayOrder(day: SpecialDay): [number, number] {
  const slugIndex = day.slug ? SLUG_ORDER.indexOf(day.slug) : -1;
  if (day.recurrence === 'founding' || day.slug === 'kurulus') return [3, 0];
  if (slugIndex >= 0) return [0, slugIndex];
  const month = day.month ?? Number((day.date ?? '').slice(5, 7));
  const date = day.day ?? Number((day.date ?? '').slice(8, 10));
  return [1, (month || 12) * 40 + (date || 31)];
}

/** Every day HR can design: special days (seeded and custom), then the person templates. */
export function designItems(days: SpecialDay[], templates: CelebrationTemplate[]): DesignItem[] {
  const dayItems = [...days]
    .sort((a, b) => {
      const [ga, oa] = dayOrder(a);
      const [gb, ob] = dayOrder(b);
      return ga - gb || oa - ob || a.name.localeCompare(b.name, 'tr');
    })
    .map((day): DesignItem => ({
      type: 'day',
      id: day.id,
      name: day.name,
      tone: normalizeDesign(day.design, THEME_DESIGN[day.theme] ?? THEME_DESIGN.company).tone,
      active: day.is_active,
      day,
    }));
  const founding = dayItems.filter((i) => i.type === 'day' && dayOrder(i.day)[0] === 3);
  const rest = dayItems.filter((i) => !founding.includes(i));
  const templateItems = (['birthday', 'work_anniversary', 'public_holiday'] as TemplateKind[])
    .map((kind) => templates.find((t) => t.kind === kind))
    .filter((t): t is CelebrationTemplate => Boolean(t))
    .map((template): DesignItem => ({
      type: 'template',
      kind: template.kind,
      name: TEMPLATE_NAME[template.kind] ?? template.kind_label,
      tone: normalizeDesign(template.design, TEMPLATE_DEFAULT_DESIGN[template.kind]).tone,
      active: template.show_popup,
      template,
    }));
  return [...rest, ...templateItems, ...founding];
}

export interface PhaseTexts {
  title: string;
  body: string;
  note: string;
}

export interface DesignForm {
  design: OccasionDesign;
  on: PhaseTexts;
  before: PhaseTexts;
  ret: PhaseTexts;
  show_on: ShowOn;
  show_popup: boolean;
  color_band: boolean;
  keep_theme_during: boolean;
  return_enabled: boolean;
  /** Days only: whether the day is used at all (Ramazan ayı and Kandiller start off). */
  is_active: boolean;
}

export function formFromItem(item: DesignItem): DesignForm {
  if (item.type === 'template') {
    const t = item.template;
    return {
      design: normalizeDesign(t.design, TEMPLATE_DEFAULT_DESIGN[t.kind]),
      on: { title: t.title, body: t.body, note: t.note ?? '' },
      before: { title: '', body: '', note: '' },
      ret: { title: '', body: '', note: '' },
      show_on: t.show_on ?? 'both',
      show_popup: t.show_popup,
      color_band: t.color_band ?? true,
      keep_theme_during: true,
      return_enabled: false,
      is_active: true,
    };
  }
  const d = item.day;
  return {
    design: normalizeDesign(d.design, THEME_DESIGN[d.theme] ?? THEME_DESIGN.company),
    on: { title: d.popup_title, body: d.popup_body, note: d.popup_note ?? '' },
    before: { title: d.before_title ?? '', body: d.before_body ?? '', note: d.before_note ?? '' },
    ret: { title: d.return_title ?? '', body: d.return_body ?? '', note: '' },
    show_on: d.show_on ?? 'both',
    show_popup: d.show_popup,
    color_band: d.color_band ?? true,
    keep_theme_during: d.keep_theme_during ?? true,
    return_enabled: d.return_enabled ?? false,
    is_active: d.is_active,
  };
}

/** "Varsayılana Dön": the seed's values (or the category's / the design's). */
export function defaultForm(item: DesignItem, current: DesignForm): DesignForm {
  if (item.type === 'template') {
    return { ...current, design: { ...TEMPLATE_DEFAULT_DESIGN[item.kind] } };
  }
  const defaults = item.day.defaults;
  if (!defaults)
    return { ...current, design: { ...(THEME_DESIGN[item.day.theme] ?? THEME_DESIGN.company) } };
  return {
    design: normalizeDesign(defaults.design),
    on: { title: defaults.popup_title, body: defaults.popup_body, note: defaults.popup_note },
    before: {
      title: defaults.before_title,
      body: defaults.before_body,
      note: defaults.before_note,
    },
    ret: { title: defaults.return_title, body: defaults.return_body, note: '' },
    show_on: defaults.show_on,
    show_popup: defaults.show_popup,
    color_band: defaults.color_band,
    keep_theme_during: defaults.keep_theme_during,
    return_enabled: defaults.return_enabled,
    is_active: current.is_active,
  };
}

const trim = (t: PhaseTexts): PhaseTexts => ({
  title: t.title.trim(),
  body: t.body.trim(),
  note: t.note.trim(),
});

export function dayPayloadFromForm(form: DesignForm): SpecialDayInput {
  const on = trim(form.on);
  const before = trim(form.before);
  const ret = trim(form.ret);
  return {
    design: form.design,
    popup_title: on.title,
    popup_body: on.body,
    popup_note: on.note,
    before_title: before.title,
    before_body: before.body,
    before_note: before.note,
    return_title: ret.title,
    return_body: ret.body,
    show_on: form.show_on,
    show_popup: form.show_popup,
    color_band: form.color_band,
    keep_theme_during: form.keep_theme_during,
    return_enabled: form.return_enabled,
    is_active: form.is_active,
  };
}

export function templatePayloadFromForm(form: DesignForm): CelebrationTemplateInput {
  const on = trim(form.on);
  return {
    design: form.design,
    title: on.title,
    body: on.body,
    note: on.note,
    show_on: form.show_on,
    show_popup: form.show_popup,
    color_band: form.color_band,
  };
}

/** The texts shown in a phase: before and return fall back to the day's own. */
export function phaseTexts(form: DesignForm, phase: OccasionPhase): PhaseTexts {
  if (phase === 'before') {
    return {
      title: form.before.title || form.on.title,
      body: form.before.body || form.on.body,
      note: form.before.note || form.on.note,
    };
  }
  if (phase === 'return') {
    return { title: form.ret.title, body: form.ret.body, note: '' };
  }
  return form.on;
}

const dayMonth = { day: 'numeric', month: 'long' } as const;
const dayMonthWeekday = { day: 'numeric', month: 'long', weekday: 'long' } as const;

function nextWorkday(iso: string): string {
  let d = addDaysIso(iso, 1);
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Date(`${d}T12:00:00`).getDay();
    if (weekday !== 0 && weekday !== 6) return d;
    d = addDaysIso(d, 1);
  }
  return d;
}

/** Values for the preview's placeholders, from this year's calendar row when there is one. */
export function sampleContext(
  item: DesignItem,
  row: CalendarDay | undefined,
  year: number,
): Record<string, string | number> {
  const date = row?.date ?? `${year}-10-29`;
  const end = row?.end_date || date;
  const since = item.type === 'day' ? item.day.since_year : null;
  const years =
    item.type === 'template'
      ? item.kind === 'work_anniversary'
        ? 10
        : ''
      : since
        ? Number(date.slice(0, 4)) - since
        : '';
  return {
    ...SAMPLE_PERSON,
    name: item.name,
    holiday_name: item.name,
    years,
    year: Number(date.slice(0, 4)),
    tarih: formatDate(date, dayMonth),
    tatil_gunleri: rangeLabel(date, end),
    donus_gunu: formatDate(row?.return_date || nextWorkday(end), dayMonthWeekday),
  };
}

export function renderPhase(
  form: DesignForm,
  phase: OccasionPhase,
  ctx: Record<string, string | number>,
) {
  const texts = phaseTexts(form, phase);
  return {
    title: renderTemplate(texts.title, ctx),
    body: renderTemplate(texts.body, ctx),
    note: renderTemplate(texts.note, ctx),
    numeral: renderTemplate(form.design.numeral, ctx),
  };
}

/** The kicker line for the preview, as the welcome would build it. */
export function previewKicker(
  item: DesignItem,
  row: CalendarDay | undefined,
  phase: OccasionPhase,
  year: number,
): string {
  const date = row?.date ?? `${year}-10-29`;
  const occasion = {
    name: item.name,
    phase,
    date,
    end_date: row?.end_date || date,
    display_date:
      phase === 'before'
        ? row?.before_date || date
        : phase === 'return'
          ? row?.return_date || nextWorkday(row?.end_date || date)
          : date,
  } as Occasion;
  return occasionKicker(occasion, date);
}

/** The line under "Ne zaman gösterilsin": when this year's welcome actually shows. */
export function whenHint(item: DesignItem, row: CalendarDay | undefined, showOn: ShowOn): string {
  if (item.type === 'template') {
    return 'Kişinin kendi günü; hafta sonuna ya da tatile denk gelirse önceki iş günü.';
  }
  if (!row) return 'Bu yıl takvimde yok.';
  const year = row.date.slice(0, 4);
  const day = formatDate(row.date, dayMonthWeekday);
  const before = row.before_date ? formatDate(row.before_date, dayMonthWeekday) : null;
  const dayOff = Boolean(row.before_date && row.before_date !== row.date);
  if (showOn === 'day') {
    return `${year}: ${day}.${dayOff ? ' Tatil olduğu için az kişi görür.' : ''}`;
  }
  if (!dayOff || !before)
    return `${year}: ${day}, iş günü olduğu için günün kendisinde gösterilir.`;
  if (showOn === 'before') return `${year}: ${before}, tatilden önceki son iş günü.`;
  return `${year}: ${before} gösterilir; o gün görmeyen biri ${formatDate(row.date, dayMonth)} günü açarsa bir kez daha görür.`;
}

export function formsEqual(a: DesignForm, b: DesignForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
