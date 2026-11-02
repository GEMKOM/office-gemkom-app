import { Text } from '@mantine/core';
import { StatusBadge, type StatusFamily } from '@/ui';
import classes from './suppliers.module.css';

// Port of components/supplier-badges/supplier-badges.js for this page (the
// legacy file stays for the purchase-request pages and the comparison table).

export const SUPPLIER_STATUS_META: Record<string, { label: string; color: StatusFamily }> = {
  approved: { label: 'Onaylı', color: 'green' },
  watch: { label: 'İzlemede', color: 'yellow' },
  blacklisted: { label: 'Kara Liste', color: 'red' },
};

/** Legacy statusLabel: the status' label, the raw key, or '-'. */
export function supplierStatusLabel(key: string | null | undefined): string {
  return (key && SUPPLIER_STATUS_META[key]?.label) || key || '-';
}

function toScore(value: unknown): number {
  // Unrated suppliers carry null; Number(null) is 0, which would draw "0.0".
  return value === null || value === undefined || value === '' ? NaN : Number(value);
}

function Dash() {
  return (
    <Text span size="sm" c="dimmed">
      —
    </Text>
  );
}

/** renderSupplierStatusBadge: a missing or unknown status shows as Onaylı. */
export function SupplierStatusBadge({ status }: { status?: string | null }) {
  const meta = (status && SUPPLIER_STATUS_META[status]) || SUPPLIER_STATUS_META.approved!;
  return <StatusBadge color={meta.color}>{meta.label}</StatusBadge>;
}

/** renderStarRating: 0–5 stars with halves; `compact` adds the number. */
export function StarRating({ score, compact = false }: { score: unknown; compact?: boolean }) {
  const n = toScore(score);
  if (!Number.isFinite(n)) return <Dash />;
  const full = Math.floor(n);
  const half = n - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  const icons: string[] = [
    ...Array.from({ length: Math.max(0, full) }, () => 'fas fa-star'),
    ...(half ? ['fas fa-star-half-stroke'] : []),
    ...Array.from({ length: Math.max(0, empty) }, () => 'far fa-star'),
  ];
  return (
    <>
      <span className={classes.stars} title={`${n.toFixed(2)} / 5`}>
        {icons.map((icon, i) => (
          <i key={i} className={icon} aria-hidden />
        ))}
      </span>
      {compact ? (
        <Text span size="xs" c="dimmed" ml={4}>
          {n.toFixed(1)}
        </Text>
      ) : null}
    </>
  );
}

/** renderOnTimePct: green from 85%, yellow from 60%, red below. */
export function OnTimePct({ pct }: { pct: unknown }) {
  const n = toScore(pct);
  if (!Number.isFinite(n)) return <Dash />;
  const color: StatusFamily = n < 60 ? 'red' : n < 85 ? 'yellow' : 'green';
  return <StatusBadge color={color}>%{n.toFixed(0)}</StatusBadge>;
}

/** Fixed 0–5 stars for a saved criterion score (legacy phStaticStars). */
export function StaticStars({ value }: { value: unknown }) {
  const n = Number(value) || 0;
  return (
    <span className={classes.stars} aria-label={`${n} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? 'fas fa-star' : 'far fa-star'} aria-hidden />
      ))}
    </span>
  );
}
