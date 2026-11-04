import type { MouseEvent, ReactNode } from 'react';
import { FaIcon, StatusBadge } from '@/ui';
import css from './RefTabs.module.css';

/**
 * A link from a job in one tab to the same job in the other (52 jobs have both
 * welder hours in the app and a MALİYET cost sheet). Stops the row click.
 */
export function CrossLink({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={css.crossLink}
      title={title}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <FaIcon icon="fas fa-link" /> {children}
    </button>
  );
}
import { RELIABILITY_LABELS, type FamilyReliability } from '@/api/projects/costHistory';
import { fmt } from '../estimate-report/reportModel';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** '2024-06' → 'Haz 2024'. */
export function monthLabel(ym: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return ym || '—';
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function ReviewBadge({ status }: { status: string | null | undefined }) {
  if (status === 'verified') return <StatusBadge color="green">Doğrulandı</StatusBadge>;
  if (status === 'excluded') return <StatusBadge color="red">Hariç</StatusBadge>;
  return <StatusBadge color="grey">İncelenmedi</StatusBadge>;
}

export function PlanSourceBadge({ source }: { source: string | null | undefined }) {
  if (source === 'claude_code') return <StatusBadge color="blue">çizimden okundu</StatusBadge>;
  if (source === 'api') return <StatusBadge color="purple">tahmin motorundan</StatusBadge>;
  return null;
}

/** "İyi · %8" — how well the family's archive predicts its own items (leave-one-out). */
export function ReliabilityBadge({ value }: { value: FamilyReliability | null | undefined }) {
  const r = RELIABILITY_LABELS[value?.level ?? 'unknown'] ?? RELIABILITY_LABELS.unknown!;
  const err = value?.median_error;
  return (
    <span title="Arşivdeki her kalem, ailesinin geri kalanıyla tahmin edildiğinde tipik sapma (leave-one-out)">
      <StatusBadge color={r.color}>
        {r.label}
        {err != null ? ` · %${fmt(err * 100, 0)}` : ''}
      </StatusBadge>
    </span>
  );
}
