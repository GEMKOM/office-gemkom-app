import { ActionIcon, Group, NumberInput, Select, Text, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { standardSizesQueryOptions } from '@/api/planning/planningRequests';
import { missingWeightText, previewWeight } from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';
import { FaIcon } from '@/ui';
import type { ItemRow } from './logic';

// A plate / boy planning line's quantity cell, on the line itself: the size
// (a standard sheet size or bar length from the dropdown, or "Özel ölçü…" for
// a custom W × L / length) times a count, then the one figure it comes to:
// total kg for a plate, total metres and kg for a bar. The line's quantity in
// the card's unit follows from them (backend weight for kg, length for metre,
// count for adet); the backend computes the same when it saves. Nothing is
// typed as Miktar / Birim, except the kg of a kg card that has no weight data
// yet (no thickness / kg/m).

type Patch = Partial<Pick<ItemRow, 'size_mode' | 'piece_width' | 'piece_length' | 'piece_count'>>;

/** The dropdown entry that switches a line to a custom size. */
const CUSTOM = '__custom';

const kg = (value: number) => `${formatNumber(value, 2)} kg`;

/**
 * A bar length in metres ("6 m", "2,5 m"). Bars are ordered in metres: a length
 * in mm next to a quantity in metres invites ordering 500 m of pipe instead of
 * 500 mm. The line still stores the length in mm (piece_length).
 */
export const barMetres = (lengthMm: number) =>
  `${String(Number((lengthMm / 1000).toFixed(3))).replace('.', ',')} m`;

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

  // An older line saved before sizes existed: its quantity as it was, and a
  // way to give it a size.
  if (!mode || mode === 'any') {
    return (
      <Group gap={6} wrap="nowrap" data-testid={`size-row-${index + 1}`}>
        <Text size="xs" fw={600} aria-label={`Miktar ${index + 1}`}>
          {Number(row.quantity) > 0 ? `${formatNumber(Number(row.quantity), 2)} ${row.item_unit}` : '—'}
        </Text>
        {disabled ? null : (
          <Text
            size="xs"
            c="blue"
            style={{ cursor: 'pointer' }}
            onClick={() => onChange({ size_mode: 'standard', piece_width: '', piece_length: '' })}
          >
            ölçü gir
          </Text>
        )}
      </Group>
    );
  }

  const standardValue =
    kind === 'plate'
      ? width && length
        ? `${width}x${length}`
        : null
      : length
        ? String(length)
        : null;
  const standardData = [
    ...(kind === 'plate'
      ? (sizes.data?.plate ?? []).map((s) => ({
          value: `${s.width_mm}x${s.length_mm}`,
          // All sizes are mm: the plate label without it fits the cell.
          label: s.label.replace(/\s*mm$/, ''),
        }))
      : (sizes.data?.bar ?? []).map((s) => ({
          value: String(s.length_mm),
          label: barMetres(Number(s.length_mm)),
        }))),
    { value: CUSTOM, label: 'Özel ölçü…' },
  ];

  const figure = !totals.complete
    ? ''
    : kind === 'plate'
      ? totals.totalKg !== null
        ? kg(totals.totalKg)
        : ''
      : `${formatNumber(totals.metres ?? 0, 2)} m` +
        (totals.totalKg !== null ? ` · ${kg(totals.totalKg)}` : '');
  const perPiece =
    totals.unitKg !== null ? `${kg(totals.unitKg)} / ${kind === 'plate' ? 'sac' : 'boy'}` : '';

  const mm = { size: 'xs', min: 0, hideControls: true, disabled } as const;

  return (
    <Group gap={6} wrap="nowrap" align="center" data-testid={`size-row-${index + 1}`}>
      {mode === 'standard' ? (
        <Select
          size="xs"
          w={140}
          disabled={disabled}
          placeholder={kind === 'plate' ? 'Sac ölçüsü' : 'Boy'}
          aria-label={`Ölçü ${index + 1}`}
          data={standardData}
          value={standardValue}
          comboboxProps={{ width: 180, position: 'bottom-start' }}
          onChange={(value) => {
            if (!value) return onChange({ piece_width: '', piece_length: '' });
            if (value === CUSTOM) {
              return onChange({ size_mode: 'custom', piece_width: '', piece_length: '' });
            }
            if (kind === 'plate') {
              const [w, l] = value.split('x').map(Number);
              onChange({ piece_width: w, piece_length: l });
            } else {
              onChange({ piece_length: Number(value) });
            }
          }}
        />
      ) : (
        <>
          {kind === 'plate' ? (
            <>
              <NumberInput
                {...mm}
                w={64}
                placeholder="En"
                aria-label={`En (mm) ${index + 1}`}
                value={row.piece_width ?? ''}
                onChange={(value) => onChange({ piece_width: value })}
              />
              <Text size="xs" c="dimmed">
                ×
              </Text>
            </>
          ) : null}
          {kind === 'plate' ? (
            <NumberInput
              {...mm}
              w={64}
              placeholder="Boy"
              aria-label={`Boy (mm) ${index + 1}`}
              value={row.piece_length ?? ''}
              onChange={(value) => onChange({ piece_length: value })}
            />
          ) : (
            // A bar's length is typed in metres; the line keeps it in mm.
            <NumberInput
              {...mm}
              w={84}
              decimalScale={3}
              decimalSeparator=","
              placeholder="Boy (m)"
              aria-label={`Boy (m) ${index + 1}`}
              rightSection={
                <Text size="xs" c="dimmed">
                  m
                </Text>
              }
              value={length > 0 ? length / 1000 : ''}
              onChange={(value) =>
                onChange({
                  piece_length:
                    value === '' || value === null ? '' : Math.round(Number(value) * 1000),
                })
              }
            />
          )}
          {disabled ? null : (
            <Tooltip label="Standart ölçüye dön" withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={`Standart ölçü ${index + 1}`}
                onClick={() => onChange({ size_mode: 'standard', piece_width: '', piece_length: '' })}
              >
                <FaIcon icon="fas fa-list" />
              </ActionIcon>
            </Tooltip>
          )}
        </>
      )}
      <Text size="xs" c="dimmed">
        ×
      </Text>
      <NumberInput
        size="xs"
        w={56}
        min={1}
        allowDecimal={false}
        hideControls
        disabled={disabled}
        placeholder="Adet"
        aria-label={`Parça adedi ${index + 1}`}
        value={row.piece_count ?? ''}
        onChange={(value) => onChange({ piece_count: value })}
      />
      {figure ? (
        <Tooltip label={perPiece} disabled={!perPiece} withArrow>
          <Text
            size="xs"
            fw={600}
            style={{ whiteSpace: 'nowrap' }}
            aria-label={`Miktar ${index + 1}`}
            data-testid={`size-total-${index + 1}`}
          >
            {figure}
          </Text>
        </Tooltip>
      ) : null}
      {totals.missing ? (
        <Tooltip label={totals.missing.trim() || missingWeightText(kind)} withArrow>
          <Text size="xs" c="orange.8" style={{ whiteSpace: 'nowrap' }}>
            Ağırlık yok
          </Text>
        </Tooltip>
      ) : null}
      {askKg ? (
        <NumberInput
          size="xs"
          w={96}
          min={0.01}
          step={0.01}
          disabled={disabled}
          placeholder="kg"
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
