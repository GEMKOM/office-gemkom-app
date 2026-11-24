import { NumberInput, Select } from '@mantine/core';
import { SHAPE_OPTIONS, type PieceShape, type PieceSize } from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';

// A plate piece's shape and size as typed (Parça Ekle, lot size correction,
// Sac Sayımı lines, remnants at a cut's finish). The size inputs follow the
// shape: Dikdörtgen en × boy, Üçgen taban × yükseklik, Daire çap (sent as
// width and length), Şekilsiz en × boy and its estimated area (m²), which its
// weight comes from. width × length is always the bounding box.

export interface PlateSizeDraft {
  shape: PieceShape;
  width: number | string;
  length: number | string;
  /** Şekilsiz only: the estimated area in m². */
  area: number | string;
}

export const emptyPlateSize = (): PlateSizeDraft => ({
  shape: 'rectangle',
  width: '',
  length: '',
  area: '',
});

/** A piece's size as the inputs show it. */
export function plateSizeOf(p: PieceSize): PlateSizeDraft {
  const num = (v: string | null | undefined) => (v ? Number(v) : '');
  return {
    shape: (p.shape as PieceShape | null | undefined) ?? 'rectangle',
    width: num(p.width_mm),
    length: num(p.length_mm),
    area: num(p.area_m2),
  };
}

type Field = 'width' | 'length' | 'area';

/** The size inputs a shape has, with their labels. */
export function plateSizeFields(shape: PieceShape): { field: Field; label: string }[] {
  switch (shape) {
    case 'triangle':
      return [
        { field: 'width', label: 'Taban (mm)' },
        { field: 'length', label: 'Yükseklik (mm)' },
      ];
    case 'circle':
      return [{ field: 'width', label: 'Çap (mm)' }];
    case 'irregular':
      return [
        { field: 'width', label: 'En (mm)' },
        { field: 'length', label: 'Boy (mm)' },
        { field: 'area', label: 'Tahmini alan (m²)' },
      ];
    default:
      return [
        { field: 'width', label: 'En (mm)' },
        { field: 'length', label: 'Boy (mm)' },
      ];
  }
}

/** A typed number ("0,45" too); NaN when it is none. */
function toNum(value: number | string): number {
  if (typeof value === 'number') return value;
  return value.trim() === '' ? Number.NaN : Number(value.replace(',', '.'));
}

/** The bounding box in m² (en × boy / 1e6). */
const boxM2 = (d: PlateSizeDraft) => (toNum(d.width) * toNum(d.length)) / 1_000_000;

/** Why the area is too big for its box, or ''. */
function areaTooBig(d: PlateSizeDraft): string {
  const area = toNum(d.area);
  const box = boxM2(d);
  if (d.shape !== 'irregular' || !(area > 0) || !(box > 0) || area <= box + 1e-9) return '';
  return `Tahmini alan en × boydan (${formatNumber(box, { maximumFractionDigits: 4 })} m²) büyük olamaz`;
}

/** What is wrong with the typed size (Turkish, for the user), or null when it can be sent. */
export function plateSizeError(d: PlateSizeDraft): string | null {
  for (const { field, label } of plateSizeFields(d.shape)) {
    const value = d[field];
    if (value === '' || Number.isNaN(toNum(value))) return `${label} girin`;
    if (!(toNum(value) > 0)) return `${label} 0'dan büyük olmalı`;
  }
  return areaTooBig(d) || null;
}

/** Whether the typed size differs from the piece's (a circle's length follows its width). */
export function plateSizeChanged(was: PlateSizeDraft, now: PlateSizeDraft): boolean {
  const same = (a: number | string, b: number | string) =>
    toNum(a) === toNum(b) || (Number.isNaN(toNum(a)) && Number.isNaN(toNum(b)));
  if (was.shape !== now.shape || !same(was.width, now.width)) return true;
  if (now.shape !== 'circle' && !same(was.length, now.length)) return true;
  return now.shape === 'irregular' && !same(was.area, now.area);
}

/** Whether nothing of the size is typed in (an empty extra row is ignored). */
export const isBlankPlateSize = (d: PlateSizeDraft) =>
  !String(d.width) && !String(d.length) && !String(d.area);

/** The API's fields for a valid size: a circle's diameter both ways, the area only when irregular. */
export function plateSizeInput(d: PlateSizeDraft): {
  width_mm: string;
  length_mm: string;
  shape: PieceShape;
  area_m2?: string;
} {
  const width = String(toNum(d.width));
  return {
    width_mm: width,
    length_mm: d.shape === 'circle' ? width : String(toNum(d.length)),
    shape: d.shape,
    ...(d.shape === 'irregular' ? { area_m2: String(toNum(d.area)) } : {}),
  };
}

export const AREA_HINT = 'Ağırlık bu alandan hesaplanır';

interface FieldProps {
  value: PlateSizeDraft;
  onChange: (value: PlateSizeDraft) => void;
  disabled?: boolean;
  size?: 'xs' | 'sm';
  /** Each input's width (compact rows); grows with the layout when left out. */
  width?: number;
  /** The inputs' accessible names ("En (mm) 2" on row 2); the label by default. */
  ariaLabel?: (label: string) => string;
}

/** The Şekil select. A shape change keeps what was typed. */
export function PlateShapeSelect({
  value,
  onChange,
  disabled,
  size,
  width,
  ariaLabel,
}: FieldProps) {
  const name = ariaLabel ?? ((label: string) => label);
  return (
    <Select
      size={size}
      w={width}
      label="Şekil"
      aria-label={name('Şekil')}
      data={SHAPE_OPTIONS}
      value={value.shape}
      allowDeselect={false}
      disabled={disabled}
      onChange={(shape) => onChange({ ...value, shape: (shape as PieceShape) ?? 'rectangle' })}
    />
  );
}

/**
 * The size inputs of the shape, as siblings. The area's hint sits under its input, so the
 * inputs of a row stay level.
 */
export function PlateSizeInputs({ value, onChange, disabled, size, width, ariaLabel }: FieldProps) {
  const name = ariaLabel ?? ((label: string) => label);
  const tooBig = areaTooBig(value);
  return (
    <>
      {plateSizeFields(value.shape).map(({ field, label }) =>
        field === 'area' ? (
          <NumberInput
            key={field}
            size={size}
            w={width}
            label={label}
            aria-label={name(label)}
            description={AREA_HINT}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            min={0}
            decimalScale={4}
            decimalSeparator=","
            hideControls
            disabled={disabled}
            error={tooBig || undefined}
            value={value.area}
            onChange={(area) => onChange({ ...value, area })}
          />
        ) : (
          <NumberInput
            key={field}
            size={size}
            w={width}
            label={label}
            aria-label={name(label)}
            min={0}
            decimalScale={1}
            hideControls
            disabled={disabled}
            value={value[field]}
            onChange={(v) => onChange({ ...value, [field]: v })}
          />
        ),
      )}
    </>
  );
}

/**
 * The Şekil select and the size inputs of that shape, as siblings (the caller lays them out
 * in its Group or grid).
 */
export function PlateSizeFields(props: FieldProps) {
  return (
    <>
      <PlateShapeSelect {...props} />
      <PlateSizeInputs {...props} />
    </>
  );
}
