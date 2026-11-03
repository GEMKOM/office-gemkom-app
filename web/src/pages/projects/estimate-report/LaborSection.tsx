import type { ReactNode } from 'react';
import { BAND_STATUS, machiningExclusionLabel, STRUCTURE_CLASS_LABELS, WORK_CENTRE_SHORT } from '@/api/projects/estimator';
import { PlanGroups } from './PlanTables';
import {
  Badge,
  centreColour,
  FactorBadge,
  JobLink,
  JobLinks,
  JOINT_TYPE_LABELS,
  joinNodes,
  MATERIAL_LABELS,
  Md,
  money,
  RouteBadge,
  SchemaPill,
  Section,
  ShareBar,
  SimilarityCell,
} from './reportParts';
import {
  bandInfo,
  distributionRows,
  exclusionLabel,
  fmt,
  GEOMETRY_SOURCE_LABELS,
  hoursBreakdown,
  hoursInfo,
  planGroups,
  planInfo,
  UNIT_LABELS,
  type Band,
  type Distribution,
  type HoursBreakdown,
  type Payload,
  type PlanInfo,
  type ReportModel,
} from './reportModel';

// İşçilik (labour) section of a done report: the v3/v4 shape (unit times or
// joint geometry × reference factor) and the v5 manufacturing plan (work
// centres × centre factors). Port of the legacy laborSection /
// planLaborSection of report-view.js.

function range(lo: unknown, hi: unknown, digits: number, unit: string): string {
  return lo != null && hi != null ? `${fmt(lo, digits)} – ${fmt(hi, digits)} ${unit}`.trim() : '';
}

function Kpi({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="est-kpi">
      <span className="est-kpi-label">{label}</span>
      <span className="est-kpi-value">{value}</span>
      {sub ? <span className="est-kpi-sub">{sub}</span> : null}
    </div>
  );
}

