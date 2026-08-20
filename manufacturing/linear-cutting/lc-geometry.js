/**
 * Shared geometry + drawing helpers for the Linear Cutting module.
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
 * Both cuts.js and tasks.js must use `drawBarCanvas` from here — do not
 * duplicate bar-drawing code in the pages.
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
    'Açılı uç, resimdekinin ters ucunda kesilir. Kesimde ek bir işlem yoktur — '
    + 'simetrik profilde (boru, lama) parça birebir aynıdır, asimetrik profilde '
    + 'ayna görüntüsü olur.';

const PALETTE = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#20c997', '#dc3545', '#0dcaf0', '#b58900'];

export function colorForIndex(i) {
    return PALETTE[i % PALETTE.length];
}

export function recessMm(angleDeg, heightMm) {
    const a = Math.abs(Number(angleDeg) || 0);
    const h = Number(heightMm) || 0;
    if (a < ANGLE_TOL_DEG || h <= 0) return 0;
    return h * Math.tan(a * Math.PI / 180);
}

/**
 * Signed miter angle from the corner offset of an end face — the "köşe farkı"
 * a drawing gives when it dimensions lengths instead of angles. Inverse of
 * `setbackFromAngle`. Returns null when the profile dimension is unknown
 * (the angle is then underdetermined).
 * Mirrors angle_from_setback() in the backend geometry module.
 */
export function angleFromSetback(setbackMm, heightMm) {
    const h = Number(heightMm) || 0;
    if (h <= 0) return null;
    const t = Number(setbackMm) || 0;
    const a = Math.atan(Math.abs(t) / h) * 180 / Math.PI;
    return t >= 0 ? a : -a;
}

/** Signed corner offset of a miter — inverse of `angleFromSetback`. */
export function setbackFromAngle(angleDeg, heightMm) {
    const t = recessMm(angleDeg, heightMm);
    return (Number(angleDeg) || 0) >= 0 ? t : -t;
}

export function kerfAxialMm(kerfMm, angleDeg) {
    const a = Math.abs(Number(angleDeg) || 0);
    const k = Number(kerfMm) || 0;
    if (a < ANGLE_TOL_DEG) return k;
    return k / Math.cos(a * Math.PI / 180);
}

/** Recess of an end face at [near (h=0), far (h=H)]. */
export function endRecessProfile(angleDeg, heightMm) {
    const t = recessMm(angleDeg, heightMm);
    if (t === 0) return [0, 0];
    return (Number(angleDeg) > 0) ? [0, t] : [t, 0];
}

