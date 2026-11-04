import { hasRouteAccess } from '@/auth/accessControl';
import { SegmentedControl } from '@mantine/core';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';

/** One department's view of a merged report. */
export interface ReportView<V extends string> {
  value: V;
  label: string;
  /** The page this view used to be; its grant decides who sees the view. */
  route: string;
}

export interface ReportViewState<V extends string> {
  /** The view to render; null when the user may open none of them. */
  view: V | null;
  /** Switch between the views the user may open; null with only one. */
  switcher: ReactNode;
}

/**
 * The view of a merged report, kept in the URL as `?<param>=`. Grants stay
 * on the old per-department pages, so a user only gets the views whose old
 * page they can open; an unknown or ungranted value falls back to the first
 * one they can. Switching keeps the `keep` params (filters every view reads)
 * and drops the rest, which belong to the view being left.
 */
export function useReportView<V extends string>(
  param: string,
  views: readonly ReportView<V>[],
  keep: readonly string[] = [],
): ReportViewState<V> {
  const [searchParams, setSearchParams] = useSearchParams();
  const allowed = views.filter((v) => hasRouteAccess(v.route));
  const requested = searchParams.get(param);
  const view = allowed.find((v) => v.value === requested)?.value ?? allowed[0]?.value ?? null;

  const switcher =
    allowed.length > 1 && view ? (
      <SegmentedControl
        aria-label="Rapor görünümü"
        size="xs"
        data={allowed.map((v) => ({ value: v.value, label: v.label }))}
        value={view}
        onChange={(next) =>
          setSearchParams((prev) => {
            const params = new URLSearchParams();
            for (const key of keep) for (const v of prev.getAll(key)) params.append(key, v);
            params.set(param, next);
            return params;
          })
        }
      />
    ) : null;

  return { view, switcher };
}
