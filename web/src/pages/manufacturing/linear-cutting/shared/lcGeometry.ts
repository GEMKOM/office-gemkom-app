/**
 * Shared geometry + bar drawing for the linear cutting pages (cuts and tasks).
 * Ported from the legacy manufacturing/linear-cutting/lc-geometry.js; only the
 * parts the React pages use came along (the SVG pictogram is PiecePictogram.tsx).
 *
 * Mirrors the backend model in `gemkom-backend/linear_cutting/geometry.py`
 * (see CUTTING_MODEL.md there for the full derivation). Conventions:
 *
 *  - Viewed in the miter plane; the NEAR edge (h = 0, "alt") is drawn at the
 *    BOTTOM of the bar, the FAR edge (h = H, "üst") at the top.
 *  - `nominal_mm` is the long-point (bounding) length of a piece.
 *  - End angles are signed degrees from square:
 *      angle > 0  → far/top corner cut back  → long point on the bottom edge
 *      angle < 0  → near/bottom corner cut back → long point on the top edge
 *  - An angled saw pass consumes kerf / cos(angle) along the bar axis.
 *
 * Every bar drawing goes through `drawBarCanvas` here.
 */

export const ANGLE_TOL_DEG = 0.05;
// Mirrors MAX_ANGLE_DEG in gemkom-backend/linear_cutting/geometry.py
export const MAX_ANGLE_DEG = 85;

// Shown wherever a piece is marked flipped (web ↻, PDF "d"). `flipped` is a
// statement about WHERE ON THE BAR the miter falls, not an instruction to the
// operator: the cut list already produces the right piece. It only changes the
// part itself when the cross-section is chiral (unequal angle, channel) — for a
// pipe or a flat bar the mirrored piece is the same piece.
export const FLIPPED_TITLE =
  'Açılı uç, resimdekinin ters ucunda kesilir. Kesimde ek bir işlem yoktur — ' +
  'simetrik profilde (boru, lama) parça birebir aynıdır, asimetrik profilde ' +
  'ayna görüntüsü olur.';

/** A placed piece on a bar, as the API returns it. */
export interface BarCut {
  label?: string | null;
  offset_mm?: number | null;
  end_mm?: number | null;
  nominal_mm?: number | null;
  effective_mm?: number | null;
  profile_height_mm?: number | null;
  angle_left_deg?: number | null;
  angle_right_deg?: number | null;
  flipped?: boolean;
  requires_bending?: boolean;
  shared_left?: boolean;
  shared_right?: boolean;
  job_no?: string | null;
}

/** One saw pass. */
export interface BarPass {
  kind?: string | null;
  angle_deg?: number | null;
  x_near_mm?: number | null;
  x_far_mm?: number | null;
  blade_axial_mm?: number | null;
}

export interface BarLayout {
  stock_length_mm?: number | null;
  waste_mm?: number | null;
  is_remnant?: boolean;
  /** BarCut objects. */
  cuts?: readonly unknown[] | null;
  /** BarPass objects. */
  passes?: readonly unknown[] | null;
}

const PALETTE = [
  '#0d6efd',
  '#198754',
  '#fd7e14',
  '#6f42c1',
  '#20c997',
  '#dc3545',
  '#0dcaf0',
  '#b58900',
] as const;

function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length] ?? PALETTE[0];
}

function recessMm(angleDeg: unknown, heightMm: unknown): number {
  const a = Math.abs(Number(angleDeg) || 0);
  const h = Number(heightMm) || 0;
  if (a < ANGLE_TOL_DEG || h <= 0) return 0;
  return h * Math.tan((a * Math.PI) / 180);
}

/**
 * Signed miter angle from the corner offset of an end face — the "köşe farkı"
 * a drawing gives when it dimensions lengths instead of angles. Inverse of
 * `setbackFromAngle`. Null when the profile dimension is unknown (the angle is
 * then underdetermined). Mirrors angle_from_setback() in the backend.
 */
export function angleFromSetback(setbackMm: unknown, heightMm: unknown): number | null {
  const h = Number(heightMm) || 0;
  if (h <= 0) return null;
  const t = Number(setbackMm) || 0;
  const a = (Math.atan(Math.abs(t) / h) * 180) / Math.PI;
  return t >= 0 ? a : -a;
}

/** Signed corner offset of a miter — inverse of `angleFromSetback`. */
export function setbackFromAngle(angleDeg: unknown, heightMm: unknown): number {
  const t = recessMm(angleDeg, heightMm);
  return (Number(angleDeg) || 0) >= 0 ? t : -t;
}

function kerfAxialMm(kerfMm: unknown, angleDeg: unknown): number {
  const a = Math.abs(Number(angleDeg) || 0);
  const k = Number(kerfMm) || 0;
  if (a < ANGLE_TOL_DEG) return k;
  return k / Math.cos((a * Math.PI) / 180);
}

/** Recess of an end face at [near (h=0), far (h=H)]. */
function endRecessProfile(angleDeg: unknown, heightMm: unknown): [number, number] {
  const t = recessMm(angleDeg, heightMm);
  if (t === 0) return [0, 0];
  return Number(angleDeg) > 0 ? [0, t] : [t, 0];
}

