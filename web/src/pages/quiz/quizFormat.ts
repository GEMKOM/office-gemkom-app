import type { QuizCategory } from '@/api/quiz';
import type { StatusFamily } from '@/ui';

export type PillFamily = StatusFamily | 'brand';

/** Each category's pill family (global.css [data-family]). */
export const CATEGORY_FAMILY: Record<QuizCategory, PillFamily> = {
  data: 'brand',
  app: 'blue',
  isg: 'orange',
  technical: 'purple',
  general: 'green',
};

export const CATEGORY_LABEL: Record<QuizCategory, string> = {
  data: 'Dünün Rakamı',
  app: 'Uygulama',
  isg: 'İSG',
  technical: 'Teknik',
  general: 'Genel Kültür',
};

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** "4 gün" / "-" */
export function streakLabel(streak: number | undefined): string {
  return streak ? `${streak} gün` : '-';
}

/** A local YYYY-MM-DD as a Date at noon, so time zones never shift the day. */
export function dayDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
