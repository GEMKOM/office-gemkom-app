import { Fragment, useState, type ReactNode } from 'react';
import { STRUCTURE_CLASS_LABELS, type WeldSchedule } from '@/api/projects/estimator';
import { LaborSection } from './LaborSection';
import { Markdown } from './Markdown';
import { PlanParts } from './PlanTables';
import {
  Badge,
  bulletCount,
  ConfidencePill,
  costRowLabel,
  Decorated,
  FactorBadge,
  formatDateTime,
  JobLink,
  JobLinks,
  joinNodes,
  Md,
  money,
  pct,
  ROUTE_LABELS,
  runMinutes,
  RouteBadge,
  SAME_IN_BOTH_ROUTES,
  SchemaPill,
  Section,
  SECTION_DEFS,
  sectionMarkdown,
  ShareBar,
  SimilarityCell,
  useReport,
  MATERIAL_LABELS,
} from './reportParts';
import { fmt, hoursInfo, planInfo, similarRow, withoutFirstTable, type Payload, type ReportModel } from './reportModel';
import { WeldTable } from './WeldTable';
import { AdjustmentBanner, archiveRows, ExclusionsSection, referenceRows } from './ExclusionsSection';

// A finished Tahmin report as React: the summary header, the sticky section
// nav and one collapsible section per topic (port of the legacy
// components/estimate-report/report-view.js builders). The card
// (EstimateReport.tsx) owns the state and the requests and hands the view
// state and actions down through ReportContext.

const SIMILAR_PREVIEW = 8;
const DEPARTMENT_ICONS: [RegExp, string][] = [
  [/tasarım|çizim/i, 'fa-pen-ruler'],
  [/imalat/i, 'fa-industry'],
  [/kalite/i, 'fa-clipboard-check'],
  [/satın/i, 'fa-cart-shopping'],
  [/lojistik|sevk/i, 'fa-truck'],
  [/ticari/i, 'fa-scale-balanced'],
];
const PARAMETER_LABELS: Record<string, [string, (v: number) => string]> = {
  scrap_plate: ['Sac firesi', (v) => `%${fmt(v * 100, 0)}`],
  scrap_tube: ['Boru / uzun ürün firesi', (v) => `%${fmt(v * 100, 0)}`],
  labor_eur_per_h: ['İşçilik ücreti', (v) => `${fmt(v, 2)} €/h`],
  employee_overhead_share: ['Personel genel gider payı', (v) => `%${fmt(v * 100, 0)}`],
  general_expenses_rate_eur_per_kg: ['Genel gider oranı', (v) => `${fmt(v, 2)} €/kg`],
};
const SKIP_REASONS: Record<string, string> = {
  too_many_pages: 'sayfa sınırı aşıldı',
  unreadable: 'okunamadı',
  unsupported: 'desteklenmeyen biçim',
};

/** "§2.2" → the section key that shows it (extra sections such as "§6" included). */
export function gotoResolver(m: ReportModel): (num: string) => string | null {
  const map: Record<string, string> = { 1: 'ozet', 2: 'maliyet', '2.1': 'malzeme', '2.2': 'iscilik', '2.3': 'maliyet', 3: 'teklif', 4: 'dikkat', 5: 'sorular' };
  m.extra.forEach((sec, i) => {
    if (sec.num) map[sec.num] = `ek${i + 1}`;
  });
  return (num) => map[num] || map[String(num).split('.')[0]!] || null;
}

const QUESTION_GROUPS: [string, string, string][] = [
  ['design', 'Tasarımdan', 'fa-pen-ruler'],
  ['customer', 'Müşteriden', 'fa-user-tie'],
  ['procurement', 'Satın almadan', 'fa-cart-shopping'],
];

function questionCount(r: Payload): number {
  const q = r.questions || {};
  return QUESTION_GROUPS.reduce((s, [k]) => s + (q[k]?.length || 0), 0) + (r.weld_schedule?.open_questions?.length || 0);
}

interface NavEntry {
  key: string;
  label?: string;
  count?: number | null;
}

/**
 * A done report's sections, in page order: the summary first, then the nav
 * (it sticks once the summary is scrolled past), then every section the
 * payload has. `weld` is the weld-list section (owned by the card).
 */
export function DoneReport({ r, m, weld }: { r: Payload; m: ReportModel; weld: ReactNode }) {
  const nav: NavEntry[] = [{ key: 'ozet' }];
  const sections: ReactNode[] = [];
  const add = (key: string, node: ReactNode, entry: Omit<NavEntry, 'key'> = {}) => {
    if (!node) return;
    nav.push({ key, ...entry });
    sections.push(<Fragment key={key}>{node}</Fragment>);
  };
  add('maliyet', costSection(r, m));
  add('malzeme', materialSection(r, m), { count: (r.material_lines || []).filter((x: Payload) => !x.is_total).length || null });
  if (r.hours?.calibration?.in_house || r.hours?.bottom_up || r.weld_schedule?.bottom_up || m.sections.iscilik)
    add('iscilik', <LaborSection r={r} m={m} />);
  add('benzer', similarSection(r, m), { count: (r.similar_jobs || []).length || null });
  if (referenceRows(r).length || archiveRows(r).length || r.hours?.historical_costs) {
    const nEx = Object.keys(r.adjustments?.excluded?.reference || {}).length + Object.keys(r.adjustments?.excluded?.archive || {}).length;
    add('haric', <ExclusionsSection r={r} />, { count: nEx || null });
  }
  add('teklif', offerSection(m));
  add('dikkat', attentionSection(m), { count: bulletCount(sectionMarkdown(m.sections.dikkat)) || null });
  add('sorular', questionsSection(r, m), { count: questionCount(r) || null });
  m.extra.forEach((sec, i) => {
    const key = `ek${i + 1}`;
    const body = sectionMarkdown(sec);
    add(
      key,
      body.trim() ? (
        <Section secKey={key} title={`${sec.num ? `${sec.num}. ` : ''}${sec.title}`} icon="fa-bookmark">
          <Md text={body} />
        </Section>
      ) : null,
      { label: sec.title.length > 22 ? `${sec.title.slice(0, 20)}…` : sec.title },
    );
  });
  if (weld) add('kaynak', weld, { count: null });
  add('metin', r.markdown ? <TextSection r={r} m={m} /> : null);
  add('girdiler', <InputsSection r={r} />);
  return (
    <>
      <Hero r={r} m={m} />
      <AdjustmentBanner r={r} />
      <Nav present={nav} />
      {sections}
    </>
  );
}

