import type { OpenNeoOptions } from './neoStore';

// Links that land in Neo: the bell's "Neo bildiriminizle ilgili bilgi istiyor"
// notification points at /?bildirim=<report id>, a daily summary at
// /?ozet=<summary id> (the legacy widget reads the same parameters).

/** Where a link opens Neo, or null when it is an ordinary link. */
export function neoLinkTarget(link: string | null | undefined): OpenNeoOptions | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link, 'http://neo.invalid');
  } catch {
    return null;
  }
  const reportId = Number(url.searchParams.get('bildirim'));
  if (reportId > 0) return { reportId };
  const summaryId = Number(url.searchParams.get('ozet'));
  if (summaryId > 0) return { summaryId, openSummary: true };
  return null;
}