/** Absolute face segments of a placed cut: {left:[xNear,xFar], right:[xNear,xFar]} (mm). */
function pieceFacesMm(cut: BarCut): { left: [number, number]; right: [number, number] } {
  const offset = Number(cut.offset_mm) || 0;
  const len = Number(cut.nominal_mm ?? cut.effective_mm) || 0;
  const h = Number(cut.profile_height_mm) || 0;
  const [lNear, lFar] = endRecessProfile(cut.angle_left_deg || 0, h);
  const [rNear, rFar] = endRecessProfile(cut.angle_right_deg || 0, h);
  const end = offset + len;
  return {
    left: [offset + lNear, offset + lFar],
    right: [end - rNear, end - rFar],
  };
}

// ─────────────────────────── Formatting (TR) ───────────────────────────

export function formatAngleTr(angleDeg: unknown): string {
  const a = Number(angleDeg) || 0;
  if (Math.abs(a) < ANGLE_TOL_DEG) return '0°';
  const mag = `${Math.round(Math.abs(a) * 100) / 100}°`;
  return a > 0 ? `${mag} (alt uzun)` : `${mag} (üst uzun)`;
}

/**
 * Pass angle with the physical lean of the cut plane (the direction the
 * plane leans toward the far/"üst" edge) — what the operator sets on the saw.
 */
export function formatPassAngle(pass: BarPass | null | undefined): string {
  const a = Number(pass?.angle_deg) || 0;
  if (Math.abs(a) < ANGLE_TOL_DEG) return '0°';
  const near = Number(pass?.x_near_mm) || 0;
  const far = Number(pass?.x_far_mm) || 0;
  const side = far > near ? 'sağa' : 'sola';
  return `${Math.round(Math.abs(a) * 100) / 100}° ${side}`;
}

export function passKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'lead':
      return 'Baş kesim';
    case 'shared':
      return 'Ortak kesim';
    case 'end':
      return 'Parça ayırma';
    default:
      return kind || '—';
  }
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────── Tooltip ───────────────────────────

function buildCutTooltipHtml(cut: BarCut): string {
  const rows: string[] = [];
  rows.push(
    `<div style="font-weight:700;margin-bottom:4px;">${esc(cut.label || '—')}${cut.flipped ? ` <span title="${FLIPPED_TITLE}">↻</span>` : ''}</div>`,
  );
  rows.push(
    `<div><span style="opacity:.7">Boy (uzun kenar):</span> ${cut.nominal_mm ?? cut.effective_mm ?? '—'} mm</div>`,
  );
  rows.push(
    `<div><span style="opacity:.7">Sol açı:</span> ${formatAngleTr(cut.angle_left_deg)}</div>`,
  );
  rows.push(
    `<div><span style="opacity:.7">Sağ açı:</span> ${formatAngleTr(cut.angle_right_deg)}</div>`,
  );
  rows.push(`<div><span style="opacity:.7">Başlangıç:</span> ${cut.offset_mm ?? '—'} mm</div>`);
  if (cut.shared_left || cut.shared_right) {
    const sides = [cut.shared_left ? 'sol' : null, cut.shared_right ? 'sağ' : null]
      .filter(Boolean)
      .join(' + ');
    rows.push(`<div><span style="opacity:.7">Ortak kesim:</span> ${sides}</div>`);
  }
  if (cut.requires_bending)
    rows.push(`<div style="color:#ffc107;">Büküm var — boy açınım boyudur</div>`);
  if (cut.job_no) rows.push(`<div><span style="opacity:.7">İş No:</span> ${esc(cut.job_no)}</div>`);
  return rows.join('');
}

// ─────────────────────────── Bar canvas renderer ───────────────────────────

function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  step = 7,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = 1;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

export interface DrawBarOptions {
  kerfMm?: number;
  referenceStockMm?: number | null;
  tooltipEl?: HTMLElement | null;
}

/**
 * Draw one bar layout onto `canvas`.
 *
 * Pieces are drawn as their true quadrilaterals; everything of the bar not
 * covered by a piece (wedges, kerf, end leftover) shows as hatched scrap.
 * Saw passes (if present) are drawn as dark blade bands.
 */
