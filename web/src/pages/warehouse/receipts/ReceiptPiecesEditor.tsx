import { ActionIcon, Button, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import type { OrderLineState, ReceiptPieceInput } from '@/api/warehouse/goodsReceipts';
import { missingWeightText, previewWeight } from '@/api/warehouse/pieces';
import { BAR_METRES_INPUT, formatNumber, metresToMm, mmToMetres } from '@/lib/format';
import { FaIcon } from '@/ui';

// The pieces that came on one plate / boy order line in Mal kabul: size,
// count, heat number, certificate. Weights come from the backend preview.

export interface PieceDraft {
  key: number;
  width: string | number;
  /** A plate's length in mm; a bar's in metres (bars read in metres, never mm; sent in mm). */
  length: string | number;
  quantity: string | number;
  heat: string;
  certificate: string;
}

let nextKey = 1;
export const emptyPiece = (): PieceDraft => ({
  key: nextKey++,
  width: '',
  length: '',
  quantity: '',
  heat: '',
  certificate: '',
});

/**
 * The rows a sized plate / bar line starts with while the warehouse hasn't touched them:
 * the pieces this receipt's quantity comes to (2 of 2 sheets outstanding, or 1 when the
 * quantity is lowered to one sheet's worth); one empty row otherwise.
 */
export function startPieces(
  line: Pick<OrderLineState, 'outstanding_pieces' | 'outstanding'>,
  quantity: number,
): PieceDraft[] {
  const pieces = line.outstanding_pieces;
  const outstanding = Number(line.outstanding);
  if (!pieces?.count || !(outstanding > 0)) return [emptyPiece()];
  const count = Math.round(quantity / (outstanding / pieces.count));
  if (!(count >= 1)) return [emptyPiece()];
  return [
    {
      ...emptyPiece(),
      width: pieces.width_mm ? Number(pieces.width_mm) : '',
      // No width: a bar, in metres.
      length: pieces.width_mm ? Number(pieces.length_mm) : mmToMetres(pieces.length_mm),
      quantity: count,
    },
  ];
}

/** A row the backend can take, or null while it is incomplete. */
export function pieceInput(kind: 'plate' | 'boy', row: PieceDraft): ReceiptPieceInput | null {
  const length = Number(kind === 'plate' ? row.length : metresToMm(row.length));
  const quantity = Number(row.quantity);
  if (!(length > 0) || !(quantity >= 1) || !Number.isInteger(quantity)) return null;
  if (kind === 'plate' && !(Number(row.width) > 0)) return null;
  return {
    width_mm: kind === 'plate' ? String(row.width) : null,
    length_mm: String(length),
    quantity,
    heat_number: row.heat.trim(),
    certificate_no: row.certificate.trim(),
  };
}

/** Whether a row has anything typed in (an empty extra row is ignored). */
export const isBlankPiece = (row: PieceDraft) =>
  !String(row.width) &&
  !String(row.length) &&
  !String(row.quantity) &&
  !row.heat &&
  !row.certificate;

export function ReceiptPiecesEditor({
  line,
  quantity,
  rows,
  onChange,
}: {
  line: OrderLineState;
  /** The line's quantity on this receipt (irsaliye), in the card's unit. */
  quantity: number;
  rows: PieceDraft[];
  onChange: (rows: PieceDraft[]) => void;
}) {
  const kind = line.piece_kind === 'plate' ? 'plate' : 'boy';
  const inputs = rows.map((row) => pieceInput(kind, row));
  const weights = useQueries({
    queries: inputs.map((input) => ({
      queryKey: [
        'receipt-piece-weight',
        line.item,
        input?.width_mm ?? null,
        input?.length_mm ?? null,
      ],
      queryFn: () =>
        previewWeight({
          item: line.item,
          width_mm: input!.width_mm ?? null,
          length_mm: input!.length_mm,
          quantity: 1,
        }),
      enabled: input !== null && !line.weight_missing,
      staleTime: Infinity,
    })),
  });
  const unitKg = (index: number) => {
    const value = weights[index]?.data?.unit_kg;
    return value === null || value === undefined ? null : Number(value);
  };
  const totalPieces = inputs.reduce((n, input) => n + (input?.quantity ?? 0), 0);
  const allWeighed = inputs.every((input, i) => input === null || unitKg(i) !== null);
  const totalKg = inputs.reduce(
    (sum, input, i) => sum + (input ? (unitKg(i) ?? 0) * input.quantity : 0),
    0,
  );
  // A kg line's irsaliye quantity should be about what the pieces weigh.
  const mismatch =
    line.item_unit === 'kg' &&
    allWeighed &&
    totalKg > 0 &&
    quantity > 0 &&
    Math.abs(quantity - totalKg) / totalKg > 0.05;
  const update = (key: number, patch: Partial<PieceDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const label = `${line.item_code}`;

  return (
    <Stack gap={4} p="xs" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 6 }}>
      <Text size="xs" fw={600}>
        Gelen parçalar ({kind === 'plate' ? 'en × boy' : 'boy'}, adet)
      </Text>
      {rows.map((row, index) => (
        <Group key={row.key} gap={6} wrap="nowrap" align="flex-end">
          {kind === 'plate' ? (
            <NumberInput
              size="xs"
              w={90}
              min={0}
              decimalScale={1}
              hideControls
              placeholder="En (mm)"
              aria-label={`${label} parça ${index + 1} en`}
              value={row.width}
              onChange={(v) => update(row.key, { width: v })}
            />
          ) : null}
          {kind === 'plate' ? (
            <NumberInput
              size="xs"
              w={90}
              min={0}
              decimalScale={1}
              hideControls
              placeholder="Boy (mm)"
              aria-label={`${label} parça ${index + 1} boy`}
              value={row.length}
              onChange={(v) => update(row.key, { length: v })}
            />
          ) : (
            <NumberInput
              size="xs"
              w={90}
              {...BAR_METRES_INPUT}
              placeholder="Boy (m)"
              aria-label={`${label} parça ${index + 1} boy`}
              value={row.length}
              onChange={(v) => update(row.key, { length: v })}
            />
          )}
          <NumberInput
            size="xs"
            w={70}
            min={1}
            allowDecimal={false}
            hideControls
            placeholder="Adet"
            aria-label={`${label} parça ${index + 1} adet`}
            value={row.quantity}
            onChange={(v) => update(row.key, { quantity: v })}
          />
          <TextInput
            size="xs"
            w={110}
            placeholder="Döküm no"
            aria-label={`${label} parça ${index + 1} döküm no`}
            value={row.heat}
            onChange={(e) => update(row.key, { heat: e.currentTarget.value })}
          />
          <TextInput
            size="xs"
            w={110}
            placeholder="Sertifika no"
            aria-label={`${label} parça ${index + 1} sertifika no`}
            value={row.certificate}
            onChange={(e) => update(row.key, { certificate: e.currentTarget.value })}
          />
          <Text size="xs" c="dimmed" w={90} ta="right">
            {inputs[index] && unitKg(index) !== null
              ? `${formatNumber((unitKg(index) ?? 0) * inputs[index]!.quantity, 2)} kg`
              : ''}
          </Text>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            aria-label={`${label} parça ${index + 1} sil`}
            disabled={rows.length === 1}
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
          >
            <FaIcon icon="fas fa-times" />
          </ActionIcon>
        </Group>
      ))}
      <Group justify="space-between">
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => onChange([...rows, emptyPiece()])}
        >
          Ölçü ekle
        </Button>
        <Text size="xs" c={line.weight_missing ? 'orange.8' : 'dimmed'}>
          {totalPieces} parça
          {line.weight_missing
            ? ` · ağırlık yok: ${line.weight_missing || missingWeightText(kind)}`
            : allWeighed && totalPieces > 0
              ? ` · ${formatNumber(totalKg, 2)} kg`
              : ''}
        </Text>
      </Group>
      {mismatch ? (
        <Text size="xs" c="orange.8">
          İrsaliyedeki miktar ({formatNumber(quantity, 2)} kg) parçaların ağırlığından (
          {formatNumber(totalKg, 2)} kg) farklı; ölçüleri ve adedi kontrol edin.
        </Text>
      ) : null}
    </Stack>
  );
}
