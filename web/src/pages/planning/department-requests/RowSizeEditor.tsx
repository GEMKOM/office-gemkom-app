import { Group, NumberInput, SegmentedControl, Select, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { standardSizesQueryOptions, type SizeMode } from '@/api/planning/planningRequests';
import { previewWeight } from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';
import type { ItemRow } from './logic';

// The size of a plate / boy planning line: a standard sheet size or bar
// length, a custom size, or "any size" (supplier's choice). With a size the
// quantity follows from the pieces (backend weight for kg, length for metre,
// count for adet); the backend computes the same when it saves.

type Patch = Partial<Pick<ItemRow, 'size_mode' | 'piece_width' | 'piece_length' | 'piece_count'>>;

const MODES: { value: SizeMode; label: string }[] = [
  { value: 'standard', label: 'Standart ölçü' },
  { value: 'custom', label: 'Özel ölçü' },
  { value: 'any', label: 'Herhangi ölçü' },
];

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
  onQuantity: (quantity: number) => void;
}) {
  const kind = row.kind === 'plate' ? 'plate' : 'boy';
  const sizes = useQuery(standardSizesQueryOptions());
  const mode = row.size_mode ?? '';
  const width = Number(row.piece_width) || 0;
  const length = Number(row.piece_length) || 0;
  const count = Number(row.piece_count) || 0;
  const sized = (mode === 'standard' || mode === 'custom') && length > 0 && count >= 1;
  const complete = sized && (kind === 'boy' || width > 0);
  const unit = (row.item_unit || '').toLowerCase();
  const weight = useQuery({
    queryKey: ['planning-size-weight', itemId, kind === 'plate' ? width : null, length],
    queryFn: () =>
      previewWeight({
        item: itemId!,
        width_mm: kind === 'plate' ? String(width) : null,
        length_mm: String(length),
        quantity: 1,
      }),
    enabled: complete && unit === 'kg' && itemId !== null,
    staleTime: Infinity,
  });

  // What the pieces come to, in the line's unit (null when it can't be said).
  const unitKg = weight.data?.unit_kg ? Number(weight.data.unit_kg) : null;
  const computed = !complete
    ? null
    : unit === 'kg'
      ? unitKg === null
        ? null
        : Math.round(unitKg * count * 100) / 100
      : unit === 'metre'
        ? Math.round(((length * count) / 1000) * 100) / 100
        : unit === 'adet'
          ? count
          : null;
  const current = Number(row.quantity) || 0;
  useEffect(() => {
    if (computed !== null && computed !== current) onQuantity(computed);
  }, [computed, current, onQuantity]);

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

  return (
    <Group gap="xs" wrap="wrap" align="center">
      <Text size="xs" fw={600} c="dimmed">
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
          w={170}
          disabled={disabled}
          placeholder={kind === 'plate' ? 'Sac ölçüsü seçin' : 'Boy seçin'}
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
              w={90}
              min={0}
              hideControls
              disabled={disabled}
              placeholder="En (mm)"
              aria-label={`En (mm) ${index + 1}`}
              value={row.piece_width ?? ''}
              onChange={(value) => onChange({ piece_width: value })}
            />
          ) : null}
          <NumberInput
            size="xs"
            w={90}
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
        <NumberInput
          size="xs"
          w={80}
          min={1}
          allowDecimal={false}
          hideControls
          disabled={disabled}
          placeholder="Adet"
          aria-label={`Parça adedi ${index + 1}`}
          value={row.piece_count ?? ''}
          onChange={(value) => onChange({ piece_count: value })}
        />
      ) : null}
      <Text size="xs" c="dimmed">
        {mode === 'any'
          ? 'Tedarikçi ölçüyü seçer; miktarı kg olarak girin.'
          : computed !== null
            ? `= ${formatNumber(computed, unit === 'adet' ? 0 : 2)} ${unit}`
            : complete && unit === 'kg' && weight.data && unitKg === null
              ? `Kartta ağırlık bilgisi yok (${weight.data.missing}); miktarı kg olarak girin.`
              : !mode
                ? 'Sac / boy kalemleri ölçüyle istenir.'
                : ''}
      </Text>
    </Group>
  );
}
