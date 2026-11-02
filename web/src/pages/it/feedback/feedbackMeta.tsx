import { StatusBadge, type StatusFamily } from '@/ui';

export const STATUS_META: Record<string, { label: string; color: StatusFamily }> = {
  new: { label: 'Yeni', color: 'grey' },
  analyzed: { label: 'İncelendi', color: 'purple' },
  needs_info: { label: 'Bilgi Bekleniyor', color: 'orange' },
  duplicate: { label: 'Yinelenen', color: 'grey' },
  queued: { label: 'Kuyruğa Alındı', color: 'blue' },
  in_review: { label: 'PR İncelemede', color: 'orange' },
  done: { label: 'Tamamlandı', color: 'green' },
  dismissed: { label: 'Reddedildi', color: 'grey' },
  failed: { label: 'Başarısız', color: 'red' },
};

export const KIND_META: Record<string, { label: string; icon: string }> = {
  bug: { label: 'Hata', icon: 'fas fa-bug' },
  feature: { label: 'Özellik', icon: 'fas fa-lightbulb' },
  improvement: { label: 'İyileştirme', icon: 'fas fa-arrow-trend-up' },
  other: { label: 'Diğer', icon: 'fas fa-comment-dots' },
};

export const RECOMMENDATION_LABELS: Record<string, string> = {
  implement: 'Uygulanabilir',
  needs_human: 'İnsan kararı',
  needs_info: 'Bilgi gerekli',
  duplicate: 'Yinelenen',
  reject: 'Reddedilmeli',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  critical: 'Kritik',
};

export const REPO_LABELS: Record<string, string> = {
  backend: 'Backend',
  frontend: 'Frontend',
  both: 'Backend + Frontend',
  unknown: 'Belirsiz',
};

export function kindMeta(kind: string | undefined) {
  return KIND_META[kind ?? ''] ?? KIND_META.other!;
}

export function FeedbackStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'grey' as const };
  return <StatusBadge color={meta.color}>{meta.label}</StatusBadge>;
}

export function usd(value: unknown): string {
  const n = Number.parseFloat(String(value));
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** dd.mm.yy hh:mm, as the legacy table and timeline showed it. */
export function shortDateTime(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
