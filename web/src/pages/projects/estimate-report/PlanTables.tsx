import type { ReactNode } from 'react';
import {
  MACHINE_LABELS,
  MACHINING_KIND_LABELS,
  PART_KIND_LABELS,
  SUB_ASSEMBLY_KIND_LABELS,
  TOLERANCE_LABELS,
} from '@/api/projects/estimator';
import {
  Badge,
  centreColour,
  ConfidencePill,
  JOINT_TYPE_LABELS,
  MATERIAL_LABELS,
  ShareBar,
  SourcePill,
} from './reportParts';
import { fmt, planGroups, planParts, UNIT_LABELS, type Payload, type PlanGroup, type PlanPart, type PlanSub } from './reportModel';

// The manufacturing-plan tables (v5): the plan grouped by work centre and the
// parts / sub-assemblies list. Shared by the Tahmin card and the Referanslar
// weld-list modal (legacy planTableHtml / planPartsHtml).

const PREP_LABELS: Record<string, string> = { I: 'I alın', V: 'V ağız', HV: 'Yarım V', X: 'X ağız', K: 'K ağız', U: 'U ağız', fillet: 'köşe' };

function unitText(unitH: number | null | undefined, unit: string | undefined, averaged = false): ReactNode {
  if (unitH == null) return 'karışık';
  const text = `${fmt(unitH, unitH < 0.1 ? 4 : 2)} ${UNIT_LABELS[unit ?? ''] || unit || ''}`;
  return averaged ? <span title="Birleşimlerin kendi geometrisinden; grup ortalaması">ort. {text}</span> : text;
}

function qtyText(q: unknown, unit: string | undefined): string {
  if (unit === 'h/m') return `${fmt(q, 1)} m`;
  if (unit === 'h/kg') return `${fmt(q, 0)} kg`;
  if (unit === 'h/t') return `${fmt(q, 2)} t`;
  if (unit === 'oran') return `%${fmt(Number(q) * 100, 0)}`;
  return fmt(q, 0);
}

interface PlanRow {
  cls?: string;
  label: ReactNode;
  driver?: ReactNode;
  unitHtml?: ReactNode;
  hours?: number | null;
  source?: ReactNode;
  off?: boolean;
  extra?: ReactNode;
}