/** Absolute face segments of a placed cut: {left:[xNear,xFar], right:[xNear,xFar]} (mm). */
export function pieceFacesMm(cut) {
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

export function formatAngleTr(angleDeg) {
    const a = Number(angleDeg) || 0;
    if (Math.abs(a) < ANGLE_TOL_DEG) return '0°';
    const mag = `${Math.round(Math.abs(a) * 100) / 100}°`;
    return a > 0 ? `${mag} (alt uzun)` : `${mag} (üst uzun)`;
}

/**
 * Pass angle with the physical lean of the cut plane (the direction the
 * plane leans toward the far/"üst" edge) — what the operator sets on the saw.
 */
export function formatPassAngle(pass) {
    const a = Number(pass?.angle_deg) || 0;
    if (Math.abs(a) < ANGLE_TOL_DEG) return '0°';
    const near = Number(pass?.x_near_mm) || 0;
    const far = Number(pass?.x_far_mm) || 0;
    const side = far > near ? 'sağa' : 'sola';
    return `${Math.round(Math.abs(a) * 100) / 100}° ${side}`;
}

export function passKindLabel(kind) {
    switch (kind) {
        case 'lead': return 'Baş kesim';
        case 'shared': return 'Ortak kesim';
        case 'end': return 'Parça ayırma';
        default: return kind || '—';
    }
}

export function longPointLabel(lp) {
    switch (lp) {
        case 'near': return 'alt uzun';
        case 'far': return 'üst uzun';
        default: return 'düz';
    }
}

function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────── Piece pictogram (SVG) ───────────────────────────

function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

/**
 * Scale drawing of a piece, built from its real dimensions.
 *
 * `spec` = {nominal_length_mm, profile_height_mm, angle_left_deg, angle_right_deg}
 * (`nominal_mm` is accepted as an alias, so placed cuts can be drawn too).
 *
 * Angles are ALWAYS exact: each slant is tan(a) × the drawn profile height, so
 * the on-screen angle equals the real one at any scale. Length is to scale as
 * well, until the piece is more slender than `maxAspect` — past that the length
 * axis alone is compressed (angles untouched) so that a 6000 × 50 mm bar does
 * not render as a hairline. Compression is stated in the tooltip.
 *
 * Impossible geometry (the two end faces crossing inside the profile — what
 * validate_piece rejects on the backend) is drawn in red instead of silently
 * folding the polygon inside out.
 *
 * opts: {width, height, pad, maxAspect, dimensions}
 */
export function piecePictogramSVG(spec, opts = {}) {
    const W = opts.width ?? 96;
    const H = opts.height ?? 34;
    const withDims = !!opts.dimensions;
    // Dimension lines live outside the shape — reserve room for them.
    const padX = opts.pad ?? (withDims ? 46 : 3);
    const padTop = opts.pad ?? (withDims ? 22 : 3);
    const padBot = opts.pad ?? (withDims ? 26 : 3);
    const maxAspect = opts.maxAspect ?? 7;

    const L = Number(spec.nominal_length_mm ?? spec.nominal_mm) || 0;
    const h = Number(spec.profile_height_mm) || 0;
    const aL = Number(spec.angle_left_deg) || 0;
    const aR = Number(spec.angle_right_deg) || 0;

    const boxW = Math.max(8, W - 2 * padX);
    const boxH = Math.max(6, H - padTop - padBot);

    const frame = (inner, title) =>
        `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
            <title>${esc(title)}</title>${inner}
        </svg>`;

    if (!(L > 0)) {
        return frame(
            `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="middle"
                   font-size="10" fill="#adb5bd">boy girin</text>`,
            'Uzunluk girilmedi'
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
    const yTop = padTop + (boxH - hPx) / 2;   // far edge (h = H, "üst")
    const yBot = yTop + hPx;                  // near edge (h = 0, "alt")

    const slantPx = (deg) => {
        const a = Math.abs(Number(deg) || 0);
        if (a < ANGLE_TOL_DEG || !known) return 0;
        return Math.tan(a * Math.PI / 180) * hPx;
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
    // Shortest length that still leaves both edges non-negative — the number
    // the operator actually needs when the angles will not fit.
    const minLengthMm = round2(Math.max(
        (aL < 0 ? tL : 0) + (aR < 0 ? tR : 0),
        (aL > 0 ? tL : 0) + (aR > 0 ? tR : 0),
    ));

    const titleParts = [
        `Boy ${L} mm (uzun kenar)`,
        known ? `Kesit ${h} mm` : 'Kesit girilmedi',
        `Sol: ${formatAngleTr(aL)}${tL ? ` · köşe farkı ${tL} mm` : ''}`,
        `Sağ: ${formatAngleTr(aR)}${tR ? ` · köşe farkı ${tR} mm` : ''}`,
    ];
    if (impossible) {
        titleParts.push(
            `⚠ Bu boy bu açılara yetmiyor — kesim yüzeyleri kesişiyor. `
            + `Bu açılarla en az ${minLengthMm} mm gerekir.`);
    } else if (compressed) titleParts.push('Çizim: açılar birebir, boy sıkıştırılmış.');
    else if (!known) titleParts.push('Çizim: kesit bilinmediği için ölçekli değil.');
    const title = titleParts.join(' · ');

    let inner;
    if (impossible) {
        // Drawing the polygon would fold it inside out into a bow tie, which
        // reads as a broken renderer rather than as bad data. Show the
        // bounding box struck through instead, and say what is wrong.
        inner = `<rect x="${x0}" y="${yTop}" width="${wPx}" height="${hPx}"
                    fill="#f8d7da" fill-opacity=".55" stroke="#b02a37"
                    stroke-width="1" stroke-dasharray="4 3"/>
                 <line x1="${x0}" y1="${yTop}" x2="${x1}" y2="${yBot}" stroke="#b02a37" stroke-width="1"/>
                 <line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yTop}" stroke="#b02a37" stroke-width="1"/>`;
    } else {
        inner = `<polygon points="${blx},${yBot} ${tlx},${yTop} ${trx},${yTop} ${brx},${yBot}"
                     fill="#7aa5d8" fill-opacity=".45" stroke="#39587c" stroke-width="1"
                     stroke-linejoin="round"/>`;
        // A compressed drawing must not be mistaken for a scale one.
        if (compressed && !withDims) {
            inner += `<text x="${x1}" y="${yTop - 1.5}" text-anchor="end"
                            font-size="8" fill="#adb5bd">≉</text>`;
        }
    }

    if (withDims) {
        const dim = (x1_, y1_, x2_, y2_) =>
            `<line x1="${x1_}" y1="${y1_}" x2="${x2_}" y2="${y2_}"
                   stroke="#adb5bd" stroke-width="1"/>`;
        const label = (x, y, text, anchor = 'middle') =>
            `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="10" fill="#6c757d">${esc(text)}</text>`;

        // Must stay inside padBot even when the shape fills the full box height.
        const dimY = yBot + 9;
        inner += dim(x0, dimY, x1, dimY)
            + dim(x0, dimY - 3, x0, dimY + 3)
            + dim(x1, dimY - 3, x1, dimY + 3)
            + label((x0 + x1) / 2, dimY + 11, `${L} mm${compressed ? ' (boy sıkıştırılmış)' : ''}`);

        if (known) {
            const dimX = x0 - 10;
            inner += dim(dimX, yTop, dimX, yBot)
                + dim(dimX - 3, yTop, dimX + 3, yTop)
                + dim(dimX - 3, yBot, dimX + 3, yBot)
                + label(dimX - 5, (yTop + yBot) / 2 + 3, `${h}`, 'end');
        }

        if (impossible) {
            // The corner offsets have nowhere sensible to sit on a shape that
            // cannot exist — say what would make it exist instead.
            inner += `<text x="${(x0 + x1) / 2}" y="${yTop - 7}" text-anchor="middle"
                            font-size="10" fill="#b02a37" font-weight="600"
                            >Açılar bu boya sığmıyor — en az ${minLengthMm} mm</text>`;
        } else {
            // Corner offsets: the drawing dimension the angle is derived from.
            if (tL) inner += label((x0 + Math.max(tlx, blx)) / 2, yTop - 7, `Δ${tL}`);
            if (tR) inner += label((x1 + Math.min(trx, brx)) / 2, yTop - 7, `Δ${tR}`);
        }

        // Which edge is which — the sign of every angle is read off these.
        inner += label(x1 + 5, yTop + 3, 'üst', 'start')
            + label(x1 + 5, yBot + 3, 'alt', 'start');
    }

    return frame(inner, title);
}

// ─────────────────────────── Tooltip ───────────────────────────

export function buildCutTooltipHtml(cut) {
    const rows = [];
    rows.push(`<div style="font-weight:700;margin-bottom:4px;">${esc(cut.label || '—')}${cut.flipped ? ` <span title="${FLIPPED_TITLE}">↻</span>` : ''}</div>`);
    rows.push(`<div><span style="opacity:.7">Boy (uzun kenar):</span> ${cut.nominal_mm ?? cut.effective_mm ?? '—'} mm</div>`);
    rows.push(`<div><span style="opacity:.7">Sol açı:</span> ${formatAngleTr(cut.angle_left_deg)}</div>`);
    rows.push(`<div><span style="opacity:.7">Sağ açı:</span> ${formatAngleTr(cut.angle_right_deg)}</div>`);
    rows.push(`<div><span style="opacity:.7">Başlangıç:</span> ${cut.offset_mm ?? '—'} mm</div>`);
    if (cut.shared_left || cut.shared_right) {
        const sides = [cut.shared_left ? 'sol' : null, cut.shared_right ? 'sağ' : null].filter(Boolean).join(' + ');
        rows.push(`<div><span style="opacity:.7">Ortak kesim:</span> ${sides}</div>`);
    }
    if (cut.requires_bending) rows.push(`<div style="color:#ffc107;">Büküm var — boy açınım boyudur</div>`);
    if (cut.job_no) rows.push(`<div><span style="opacity:.7">İş No:</span> ${esc(cut.job_no)}</div>`);
    return rows.join('');
}

// ─────────────────────────── Bar canvas renderer ───────────────────────────

function hatch(ctx, x, y, w, h, step = 7) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
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

/**
 * Draw one bar layout onto `canvas`.
 *
 * bar: {stock_length_mm, waste_mm, is_remnant, cuts:[...], passes:[...]}
 * opts: {kerfMm, referenceStockMm, tooltipEl}
 *
 * Pieces are drawn as their true quadrilaterals; everything of the bar not
 * covered by a piece (wedges, kerf, end leftover) shows as hatched scrap.
 * Saw passes (if present) are drawn as dark blade bands.
 */
export function drawBarCanvas(canvas, bar, opts = {}) {
    const { kerfMm = 0, referenceStockMm = null, tooltipEl = null } = opts;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 900;
    const H = 74;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const pad = 8, barY = 24, barH = 30;
    const barX = pad;
    const maxBarW = W - pad * 2;
    const stockLength = Number(bar.stock_length_mm) || 1;
    const refStock = Number(referenceStockMm) || stockLength;
    const barW = Math.max(36, maxBarW * Math.min(1, Math.max(0.08, stockLength / refStock)));
    const scale = barW / stockLength;
    const yTop = barY;              // far edge (h = H, "üst")
    const yBot = barY + barH;       // near edge (h = 0, "alt")

    ctx.clearRect(0, 0, W, H);

    // Reference envelope for the longest stock in the group
    ctx.fillStyle = '#f8f9fb';
    ctx.beginPath(); ctx.roundRect(barX, barY, maxBarW, barH, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.lineWidth = 1; ctx.stroke();

    // Bar background = scrap (hatched); pieces get painted on top.
    ctx.fillStyle = '#e4e7ea';
    ctx.fillRect(barX, barY, barW, barH);
    hatch(ctx, barX, barY, barW, barH);

    const cuts = bar.cuts || [];
    const hitBoxes = [];

    cuts.forEach((cut, idx) => {
        const faces = pieceFacesMm(cut);
        const xLN = barX + faces.left[0] * scale;    // left near (bottom)
        const xLF = barX + faces.left[1] * scale;    // left far (top)
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
        ctx.fill(); ctx.stroke();

        const x0 = barX + (Number(cut.offset_mm) || 0) * scale;
        const x1 = barX + (Number(cut.end_mm ?? ((cut.offset_mm || 0) + (cut.nominal_mm ?? cut.effective_mm ?? 0)))) * scale;
        const w = x1 - x0;
        hitBoxes.push({ x: x0, y: yTop, w, h: barH, cut });

        const cx = (xLN + xLF + xRF + xRN) / 4;
        if (w > 46) {
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.font = '600 11px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const marks = `${cut.flipped ? '↻' : ''}${cut.requires_bending ? '⌒' : ''}`;
            ctx.fillText(`${idx + 1}${marks ? ' ' + marks : ''} · ${cut.nominal_mm ?? ''}`, cx, barY + barH / 2);
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
    const passes = bar.passes || [];
    passes.forEach(p => {
        const blade = (Number(p.blade_axial_mm) || kerfAxialMm(kerfMm, p.angle_deg)) * scale;
        const dir = p.kind === 'lead' ? -1 : 1;   // lead pass: band left of the plane
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
            ctx.fillText(`${Math.round(Math.abs(p.angle_deg) * 100) / 100}°`, (nx + fx) / 2, barY - 4);
            ctx.textAlign = 'start';
        }
    });

    // Outer border + remnant marker
    ctx.strokeStyle = bar.is_remnant ? '#b98900' : 'rgba(0,0,0,.25)';
    ctx.lineWidth = bar.is_remnant ? 1.5 : 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Axis labels
    ctx.fillStyle = '#6c757d'; ctx.font = '10px system-ui'; ctx.textBaseline = 'top';
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
        canvas.onmousemove = e => {
            const r = canvas.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const hb = hitBoxes.find(h => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);
            if (!hb) { tooltipEl.style.display = 'none'; canvas.style.cursor = 'default'; return; }
            canvas.style.cursor = 'help';
            tooltipEl.innerHTML = buildCutTooltipHtml(hb.cut);
            tooltipEl.style.left = `${e.clientX + 14}px`;
            tooltipEl.style.top = `${e.clientY + 12}px`;
            tooltipEl.style.display = 'block';
        };
        canvas.onmouseleave = () => { tooltipEl.style.display = 'none'; canvas.style.cursor = 'default'; };
    }
}

// ─────────────────────────── Pass table (operator contract) ───────────────────────────

/**
 * HTML table of saw passes: angle, stop distances (dial these on the length
 * stop, measured from the fresh edge of the remaining bar), released piece.
 */
export function buildPassTableHtml(passes) {
    if (!Array.isArray(passes) || !passes.length) return '';
    const rows = passes.map(p => `
        <tr>
            <td class="text-center fw-bold">${p.seq}</td>
            <td>${passKindLabel(p.kind)}</td>
            <td class="text-center" title="Yön: kesim çizgisinin üst kenara doğru yattığı taraf">${formatPassAngle(p)}</td>
            <td class="text-end">${p.stop_near_mm ?? '—'}</td>
            <td class="text-end">${p.stop_far_mm ?? '—'}</td>
            <td>${p.releases ? esc(p.releases) : '<span class="text-muted">fire parçası</span>'}</td>
        </tr>`).join('');
    return `
        <div class="table-responsive">
            <table class="table table-sm table-bordered align-middle mb-0" style="font-size:.85rem;">
                <thead class="table-light">
                    <tr>
                        <th class="text-center" style="width:44px;">Kesim</th>
                        <th>Tür</th>
                        <th class="text-center">Açı</th>
                        <th class="text-end" title="Kalan barın taze kenarından, alt (yakın) kenar boyunca ölçü">Ayar Alt (mm)</th>
                        <th class="text-end" title="Kalan barın taze kenarından, üst (uzak) kenar boyunca ölçü">Ayar Üst (mm)</th>
                        <th>Çıkan Parça</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="text-muted mt-1" style="font-size:.75rem;">
                Tür — <strong>Ortak kesim:</strong> tek geçiş iki parçaya hizmet eder (bıçağın iki tarafı da parça).
                <strong>Parça ayırma:</strong> parçayı bitirir; kesimin öbür tarafı parça yüzeyi değildir.
                <strong>Baş kesim:</strong> parça çıkmaz, sonraki parçanın yüzeyini hazırlar (çıkan küçük parça firedir).
            </div>
        </div>`;
}
