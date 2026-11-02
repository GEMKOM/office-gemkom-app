import { useSyncExternalStore } from 'react';
import { formatNumber, toDate } from '@/lib/format';

// One 1-second clock for every ticking cell on a dashboard. The interval runs
// only while something is subscribed, so a page without running timers is idle.
// Legacy read apis/timeService.js getSyncedNow(), but nothing ever called
// syncServerTime(), so its offset was always 0: Date.now() is the same clock.

let now = Date.now();
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!interval) {
    now = Date.now();
    interval = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

/** Epoch ms, updated every second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}

/** A timer's start as epoch ms: the API sends ms, older rows an ISO string. */
export function startMs(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  return toDate(value)?.getTime() ?? null;
}

/** "01:02:03" (apis/formatters.js formatDurationFromMs). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

const HOUR_MS = 60 * 60 * 1000;

/** Hours already booked plus the running timer, if any. */
export function hoursWithRunning(
  baseHours: unknown,
  runningSince: number | null,
  at: number,
): number {
  const base = Number.parseFloat(String(baseHours ?? '')) || 0;
  return runningSince ? base + (at - runningSince) / HOUR_MS : base;
}

/** "3,25 saat" (formatHoursSpent). */
export function formatHours(hours: number): string {
  return `${formatNumber(hours, 2)} saat`;
}

/** 45 hours = 1 week; '-' when there is nothing planned (formatWeeksFromHours). */
export function formatWeeks(totalEstimatedHours: unknown): string {
  const hours = Number(totalEstimatedHours) || 0;
  return hours ? `${formatNumber(hours / 45, 1)} hafta` : '-';
}