/** The plan rows of one work centre: welding groups, the other steps, the machining parts with their features. */
function PlanGroupBlock({ g, planTotal }: { g: PlanGroup; planTotal: number }) {
  const total = planTotal || 1;
  const rows: PlanRow[] = [];
  g.welding.forEach((w) => {
    const th = w.thickness.length
      ? ` ${w.thickness.length === 1 ? fmt(w.thickness[0], 0) : `${fmt(w.thickness[0], 0)}–${fmt(w.thickness[w.thickness.length - 1], 0)}`} mm`
      : '';
    rows.push({
      label: (
        <>
          Kaynak · {JOINT_TYPE_LABELS[w.joint_type ?? ''] || w.joint_type || ''}{' '}
          <span className="est-muted">
            {MATERIAL_LABELS[w.material ?? ''] || w.material || ''}
            {w.prep ? ` · ${PREP_LABELS[w.prep] || w.prep}${th}` : ''}
          </span>
        </>
      ),
      driver: (
        <>
          {fmt(w.qty, 1)} m{w.joints ? ` · ${fmt(w.joints, 0)} birleşim` : ''}
          {w.sub_ids.length ? (
            <>
              {' '}
              <span className="est-muted">· {w.sub_ids.join(', ')}</span>
            </>
          ) : null}
        </>
      ),
      unitHtml: unitText(w.unit_h, w.unit, w.averaged),
      hours: w.hours,
      source: w.source ? <SourcePill source={w.source} /> : null,
    });
  });
  if (g.machining) {
    const mc = g.machining;
    const ml = g.machiningLine;
    rows.push({
      cls: 'est-plan-head',
      label: <strong>{ml?.label || 'Talaşlı imalat'}</strong>,
      driver: ml?.driver || `${mc.partsCount} parça numarası, ${mc.featuresCount} özellik`,
      unitHtml: null,
      hours: mc.machiningH,
      source: mc.defaultsCount ? (
        <Badge cls="status-grey" title="Ölçüsüz özellik: makinenin kayıtlı operasyon medyanı kullanıldı">
          {mc.defaultsCount} varsayılan
        </Badge>
      ) : null,
    });
    mc.parts.forEach((p) => {
      rows.push({
        cls: 'est-plan-part',
        label: (
          <>
            {p.part}{' '}
            <span className="est-muted">
              ×{fmt(p.qty, 0)}
              {p.subId ? ` · ${p.subId}` : ''}
            </span>
          </>
        ),
        driver: [
          p.massKgEach != null ? `${fmt(p.massKgEach, 0)} kg/parça` : '',
          p.setups.length ? `bağlama: ${p.setups.map((s) => MACHINE_LABELS[s] || s).join(', ')}` : '',
          p.setupH != null ? `ayar ${fmt(p.setupH, 2)} h` : '',
          p.programmingH != null && p.programmingH ? `program ${fmt(p.programmingH, 2)} h` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        unitHtml: p.perPieceH != null ? `${fmt(p.perPieceH, 2)} h/parça` : null,
        hours: p.hours,
        source: p.deducedCount ? (
          <span className="est-muted small">
            {p.deducedCount}/{p.featureCount} çıkarım
          </span>
        ) : null,
      });
      p.features.forEach((f) => {
        const kind = MACHINING_KIND_LABELS[f.kind ?? ''] || f.kind || '';
        const tol = f.tolerance && f.tolerance !== 'general' ? ` · ${TOLERANCE_LABELS[f.tolerance] || f.tolerance}` : '';
        rows.push({
          cls: 'est-plan-feat',
          label: (
            <span className="est-plan-indent">
              {kind}{' '}
              <span className="est-muted">
                ×{fmt(f.qty, 0)} · {MACHINE_LABELS[f.machine ?? ''] || f.machine || ''}
                {tol}
              </span>
            </span>
          ),
          driver: f.text ? <span className="est-muted">{f.text}</span> : null,
          unitHtml: f.hEach != null ? `${fmt(f.hEach, 3)} h/özellik` : null,
          hours: f.hoursPiece != null ? f.hoursPiece * p.qty : null,
          source: <SourcePill source={f.source} />,
          extra: (
            <>
              {f.isDefault ? (
                <>
                  {' '}
                  <Badge cls="status-grey" title="Ölçü yok: makinenin kayıtlı operasyon medyanı">
                    varsayılan
                  </Badge>
                </>
              ) : null}
              {f.afterWelding ? (
                <>
                  {' '}
                  <span className="est-plan-note" title="Kaynaklı alt montaj üzerinde işlenir">
                    kaynak sonrası
                  </span>
                </>
              ) : null}
            </>
          ),
        });
      });
    });
  }
  g.lines.forEach((l) => {
    const off = !l.applies;
    const unitH = Number(l.unit_h);
    rows.push({
      label: l.label,
      driver: (
        <>
          {l.driver || ''}
          {off ? (
            <>
              {' '}
              <span className="est-muted">— uygulanmaz</span>
            </>
          ) : null}
        </>
      ),
      unitHtml: off ? null : (
        <>
          {l.unit === 'oran' ? `${fmt(l.unit_h, 1)} h × oran` : `${fmt(l.unit_h, unitH < 0.1 ? 4 : 2)} ${UNIT_LABELS[l.unit ?? ''] || l.unit || ''}`}
          {l.qty != null ? (
            <>
              {' '}
              <span className="est-muted">· {qtyText(l.qty, l.unit)}</span>
            </>
          ) : null}
        </>
      ),
      hours: l.hours,
      off,
    });
  });
  return (
    <details className="est-more est-plan-group" open={g.hours > 0}>
      <summary>
        <i className="est-dot-c" style={{ background: centreColour(g.key) }} />
        {g.label}
        <span className="est-plan-sum">
          <strong>{fmt(g.hours, 1)} h</strong> · %{fmt(g.share * 100, 0)}
        </span>
      </summary>
      <div className="est-table-wrap">
        <table className="est-table est-plan-table">
          <thead>
            <tr>
              <th>İşlem</th>
              <th>Sürücü</th>
              <th className="num">Birim süre</th>
              <th className="num">Saat</th>
              <th>Kaynak</th>
              <th className="est-share-cell">Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, i) => (
                <tr key={i} className={`${r.cls ?? ''}${r.off ? ' is-zero' : ''}`}>
                  <td className="est-plan-op">{r.label}</td>
                  <td className="est-plan-driver">{r.driver}</td>
                  <td className="num est-nowrap est-muted">{r.unitHtml}</td>
                  <td className="num">{r.off ? '—' : fmt(r.hours, 1)}</td>
                  <td className="est-plan-src">
                    {r.source}
                    {r.extra}
                  </td>
                  <td className="est-share-cell">
                    {r.off || !r.hours ? null : <ShareBar part={r.hours} total={total} colour={centreColour(g.key)} />}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="est-muted">
                  Bu merkezde iş yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** The plan table grouped by work centre; `planTotal` is the total the share bars divide by. */
export function PlanGroups({ groups, planTotal }: { groups: PlanGroup[]; planTotal: number }) {
  return (
    <div className="est-plan">
      {groups.map((g) => (
        <PlanGroupBlock key={g.key} g={g} planTotal={planTotal} />
      ))}
    </div>
  );
}

/** The whole plan table (every work centre) of a v5 bottom-up, for the Referanslar modal; nothing for older shapes. */
export function PlanTable({ bottomUp }: { bottomUp: Payload }) {
  const groups = planGroups(bottomUp);
  if (!groups.length) return null;
  return <PlanGroups groups={groups} planTotal={Number(bottomUp?.total_h) || 0} />;
}

function FeatureList({ part }: { part: PlanPart }) {
  if (!part.machiningCount) return <span className="est-muted">—</span>;
  return (
    <details className="est-plan-feats">
      <summary>{part.machiningCount} talaşlı özellik</summary>
      <ul className="est-plain-list">
        {part.machining.map((f, i) => (
          <li key={i}>
            {MACHINING_KIND_LABELS[f.kind ?? ''] || f.kind || ''} ×{fmt(f.qty ?? 1, 0)} · {MACHINE_LABELS[f.machine ?? ''] || f.machine || ''}
            {f.tolerance && f.tolerance !== 'general' ? ` · ${TOLERANCE_LABELS[f.tolerance] || f.tolerance}` : ''}
            {f.text ? ` · ${f.text}` : ''} <SourcePill source={f.source || 'drawn'} />
            {f.after_welding ? (
              <>
                {' '}
                <span className="est-plan-note">kaynak sonrası</span>
              </>
            ) : null}
            {f.note ? (
              <>
                {' '}
                <span className="est-muted">— {f.note}</span>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PartRow({ x }: { x: PlanPart }) {
  return (
    <tr className="est-plan-part">
      <td className="est-plan-indent">
        {x.name}
        <span className="est-muted"> · {x.partId}</span>
      </td>
      <td>{PART_KIND_LABELS[x.kind] || x.kind || ''}</td>
      <td className="num">{fmt(x.qty, 0)}</td>
      <td className="num">{x.massKgEach != null ? fmt(x.massKgEach, x.massKgEach < 10 ? 1 : 0) : '—'}</td>
      <td className="num">{x.thicknessMm ? fmt(x.thicknessMm, 0) : <span className="est-muted">—</span>}</td>
      <td>{x.material ? MATERIAL_LABELS[x.material] || x.material : <span className="est-muted">—</span>}</td>
      <td>
        <SourcePill source={x.source} />
        {x.basis ? (
          <small className="est-cell-sub" title={x.basis}>
            {x.basis}
          </small>
        ) : null}
      </td>
      <td>
        <FeatureList part={x} />
      </td>
    </tr>
  );
}

function SubRow({ s }: { s: PlanSub }) {
  return (
    <tr className="est-plan-sub">
      <td>
        <strong>{s.name}</strong>
        <span className="est-muted"> · {s.subId}</span>
        {s.mainDims ? (
          <small className="est-cell-sub">
            {s.mainDims}
            {s.governingT ? ` · t=${fmt(s.governingT, 0)} mm` : ''}
          </small>
        ) : null}
      </td>
      <td>
        {SUB_ASSEMBLY_KIND_LABELS[s.kind] || s.kind || ''}
        {s.welded ? null : (
          <>
            {' '}
            <span className="est-muted">· kaynaksız</span>
          </>
        )}
      </td>
      <td className="num">{fmt(s.qty, 0)}</td>
      <td className="num">{s.massKgEach != null ? fmt(s.massKgEach, 0) : '—'}</td>
      <td className="num" />
      <td>{s.material ? MATERIAL_LABELS[s.material] || s.material : ''}</td>
      <td>
        <SourcePill source={s.source} />
        {s.basis ? (
          <small className="est-cell-sub" title={s.basis}>
            {s.basis}
          </small>
        ) : null}
      </td>
      <td>
        güven {s.confidence == null ? <span className="est-muted">—</span> : <ConfidencePill value={s.confidence} />}
      </td>
    </tr>
  );
}

/** "Parçalar ve alt montajlar": the plan's sub-assemblies with their parts (machining feature counts, expandable features). */
export function PlanParts({ schedule }: { schedule: Payload }) {
  const p = planParts(schedule);
  if (!p.hasPlan) return null;
  const seen = new Set(p.subs.map((s) => s.subId));
  const loose = Object.entries(p.partsBySub).filter(([k]) => !seen.has(k));
  return (
    <details className="est-more est-plan-parts">
      <summary>
        Parçalar ve alt montajlar{' '}
        <span className="est-muted">
          · {p.subs.length} alt montaj, {p.parts.length} parça
          {p.machinedParts ? `, ${p.machinedParts} işlenen` : ''}
          {p.totalMassKg ? ` · ${fmt(p.totalMassKg, 0)} kg` : ''}
        </span>
      </summary>
      <div className="est-table-wrap">
        <table className="est-table est-parts">
          <thead>
            <tr>
              <th>Alt montaj / parça</th>
              <th>Tür</th>
              <th className="num">Adet</th>
              <th className="num">kg/adet</th>
              <th className="num">t mm</th>
              <th>Malzeme</th>
              <th>Kaynak</th>
              <th>Talaşlı</th>
            </tr>
          </thead>
          <tbody>
            {p.subs.map((s, i) => [
              <SubRow key={`s${i}`} s={s} />,
              ...(p.partsBySub[s.subId] || []).map((x, j) => <PartRow key={`s${i}p${j}`} x={x} />),
            ])}
            {loose.map(([k, parts]) => [
              <tr key={`l-${k}`} className="est-plan-sub">
                <td colSpan={8}>
                  {k ? (
                    <>
                      <strong>{k}</strong> <span className="est-muted">(alt montaj listede yok)</span>
                    </>
                  ) : (
                    <strong>Tek parçalar</strong>
                  )}
                </td>
              </tr>,
              ...parts.map((x, j) => <PartRow key={`l-${k}-${j}`} x={x} />),
            ])}
          </tbody>
        </table>
      </div>
    </details>
  );
}