function Nav({ present }: { present: NavEntry[] }) {
  const { view, actions } = useReport();
  const defs = Object.fromEntries(SECTION_DEFS.map((d) => [d.key, d]));
  return (
    <nav
      className={`est-nav${view.navStuck ? ' is-stuck' : ''}`}
      style={view.navTop != null ? { top: view.navTop } : undefined}
      data-est-nav
      aria-label="Rapor bölümleri"
    >
      <div className="est-nav-items">
        {present.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`est-nav-item${view.navActive === p.key ? ' is-active' : ''}`}
            data-nav-key={p.key}
            onClick={() => actions.goto(p.key)}
          >
            <span>{p.label || defs[p.key]?.label}</span>
            {p.count ? <span className="est-nav-count">{p.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="est-nav-tools">
        <button type="button" className="est-nav-tool" title="Tüm bölümleri aç" onClick={actions.expandAll}>
          <i className="fas fa-angles-down" aria-hidden />
        </button>
        <button type="button" className="est-nav-tool" title="Tüm bölümleri kapat" onClick={actions.collapseAll}>
          <i className="fas fa-angles-up" aria-hidden />
        </button>
        <button type="button" className="est-nav-tool est-nav-top" title="Başa dön" onClick={actions.top}>
          <i className="fas fa-arrow-up" aria-hidden />
          <span>Başa dön</span>
        </button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- Özet (hero)

function Fact({ label, value, sub, cls = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; cls?: string }) {
  return (
    <div className={`est-fact${cls ? ` ${cls}` : ''}`}>
      <span className="est-fact-label">{label}</span>
      <span className="est-fact-value">{value}</span>
      {sub ? <span className="est-fact-sub">{sub}</span> : null}
    </div>
  );
}

const DOT = <span className="est-dot">·</span>;

/** Düşük ——●—— Yüksek, the dot at Beklenen. */
function RangeBar({ low, expected, high }: { low: number | null | undefined; expected: number | null | undefined; high: number | null | undefined }) {
  if (low == null || high == null) return null;
  const span = high - low;
  const pos = span > 0 && expected != null ? Math.max(0, Math.min(100, ((expected - low) / span) * 100)) : 50;
  return (
    <div className="est-range" title={`Düşük ${fmt(low, 0)} € · Beklenen ${fmt(expected, 0)} € · Yüksek ${fmt(high, 0)} €`}>
      <div className="est-range-track">
        <span className="est-range-mark" style={{ left: `${pos.toFixed(1)}%` }} />
      </div>
      <div className="est-range-labels">
        <span>Düşük {fmt(low, 0)}</span>
        <span>Yüksek {fmt(high, 0)}</span>
      </div>
    </div>
  );
}

function Hero({ r, m }: { r: Payload; m: ReportModel }) {
  const { view, actions } = useReport();
  const ct = r.cost_table || {};
  const exp = ct.expected_total || {};
  const kg = ct.eur_per_kg || {};
  const totals = (ct.rows || []).find((x: Payload) => x.key === 'total') || {};
  const routes: string[] = m.routes.length ? m.routes : Object.keys(exp);
  const basisKey = m.basis?.key || null;

  const p = m.price;
  let priceBlock: ReactNode;
  if (p && (p.total != null || p.perUnit != null)) {
    const subParts: ReactNode[] = [];
    if (p.perUnit != null)
      subParts.push(
        <>
          <strong>{money(p.perUnit)}</strong>/adet
          {p.computed === 'perUnit' ? (
            <>
              {' '}
              <span className="est-calc" title="Toplam ÷ adet">
                hesaplandı
              </span>
            </>
          ) : null}
        </>,
      );
    if (p.perKg != null)
      subParts.push(
        <>
          <strong>{fmt(p.perKg, 2)}</strong> €/kg
        </>,
      );
    priceBlock = (
      <>
        <div className="est-price-value">{money(p.total)}</div>
        <div className="est-price-sub">{joinNodes(subParts, DOT)}</div>
      </>
    );
  } else if (p?.raw != null) {
    priceBlock = (
      <>
        <div className="est-price-value">{money(p.raw)}</div>
        <div className="est-price-sub">Raporda birim (toplam / adet) belirtilmemiş</div>
      </>
    );
  } else {
    priceBlock = (
      <>
        <div className="est-price-value est-muted">—</div>
        <div className="est-price-sub">Raporda önerilen fiyat bulunamadı</div>
      </>
    );
  }
  const f = m.floor;
  const floorText: ReactNode =
    f && (f.total != null || f.perUnit != null) ? (
      <>
        Taban fiyat <strong>{money(f.total)}</strong>
        {f.perUnit != null ? (
          <>
            {DOT}
            {money(f.perUnit)}/adet
          </>
        ) : null}
      </>
    ) : f?.raw != null ? (
      <>
        Taban fiyat <strong>{money(f.raw)}</strong>
      </>
    ) : null;
  const chips: ReactNode[] = [];
  if (m.basis?.label || basisKey) {
    chips.push(
      <span key="route" className="est-chip est-chip-route" title="Teklifin dayandığı rota (§3)">
        <i className="fas fa-route" aria-hidden />
        {m.basis?.label || ROUTE_LABELS[basisKey ?? '']}
      </span>,
    );
  }
  if (m.targetMargin)
    chips.push(
      <span key="target" className="est-chip" title="Raporun hedef marjı (§3)">
        Hedef marj {m.targetMargin}
      </span>,
    );
  if (m.margin != null && basisKey) {
    chips.push(
      <span
        key="margin"
        className="est-chip est-chip-soft"
        title={`(Önerilen fiyat − ${ROUTE_LABELS[basisKey]} beklenen maliyeti) ÷ önerilen fiyat`}
      >
        Fiyata göre marj {pct(m.margin, 1)}
      </span>,
    );
  }

  const shown = routes.filter((k) => exp[k] != null);
  const routeCards = shown.map((k, i) => {
    const isBasis = k === basisKey && shown.length > 1;
    const first = shown[0]!;
    let delta: ReactNode = null;
    if (i > 0 && exp[first] != null) {
      const d = exp[k] - exp[first];
      delta = (
        <div className={`est-route-delta ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}`}>
          {ROUTE_LABELS[first]} rotasına göre {d > 0 ? '+' : d < 0 ? '−' : ''}
          {fmt(Math.abs(d), 0)} €{exp[first] ? ` (${d >= 0 ? '+' : '−'}%${fmt((Math.abs(d) / exp[first]) * 100, 1)})` : ''}
        </div>
      );
    }
    return (
      <div key={k} className={`est-route-card${isBasis ? ' is-basis' : ''}`}>
        <div className="est-kicker">
          Beklenen maliyet · {ROUTE_LABELS[k] || k}
          {isBasis ? <span className="est-basis-tag">fiyat dayanağı</span> : null}
        </div>
        <div className="est-route-value">{money(exp[k])}</div>
        <div className="est-route-sub">
          {kg[k] != null ? (
            <>
              <strong>{fmt(kg[k], 2)}</strong> €/kg
            </>
          ) : null}
        </div>
        {totals[k] ? <RangeBar low={totals[k].low} expected={exp[k]} high={totals[k].high} /> : null}
        {delta}
      </div>
    );
  });

  const ws = r.weld_schedule;
  const hours = r.hours || {};
  const facts: ReactNode[] = [];
  if (m.quantity != null) facts.push(<Fact key="qty" label="Adet" value={fmt(m.quantity, 0)} />);
  if (m.unitKg != null) facts.push(<Fact key="unitkg" label="Birim ağırlık" value={`${fmt(m.unitKg, 0)} kg`} />);
  if (m.totalKg != null)
    facts.push(
      <Fact
        key="totalkg"
        label="Toplam ağırlık"
        value={`${fmt(m.totalKg, 0)} kg`}
        sub={m.totalKgBasis ? <Decorated text={m.totalKgBasis} /> : null}
      />,
    );
  const plan = planInfo(hours, ct.labour);
  if (plan.plan && (plan.expectedTotal != null || plan.computedTotal != null)) {
    // "Toplam 1.364 h hesaplanan · 2.100 h beklenen (atölye 79 %, talaşlı 15 %)"; with corrected hours "plan 77.570 h · rapor düzeltti · …"
    const band = plan.lowTotal != null && plan.highTotal != null ? `${fmt(plan.lowTotal, 0)} – ${fmt(plan.highTotal, 0)} h` : '';
    const shares = [
      plan.shares.shop != null ? `atölye %${fmt(plan.shares.shop * 100, 0)}` : '',
      plan.shares.mach != null ? `talaşlı %${fmt(plan.shares.mach * 100, 0)}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const corr: ReactNode =
      plan.recomputed && plan.planExpectedTotal != null ? (
        <>
          plan {fmt(plan.planExpectedTotal, 0)} h
          {plan.labour?.anyCorrected ? (
            <>
              {' '}
              <Badge cls="status-orange est-badge-sm" title="Maliyet tablosu raporun düzelttiği saatleri fiyatlar">
                rapor düzeltti
              </Badge>
            </>
          ) : null}
        </>
      ) : null;
    const computed = `${plan.computedTotal != null ? `${fmt(plan.computedTotal, 0)} h hesaplanan` : ''}${shares ? ` (${shares})` : ''}`.trim();
    const subParts = [corr, computed, band].filter(Boolean);
    const sub = subParts.length ? joinNodes(subParts, ' · ') : null;
    facts.push(
      <Fact
        key="hours"
        label={`Toplam saat${m.quantity ? ` · ${fmt(m.quantity, 0)} adet` : ''}`}
        value={`${fmt(plan.expectedTotal ?? plan.computedTotal, 0)} h`}
        sub={
          plan.noInHouseRef ? (
            <>
              atölye referansı yok · faktör 1,0
              {sub ? <> · {sub}</> : null}
            </>
          ) : (
            sub
          )
        }
      />,
    );
    if (plan.structureClassLabel || plan.structureClass) {
      const ded =
        plan.deduced.weldShare != null && plan.deduced.weldShare > 0
          ? `kaynak metresinin %${fmt(plan.deduced.weldShare * 100, 0)}'i çıkarım`
          : 'çıkarım yok';
      facts.push(
        <Fact
          key="class"
          label="Yapı sınıfı"
          value={plan.structureClassLabel || STRUCTURE_CLASS_LABELS[plan.structureClass ?? ''] || plan.structureClass}
          sub={`${plan.schemaVersion >= 2 ? 'plan v2' : 'v1 liste'}${plan.proxy ? ' (uyarlandı)' : ''} · ${ded}`}
        />,
      );
    }
  } else if (hours.expected_h_total != null) {
    const band =
      hours.low_h_total != null && hours.high_h_total != null ? `${fmt(hours.low_h_total, 0)} – ${fmt(hours.high_h_total, 0)} h` : '';
    facts.push(
      <Fact
        key="hours"
        label="Kaynak saati · iç imalat"
        value={`${fmt(hours.expected_h_total, 0)} h`}
        sub={hoursInfo(hours).noInHouseRef ? `iç imalat referansı yok · faktör 1,0${band ? ` · ${band}` : ''}` : band}
      />,
    );
  }
  if (m.termin) facts.push(<Fact key="termin" label="Termin" value={m.termin} cls="is-wide" />);
  if (ws) {
    const isPlan = plan.plan && plan.schemaVersion >= 2;
    const planConf = plan.plan ? plan.planConfidence : null;
    facts.push(
      <div key="conf" className="est-fact">
        <span className="est-fact-label">{isPlan ? 'Plan güveni' : 'Kaynak listesi güveni'}</span>
        <span className="est-fact-value">
          <ConfidencePill value={planConf != null ? planConf : ws.confidence} />
          <button
            type="button"
            className="est-help"
            aria-expanded={view.confOpen ? 'true' : 'false'}
            title="Güven nedir?"
            onClick={actions.confHelp}
          >
            <i className="fas fa-circle-question" aria-hidden />
          </button>
        </span>
        <span className="est-fact-sub">
          {isPlan ? 'imalat planı' : 'kaynak listesi'} v{ws.version ?? ''}
          {planConf != null && ws.confidence != null && Math.abs(planConf - ws.confidence) >= 0.005
            ? ` · liste güveni %${fmt(ws.confidence * 100, 0)}`
            : ''}
        </span>
      </div>,
    );
  }

  return (
    <section className="est-sec est-hero" data-sec="ozet" id={`${view.uid}-sec-ozet`}>
      {m.part ? <div className="est-hero-part">{m.part}</div> : null}
      <div className={`est-hero-grid${routeCards.length ? '' : ' is-single'}`}>
        <div className="est-price">
          <div className="est-kicker">Önerilen fiyat{m.quantity ? ` · ${fmt(m.quantity, 0)} adet toplamı` : ''}</div>
          {priceBlock}
          {chips.length ? <div className="est-chips">{chips}</div> : null}
          {floorText ? <div className="est-floor">{floorText}</div> : null}
        </div>
        {routeCards.length ? <div className="est-routes">{routeCards}</div> : null}
      </div>
      {facts.length ? <div className="est-facts">{facts}</div> : null}
      {view.confOpen ? <ConfidenceExplainer ws={ws} /> : null}
      {m.risks ? (
        <div className="est-risks">
          <div className="est-risks-title">
            <i className="fas fa-triangle-exclamation" aria-hidden />
            En önemli riskler
          </div>
          <Md text={m.risks} />
        </div>
      ) : null}
      {m.summaryRest ? <Md text={m.summaryRest} className="mt-2" /> : null}
      {m.preamble ? (
        <details className="est-more">
          <summary>Rapor notu</summary>
          <Md text={m.preamble} />
        </details>
      ) : null}
    </section>
  );
}

/** "Güven nedir?" — inline, because the card already lives inside a modal. */
export function ConfidenceExplainer({ ws }: { ws: Payload }) {
  const { actions } = useReport();
  const v = ws?.confidence != null ? Number(ws.confidence) : null;
  const level: ReactNode =
    v == null ? null : v < 0.4 ? (
      <>
        Bu liste <strong>düşük güvenli</strong>: kaynak metresi ve saatler eksik ya da tahmini olabilir. Kaynak listesi bölümündeki
        açık soruları ve birleşimleri kontrol edin.
      </>
    ) : v < 0.5 ? (
      <>
        Bu liste <strong>orta güvenli</strong>: genel tablo doğru, bazı ölçü veya adetler tahmin. Kaynak listesine bir göz atın.
      </>
    ) : (
      <>
        Bu liste <strong>yeterli güvenli</strong>: çizimle büyük ölçüde örtüşüyor.
      </>
    );
  return (
    <div className="est-explainer" role="note">
      <div className="est-explainer-head">
        <strong>
          <i className="fas fa-circle-question me-1" aria-hidden />
          Kaynak listesi güveni nedir?
        </strong>
        <button type="button" className="est-explainer-close" aria-label="Kapat" onClick={actions.confHelp} />
      </div>
      <p>
        Çizimlerden kaynak listesini (birleşimler, metreler, parça ve büküm sayıları, birim ağırlık) çıkaran modelin{' '}
        <strong>kendi verdiği puandır</strong> (0–100). Çizim eksik ya da okunaksızsa, ölçüler okunamayıp tahmin edildiyse veya kaynak
        detayı tanımlı değilse düşer.
      </p>
      <div className="est-explainer-scale">
        <span>
          <Badge cls="status-orange">%40 altı</Badge> düşük — saatler ve kg&apos;a bağlı kalemler güvenilmez
        </span>
        <span>
          <Badge cls="status-grey">%40–50</Badge> orta — gözden geçirin
        </span>
        <span>
          <Badge cls="status-green">%50 ve üstü</Badge> yeterli
        </span>
      </div>
      {level ? <p className="est-explainer-level">{level}</p> : null}
      <p className="est-muted est-explainer-last">
        Yalnız kaynak listesinin güvenini gösterir; malzeme birim fiyatlarının ve saat kalibrasyonunun güvenini göstermez (onlar için
        Malzeme bölümündeki kaynak atıflarına ve İşçilik bölümündeki faktör aralığına bakın). İş emirlerinde liste, Referanslar
        sayfasındaki Düzenle ile elle düzeltilebilir.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Maliyet

function costSection(r: Payload, m: ReportModel): ReactNode {
  const ct = r.cost_table || {};
  if (!ct.found || !(ct.rows || []).length) {
    const body = m.sections.maliyet ? sectionMarkdown({ body: m.sections.maliyet.body }) : '';
    return (
      <Section secKey="maliyet" title="Maliyet tablosu">
        {body.trim() ? <Md text={body} /> : <div className="est-empty-line">Maliyet tablosu ayrıştırılamadı; rapor metnine bakın.</div>}
      </Section>
    );
  }
  return <CostSection r={r} m={m} />;
}

function CostSection({ r, m }: { r: Payload; m: ReportModel }) {
  const { view, actions } = useReport();
  const ct = r.cost_table || {};
  const routes = m.routes;
  const route = view.costRoute;
  const seg =
    routes.length > 1 ? (
      <div className="est-seg" role="group" aria-label="Rota">
        {routes.map((k) => (
          <button
            key={k}
            type="button"
            className={route === k ? 'is-active' : ''}
            data-route={k}
            aria-pressed={route === k}
            onClick={() => actions.route(k)}
          >
            {ROUTE_LABELS[k] || k}
            {k === m.basis?.key ? <i className="fas fa-star est-seg-star" title="Fiyat dayanağı" /> : null}
          </button>
        ))}
        <button
          type="button"
          className={route === 'compare' ? 'is-active' : ''}
          data-route="compare"
          aria-pressed={route === 'compare'}
          onClick={() => actions.route('compare')}
        >
          <i className="fas fa-code-compare me-1" aria-hidden />
          Karşılaştır
        </button>
      </div>
    ) : null;
  const dayanak = m.sections.dayanak;
  return (
    <Section
      secKey="maliyet"
      title="Maliyet tablosu"
      sub={`€ · ${m.quantity ? `${fmt(m.quantity, 0)} adet toplamı` : 'toplam adet'}`}
      tools={seg}
    >
      <div data-est-cost>
        <CostTable ct={ct} route={route} />
      </div>
      {m.maliyetIntro ? <Md text={m.maliyetIntro} className="mt-2" /> : null}
      {dayanak ? (
        <details className="est-more">
          <summary>
            {dayanak.num ? `${dayanak.num} ` : ''}Kalem dayanakları <span className="est-muted">({dayanak.title})</span>
          </summary>
          <Md text={dayanak.body} />
        </details>
      ) : null}
      {m.maliyetOtherSubs.map((s, i) => (
        <details key={i} className="est-more">
          <summary>
            {s.num ? `${s.num} ` : ''}
            {s.title}
          </summary>
          <Md text={s.body} />
        </details>
      ))}
    </Section>
  );
}

function isZeroRow(x: Payload, keys: string[]): boolean {
  return keys.every((k) => ['low', 'expected', 'high'].every((lvl) => !Number(x[k]?.[lvl])));
}

/** The cost table for one route (Düşük / Beklenen / Yüksek) or both routes' Beklenen side by side. */
export function CostTable({ ct, route }: { ct: Payload; route: string | null }) {
  const rows: Payload[] = (ct.rows || []).map((x: Payload) => ({ ...x, label: costRowLabel(x) }));
  const body = rows.filter((x) => x.key !== 'total' && x.key !== 'eur_per_kg');
  const total = rows.find((x) => x.key === 'total');
  const perKg = rows.find((x) => x.key === 'eur_per_kg');
  // machining / CNC labour: a grey "iki rotada aynı" badge instead of the basis' own "; iki rotada aynı (GEMKOM)"
  const sameBoth = (x: Payload) => SAME_IN_BOTH_ROUTES.includes(x.key) && x.in_house && x.subcontract;
  const basisCell = (x: Payload) => {
    const same = sameBoth(x);
    const text = same ? (x.basis || '').replace(/[;,]?\s*iki rotada aynı(\s*\(GEMKOM\))?\s*$/i, '') : x.basis;
    return (
      <td className="est-basis">
        {same ? (
          <>
            <Badge
              cls="status-grey est-badge-sm est-same-badge"
              title="Talaşlı ve CNC kesimi taşeron yapmaz: GEMKOM iki rotada da aynı tutarla yapar"
            >
              iki rotada aynı
            </Badge>{' '}
          </>
        ) : null}
        {text ? <Decorated text={text} /> : null}
      </td>
    );
  };
  const n = (val: unknown, digits = 0): ReactNode => (val == null ? <span className="est-muted">—</span> : fmt(val, digits));
  // every money cell also in €/kg on the report's own kg (the backend's total_kg, the €/kg row's basis)
  const kgTotal = Number(ct.total_kg) || null;
  const nk = (val: unknown, digits = 0): ReactNode => (
    <>
      {n(val, digits)}
      {kgTotal && digits === 0 && val != null && Number(val) ? (
        <small className="est-cell-sub">{fmt(Number(val) / kgTotal, 2)} €/kg</small>
      ) : null}
    </>
  );

  if (route === 'compare') {
    const a = 'in_house';
    const b = 'subcontract';
    const delta = (x: Payload, digits = 0) => {
      const va = x[a]?.expected;
      const vb = x[b]?.expected;
      if (va == null || vb == null) return <td className="num est-muted">—</td>;
      const d = vb - va;
      const cls = Math.abs(d) < 0.5 / 10 ** digits ? 'is-zero' : d > 0 ? 'is-up' : 'is-down';
      return (
        <td className={`num est-delta ${cls}`}>{cls === 'is-zero' ? '0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), digits)}`}</td>
      );
    };
    const tr = (x: Payload, key: string, cls = '', digits = 0) => (
      <tr key={key} className={cls}>
        <td className="est-item">{x.label}</td>
        <td className="num">{nk(x[a]?.expected, digits)}</td>
        <td className="num">{nk(x[b]?.expected, digits)}</td>
        {delta(x, digits)}
        {basisCell(x)}
      </tr>
    );
    return (
      <div className="est-table-wrap">
        <table className="est-table est-cost is-compare">
          <thead>
            <tr>
              <th>Kalem</th>
              <th className="num">
                İç imalat<small>beklenen</small>
              </th>
              <th className="num">
                Taşeron<small>beklenen</small>
              </th>
              <th className="num">
                Fark<small>taşeron − iç imalat</small>
              </th>
              <th>Dayanak</th>
            </tr>
          </thead>
          <tbody>{body.map((x, i) => tr(x, `r${i}`, isZeroRow(x, [a, b]) ? 'is-zero' : ''))}</tbody>
          <tfoot>
            {total ? tr(total, 'total', 'est-total') : null}
            {perKg ? tr(perKg, 'perkg', 'est-perkg', 2) : null}
          </tfoot>
        </table>
      </div>
    );
  }

  const k = route ?? '';
  const totalExp = total?.[k]?.expected || body.reduce((s, x) => s + (Number(x[k]?.expected) || 0), 0);
  const tr = (x: Payload, key: string, cls = '', digits = 0, share = true) => (
    <tr key={key} className={cls}>
      <td className="est-item">{x.label}</td>
      <td className="num est-lohi">{nk(x[k]?.low, digits)}</td>
      <td className="num is-exp">{nk(x[k]?.expected, digits)}</td>
      <td className="num est-lohi">{nk(x[k]?.high, digits)}</td>
      <td className="est-share-cell">{share ? <ShareBar part={x[k]?.expected} total={totalExp} /> : null}</td>
      {basisCell(x)}
    </tr>
  );
  return (
    <div className="est-table-wrap">
      <table className="est-table est-cost">
        <thead>
          <tr>
            <th>Kalem</th>
            <th className="num">Düşük</th>
            <th className="num is-exp">Beklenen</th>
            <th className="num">Yüksek</th>
            <th className="est-share-cell">Pay</th>
            <th>Dayanak</th>
          </tr>
        </thead>
        <tbody>{body.map((x, i) => tr(x, `r${i}`, isZeroRow(x, [k]) ? 'is-zero' : ''))}</tbody>
        <tfoot>
          {total ? tr(total, 'total', 'est-total', 0, false) : null}
          {perKg ? tr(perKg, 'perkg', 'est-perkg', 2, false) : null}
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Malzeme

function materialSection(r: Payload, m: ReportModel): ReactNode {
  const lines: Payload[] = r.material_lines || [];
  const sec = m.sections.malzeme;
  if (!lines.length) {
    return sec && sec.body.trim() ? (
      <Section secKey="malzeme" title="Malzeme">
        <Md text={sec.body} />
      </Section>
    ) : null;
  }
  const items = lines.filter((x) => !x.is_total);
  const totalLine = lines.find((x) => x.is_total);
  const keys = Object.keys(items[0] || {}).filter((k) => k !== 'amount_eur' && k !== 'is_total');
  const amountKey = keys.find((k) => /^tutar/i.test(k));
  const textKeys = keys.filter((k) => k !== amountKey);
  const total = totalLine?.amount_eur ?? items.reduce((s, x) => s + (Number(x.amount_eur) || 0), 0);
  const priceKey = textKeys.find((k) => /birim fiyat/i.test(k));
  const cell = (x: Payload, k: string) => {
    const raw = String(x[k] ?? '').replace(/\*\*/g, '');
    if (k === priceKey && /^bilinmiyor/i.test(raw.trim()))
      return (
        <td key={k}>
          <Badge cls="status-orange">Fiyat yok</Badge>
        </td>
      );
    const cls = k === priceKey ? 'est-basis' : /miktar/i.test(k) ? 'num est-nowrap' : '';
    return (
      <td key={k} className={cls}>
        {raw ? <Decorated text={raw} /> : <span className="est-muted">—</span>}
      </td>
    );
  };
  const missing = items.filter((x) => x.amount_eur == null).length;
  const notes = sec ? withoutFirstTable(sec.body) : '';
  return (
    <Section secKey="malzeme" title="Malzeme" count={items.length} sub={`toplam ${money(total)}`}>
      <div className="est-table-wrap">
        <table className="est-table est-material">
          <thead>
            <tr>
              {textKeys.map((k) => (
                <th key={k} className={/miktar/i.test(k) ? 'num' : ''}>
                  {k}
                </th>
              ))}
              <th className="num">Tutar €</th>
              <th className="est-share-cell">Pay</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={i} className={x.amount_eur == null ? 'is-missing' : ''}>
                {textKeys.map((k) => cell(x, k))}
                <td className="num is-exp">{x.amount_eur == null ? <span className="est-muted">—</span> : fmt(x.amount_eur, 0)}</td>
                <td className="est-share-cell">
                  <ShareBar part={x.amount_eur} total={total} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="est-total">
              <td colSpan={textKeys.length}>
                Toplam
                {missing ? (
                  <>
                    {' '}
                    <span className="est-muted fw-normal">({missing} kalem fiyatsız, dahil değil)</span>
                  </>
                ) : null}
              </td>
              <td className="num">{fmt(total, 0)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {notes ? (
        <div className="est-notes">
          <Md text={notes} />
        </div>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------- Benzer işler

function similarSection(r: Payload, m: ReportModel): ReactNode {
  const jobs: Payload[] = (r.similar_jobs || []).map(similarRow);
  if (!jobs.length) {
    return m.maliyetSimilarTable ? (
      <Section secKey="benzer" title="Benzer işler">
        <Md text={m.maliyetSimilarTable} />
      </Section>
    ) : null;
  }
  return <SimilarSection r={r} m={m} jobs={jobs} />;
}

function SimilarSection({ r, m, jobs }: { r: Payload; m: ReportModel; jobs: Payload[] }) {
  const { view, actions } = useReport();
  const sorted = [...jobs].sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
  const calRefs = new Set<string>(r.hours?.calibration?.in_house?.references_used || r.inputs?.references_used || []);
  const shown = view.similarAll ? sorted : sorted.slice(0, SIMILAR_PREVIEW);
  const muted = <span className="est-muted">—</span>;
  return (
    <Section
      secKey="benzer"
      title="Benzer işler"
      count={sorted.length}
      sub="benzerliğe göre; marj = (satış − gerçekleşen maliyet) ÷ satış"
    >
      <div className="est-table-wrap">
        <table className="est-table est-similar">
          <thead>
            <tr>
              <th rowSpan={2}>İş</th>
              <th rowSpan={2}>Rota</th>
              <th rowSpan={2} className="num">
                Benzerlik
              </th>
              <th rowSpan={2} className="num">
                Faktör
              </th>
              <th rowSpan={2} className="num">
                kg
              </th>
              <th colSpan={3} className="est-th-group">
                €/kg
              </th>
              <th rowSpan={2} className="num">
                Marj
              </th>
              <th rowSpan={2} className="num">
                Kaynak<small>h/adet</small>
              </th>
              <th rowSpan={2} className="num">
                NCR
              </th>
            </tr>
            <tr>
              <th className="num">Gerçekleşen</th>
              <th className="num">Malzeme</th>
              <th className="num">Satış</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x, i) => (
              <tr key={i}>
                <td className="est-job-cell">
                  <span className="est-job-line">
                    <JobLink no={x.job_no} />
                    {calRefs.has(x.job_no) ? (
                      <span className="est-tag est-tag-cal" title="Saat kalibrasyonunda kullanıldı">
                        kalibrasyon
                      </span>
                    ) : null}
                    {m.citedJobs.has(x.job_no) ? (
                      <span className="est-tag" title="Raporun benzer iş tablosunda">
                        raporda
                      </span>
                    ) : null}
                  </span>
                  <div className="est-job-title">
                    {x.title || ''}
                    {x.customer ? (
                      <>
                        {' · '}
                        <span className="est-muted">{x.customer}</span>
                      </>
                    ) : null}
                  </div>
                </td>
                <td>
                  <RouteBadge route={x.route} />
                </td>
                <td className="num">
                  <SimilarityCell s={x.similarity} />
                </td>
                <td className="num">
                  <FactorBadge f={x.factor} />
                </td>
                <td className="num">{x.weight_kg ? fmt(x.weight_kg, 0) : muted}</td>
                <td className="num">{x.eur_per_kg != null ? fmt(x.eur_per_kg, 2) : muted}</td>
                <td className="num">{x.material_eur_per_kg != null ? fmt(x.material_eur_per_kg, 2) : muted}</td>
                <td className="num">{x.sell_per_kg != null ? fmt(x.sell_per_kg, 2) : muted}</td>
                <td className="num">
                  {x.margin == null ? (
                    muted
                  ) : (
                    <span className={x.margin < 0 ? 'est-neg' : 'est-pos'}>
                      {x.margin < 0 ? '−' : ''}%{fmt(Math.abs(x.margin) * 100, 1)}
                    </span>
                  )}
                </td>
                <td className="num">
                  {x.recorded_welding_h_per_unit != null
                    ? fmt(x.recorded_welding_h_per_unit, 1)
                    : x.welding_hours
                      ? fmt(x.welding_hours, 1)
                      : muted}
                </td>
                <td className="num">
                  {x.ncr_count ? (
                    <Badge cls="status-orange" title="Uygunsuzluk raporu (NCR) sayısı">
                      {String(x.ncr_count)}
                    </Badge>
                  ) : (
                    <span className="est-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > SIMILAR_PREVIEW ? (
        <button type="button" className="btn btn-link btn-sm est-more-btn" onClick={actions.similarAll}>
          {view.similarAll ? `İlk ${SIMILAR_PREVIEW} işi göster` : `Tümünü göster (${sorted.length})`}
        </button>
      ) : null}
      {m.maliyetSimilarTable ? (
        <details className="est-more">
          <summary>
            Raporun benzer iş tablosu <span className="est-muted">(marj notlarıyla)</span>
          </summary>
          <Md text={m.maliyetSimilarTable} />
        </details>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------- Teklif önerisi

/** What follows the numbers on the price lines ("Hesap: …", "güncel bakırla maliyet …"): kept, not lost. */
function labeledPriceNotes(body: string): string[] {
  return String(body || '')
    .split('\n')
    .filter((l) => /önerilen fiyat|taban fiyat/i.test(l.replace(/\*/g, '')) && !/^\s*\|/.test(l))
    .map((l) => {
      const clean = l.replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/, '');
      const mm = clean.match(/\)\.?\s+(.+)$/);
      return mm ? mm[1]! : '';
    })
    .filter(Boolean);
}

function offerSection(m: ReportModel): ReactNode {
  const sec = m.sections.teklif;
  if (!sec) return null;
  const text = sectionMarkdown(sec)
    .split('\n')
    .filter((l) => !/önerilen fiyat|taban fiyat/i.test(l.replace(/\*/g, '')) || /^\s*\|/.test(l))
    .join('\n');
  const tiles: ReactNode[] = [];
  if (m.price && (m.price.total != null || m.price.raw != null)) {
    tiles.push(
      <div key="price" className="est-offer-tile is-main">
        <span>Önerilen fiyat</span>
        <strong>{money(m.price.total ?? m.price.raw)}</strong>
        {m.price.perUnit != null ? (
          <small>
            {money(m.price.perUnit)}/adet{m.price.perKg != null ? ` · ${fmt(m.price.perKg, 2)} €/kg` : ''}
          </small>
        ) : null}
      </div>,
    );
  }
  if (m.floor && (m.floor.total != null || m.floor.raw != null)) {
    tiles.push(
      <div key="floor" className="est-offer-tile">
        <span>Taban fiyat</span>
        <strong>{money(m.floor.total ?? m.floor.raw)}</strong>
        {m.floor.perUnit != null ? <small>{money(m.floor.perUnit)}/adet</small> : null}
      </div>,
    );
  }
  const notes = labeledPriceNotes(sec.body);
  return (
    <Section secKey="teklif" title="Teklif önerisi">
      {tiles.length ? <div className="est-offer-tiles">{tiles}</div> : null}
      {notes.length ? (
        <div className="est-offer-calc">
          {notes.map((n, i) => (
            <div key={i}>
              <i className="fas fa-calculator" aria-hidden />
              {n}
            </div>
          ))}
        </div>
      ) : null}
      <Md text={text} className="est-offer-md" />
    </Section>
  );
}

// ---------------------------------------------------------------- Dikkat noktaları

function attentionSection(m: ReportModel): ReactNode {
  const sec = m.sections.dikkat;
  if (!sec) return null;
  const cards = sec.subs.map((s, i) => {
    const icon = (DEPARTMENT_ICONS.find(([re]) => re.test(s.title)) || [null, 'fa-circle-exclamation'])[1];
    const n = bulletCount(s.body);
    return (
      <div key={i} className="est-card">
        <div className="est-card-head">
          <i className={`fas ${icon}`} aria-hidden />
          <span>{s.title}</span>
          {n ? <span className="est-sec-count">{n}</span> : null}
        </div>
        <Md text={s.body} />
      </div>
    );
  });
  if (!sec.body.trim() && !cards.length) return null;
  return (
    <Section secKey="dikkat" title="Dikkat noktaları" count={bulletCount(sectionMarkdown(sec)) || null} sub="departman bazında">
      {sec.body ? <Md text={sec.body} /> : null}
      {cards.length ? <div className="est-cards is-wide">{cards}</div> : null}
    </Section>
  );
}

// ---------------------------------------------------------------- Sorular

function questionsSection(r: Payload, m: ReportModel): ReactNode {
  const q = r.questions || {};
  const groups: [string, string, string[], string?][] = QUESTION_GROUPS.filter(([k]) => q[k]?.length).map(([k, label, icon]) => [
    label,
    icon,
    q[k],
  ]);
  const open: string[] = r.weld_schedule?.open_questions || [];
  if (open.length) groups.push(['Çizimin söylemediği', 'fa-fire-flame-curved', open, 'kaynak listesi']);
  if (!groups.length) {
    const text = sectionMarkdown(m.sections.sorular);
    return m.sections.sorular && text ? (
      <Section secKey="sorular" title="Teklif öncesi istenecekler">
        <Md text={text} />
      </Section>
    ) : null;
  }
  return (
    <Section secKey="sorular" title="Teklif öncesi istenecekler" count={questionCount(r)} sub="teklif vermeden önce netleşmeli">
      <div className="est-cards">
        {groups.map(([label, icon, items, note]) => (
          <div key={label} className="est-card">
            <div className="est-card-head">
              <i className={`fas ${icon}`} aria-hidden />
              <span>{label}</span>
              {note ? <span className="est-muted fw-normal">({note})</span> : null}
              <span className="est-sec-count">{items.length}</span>
            </div>
            <ul className="est-checklist">
              {items.map((x, i) => (
                <li key={i}>
                  <i className="far fa-square" aria-hidden="true" />
                  <span>
                    <Decorated text={String(x)} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- Rapor metni

function TextSection({ r, m }: { r: Payload; m: ReportModel }) {
  const secs = m.md.sections;
  const parts = (m.preamble ? 1 : 0) + secs.length;
  const [open, setOpen] = useState<boolean[]>(() => Array.from({ length: parts }, () => false));
  // No numbered headings to split at: the text is all there is, so it is not tucked away.
  const [plainClosed, setPlainClosed] = useState(false);
  if (!secs.length) {
    return (
      <Section secKey="metin" title="Rapor metni" collapsed={plainClosed} onToggle={() => setPlainClosed((v) => !v)}>
        <Md text={r.markdown} />
      </Section>
    );
  }
  const anyClosed = open.some((o) => !o);
  const setPart = (i: number, value: boolean) =>
    setOpen((prev) => {
      if (prev[i] === value) return prev;
      const next = [...prev];
      next[i] = value;
      return next;
    });
  const part = (i: number, summary: ReactNode, text: string) => (
    <details
      key={i}
      className="est-more est-text-part"
      open={open[i] ?? false}
      onToggle={(event) => setPart(i, event.currentTarget.open)}
    >
      <summary>{summary}</summary>
      <Md text={text} />
    </details>
  );
  const offset = m.preamble ? 1 : 0;
  return (
    <Section secKey="metin" title="Rapor metni" count={secs.length} sub={m.title || null}>
      <div className="est-text-tools">
        <span className="est-muted">Modelin yazdığı metin, bölüm bölüm.</span>
        <button
          type="button"
          className="btn btn-link btn-sm p-0"
          onClick={() => setOpen(Array.from({ length: parts }, () => anyClosed))}
        >
          {anyClosed ? 'Hepsini aç' : 'Hepsini kapat'}
        </button>
      </div>
      {m.preamble ? part(0, 'Not', m.preamble) : null}
      {secs.map((s, i) => part(i + offset, `${s.num ? `${s.num}. ` : ''}${s.title}`, sectionMarkdown(s)))}
    </Section>
  );
}

// ---------------------------------------------------------------- Girdiler

function InputsSection({ r }: { r: Payload }) {
  const inp = r.inputs || {};
  const u = r.usage || {};
  const rows: [string, ReactNode][] = [];
  const add = (label: string, value: ReactNode) => {
    if (value !== '' && value != null && value !== false) rows.push([label, value]);
  };
  const mins = runMinutes(r);
  add(
    'Çalıştırma',
    `v${r.version ?? ''} · ${formatDateTime(r.created_at)}${r.created_by_name ? ` · ${r.created_by_name}` : ''}${mins != null ? ` · ${mins} dk` : ''}`,
  );
  const models = inp.models || {};
  add(
    'Model',
    [models.report ? `rapor ${models.report}` : r.model ? String(r.model) : '', models.extraction ? `çıkarım ${models.extraction}` : '']
      .filter(Boolean)
      .join(' · '),
  );
  const usd = r.usage_usd != null ? Number(r.usage_usd) : null;
  const split = [u.report?.usd != null ? `rapor ${fmt(u.report.usd, 2)}` : '', u.extraction?.usd != null ? `çıkarım ${fmt(u.extraction.usd, 2)}` : '']
    .filter(Boolean)
    .join(' + ');
  add(
    'Maliyet',
    usd != null ? (
      <>
        {fmt(usd, 2)} USD
        {split ? (
          <>
            {' '}
            <span className="est-muted">({split})</span>
          </>
        ) : null}
      </>
    ) : (
      ''
    ),
  );
  if (u.report?.input_tokens) {
    add(
      'Token',
      `rapor ${fmt(u.report.input_tokens, 0)} giriş / ${fmt(u.report.output_tokens, 0)} çıkış${
        u.extraction?.input_tokens ? ` · çıkarım ${fmt(u.extraction.input_tokens, 0)} / ${fmt(u.extraction.output_tokens, 0)}` : ''
      }`,
    );
  }
  const docs = u.report?.documents;
  add('Belgeler', [docs != null ? `${fmt(docs, 0)} belge` : '', inp.pages != null ? `${fmt(inp.pages, 0)} sayfa` : ''].filter(Boolean).join(' · '));
  const method = r.hours?.method;
  const plan = planInfo(r.hours);
  if (plan.plan) {
    const nParams = Object.keys(r.hours?.model_parameters || {}).length;
    add('Saat yöntemi', `imalat planı (v5)${nParams ? ` · ${fmt(nParams, 0)} model parametresi` : ''}`);
    add(
      'Plan şeması',
      `${plan.schemaVersion >= 2 ? 'plan v2 (alt montajlar, parçalar, talaşlı özellikler)' : 'v1 kaynak listesi'}${
        plan.proxy ? ' · eski liste plana uyarlandı (proxy)' : ''
      }${plan.structureClassLabel ? ` · sınıf: ${plan.structureClassLabel}` : ''}`,
    );
    const ded: ReactNode[] = [
      plan.deduced.weldShare != null
        ? `kaynak metresi %${fmt(plan.deduced.weldShare * 100, 0)} çıkarım (${fmt(plan.weldM.deduced, 1)} / ${fmt(plan.weldM.total, 1)} m${
            plan.weldM.rule ? `, ${fmt(plan.weldM.rule, 1)} m kural` : ''
          })`
        : '',
      plan.deduced.machShare != null && plan.deduced.machH != null
        ? `talaşlı saat %${fmt(plan.deduced.machShare * 100, 0)} çıkarım (${fmt(plan.deduced.machH, 1)} h${
            plan.deduced.machDefaultH ? `, ${fmt(plan.deduced.machDefaultH, 1)} h varsayılan` : ''
          })`
        : '',
      plan.deduced.thinDrawingSet ? <strong>çizim seti ince</strong> : '',
    ].filter(Boolean);
    add('Çıkarım payı', ded.length ? joinNodes(ded, ' · ') : '');
    if (plan.subAssemblies.length) {
      add(
        'Alt montaj güveni',
        <>
          {plan.subAssemblies
            .map((s) => `${s.name || s.sub_id || ''} ${s.confidence != null ? `%${fmt(Number(s.confidence) * 100, 0)}` : '—'}`)
            .join(' · ')}
          {plan.planConfidence != null ? (
            <>
              {' '}
              <span className="est-muted">(kütle ağırlıklı %{fmt(plan.planConfidence * 100, 0)})</span>
            </>
          ) : null}
        </>,
      );
    }
  } else if (method || r.hours?.unit_times_h_per_m) {
    const nParams = Object.keys(r.hours?.model_parameters || {}).length;
    add(
      'Saat yöntemi',
      method === 'geometry_v4'
        ? `birleşim geometrisi (v4)${nParams ? ` · ${fmt(nParams, 0)} model parametresi` : ''}`
        : method
          ? String(method)
          : 'standart birim süreler (v3)',
    );
  }
  if (inp.weld_schedule_version)
    add(
      'Kaynak listesi',
      `v${inp.weld_schedule_version}${inp.weld_schedule_created ? ' · bu çalıştırmada çıkarıldı' : ' · önceki çıkarım kullanıldı'}`,
    );
  if ((inp.references_used || []).length) add('Kalibrasyon referansları', <JobLinks nos={inp.references_used} />);
  if ((inp.similar_job_nos || []).length) add('Benzer iş adayları', `${inp.similar_job_nos.length} iş`);
  if (inp.similar_drawings_job) add('Çizimi eklenen benzer iş', <JobLink no={inp.similar_drawings_job} />);
  const params = Object.entries(inp.parameters || {}).map(([k, val]) => {
    const [label, f] = PARAMETER_LABELS[k] || [k, (x: number) => fmt(x, 2)];
    return (
      <span key={k} className="est-param">
        <span>{label}</span>
        <strong>{f(Number(val))}</strong>
      </span>
    );
  });
  const skipped: Payload[] = inp.skipped || u.extraction?.skipped || [];
  const files: string[] = u.extraction?.files || [];
  return (
    <Section secKey="girdiler" title="Girdiler ve çalıştırma">
      <div className="est-kvs">
        {rows.map(([label, value]) => (
          <div key={label} className="est-kv">
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
      {params.length ? (
        <>
          <div className="est-sub-title">Parametreler</div>
          <div className="est-params">{params}</div>
        </>
      ) : null}
      {skipped.length ? (
        <>
          <div className="est-sub-title">Atlanan belgeler</div>
          <ul className="est-plain-list">
            {skipped.map((s, i) => (
              <li key={i}>
                {Array.isArray(s) ? s[0] : s}
                {Array.isArray(s) && s[1] ? (
                  <>
                    {' — '}
                    <span className="est-muted">{SKIP_REASONS[s[1]] || s[1]}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {files.length ? (
        <details className="est-more">
          <summary>Kaynak listesi çıkarımında okunan dosyalar ({files.length})</summary>
          <ul className="est-plain-list est-cols">
            {files.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------- weld list, method

/** A fact's sub line as tooltip text. */
function factTitle(sub: ReactNode): string | undefined {
  return typeof sub === 'string' ? sub : undefined;
}

/** The weld list / manufacturing plan section of the card. */
export function WeldSection({ ws }: { ws: WeldSchedule & Payload }) {
  const { view, actions } = useReport();
  const t = ws.totals || {};
  const byMat = Object.entries(t.weld_m_by_material || {})
    .map(([mat, val]) => `${MATERIAL_LABELS[mat] || mat} ${fmt(val, 1)} m`)
    .join(', ');
  const bu = ws.bottom_up || {};
  const plan = bu.method === 'plan_v5' || Array.isArray(bu.work_centres);
  const schema = Number(ws.schema_version ?? bu.schema_version ?? 1) || 1;
  const metres =
    t.weld_m_drawn != null && t.weld_m_deduced != null
      ? `çizim ${fmt(t.weld_m_drawn, 1)} + çıkarım ${fmt(t.weld_m_deduced, 1)} m${byMat ? ` · ${byMat}` : ''}`
      : byMat;
  const centres = plan
    ? (bu.work_centres || [])
        .filter((wc: Payload) => Number(wc.hours))
        .map((wc: Payload) => `${wc.label} ${fmt(wc.hours, 0)}`)
        .join(' + ')
    : '';
  const facts: [string, ReactNode, ReactNode?][] = [
    ['Birleşim', fmt(t.joints_total ?? 0, 0)],
    ['Kaynak / adet', `${fmt(t.weld_m_total, 1)} m`, metres],
    schema >= 2 && (ws.sub_assemblies || ws.parts)
      ? [
          'Alt montaj · parça',
          `${fmt((ws.sub_assemblies || []).length, 0)} · ${fmt((ws.parts || []).length, 0)}`,
          `${fmt(ws.pieces_to_cut_per_unit ?? bu.parts_count ?? 0, 0)} kesilecek parça · ${fmt(ws.bends_per_unit ?? 0, 0)} büküm`,
        ]
      : ['Parça · büküm', `${fmt(ws.pieces_to_cut_per_unit ?? 0, 0)} · ${fmt(ws.bends_per_unit ?? 0, 0)}`],
    ['Birim kütle', `${fmt(ws.unit_mass_kg, 0)} kg`, ws.mass_basis ? String(ws.mass_basis) : ''],
    plan
      ? ['Plan saati / adet', `${fmt(bu.total_h, 1)} h`, centres || `kaynak ${fmt(bu.welding_h, 1)} + diğer ${fmt(bu.non_welding_h, 1)}`]
      : ['Standart saat / adet', `${fmt(bu.total_h, 1)} h`, `kaynak ${fmt(bu.welding_h, 1)} + diğer ${fmt(bu.non_welding_h, 1)}`],
    ...(plan && bu.structure_class
      ? [
          [
            'Yapı sınıfı',
            bu.structure_class_label || STRUCTURE_CLASS_LABELS[bu.structure_class] || bu.structure_class,
            <SchemaPill key="schema" version={schema} />,
          ] as [string, ReactNode, ReactNode],
        ]
      : []),
    [
      'Güven',
      <ConfidencePill key="conf" value={ws.confidence} />,
      plan && bu.plan_confidence != null ? `plan güveni %${fmt(Number(bu.plan_confidence) * 100, 0)}` : '',
    ],
  ];
  const openQuestions: string[] = ws.open_questions || [];
  const hints: string[] = (ws.operations_hints || []).map((x: Payload) => String(x.text || x.kind || '')).filter(Boolean);
  const title = schema >= 2 ? 'İmalat planı ve kaynak listesi' : 'Kaynak listesi';
  return (
    <Section
      secKey="kaynak"
      title={
        <>
          {title} <span className="est-muted fw-normal">· 1 adet · v{ws.version ?? ''}</span>
        </>
      }
      tools={
        <button type="button" className="btn btn-link btn-sm" onClick={actions.weldToggle}>
          {view.weldOpen ? 'Listeyi gizle' : 'Listeyi göster'}
        </button>
      }
    >
      <div className="est-facts is-compact">
        {facts.map(([label, value, sub]) => (
          <div key={label} className="est-fact">
            <span className="est-fact-label">{label}</span>
            <span className="est-fact-value">{value}</span>
            {sub ? (
              <span className="est-fact-sub" title={factTitle(sub)}>
                {sub}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {view.weldOpen ? (
        <>
          <div className="est-weld-table">
            <WeldTable joints={ws.joints ?? []} />
          </div>
          {openQuestions.length ? (
            <div className="est-note-line">
              <i className="fas fa-circle-question" aria-hidden />
              <span>
                <strong>Çizimin söylemediği:</strong> {openQuestions.join(' · ')}
              </span>
            </div>
          ) : null}
          {hints.length ? (
            <div className="est-note-line">
              <i className="fas fa-clipboard-list" aria-hidden />
              <span>
                <strong>Çizimin işlem notları:</strong> {hints.join(' · ')}
              </span>
            </div>
          ) : null}
          <PlanParts schedule={ws} />
        </>
      ) : null}
    </Section>
  );
}

/** "Nasıl çalışır?": the backend's method text once loaded (GET /estimator/method/). */
export function MethodSection({ markdown, error }: { markdown: string | null; error: string | null }) {
  return (
    <Section
      secKey="yontem"
      title="Nasıl çalışır?"
      icon="fa-circle-question"
      sub="kaynak listesi, birim süreler, referans seçimi ve faktör"
    >
      {error ? (
        <div className="est-md">
          <span className="est-error">{error}</span>
        </div>
      ) : markdown != null ? (
        <div className="est-md">
          <Markdown source={markdown} />
        </div>
      ) : (
        <span className="est-muted small">
          <i className="fas fa-spinner fa-spin me-1" aria-hidden />
          Yükleniyor…
        </span>
      )}
    </Section>
  );
}