export function drawBarCanvas(
  canvas: HTMLCanvasElement,
  bar: BarLayout,
  opts: DrawBarOptions = {},
): void {
  const { kerfMm = 0, referenceStockMm = null, tooltipEl = null } = opts;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 900;
  const H = 74;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const pad = 8,
    barY = 24,
    barH = 30;
  const barX = pad;
  const maxBarW = W - pad * 2;
  const stockLength = Number(bar.stock_length_mm) || 1;
  const refStock = Number(referenceStockMm) || stockLength;
  const barW = Math.max(36, maxBarW * Math.min(1, Math.max(0.08, stockLength / refStock)));
  const scale = barW / stockLength;
  const yTop = barY; // far edge (h = H, "üst")
  const yBot = barY + barH; // near edge (h = 0, "alt")

  ctx.clearRect(0, 0, W, H);

  // Reference envelope for the longest stock in the group
  ctx.fillStyle = '#f8f9fb';
  ctx.beginPath();
  ctx.roundRect(barX, barY, maxBarW, barH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.05)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Bar background = scrap (hatched); pieces get painted on top.
  ctx.fillStyle = '#e4e7ea';
  ctx.fillRect(barX, barY, barW, barH);
  hatch(ctx, barX, barY, barW, barH);

  const cuts = (bar.cuts || []) as BarCut[];
  const hitBoxes: { x: number; y: number; w: number; h: number; cut: BarCut }[] = [];

  cuts.forEach((cut, idx) => {
    const faces = pieceFacesMm(cut);
    const xLN = barX + faces.left[0] * scale; // left near (bottom)
    const xLF = barX + faces.left[1] * scale; // left far (top)
    const xRN = barX + faces.right[0] * scale;
    const xRF = barX + faces.right[1] * scale;

    ctx.fillStyle = colorForIndex(idx);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xLN, yBot);
    ctx.lineTo(xLF, yTop);
    ctx.lineTo(xRF, yTop);
    ctx.lineTo(xRN, yBot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const x0 = barX + (Number(cut.offset_mm) || 0) * scale;
    const x1 =
      barX +
      Number(cut.end_mm ?? (cut.offset_mm || 0) + (cut.nominal_mm ?? cut.effective_mm ?? 0)) *
        scale;
    const w = x1 - x0;
    hitBoxes.push({ x: x0, y: yTop, w, h: barH, cut });

    const cx = (xLN + xLF + xRF + xRN) / 4;
    if (w > 46) {
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const marks = `${cut.flipped ? '↻' : ''}${cut.requires_bending ? '⌒' : ''}`;
      ctx.fillText(
        `${idx + 1}${marks ? ' ' + marks : ''} · ${cut.nominal_mm ?? ''}`,
        cx,
        barY + barH / 2,
      );
    } else if (w > 14) {
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), cx, barY + barH / 2);
    }
    ctx.textAlign = 'start';
  });

  // Saw passes as blade bands (+ angle labels above)
  const passes = (bar.passes || []) as BarPass[];
  passes.forEach((p) => {
    const blade = (Number(p.blade_axial_mm) || kerfAxialMm(kerfMm, p.angle_deg)) * scale;
    const dir = p.kind === 'lead' ? -1 : 1; // lead pass: band left of the plane
    const nx = barX + (Number(p.x_near_mm) || 0) * scale;
    const fx = barX + (Number(p.x_far_mm) || 0) * scale;
    ctx.fillStyle = 'rgba(20,24,28,.55)';
    ctx.beginPath();
    ctx.moveTo(nx, yBot);
    ctx.lineTo(fx, yTop);
    ctx.lineTo(fx + dir * blade, yTop);
    ctx.lineTo(nx + dir * blade, yBot);
    ctx.closePath();
    ctx.fill();

    if (Math.abs(Number(p.angle_deg) || 0) >= ANGLE_TOL_DEG && barW / (passes.length || 1) > 34) {
      ctx.fillStyle = '#495057';
      ctx.font = '600 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${Math.round(Math.abs(Number(p.angle_deg)) * 100) / 100}°`,
        (nx + fx) / 2,
        barY - 4,
      );
      ctx.textAlign = 'start';
    }
  });

  // Outer border + remnant marker
  ctx.strokeStyle = bar.is_remnant ? '#b98900' : 'rgba(0,0,0,.25)';
  ctx.lineWidth = bar.is_remnant ? 1.5 : 1;
  ctx.strokeRect(barX, barY, barW, barH);

  // Axis labels
  ctx.fillStyle = '#6c757d';
  ctx.font = '10px system-ui';
  ctx.textBaseline = 'top';
  ctx.fillText('0', barX, 6);
  const endLabel = `${stockLength} mm`;
  ctx.fillText(endLabel, barX + barW - ctx.measureText(endLabel).width, 6);

  // Waste label at the tail
  const wasteMm = Number(bar.waste_mm) || 0;
  const wasteW = wasteMm * scale;
  if (wasteW > 40) {
    ctx.fillStyle = '#6c757d';
    ctx.font = 'italic 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`Fire ${wasteMm} mm`, barX + barW - wasteW / 2, barY + barH + 4);
    ctx.textAlign = 'start';
  }

  if (tooltipEl) {
    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      const hb = hitBoxes.find((h) => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);
      if (!hb) {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = 'default';
        return;
      }
      canvas.style.cursor = 'help';
      tooltipEl.innerHTML = buildCutTooltipHtml(hb.cut);
      tooltipEl.style.left = `${e.clientX + 14}px`;
      tooltipEl.style.top = `${e.clientY + 12}px`;
      tooltipEl.style.display = 'block';
    };
    canvas.onmouseleave = () => {
      tooltipEl.style.display = 'none';
      canvas.style.cursor = 'default';
    };
  }
}