function NoteLine({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="est-note-line">
      <i className={`fas ${icon}`} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="est-callout">
      <i className="fas fa-triangle-exclamation" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function ReportText({ sec }: { sec: ReportModel['sections']['iscilik'] }) {
  if (!sec) return null;
  return (
    <details className="est-more" open>
      <summary>
        Raporun işçilik hesabı ve gerekçeleri <span className="est-muted">({sec.num || '2.2'})</span>
      </summary>
      <Md text={sec.body} />
    </details>
  );
}

/** "Dışlanan referanslar" and the subcontract route's exclusions, grouped by reason. */
function Excluded({ h }: { h: Payload }) {
  const exIn: Payload[] = h.excluded?.in_house || [];
  const exSub: Payload[] = h.excluded?.subcontract || [];
  if (!exIn.length && !exSub.length) return null;
  const subGroups: Record<string, number> = {};
  exSub.forEach((x) => {
    const k = exclusionLabel(x.reason, x);
    subGroups[k] = (subGroups[k] || 0) + 1;
  });
  return (
    <div className="est-excluded">
      {exIn.length ? (
        <>
          <div className="est-sub-title">Dışlanan referanslar</div>
          <ul className="est-plain-list">
            {exIn.map((x, i) => (
              <li key={i}>
                <JobLink no={x.job_no} /> <span className="est-job-title">{x.title || ''}</span> — {exclusionLabel(x.reason, x)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {exSub.length ? (
        <details className="est-more">
          <summary>
            Taşeron rotası için dışlanan {exSub.length} referans:{' '}
            {Object.entries(subGroups)
              .map(([k, c]) => `${k} (${c})`)
              .join(', ')}
          </summary>
          <ul className="est-plain-list est-cols">
            {exSub.map((x, i) => (
              <li key={i}>
                <JobLink no={x.job_no} /> <span className="est-job-title">{x.title || ''}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function sameRefs(a: Payload, b: Payload): boolean {
  return JSON.stringify(a?.references_used) === JSON.stringify(b?.references_used) && a?.factor_mean === b?.factor_mean;
}

// ---------------------------------------------------------------- v3 / v4

function HoursTable({ b }: { b: HoursBreakdown }) {
  const total =
    b.total || b.welding.reduce((s, x) => s + x.hours, 0) + b.other.reduce((s, x) => s + (Number(x.hours) || 0), 0);
  const unitText = (unitH: number | null | undefined, unit: string | undefined, averaged: boolean): ReactNode => {
    if (unitH == null) return 'karışık';
    const text = `${fmt(unitH, unitH < 0.1 ? 4 : 2)} ${UNIT_LABELS[unit ?? ''] || unit || ''}`;
    return averaged ? <span title="Birleşimlerin kendi geometrisinden; grup ortalaması">ort. {text}</span> : text;
  };
  const qtyText = (q: unknown, unit: string | undefined) =>
    unit === 'h/m' ? `${fmt(q, 1)} m` : unit === 'h/kg' ? `${fmt(q, 0)} kg` : fmt(q, 0);
  const row = (
    key: string,
    label: ReactNode,
    qty: ReactNode,
    unitH: number | null | undefined,
    unit: string | undefined,
    hours: unknown,
    { averaged = false, off = false } = {},
  ) => (
    <tr key={key} className={off ? 'is-zero' : ''}>
      <td>{label}</td>
      <td className="num est-nowrap">{qty}</td>
      <td className="num est-nowrap est-muted">{unitText(unitH, unit, averaged)}</td>
      <td className="num">{off ? '—' : fmt(hours, 1)}</td>
      <td className="est-share-cell">{off ? null : <ShareBar part={hours} total={total} />}</td>
    </tr>
  );
  const notes: ReactNode[] = [];
  if (b.weldMetalKg != null)
    notes.push(
      <>
        kaynak metali <strong>{fmt(b.weldMetalKg, 1)} kg</strong>
      </>,
    );
  if (b.setupH != null)
    notes.push(
      <>
        birleşim hazırlığı (çatma, punta, hizalama) <strong>{fmt(b.setupH, 1)} h</strong> (kaynak saatine dahil)
      </>,
    );
  const defaults = Number(b.geometrySources?.default) || 0; // shown as the orange badge, not in the list
  const src = b.geometrySources ? Object.entries(b.geometrySources).filter(([k, n]) => n && k !== 'default') : [];
  const srcText = src.map(([k, n]) => `${fmt(n, 0)} ${GEOMETRY_SOURCE_LABELS[k] || k}`).join(', ') || (defaults ? 'hepsi' : '');
  return (
    <>
      <div className="est-sub-title">Saat dağılımı · 1 adet</div>
      <div className="est-table-wrap">
        <table className="est-table est-hours">
          <thead>
            <tr>
              <th>İş adımı</th>
              <th className="num">Miktar</th>
              <th className="num">Birim süre</th>
              <th className="num">Saat</th>
              <th className="est-share-cell">Pay</th>
            </tr>
          </thead>
          <tbody>
            {b.welding.map((g, i) =>
              row(
                `w${i}`,
                <>
                  Kaynak · {JOINT_TYPE_LABELS[g.joint_type ?? ''] || g.joint_type || ''}{' '}
                  <span className="est-muted">{MATERIAL_LABELS[g.material ?? ''] || g.material || ''}</span>
                </>,
                qtyText(g.qty, g.unit),
                g.unit_h,
                g.unit,
                g.hours,
                { averaged: g.averaged },
              ),
            )}
            {b.other.map((x, i) =>
              x.applies
                ? row(`o${i}`, x.label, qtyText(x.qty, x.unit), x.unit_h, x.unit, x.hours)
                : row(
                    `o${i}`,
                    <>
                      {x.label} <span className="est-muted">— basınçlı değil, uygulanmaz</span>
                    </>,
                    '—',
                    x.unit_h,
                    x.unit,
                    0,
                    { off: true },
                  ),
            )}
          </tbody>
          <tfoot>
            <tr className="est-total">
              <td colSpan={3}>Toplam</td>
              <td className="num">{fmt(total, 1)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {notes.length ? <NoteLine icon="fa-circle-info">{joinNodes(notes, ' · ')}</NoteLine> : null}
      {srcText ? (
        <NoteLine icon="fa-ruler-combined">
          Birleşim geometrisi: {srcText}
          {defaults ? (
            <>
              {' '}
              <Badge cls="status-orange" title="Et kalınlığı / ağız çizimden okunamadı; birleşim sınıfının varsayımı kullanıldı">
                {fmt(defaults, 0)} varsayılan
              </Badge>
            </>
          ) : null}
        </NoteLine>
      ) : null}
    </>
  );
}

/** The labour section, or nothing when the report has no hours. */
export function LaborSection({ r, m }: { r: Payload; m: ReportModel }) {
  const h = r.hours || {};
  const sec = m.sections.iscilik;
  const cal = h.calibration?.in_house;
  const bu = h.bottom_up || r.weld_schedule?.bottom_up;
  if (!cal && !bu && !sec) return null;
  const info = hoursInfo(h);
  if (info.plan) return <PlanLaborSection r={r} m={m} />;
  const kpis: ReactNode[] = [];
  if (bu?.total_h != null) {
    kpis.push(
      <Kpi
        key="bu"
        label={info.geometry ? 'Hesaplanan (geometriden)' : 'Hesaplanan (birim sürelerle)'}
        value={`${fmt(bu.total_h, 1)} h/adet`}
        sub={`kaynak ${fmt(bu.welding_h, 1)} + diğer ${fmt(bu.non_welding_h, 1)}`}
      />,
    );
  }
  if (cal) {
    if (info.noInHouseRef) {
      kpis.push(
        <Kpi
          key="factor"
          label="Kalibrasyon faktörü"
          value={
            <>
              1,00{' '}
              <Badge cls="status-orange" title="Kullanılabilir iç imalat referansı yok">
                referans yok
              </Badge>
            </>
          }
          sub="hesaplanan saat aynen alındı"
        />,
      );
    } else {
      const flag = cal.factor_mean != null && (cal.factor_mean < 0.6 || cal.factor_mean > 1.6);
      kpis.push(
        <Kpi
          key="factor"
          label="Kalibrasyon faktörü"
          value={
            <>
              {fmt(cal.factor_mean, 2)}
              {flag ? (
                <>
                  {' '}
                  <Badge cls="status-orange" title="Olağan aralık 0,6–1,6; nedeni raporun 2.2 bölümünde">
                    aralık dışı
                  </Badge>
                </>
              ) : null}
            </>
          }
          sub={[range(cal.factor_min, cal.factor_max, 2, ''), `${(cal.references_used || []).length} referans`]
            .filter(Boolean)
            .join(' · ')}
        />,
      );
    }
    kpis.push(
      <Kpi
        key="expected"
        label="Beklenen saat"
        value={`${fmt(cal.expected_h_per_unit, 1)} h/adet`}
        sub={range(cal.low_h_per_unit, cal.high_h_per_unit, 1, 'h/adet') || (info.noInHouseRef ? 'aralık raporda varsayım (§2.2)' : '')}
      />,
    );
  }
  if (h.expected_h_total != null) {
    kpis.push(
      <Kpi
        key="total"
        label={`Toplam${m.quantity ? ` (${fmt(m.quantity, 0)} adet)` : ''}`}
        value={`${fmt(h.expected_h_total, 0)} h`}
        sub={range(h.low_h_total, h.high_h_total, 0, 'h')}
      />,
    );
  }
  const wage = h.labor_eur_per_h ?? r.inputs?.parameters?.labor_eur_per_h;
  if (wage != null) kpis.push(<Kpi key="wage" label="İşçilik ücreti" value={`${fmt(wage, 2)} €/h`} sub="referansların ortalaması" />);
  if (Number(h.machining_h_per_unit_references))
    kpis.push(
      <Kpi
        key="mach"
        label="Talaşlı (referans ort.)"
        value={`${fmt(h.machining_h_per_unit_references, 1)} h/adet`}
        sub="çizimden hesaplanmaz"
      />,
    );

  const refsUsed: string[] = cal?.references_used || [];
  const refPool: Payload[] = [...(h.references?.in_house || []), ...(h.references?.subcontract || [])];
  const refRows: Payload[] = refsUsed.map((no) => refPool.find((x) => x.job_no === no) || { job_no: no });
  // On the in-house route a partly subcontracted reference is compared on GEMKOM's share of the work.
  const inHouseHours = (x: Payload) => (x.bottom_up_in_house_h_per_unit != null ? x.bottom_up_in_house_h_per_unit : x.bottom_up_h_per_unit);

  const subCal = h.calibration?.subcontract;
  let subNote: ReactNode = null;
  if (subCal && !info.noInHouseRef && cal && sameRefs(subCal, cal)) {
    subNote = (
      <div className="est-note-line">
        <i className="fas fa-circle-info" aria-hidden />
        Taşeron rotası aynı referansları ve faktörü kullanır.
      </div>
    );
  } else if (subCal && subCal.factor_mean != null) {
    subNote = (
      <NoteLine icon="fa-circle-info">
        Taşeron rotası (GEMKOM&apos;da kalan saat): faktör {fmt(subCal.factor_mean, 2)}
        {subCal.factor_min != null ? ` (${fmt(subCal.factor_min, 2)} – ${fmt(subCal.factor_max, 2)})` : ''}, referanslar{' '}
        <JobLinks nos={subCal.references_used} />.
      </NoteLine>
    );
  }

  const breakdown = bu ? hoursBreakdown(bu) : null;
  return (
    <Section
      secKey="iscilik"
      title="İşçilik ve saat"
      sub={info.geometry ? 'birleşim geometrisinden saat × referans faktörü' : 'standart birim süre × referans faktörü'}
    >
      {kpis.length ? <div className="est-kpis">{kpis}</div> : null}
      {info.noInHouseRef ? (
        <Callout>
          <strong>Kullanılabilir iç imalat referansı yok.</strong> İç imalat faktörü 1,0 alındı: saat, birleşimlerin geometrisinden
          hesaplanan değerdir ve kayıtlı saatlerle doğrulanmadı. Düşük / yüksek saat raporun varsayımıdır (§2.2).
        </Callout>
      ) : null}
      <div className="est-two">
        <div className="est-two-main">
          {refRows.length ? (
            <>
              <div className="est-sub-title">
                Kalibrasyon referansları{' '}
                <span className="est-muted">
                  — faktör = kayıtlı saat ÷ {info.geometry ? 'aynı yöntemle' : 'birim sürelerle'} hesaplanan saat
                </span>
              </div>
              <div className="est-table-wrap">
                <table className="est-table">
                  <thead>
                    <tr>
                      <th>İş</th>
                      <th>Rota</th>
                      <th className="num">Benzerlik</th>
                      <th className="num">Kaynak m/adet</th>
                      <th className="num">Kayıtlı h/adet</th>
                      <th className="num">Hesaplanan h/adet</th>
                      <th className="num">Faktör</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refRows.map((x, i) => {
                      const own = inHouseHours(x);
                      const split =
                        x.bottom_up_in_house_h_per_unit != null &&
                        x.bottom_up_h_per_unit != null &&
                        Math.abs(x.bottom_up_in_house_h_per_unit - x.bottom_up_h_per_unit) > 0.05;
                      return (
                        <tr key={i}>
                          <td>
                            <JobLink no={x.job_no} /> <span className="est-job-title">{x.title || ''}</span>
                          </td>
                          <td>
                            <RouteBadge route={x.route} />
                          </td>
                          <td className="num">
                            <SimilarityCell s={x.similarity_to_target} />
                          </td>
                          <td className="num">{fmt(x.weld_m_total, 1)}</td>
                          <td className="num">{fmt(x.recorded_welding_h_per_unit, 1)}</td>
                          <td className="num">
                            {fmt(own, 1)}
                            {split ? (
                              <small className="est-cell-sub" title="Taşeronda kaynaklanan kilonun payı düşüldü">
                                toplam {fmt(x.bottom_up_h_per_unit, 1)}, iç imalat payı
                              </small>
                            ) : null}
                          </td>
                          <td className="num">
                            <FactorBadge f={x.factor} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {subNote}
          <Excluded h={h} />
        </div>
        {breakdown ? (
          <div className="est-two-side">
            <HoursTable b={breakdown} />
          </div>
        ) : null}
      </div>
      <ReportText sec={sec} />
    </Section>
  );
}

// ---------------------------------------------------------------- İşçilik · imalat planı (v5)
//
// One total of man-hours, then its distribution over the work centres
// (hours.distribution), the tonne-rate gauges (hours.bands), the plan table
// grouped by centre (bottom_up), the deductions line and the calibration
// table with the machining factor next to the welding-shop one.

function PlanLaborSection({ r, m }: { r: Payload; m: ReportModel }) {
  const h = r.hours || {};
  const sec = m.sections.iscilik;
  const labour = r.cost_table?.labour;
  const plan = planInfo(h, labour) as PlanInfo;
  const bu = h.bottom_up || r.weld_schedule?.bottom_up || {};
  const cal = h.calibration?.in_house || null;
  const calMach = h.calibration?.machining || null;
  const dist = distributionRows(h, labour);
  const bands = bandInfo(h);
  const nRefs = (c: Payload) => (c?.references_used || []).length;

  // --- KPIs
  const kpis: ReactNode[] = [];
  const lab = plan.recomputed ? plan.labour : null;
  const centreSub = lab
    ? Object.values(lab.centres)
        .filter((c) => c.correctedH)
        .map((c) => `${WORK_CENTRE_SHORT[c.key] || c.key} ${fmt(c.correctedH, 0)}`)
        .join(' + ')
    : (bu.work_centres || [])
        .filter((wc: Payload) => Number(wc.hours))
        .map((wc: Payload) => `${WORK_CENTRE_SHORT[wc.key] || wc.key} ${fmt(wc.hours, 0)}`)
        .join(' + ');
  if (plan.computedH != null) {
    kpis.push(
      <Kpi
        key="computed"
        label={lab ? 'Hesaplanan (rapor düzeltmesi)' : 'Hesaplanan (plan)'}
        value={`${fmt(plan.computedH, 1)} h/adet`}
        sub={[lab ? `plan ${fmt(plan.planComputedH, 1)} h/adet` : '', centreSub].filter(Boolean).join(' · ')}
      />,
    );
  }
  if (plan.expectedH != null)
    kpis.push(
      <Kpi
        key="expected"
        label="Beklenen (merkez faktörleriyle)"
        value={`${fmt(plan.expectedH, 1)} h/adet`}
        sub={range(plan.lowH, plan.highH, 1, 'h/adet')}
      />,
    );
  if (plan.expectedTotal != null) {
    kpis.push(
      <Kpi
        key="total"
        label={`Toplam${m.quantity ? ` (${fmt(m.quantity, 0)} adet)` : ''}`}
        value={`${fmt(plan.expectedTotal, 0)} h`}
        sub={[
          range(plan.lowTotal, plan.highTotal, 0, 'h'),
          lab && plan.planExpectedTotal != null ? `plan ${fmt(plan.planExpectedTotal, 0)} h` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      />,
    );
  }
  if (cal) {
    if (plan.noInHouseRef) {
      kpis.push(
        <Kpi
          key="shop"
          label="Atölye faktörü"
          value={
            <>
              1,00{' '}
              <Badge cls="status-orange" title="Kullanılabilir iç imalat (atölye) referansı yok">
                referans yok
              </Badge>
            </>
          }
          sub="atölye saati plandan aynen alındı"
        />,
      );
    } else {
      const flag = cal.factor_mean != null && (cal.factor_mean < 0.6 || cal.factor_mean > 1.6);
      kpis.push(
        <Kpi
          key="shop"
          label="Atölye faktörü"
          value={
            <>
              {fmt(cal.factor_mean, 2)}
              {flag ? (
                <>
                  {' '}
                  <Badge cls="status-orange" title="Olağan aralık 0,6–1,6; nedeni raporun 2.2 bölümünde">
                    aralık dışı
                  </Badge>
                </>
              ) : null}
            </>
          }
          sub={[range(cal.factor_min, cal.factor_max, 2, ''), `${nRefs(cal)} referans`, plan.classGate?.used ? 'aynı sınıf' : '']
            .filter(Boolean)
            .join(' · ')}
        />,
      );
    }
  }
  if (calMach || plan.noMachRef) {
    if (plan.noMachRef || !calMach || calMach.factor_mean == null) {
      // machining is not calibrated by references (2026-10-27): the drawing analysis stands
      kpis.push(
        <Kpi
          key="mach"
          label="Talaşlı faktörü"
          value={
            <>
              1,00{' '}
              <Badge cls="status-grey" title="Talaşlı referansla kalibre edilmez; saat çizim analizinden gelir">
                çizim analizi
              </Badge>
            </>
          }
          sub="talaşlı saat plandan (ve raporun çizime göre düzeltmesinden) alındı"
        />,
      );
    } else if (calMach.basis === 'same_part') {
      kpis.push(
        <Kpi
          key="mach"
          label="Talaşlı · aynı parça"
          value={`${fmt(calMach.expected_h_per_unit, 1)} h/adet`}
          sub={`${(calMach.references_used || []).join(', ')} kayıtlı saati · ±%10`}
        />,
      );
    } else {
      kpis.push(
        <Kpi
          key="mach"
          label="Talaşlı faktörü"
          value={fmt(calMach.factor_mean, 2)}
          sub={[range(calMach.factor_min, calMach.factor_max, 2, ''), `${nRefs(calMach)} referans`].filter(Boolean).join(' · ')}
        />,
      );
    }
  }
  const wage = plan.wage ?? r.inputs?.parameters?.labor_eur_per_h;
  if (wage != null)
    kpis.push(
      <Kpi
        key="wage"
        label="İşçilik ücreti"
        value={`${fmt(wage, 2)} €/h`}
        sub={plan.machWage != null ? `talaşlı ${fmt(plan.machWage, 2)} €/h · referans ortalaması` : 'referansların ortalaması'}
      />,
    );

  // --- callouts
  const mc = plan.massCoverage;
  const callouts = (
    <>
      {plan.noInHouseRef ? (
        <Callout>
          <strong>Kullanılabilir atölye referansı yok.</strong> Kaynak atölyesi faktörü 1,0 alındı: saat, imalat planından hesaplanan
          değerdir ve kayıtlı saatlerle doğrulanmadı. Ton başına saat bandı ve taşeron ankrajı aşağıda; düşük / yüksek saat raporun
          varsayımıdır (§2.2).
        </Callout>
      ) : null}
      {plan.deduced.thinDrawingSet ? (
        <Callout>
          <strong>Çizim seti ince:</strong> kaynak metresinin %{fmt((plan.deduced.weldShare || 0) * 100, 0)}&apos;i çıkarım
          {plan.deduced.machShare ? `, talaşlı saatin %${fmt(plan.deduced.machShare * 100, 0)}'i çıkarım` : ''}. Plan, çizimde
          görünenden çok modelin yapıdan çıkardığına dayanıyor; çıkarım satırlarını ve dayanaklarını kontrol edin.
        </Callout>
      ) : null}
      {mc && mc.status !== 'ok' ? (
        <Callout>
          <strong>Plan kütlesi birim kütlesiyle uyuşmuyor:</strong> planın alt montajları <strong>{fmt(mc.planKg, 0)} kg</strong>,
          birim <strong>{fmt(mc.unitKg, 0)} kg</strong>
          {mc.ratio != null ? ` (${fmt(mc.ratio, 2)}×)` : ''}.{' '}
          {mc.status === 'over'
            ? 'Çizim seti birden çok varyant / konfigürasyon içeriyor olabilir ve plan hepsini kapsıyor'
            : 'Birimin büyük bölümü planda yok'}
          ; saatler planın kapsadığı iş içindir ve ton başına saat plan kütlesiyle hesaplandı. Birimin tanımı (hangi varyant, kaç
          adet) teklifle netleşmeli; saatleri birim kütlesine ölçeklemeyin.
        </Callout>
      ) : null}
      {plan.proxy ? (
        <NoteLine icon="fa-circle-info">
          Bu iş için eski biçimde (v1) bir kaynak listesi var: plan, listeden uyarlandı; parça, alt montaj ve talaşlı özellikleri yok.
        </NoteLine>
      ) : null}
    </>
  );

  // --- programme: one row per variant
  const prog = plan.programme;
  const progBlock = prog ? (
    <>
      <div className="est-sub-title">
        Varyantlar{' '}
        <span className="est-muted">
          — program kapsamı: {fmt(prog.sets, 0)} takım
          {prog.unplanned.length ? `, ${fmt(prog.plannedSets, 0)} takım planlandı` : ''} · her varyant bir takım olarak planlandı,
          saat × BoQ adedi
        </span>
      </div>
      <div className="est-table-wrap">
        <table className="est-table est-programme">
          <thead>
            <tr>
              <th>Varyant</th>
              <th className="num">Adet</th>
              <th className="num">Takım kg</th>
              <th className="num">Saat / takım</th>
              <th className="num">Atölye / talaşlı</th>
              <th className="num">Toplam saat</th>
              <th className="num">h/t</th>
            </tr>
          </thead>
          <tbody>
            {prog.variants.map((v, i) => (
              <tr key={i}>
                <td>
                  <strong>{v.name}</strong>
                  <small className="est-cell-sub">
                    {v.id}
                    {v.basis ? ` · ${v.basis}` : ''}
                  </small>
                </td>
                <td className="num">{fmt(v.qty, 0)}</td>
                <td className="num">{fmt(v.massKg, 0)}</td>
                {v.planned ? (
                  <>
                    <td className="num">{fmt(v.hPerSet, 0)}</td>
                    <td className="num">
                      {fmt(v.shopPerSet, 0)} / {fmt(v.machPerSet, 0)}
                    </td>
                    <td className="num">
                      <strong>{fmt(v.totalH, 0)}</strong>
                    </td>
                    <td className="num">{fmt(v.hPerT, 0)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="num">
                    <span className="status-badge status-orange" title="Bu varyantın genel montaj çizimi sette yok: saat hesaplanmadı">
                      planlanmadı
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NoteLine icon="fa-circle-info">
        Toplam adam-saat programın tamamıdır; programlama ve parti bağlamaları programda bir kez sayıldığı için satırların toplamından
        biraz küçüktür.
        {prog.unplanned.length ? (
          <>
            {' '}
            <strong>Planlanmamış varyantlar ({fmt(prog.unplannedKg, 0)} kg) işçiliğe dahil değil.</strong>
          </>
        ) : null}
      </NoteLine>
    </>
  ) : null;

  // --- tonne-rate gauges + anchor
  const a = bands.anchor;
  const anchorLine = a ? (
    <NoteLine icon="fa-anchor">
      <strong>Taşeron fiyat ankrajı:</strong> {fmt(a.low, 0)} – {fmt(a.high, 0)} h/adet{' '}
      {a.eurPerKg != null && a.loadedRate != null ? (
        <span className="est-muted">
          ({fmt(a.eurPerKg, 2)} €/kg ÷ {fmt(a.loadedRate, 2)} €/h
          {a.hPerT.low != null ? ` · ${fmt(a.hPerT.low, 0)} – ${fmt(a.hPerT.high, 0)} h/t` : ''}
          {a.n ? ` · ${a.n} taşeron işi` : ''})
        </span>
      ) : null}{' '}
      — taşeronun kilo fiyatının ima ettiği saat; kaynaklı işin plan saatiyle karşılaştırın.
    </NoteLine>
  ) : null;
  const basisText =
    plan.hPerTBasis?.source === 'plan' ? `plan kütlesi (${fmt(plan.hPerTBasis.kg, 0)} kg, birim kütlesi değil)` : 'birim kütle';
  const hasGauges = Boolean(bands.shop || bands.mach);
  const bandBlock =
    hasGauges || anchorLine ? (
      <>
        <div className="est-sub-title">
          Ton başına saat{' '}
          <span className="est-muted">
            — plan saati ÷ {basisText}, yapı sınıfının bandına karşı
            {plan.hPerT.total != null ? ` · toplam ${fmt(plan.hPerT.total, 0)} h/t` : ''}
          </span>
        </div>
        {hasGauges ? (
          <div className="est-gauges">
            {bands.shop ? <Gauge label="Kaynak atölyesi" b={bands.shop} /> : null}
            {bands.mach ? <Gauge label="Talaşlı imalat" b={bands.mach} /> : null}
          </div>
        ) : null}
        {anchorLine}
      </>
    ) : null;

  // --- deductions, PWHT
  const w = plan.weldM;
  const dedParts: ReactNode[] = [];
  if (w.total != null) {
    dedParts.push(
      <>
        kaynak metresi: çizimden <strong>{fmt(w.drawn, 1)} m</strong>, çıkarımdan <strong>{fmt(w.deduced, 1)} m</strong>
        {w.rule ? (
          <>
            , kuraldan <strong>{fmt(w.rule, 1)} m</strong>
          </>
        ) : null}
        {plan.deduced.weldShare != null ? ` (%${fmt(plan.deduced.weldShare * 100, 0)} çıkarım)` : ''}
      </>,
    );
  }
  if (plan.deduced.machH != null && (plan.deduced.machH || plan.deduced.machDefaultH)) {
    dedParts.push(
      <>
        talaşlı: <strong>{fmt(plan.deduced.machH, 1)} h</strong> çıkarım
        {plan.deduced.machShare != null ? ` (%${fmt(plan.deduced.machShare * 100, 0)})` : ''}
        {plan.deduced.machDefaultH ? (
          <>
            , <strong>{fmt(plan.deduced.machDefaultH, 1)} h</strong> ölçüsüz (varsayılan)
          </>
        ) : null}
      </>,
    );
  }

  // --- plan table grouped by work centre
  const groups = planGroups(bu);

  // --- calibration references (welding shop + machining)
  const used = [...new Set<string>([...(cal?.references_used || []), ...(calMach?.references_used || [])])];
  const refPool: Payload[] = [...(h.references?.in_house || []), ...(h.references?.subcontract || [])];
  const refRows: Payload[] = used.map((no) => refPool.find((x) => x.job_no === no) || { job_no: no });
  const shopRefs = new Set<string>(cal?.references_used || []);
  const machRefs = new Set<string>(calMach?.references_used || []);
  const inHouseHours = (x: Payload) =>
    x.bottom_up_in_house_h_per_unit != null ? x.bottom_up_in_house_h_per_unit : (x.shop_h_per_unit ?? x.bottom_up_h_per_unit);

  const gate = plan.classGate;
  let gateNote: ReactNode = null;
  if (gate?.used) {
    gateNote = (
      <NoteLine icon="fa-layer-group">
        Atölye faktörü aynı yapı sınıfındaki referanslardan ({fmt(gate.same_class_references, 0)}
        {gate.structure_class ? ` · ${STRUCTURE_CLASS_LABELS[gate.structure_class] || gate.structure_class}` : ''}).
      </NoteLine>
    );
  } else if (gate && gate.same_class_references != null && cal && !plan.noInHouseRef) {
    gateNote = (
      <NoteLine icon="fa-layer-group">
        Aynı yapı sınıfında {fmt(gate.same_class_references, 0)} referans var (en az 2 gerekir): atölye faktörü en benzer referanslardan.
      </NoteLine>
    );
  }

  let machNote: ReactNode;
  if (plan.noMachRef || !calMach || calMach.factor_mean == null) {
    const cross: Payload[] = Array.isArray(calMach?.crosscheck) ? calMach.crosscheck.filter((c: Payload) => c && c.job_no) : [];
    const crossText: ReactNode = cross.length ? (
      <>
        {' · çapraz kontrol: '}
        {joinNodes(
          cross.map((c) => (
            <>
              <JobLink no={c.job_no} /> kayıt {fmt(c.recorded_machining_h_per_unit, 0)} / plan {fmt(c.mach_h_per_unit, 0)} h
            </>
          )),
          ', ',
        )}
      </>
    ) : Number(h.machining_h_per_unit_references) ? (
      ` · referansların kayıtlı talaşlı ortalaması ${fmt(h.machining_h_per_unit_references, 1)} h/adet (karşılaştırma için)`
    ) : (
      ''
    );
    machNote = (
      <NoteLine icon="fa-gears">
        <strong>Talaşlı · çizim analizi (faktör 1,00):</strong> talaşlı referansla kalibre edilmez; saat plandan ve raporun çizime
        göre düzeltmesinden alındı
        {calMach?.expected_h_per_unit != null ? ` (${fmt(calMach.expected_h_per_unit, 1)} h/adet)` : ''}
        {crossText}.
      </NoteLine>
    );
  } else if (calMach.basis === 'same_part') {
    const sp = calMach.same_part || {};
    machNote = (
      <NoteLine icon="fa-gears">
        <strong>Talaşlı · aynı parça:</strong> <JobLink no={sp.job_no || (calMach.references_used || [])[0]} /> (
        {(sp.shared || []).join(', ')}) kayıtlı talaşlı saati {fmt(calMach.expected_h_per_unit, 1)} h/adet doğrudan alındı (±%10;
        plan {fmt(calMach.basis_h_per_unit, 1)} h/adet).
      </NoteLine>
    );
  } else {
    machNote = (
      <NoteLine icon="fa-gears">
        <strong>Talaşlı kalibrasyonu:</strong> faktör {fmt(calMach.factor_mean, 2)}
        {calMach.factor_min != null ? ` (${fmt(calMach.factor_min, 2)} – ${fmt(calMach.factor_max, 2)})` : ''}, referanslar{' '}
        <JobLinks nos={calMach.references_used} />: plan {fmt(calMach.basis_h_per_unit, 1)} → beklenen{' '}
        {fmt(calMach.expected_h_per_unit, 1)} h/adet
        {Number(h.machining_h_per_unit_references)
          ? ` · referansların kayıtlı ortalaması ${fmt(h.machining_h_per_unit_references, 1)} h/adet`
          : ''}
        .
      </NoteLine>
    );
  }
  const subCal = h.calibration?.subcontract;
  let subNote: ReactNode = null;
  if (subCal && !plan.noInHouseRef && cal && sameRefs(subCal, cal)) {
    subNote = (
      <div className="est-note-line">
        <i className="fas fa-circle-info" aria-hidden />
        Taşeron rotası aynı referansları ve atölye faktörünü kullanır.
      </div>
    );
  } else if (subCal && subCal.factor_mean != null) {
    subNote = (
      <NoteLine icon="fa-circle-info">
        Taşeron rotası (GEMKOM&apos;da kalan atölye saati): faktör {fmt(subCal.factor_mean, 2)}
        {subCal.factor_min != null ? ` (${fmt(subCal.factor_min, 2)} – ${fmt(subCal.factor_max, 2)})` : ''}, referanslar{' '}
        <JobLinks nos={subCal.references_used} />; talaşlı imalat GEMKOM&apos;da kalır.
      </NoteLine>
    );
  }

  return (
    <Section secKey="iscilik" title="İşçilik ve saat" sub="imalat planından iş merkezi saatleri × merkez faktörleri">
      {kpis.length ? <div className="est-kpis">{kpis}</div> : null}
      {callouts}
      {dist.rows.length ? <DistributionBlock dist={dist} quantity={m.quantity} /> : null}
      {progBlock}
      {bandBlock}
      {dedParts.length ? (
        <NoteLine icon="fa-wand-magic-sparkles">
          <strong>Çıkarımlar:</strong> {joinNodes(dedParts, ' · ')}
        </NoteLine>
      ) : null}
      {plan.pwht ? (
        <NoteLine icon="fa-fire">
          <strong>Isıl işlem:</strong> {fmt(plan.pwht.kg, 0)} kg, ~{money(plan.pwht.eur)} dış hizmet
          {plan.pwht.basis ? (
            <>
              {' '}
              <span className="est-muted">({plan.pwht.basis})</span>
            </>
          ) : null}{' '}
          — bedeli maliyet tablosunda (Diğer), yükleme / temizlik saati atölyede.
        </NoteLine>
      ) : null}
      {groups.length ? (
        <>
          <div className="est-sub-title">
            İmalat planı ve saat hesabı <span className="est-muted">· 1 adet · iş merkezine göre</span>
          </div>
          <PlanGroups groups={groups} planTotal={plan.computedH || bu.total_h} />
        </>
      ) : null}
      {refRows.length ? (
        <>
          <div className="est-sub-title">
            Kalibrasyon referansları{' '}
            <span className="est-muted">
              — atölye faktörü = kayıtlı kaynakçı saati ÷ plan atölye saati · talaşlı faktörü = kayıtlı talaşlı saati ÷ plan talaşlı
              saati
            </span>
          </div>
          <div className="est-table-wrap">
            <table className="est-table est-cal">
              <thead>
                <tr>
                  <th>İş</th>
                  <th>Rota</th>
                  <th>Sınıf</th>
                  <th className="num">Benzerlik</th>
                  <th className="num">Kaynak m/adet</th>
                  <th className="num">Kayıtlı h/adet</th>
                  <th className="num">Plan atölye h/adet</th>
                  <th className="num">Faktör</th>
                  <th className="num">Talaşlı faktörü</th>
                </tr>
              </thead>
              <tbody>
                {refRows.map((x, i) => {
                  const own = inHouseHours(x);
                  const split =
                    x.bottom_up_in_house_h_per_unit != null &&
                    x.shop_h_per_unit != null &&
                    Math.abs(x.bottom_up_in_house_h_per_unit - x.shop_h_per_unit) > 0.05;
                  const exclusion = machiningExclusionLabel(x.machining_exclusion);
                  return (
                    <tr key={i}>
                      <td className="est-job-cell">
                        <span className="est-job-line">
                          <JobLink no={x.job_no} />
                          {shopRefs.has(x.job_no) ? (
                            <span className="est-tag est-tag-cal" title="Atölye faktöründe kullanıldı">
                              atölye
                            </span>
                          ) : null}
                          {machRefs.has(x.job_no) ? (
                            <span className="est-tag est-tag-cal" title="Talaşlı faktöründe kullanıldı">
                              talaşlı
                            </span>
                          ) : null}
                        </span>
                        <span className="est-job-title">{x.title || ''}</span>
                      </td>
                      <td>
                        <RouteBadge route={x.route} />
                      </td>
                      <td className="est-nowrap">
                        {x.structure_class ? STRUCTURE_CLASS_LABELS[x.structure_class] || x.structure_class : <span className="est-muted">—</span>}
                        {x.schema_version != null ? (
                          <>
                            {' '}
                            <SchemaPill version={x.schema_version} />
                          </>
                        ) : null}
                      </td>
                      <td className="num">
                        <SimilarityCell s={x.similarity_to_target} />
                      </td>
                      <td className="num">{fmt(x.weld_m_total, 1)}</td>
                      <td className="num">{fmt(x.recorded_welding_h_per_unit, 1)}</td>
                      <td className="num">
                        {fmt(own, 1)}
                        {split ? (
                          <small className="est-cell-sub" title="Taşeronda kaynaklanan kilonun payı düşüldü">
                            atölye {fmt(x.shop_h_per_unit, 1)}, iç imalat payı
                          </small>
                        ) : x.bottom_up_h_per_unit != null && own != null && Math.abs(x.bottom_up_h_per_unit - own) > 0.05 ? (
                          <small className="est-cell-sub">plan toplamı {fmt(x.bottom_up_h_per_unit, 1)}</small>
                        ) : null}
                      </td>
                      <td className="num">
                        {shopRefs.has(x.job_no) || x.factor != null ? <FactorBadge f={x.factor} /> : <span className="est-muted">—</span>}
                      </td>
                      <td className="num">
                        {x.factor_mach != null ? (
                          <>
                            <FactorBadge f={x.factor_mach} />
                            {x.recorded_machining_h_per_unit != null && x.mach_h_per_unit != null ? (
                              <small className="est-cell-sub">
                                {fmt(x.recorded_machining_h_per_unit, 1)} ÷ {fmt(x.mach_h_per_unit, 1)} h
                              </small>
                            ) : null}
                          </>
                        ) : (
                          <span className="est-out" title={exclusion || 'Talaşlı kalibrasyonunda kullanılmaz'}>
                            —<small className="est-cell-sub">{exclusion || 'kullanılmaz'}</small>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {gateNote}
      {machNote}
      {subNote}
      <Excluded h={h} />
      <ReportText sec={sec} />
    </Section>
  );
}

/** "Toplam adam-saat": the stacked share bar and the work-centre distribution table. */
function DistributionBlock({ dist, quantity }: { dist: Distribution; quantity: number | null }) {
  const t = dist.totals!;
  const rows = dist.rows;
  const expTotal = t.expectedH || rows.reduce((s, r) => s + r.expectedH, 0);
  const shown = rows.filter((r) => r.expectedH > 0);
  const qty = quantity || t.quantity;
  const fixed = Boolean(dist.recomputed);
  const anyCorrected = fixed && rows.some((r) => r.corrected);
  const n = (val: unknown, digits = 0) => (val == null ? <span className="est-muted">—</span> : fmt(val, digits));
  // machining is not calibrated by references (2026-10-27): the drawing analysis stands, unless the same part was made before
  const factorCell = (r: (typeof rows)[number]): ReactNode =>
    r.factorBasis === 'references' ? (
      <>
        <span className="est-factor">{fmt(r.factor, 2)}</span>
        <small className="est-cell-sub">
          {r.factorMin != null && r.factorMax != null && r.factorMin !== r.factorMax
            ? `${fmt(r.factorMin, 2)} – ${fmt(r.factorMax, 2)} · `
            : ''}
          {r.referencesUsed.length} referans
        </small>
      </>
    ) : r.factorBasis === 'same_part' ? (
      <>
        <span className="est-factor">{fmt(r.factor, 2)}</span>
        <small className="est-cell-sub">aynı parça · {r.referencesUsed.join(', ')}</small>
      </>
    ) : (
      <span className="est-muted">{r.key === 'mach' ? 'çizim analizi' : 'referans yok'} · 1,00</span>
    );
  // corrected hours (cost_table.labour): the priced totals come from the backend, not per unit × adet
  const totalCol = (r: (typeof rows)[number]): ReactNode =>
    r.expectedTotalH != null
      ? fmt(r.expectedTotalH, 0)
      : r.expectedH == null
        ? <span className="est-muted">—</span>
        : fmt(qty ? r.expectedH * qty : r.expectedH, 0);
  return (
    <>
      <div className="est-sub-title">
        Toplam adam-saat{' '}
        <span className="est-muted">
          · {fmt(t.computedH, 0)} h hesaplanan{fixed && anyCorrected ? ` (plan ${fmt(t.planH, 0)} h)` : ''} →{' '}
          <strong>{fmt(t.expectedH, 0)} h</strong> beklenen / adet
          {t.expectedTotal != null && qty && qty !== 1 ? ` · ${fmt(t.expectedTotal, 0)} h / ${fmt(qty, 0)} adet` : ''}
        </span>
      </div>
      <div className="est-dist-bar" role="img" aria-label="İş merkezi dağılımı">
        {shown.map((r) => (
          <span
            key={r.key}
            style={{ width: `${((r.expectedH / expTotal) * 100).toFixed(1)}%`, background: centreColour(r.key) }}
            title={`${r.label} ${fmt(r.expectedH, 0)} h · %${fmt(r.share * 100, 0)}`}
          />
        ))}
      </div>
      <div className="est-dist-legend">
        {shown.map((r) => (
          <span key={r.key}>
            <i style={{ background: centreColour(r.key) }} />
            {r.label} <strong>%{fmt(r.share * 100, 0)}</strong>
          </span>
        ))}
      </div>
      <div className="est-table-wrap">
        <table className="est-table est-dist">
          <thead>
            <tr>
              <th>İş merkezi</th>
              <th className="num">Hesaplanan h{fixed ? <small>rapor düzeltmesiyle</small> : null}</th>
              <th className="num">
                Faktör<small>dayanak</small>
              </th>
              <th className="num is-exp">
                Beklenen h<small>1 adet</small>
              </th>
              <th className="num">
                Beklenen h<small>toplam{qty ? ` · ${fmt(qty, 0)} adet` : ''}</small>
              </th>
              <th className="est-share-cell">Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`${r.computedH ? '' : 'is-zero'}${fixed && r.corrected ? ' is-corrected' : ''}`}>
                <td className="est-item">
                  <i className="est-dot-c" style={{ background: centreColour(r.key) }} />
                  {r.label}
                  {fixed && r.corrected ? (
                    <>
                      {' '}
                      <Badge cls="status-orange" title="Rapor bu merkezin plan saatini düzeltti; maliyet tablosu düzeltilmiş saati fiyatlar">
                        rapor düzeltti
                      </Badge>
                    </>
                  ) : null}
                </td>
                <td className="num">
                  {n(r.computedH, 1)}
                  {fixed && r.corrected ? (
                    <small className="est-cell-sub est-plan-h" title="Python'un plan saati (1 adet)">
                      plan {fmt(r.planH, 1)} h
                    </small>
                  ) : null}
                </td>
                <td className="num">{factorCell(r)}</td>
                <td className="num is-exp">
                  {n(r.expectedH, 1)}
                  {r.lowH != null && r.highH != null && r.lowH !== r.highH ? (
                    <small className="est-cell-sub">
                      {fmt(r.lowH, 0)} – {fmt(r.highH, 0)}
                    </small>
                  ) : null}
                </td>
                <td className="num">{totalCol(r)}</td>
                <td className="est-share-cell">
                  <ShareBar part={r.expectedH} total={expTotal} colour={centreColour(r.key)} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="est-total">
              <td>Toplam</td>
              <td className="num">
                {n(t.computedH, 1)}
                {anyCorrected ? <small className="est-cell-sub est-plan-h">plan {fmt(t.planH, 1)} h</small> : null}
              </td>
              <td />
              <td className="num is-exp">
                {n(t.expectedH, 1)}
                {t.lowH != null && t.highH != null ? (
                  <small className="est-cell-sub">
                    {fmt(t.lowH, 0)} – {fmt(t.highH, 0)}
                  </small>
                ) : null}
              </td>
              <td className="num">
                {n(t.expectedTotal ?? (qty ? t.expectedH * qty : null), 0)}
                {t.lowTotal != null && t.highTotal != null ? (
                  <small className="est-cell-sub">
                    {fmt(t.lowTotal, 0)} – {fmt(t.highTotal, 0)}
                  </small>
                ) : null}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {fixed ? (
        <NoteLine icon="fa-circle-info">Maliyet tablosu düzeltilmiş saatleri fiyatlar; plan saati Python&apos;un ilk hesabıdır.</NoteLine>
      ) : null}
    </>
  );
}

/** One tonne-rate gauge: the value against the class band (references' p25–p75 or the parameter band). */
function Gauge({ label, b }: { label: string; b: Band }) {
  const st = BAND_STATUS[b.status] || BAND_STATUS.unknown!;
  const hasBand = b.low != null && b.high != null;
  const max = Math.max(hasBand ? b.high! * 1.3 : 0, (b.hPerT || 0) * 1.15, 1);
  const pos = (x: number) => `${Math.max(0, Math.min(100, (x / max) * 100)).toFixed(1)}%`;
  const src =
    b.source === 'references'
      ? `referanslardan (p25–p75, n=${fmt(b.referencesN, 0)})`
      : b.source === 'parameter'
        ? `parametre${b.referencesN ? ` (sınıfta ${fmt(b.referencesN, 0)} referans, bant için az)` : ''}`
        : 'bant yok';
  return (
    <div className={`est-gauge is-${b.status}`}>
      <div className="est-gauge-head">
        <span>{label}</span>
        <Badge cls={st.badge} title={hasBand ? `Bant ${fmt(b.low, 0)} – ${fmt(b.high, 0)} h/t` : 'Sınıf için bant yok'}>
          {st.label}
        </Badge>
      </div>
      <div className="est-gauge-value">
        {b.hPerT != null ? (
          <>
            {fmt(b.hPerT, 1)} <small>h/t</small>
          </>
        ) : (
          <span className="est-muted">—</span>
        )}
      </div>
      <div className="est-gauge-track">
        {hasBand ? (
          <span
            className="est-gauge-band"
            style={{ left: pos(b.low!), width: `${Math.max(1, ((b.high! - b.low!) / max) * 100).toFixed(1)}%` }}
          />
        ) : null}
        {b.hPerT != null ? <span className="est-gauge-mark" style={{ left: pos(b.hPerT) }} /> : null}
      </div>
      <div className="est-gauge-sub">
        {hasBand ? (
          <>
            bant{' '}
            <strong>
              {fmt(b.low, 0)} – {fmt(b.high, 0)} h/t
            </strong>
          </>
        ) : (
          'bant yok'
        )}
        {b.structureClass ? ` · ${STRUCTURE_CLASS_LABELS[b.structureClass] || b.structureClass}` : ''} · {src}
      </div>
      {b.impliedLow != null && b.impliedHigh != null ? (
        <div className="est-gauge-sub">
          bant karşılığı{' '}
          <strong>
            {fmt(b.impliedLow, 0)} – {fmt(b.impliedHigh, 0)} h/adet
          </strong>
        </div>
      ) : null}
    </div>
  );
}
