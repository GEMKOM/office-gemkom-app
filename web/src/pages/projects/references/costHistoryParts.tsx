import { StatusBadge } from '@/ui';
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
