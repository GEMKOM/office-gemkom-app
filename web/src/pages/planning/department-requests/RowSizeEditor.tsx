import { Group, NumberInput, SegmentedControl, Select, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { standardSizesQueryOptions, type SizeMode } from '@/api/planning/planningRequests';
import { missingWeightText, previewWeight } from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';
import type { ItemRow } from './logic';

// The size of a plate / boy planning line, on one row: a standard sheet size
// or bar length (or a custom one) and a count, then what they come to: total
// kg for a plate (and the kg of one sheet), total metres and kg for a bar. The
// line's quantity (in the card's unit) follows from them: backend weight for
// kg, length for metre, count for adet; the backend computes the same when it
// saves. The user never types it, except for a kg card that has no weight data
// yet (no thickness / kg/m): then the kg is asked for here.

type Patch = Partial<Pick<ItemRow, 'size_mode' | 'piece_width' | 'piece_length' | 'piece_count'>>;

const MODES: { value: SizeMode; label: string }[] = [
  { value: 'standard', label: 'Standart' },
  { value: 'custom', label: 'Özel' },
];

const kg = (value: number) => `${formatNumber(value, 2)} kg`;

export interface SizeTotals {
  /** Every size field filled in. */
  complete: boolean;
  /** One piece's weight (null: unknown yet, or the card has no weight data). */
  unitKg: number | null;
  totalKg: number | null;
  /** Bars: length × count in metres. */
  metres: number | null;
  /** The line's quantity in the card's unit (null: it can't be derived). */
  quantity: number | null;
  /** What the card lacks for a weight ('' while unknown or when it has one). */
  missing: string;
}

/** What a sized row comes to (pure, for the editor and the tests). */
export function sizeTotals(
  row: Pick<
    ItemRow,
    'kind' | 'size_mode' | 'piece_width' | 'piece_length' | 'piece_count' | 'item_unit'
  >,
  weight: { unit_kg: string | null; missing: string } | undefined,
): SizeTotals {
  const kind = row.kind === 'plate' ? 'plate' : 'boy';
  const mode = row.size_mode ?? '';
  const width = Number(row.piece_width) || 0;
  const length = Number(row.piece_length) || 0;
  const count = Number(row.piece_count) || 0;
  const complete =
    (mode === 'standard' || mode === 'custom') &&
    length > 0 &&
    count >= 1 &&
    (kind === 'boy' || width > 0);
  const unit = (row.item_unit || '').toLowerCase();
  const round = (n: number) => Math.round(n * 100) / 100;
  const unitKg = complete && weight?.unit_kg ? Number(weight.unit_kg) : null;
  const totalKg = unitKg === null ? null : round(unitKg * count);
  const metres = complete && kind === 'boy' ? round((length * count) / 1000) : null;
  const quantity = !complete
    ? null
    : unit === 'kg'
      ? totalKg
      : unit === 'metre'
        ? round((length * count) / 1000)
        : unit === 'adet'
          ? count
          : null;
  const missing = complete && weight && weight.unit_kg === null ? weight.missing || ' ' : '';
  return { complete, unitKg, totalKg, metres, quantity, missing };
}

export function RowSizeEditor({
  row,
  itemId,
  index,
  disabled,
  onChange,
  onQuantity,
}: {
  row: ItemRow;
  /** The card's id, for the weight preview (unknown until the card is seen). */
  itemId: number | null;
  index: number;
  disabled?: boolean;
  onChange: (patch: Patch) => void;
  onQuantity: (quantity: number | string) => void;
}) {
  const kind = row.kind === 'plate' ? 'plate' : 'boy';
  const sizes = useQuery(standardSizesQueryOptions());
  const mode = row.size_mode ?? '';
  const width = Number(row.piece_width) || 0;
  const length = Number(row.piece_length) || 0;
  const unit = (row.item_unit || '').toLowerCase();
  const ready =
    (mode === 'standard' || mode === 'custom') && length > 0 && (kind === 'boy' || width > 0);
  const weight = useQuery({
    queryKey: ['planning-size-weight', itemId, kind === 'plate' ? width : null, length],
    queryFn: () =>
      previewWeight({
        item: itemId!,
        width_mm: kind === 'plate' ? String(width) : null,
        length_mm: String(length),
        quantity: 1,
      }),
    enabled: ready && itemId !== null,
    staleTime: Infinity,
  });
  const totals = sizeTotals(row, weight.data);
  // A kg card without weight data: the kg can't be derived and is asked for.
  const askKg = totals.complete && totals.quantity === null && unit === 'kg' && totals.missing;

  const current = Number(row.quantity) || 0;
  useEffect(() => {
    if (totals.quantity !== null && totals.quantity !== current) onQuantity(totals.quantity);
  }, [totals.quantity, current, onQuantity]);

  const standardValue =
    kind === 'plate'
      ? width && length
        ? `${width}x${length}`
        : null
      : length
        ? String(length)
        : null;
  const standardData =
    kind === 'plate'
      ? (sizes.data?.plate ?? []).map((s) => ({
          value: `${s.width_mm}x${s.length_mm}`,
          label: s.label,
        }))
      : (sizes.data?.bar ?? []).map((s) => ({ value: String(s.length_mm), label: s.label }));

  const summary = !totals.complete
    ? mode === 'standard' || mode === 'custom'
      ? ''
      : 'Sac / boy kalemleri ölçü ve adetle istenir.'
    : kind === 'plate'
      ? totals.totalKg !== null
        ? `Toplam ${kg(totals.totalKg)} · ${kg(totals.unitKg!)} / sac`
        : ''
      : `Toplam ${formatNumber(totals.metres ?? 0, 2)} m` +
        (totals.totalKg !== null ? ` · ${kg(totals.totalKg)}` : '');

  return (
    <Group gap="xs" wrap="wrap" align="center" data-testid={`size-row-${index + 1}`}>
      <Text size="xs" fw={600} c="dimmed" w={70}>
        {kind === 'plate' ? 'Sac ölçüsü' : 'Boy'}
      </Text>
      <SegmentedControl
        size="xs"
        disabled={disabled}
        value={mode}
        onChange={(value) =>
          onChange({ size_mode: value as SizeMode, piece_width: '', piece_length: '' })
        }
        data={MODES}
        aria-label={`Ölçü türü ${index + 1}`}
      />
      {mode === 'standard' ? (
        <Select
          size="xs"
          w={150}
          disabled={disabled}
          placeholder={kind === 'plate' ? 'Sac ölçüsü' : 'Boy'}
          aria-label={`Standart ölçü ${index + 1}`}
          data={standardData}
          value={standardValue}
          onChange={(value) => {
            if (!value) return onChange({ piece_width: '', piece_length: '' });
            if (kind === 'plate') {
              const [w, l] = value.split('x').map(Number);
              onChange({ piece_width: w, piece_length: l });
            } else {
              onChange({ piece_length: Number(value) });
            }
          }}
        />
      ) : null}
      {mode === 'custom' ? (
        <>
          {kind === 'plate' ? (
            <NumberInput
              size="xs"
              w={84}
              min={0}
              hideControls
              disabled={disabled}
              placeholder="En (mm)"
              aria-label={`En (mm) ${index + 1}`}
              value={row.piece_width ?? ''}
              onChange={(value) => onChange({ piece_width: value })}
            />
          ) : null}
          {kind === 'plate' ? (
            <Text size="xs" c="dimmed">
              ×
            </Text>
          ) : null}
          <NumberInput
            size="xs"
            w={84}
            min={0}
            hideControls
            disabled={disabled}
            placeholder="Boy (mm)"
            aria-label={`Boy (mm) ${index + 1}`}
            value={row.piece_length ?? ''}
            onChange={(value) => onChange({ piece_length: value })}
          />
        </>
      ) : null}
      {mode === 'standard' || mode === 'custom' ? (
        <>
          <Text size="xs" c="dimmed">
            ×
          </Text>
          <NumberInput
            size="xs"
            w={70}
            min={1}
            allowDecimal={false}
            hideControls
            disabled={disabled}
            placeholder="Adet"
            aria-label={`Parça adedi ${index + 1}`}
            value={row.piece_count ?? ''}
            onChange={(value) => onChange({ piece_count: value })}
          />
          <Text size="xs" c="dimmed">
            adet
          </Text>
        </>
      ) : null}
      {summary ? (
        <Text size="xs" fw={600} data-testid={`size-total-${index + 1}`}>
          {summary}
        </Text>
      ) : null}
      {totals.missing ? (
        <Text size="xs" c="orange.8">
          Ağırlık yok: {totals.missing.trim() || missingWeightText(kind)}
        </Text>
      ) : null}
      {askKg ? (
        <NumberInput
          size="xs"
          w={110}
          min={0.01}
          step={0.01}
          disabled={disabled}
          placeholder="Miktar (kg)"
          aria-label={`Miktar (kg) ${index + 1}`}
          rightSection={
            <Text size="xs" c="dimmed">
              kg
            </Text>
          }
          value={row.quantity ?? ''}
          onChange={onQuantity}
        />
      ) : null}
    </Group>
  );
}
