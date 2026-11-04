import {
  ANGLE_TOL_DEG,
  formatAngleTr,
  setbackFromAngle,
} from '@/pages/manufacturing/linear-cutting/shared/lcGeometry';
import type { ReactNode } from 'react';
import { round2 } from './partRows';

export interface PieceSpec {
  nominal_length_mm: number | null;
  profile_height_mm: number;
  angle_left_deg: number;
  angle_right_deg: number;
}

export interface PiecePictogramProps {
  spec: PieceSpec;
  width?: number;
  height?: number;
  /** Dimension lines, corner offsets and the üst/alt edge labels. */
  dimensions?: boolean;
  /** Past this length/height ratio only the length axis is compressed. */
  maxAspect?: number;
}

/**
 * JSX port of lc-geometry's piecePictogramSVG: a scale drawing of a piece from
 * its real dimensions. Angles are always exact (each slant is tan(a) × the
 * drawn profile height); the length is to scale until the piece is more
 * slender than `maxAspect`. Impossible geometry (the end faces crossing inside
 * the profile) is drawn struck through in red.
 */
export function PiecePictogram({
  spec,
  width: W = 96,
  height: H = 34,
  dimensions: withDims = false,
  maxAspect = 7,
}: PiecePictogramProps) {
  // Dimension lines live outside the shape — reserve room for them.
  const padX = withDims ? 46 : 3;
  const padTop = withDims ? 22 : 3;
  const padBot = withDims ? 26 : 3;

  const L = Number(spec.nominal_length_mm) || 0;
  const h = Number(spec.profile_height_mm) || 0;
  const aL = Number(spec.angle_left_deg) || 0;
  const aR = Number(spec.angle_right_deg) || 0;

  const boxW = Math.max(8, W - 2 * padX);
  const boxH = Math.max(6, H - padTop - padBot);

  const frame = (inner: ReactNode, title: string) => (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {inner}
    </svg>
  );

  if (!(L > 0)) {
    return frame(
      <text
        x={W / 2}
        y={H / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="10"
        fill="#adb5bd"
      >
        boy girin
      </text>,
      'Uzunluk girilmedi',
    );
  }

  // Without the profile dimension there is no miter triangle to scale from,
  // so fall back to a plain bar at a readable aspect.
  const known = h > 0;
  const aspect = known ? L / h : maxAspect;
  const drawnAspect = Math.min(aspect, maxAspect);
  const compressed = known && aspect > drawnAspect * 1.001;

  const hPx = Math.min(boxH, boxW / drawnAspect);
  const wPx = Math.min(boxW, hPx * drawnAspect);
  const x0 = padX + (boxW - wPx) / 2;
  const x1 = x0 + wPx;
  const yTop = padTop + (boxH - hPx) / 2; // far edge (h = H, "üst")
  const yBot = yTop + hPx; // near edge (h = 0, "alt")

  const slantPx = (deg: number) => {
    const a = Math.abs(deg);
    if (a < ANGLE_TOL_DEG || !known) return 0;
    return Math.tan((a * Math.PI) / 180) * hPx;
  };
  const sl = slantPx(aL);
  const sr = slantPx(aR);

  // angle > 0 → far/top corner cut back; angle < 0 → near/bottom corner
  const tlx = x0 + (aL > 0 ? sl : 0);
  const blx = x0 + (aL < 0 ? sl : 0);
  const trx = x1 - (aR > 0 ? sr : 0);
  const brx = x1 - (aR < 0 ? sr : 0);
  const impossible = brx < blx || trx < tlx;

  const tL = round2(Math.abs(setbackFromAngle(aL, h)));
  const tR = round2(Math.abs(setbackFromAngle(aR, h)));
  // Shortest length that still leaves both edges non-negative — the number the
  // operator actually needs when the angles will not fit.
  const minLengthMm = round2(
    Math.max((aL < 0 ? tL : 0) + (aR < 0 ? tR : 0), (aL > 0 ? tL : 0) + (aR > 0 ? tR : 0)),
  );

  const titleParts = [
    `Boy ${L} mm (uzun kenar)`,
    known ? `Kesit ${h} mm` : 'Kesit girilmedi',
    `Sol: ${formatAngleTr(aL)}${tL ? ` · köşe farkı ${tL} mm` : ''}`,
    `Sağ: ${formatAngleTr(aR)}${tR ? ` · köşe farkı ${tR} mm` : ''}`,
  ];
  if (impossible) {
    titleParts.push(
      `⚠ Bu boy bu açılara yetmiyor — kesim yüzeyleri kesişiyor. Bu açılarla en az ${minLengthMm} mm gerekir.`,
    );
  } else if (compressed) titleParts.push('Çizim: açılar birebir, boy sıkıştırılmış.');
  else if (!known) titleParts.push('Çizim: kesit bilinmediği için ölçekli değil.');
  const title = titleParts.join(' · ');

  const dim = (ax: number, ay: number, bx: number, by: number) => (
    <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#adb5bd" strokeWidth="1" />
  );
  const label = (
    x: number,
    y: number,
    value: string,
    anchor: 'start' | 'middle' | 'end' = 'middle',
  ) => (
    <text x={x} y={y} textAnchor={anchor} fontSize="10" fill="#6c757d">
      {value}
    </text>
  );

  // Must stay inside padBot even when the shape fills the full box height.
  const dimY = yBot + 9;
  const dimX = x0 - 10;

  return frame(
    <>
      {impossible ? (
        // Drawing the polygon would fold it inside out into a bow tie, which
        // reads as a broken renderer rather than as bad data.
        <>
          <rect
            x={x0}
            y={yTop}
            width={wPx}
            height={hPx}
            fill="#f8d7da"
            fillOpacity=".55"
            stroke="#b02a37"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <line x1={x0} y1={yTop} x2={x1} y2={yBot} stroke="#b02a37" strokeWidth="1" />
          <line x1={x0} y1={yBot} x2={x1} y2={yTop} stroke="#b02a37" strokeWidth="1" />
        </>
      ) : (
        <>
          <polygon
            points={`${blx},${yBot} ${tlx},${yTop} ${trx},${yTop} ${brx},${yBot}`}
            fill="#7aa5d8"
            fillOpacity=".45"
            stroke="#39587c"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* A compressed drawing must not be mistaken for a scale one. */}
          {compressed && !withDims ? (
            <text x={x1} y={yTop - 1.5} textAnchor="end" fontSize="8" fill="#adb5bd">
              ≉
            </text>
          ) : null}
        </>
      )}
      {withDims ? (
        <>
          {dim(x0, dimY, x1, dimY)}
          {dim(x0, dimY - 3, x0, dimY + 3)}
          {dim(x1, dimY - 3, x1, dimY + 3)}
          {label((x0 + x1) / 2, dimY + 11, `${L} mm${compressed ? ' (boy sıkıştırılmış)' : ''}`)}
          {known ? (
            <>
              {dim(dimX, yTop, dimX, yBot)}
              {dim(dimX - 3, yTop, dimX + 3, yTop)}
              {dim(dimX - 3, yBot, dimX + 3, yBot)}
              {label(dimX - 5, (yTop + yBot) / 2 + 3, `${h}`, 'end')}
            </>
          ) : null}
          {impossible ? (
            <text
              x={(x0 + x1) / 2}
              y={yTop - 7}
              textAnchor="middle"
              fontSize="10"
              fill="#b02a37"
              fontWeight="600"
            >
              Açılar bu boya sığmıyor — en az {minLengthMm} mm
            </text>
          ) : (
            <>
              {/* Corner offsets: the drawing dimension the angle is derived from. */}
              {tL ? label((x0 + Math.max(tlx, blx)) / 2, yTop - 7, `Δ${tL}`) : null}
              {tR ? label((x1 + Math.min(trx, brx)) / 2, yTop - 7, `Δ${tR}`) : null}
            </>
          )}
          {/* Which edge is which — the sign of every angle is read off these. */}
          {label(x1 + 5, yTop + 3, 'üst', 'start')}
          {label(x1 + 5, yBot + 3, 'alt', 'start')}
        </>
      ) : null}
    </>,
    title,
  );
}
