// 'Neden?' drawer content per pillar (render/drawer.js): the raw numbers and
// the payload's lists as tables. No second endpoint.
import type { ReactNode } from 'react';
import type {
  DeliverySection,
  FinanceSection,
  MaterialSection,
  OrderBookSection,
  PeopleSection,
  ProductionSection,
  QualitySafetySection,
} from '@/api/management/dashboard';
import { StatusBadge, type StatusFamily } from '@/ui';
import { ACCENT, TrendChart } from '@/ui/charts';
import {
  CAPACITY_VERDICT,
  jobStatusLabel,
  MARGIN_VERDICT,
  NCR_SEVERITY,
  PILLARS,
  teamLabel,
  type PillarId,
} from './labels';
import {
  dots,
  formatEurCompact,
  formatTons,
  formatWd,
  monthLabel,
  n0,
  num,
  pct,
  pf,
  shortDate,
  slowState,
  stampLabel,
} from './model';
import type { PillarContext } from './pillarModels';
import {
  Chip,
  DrawerSection,
  DrillLink,
  HiddenMoneyBadge,
  JobLink,
  Kv,
  RagBadge,
  SimpleTable,
  SlowNote,
  Tone,
} from './parts';
import classes from './dashboard.module.css';

const isSet = (v: unknown) => v !== null && v !== undefined;

function Links({ links }: { links: [string, string][] }) {
  return (
    <div className={classes.drawerLinks}>
      {links.map(([to, text]) => (
        <DrillLink key={to} to={to}>
          {text}
        </DrillLink>
      ))}
    </div>
  );
}

function Verdict({
  map,
  value,
}: {
  map: Record<string, { label: string; color: StatusFamily }>;
  value: string | null | undefined;
}) {
  const v = value ? map[value] : undefined;
  return v ? <StatusBadge color={v.color}>{v.label}</StatusBadge> : <>{value || ''}</>;
}

function OrderBook({ ob, ctx }: { ob: OrderBookSection; ctx: PillarContext }) {
  const b2b = ob.book_to_bill || {};
  const intake = ob.intake || null;
  const value = ob.value;
  const vstate = slowState(value, {
    slowStatus: ctx.slowStatus,
    errors: ctx.errors,
    section: 'order_book',
    sub: 'value',
  });
  const money = ctx.money;
  return (
    <>
      <DrawerSection title="Defter">
        <Kv
          rows={[
            [
              'Canlı iş emri',
              `${num(ob.live_roots)} (aktif ${num(ob.active)} · revizyonda ${num(ob.revision_hold)})`,
            ],
            ['Park edilmiş (elle beklemede)', num(ob.manual_hold_roots)],
            ['Müşteri', num(ob.customers)],
            ['Toplam ağırlık', formatTons(ob.total_kg)],
            ['Kalan ağırlık', formatTons(ob.remaining_kg)],
            ['Ağırlıksız iş', num(ob.unweighted_roots)],
            ['Bu ay açılan / geçen ay', `${num(ob.opened_month)} / ${num(ob.opened_prev_month)}`],
          ]}
        />
      </DrawerSection>
      <DrawerSection title="Giren / çıkan (son 3 ay)">
        <Kv
          rows={[
            [
              'Oran',
              <>
                {isSet(b2b.ratio_kg) ? num(b2b.ratio_kg, 2) : '—'}
                {b2b.basis === 'count' ? (
                  <>
                    {' '}
                    <Chip color="grey">adet bazlı</Chip>
                  </>
                ) : null}
              </>,
            ],
            ['Önceki 3 ay', isSet(b2b.prev_ratio_kg) ? num(b2b.prev_ratio_kg, 2) : '—'],
            ['Giren', dots(formatTons(b2b.intake_kg), `${num(b2b.intake_n)} iş`)],
            ['Çıkan', dots(formatTons(b2b.completed_kg), `${num(b2b.completed_n)} iş`)],
            ['Not', b2b.burst_flag ? 'Dönemde toplu tamamlama var' : ''],
          ]}
        />
      </DrawerSection>
      {intake ? (
        <DrawerSection
          title="Kazanılan teklifler"
          extra={ctx.moneyVisible ? null : <HiddenMoneyBadge />}
        >
          <Kv
            rows={[
              ['Bu ay', dots(`${num(intake.won_month)} teklif`, money(intake.won_month_eur))],
              [
                'Geçen ay',
                dots(`${num(intake.won_prev_month)} teklif`, money(intake.won_prev_month_eur)),
              ],
              [
                'İş emrine dönüşmemiş',
                n0(intake.won_not_converted) > 0 ? (
                  <Tone tone="orange">
                    {num(intake.won_not_converted)} teklif kazanıldı, iş emrine dönüşmedi
                  </Tone>
                ) : (
                  '0'
                ),
              ],
            ]}
          />
          <SimpleTable
            columns={[
              { label: 'Ay', cell: (r) => monthLabel(r.month) },
              { label: 'Kazanılan', num: true, cell: (r) => num(r.won) },
              ...(ctx.moneyVisible
                ? [{ label: 'Tutar', num: true, cell: (r: WonRow) => money(r.won_eur) || '—' }]
                : []),
            ]}
            rows={intake.series_6m}
            empty="Seri yok"
          />
        </DrawerSection>
      ) : null}
      <DrawerSection
        title="Defter değeri"
        extra={vstate === 'ready' ? stampLabel(value?.generated_at) : null}
      >
        {vstate !== 'ready' || !value ? (
          <SlowNote state={vstate === 'ready' ? 'unavailable' : vstate} />
        ) : (
          <Kv
            rows={[
              [
                'Defter değeri',
                ctx.moneyVisible ? (
                  money(value.value_eur) || 'Fiyatlı iş yok'
                ) : (
                  <HiddenMoneyBadge />
                ),
              ],
              ['Kendi fiyatı olan', ctx.moneyVisible ? money(value.own_value_eur) : ''],
              ['Fiyatsız iş', num(value.unpriced_roots)],
              [
                'En büyük müşterinin payı',
                isSet(value.top_customer_share_pct) ? pct(value.top_customer_share_pct) : '',
              ],
            ]}
          />
        )}
      </DrawerSection>
      <Links
        links={[
          ['/projects/project-tracking', 'Proje takibi'],
          ['/projects/cost-table', 'Maliyet tablosu'],
          ['/management/reports/overview', 'Genel bakış raporu'],
        ]}
      />
    </>
  );
}
type WonRow = NonNullable<NonNullable<OrderBookSection['intake']>['series_6m']>[number];

function Delivery({ dl, ctx }: { dl: DeliverySection; ctx: PillarContext }) {
  const od = dl.overdue || {};
  const otd = dl.otd_13w || {};
  const due = dl.due || {};
  const gate = dl.design_gate || {};
  const slips = dl.slips_30d || null;
  const fc = dl.forecast;
  const fstate = slowState(fc, {
    slowStatus: ctx.slowStatus,
    errors: ctx.errors,
    section: 'delivery',
    sub: 'forecast',
  });
  return (
    <>
      <DrawerSection title="Termini geçen işler">
        <Kv
          rows={[
            ['Sayı', `${num(od.count)} / ${num(od.live_total)} canlı iş`],
            ['Kalan tonajın payı', isSet(od.share_kg_pct) ? pct(od.share_kg_pct, 1) : ''],
            ['Kalan ağırlık', formatTons(od.remaining_kg)],
            ['Medyan gecikme', isSet(od.median_late_wd) ? formatWd(od.median_late_wd) : ''],
            ['Ağırlıksız', num(od.unweighted)],
          ]}
        />
        <SimpleTable
          columns={[
            { label: 'İş Emri', cell: (r) => <JobLink jobNo={r.job_no} /> },
            { label: 'Müşteri', cell: (r) => r.customer || '—' },
            { label: 'İş Adı', cell: (r) => r.title || '—' },
            { label: 'Termin', cell: (r) => shortDate(r.target) || '—' },
            { label: 'Gecikme', num: true, cell: (r) => formatWd(r.late_wd) || '—' },
            { label: 'Kalan', num: true, cell: (r) => formatTons(r.remaining_kg) || '—' },
            {
              label: 'Durum',
              cell: (r) =>
                r.hold_kind ? (
                  <StatusBadge color={r.hold_kind === 'revision' ? 'purple' : 'grey'}>
                    {jobStatusLabel('on_hold', r.hold_kind)}
                  </StatusBadge>
                ) : (
                  ''
                ),
            },
          ]}
          rows={od.jobs}
          empty="Termini geçen iş yok"
        />
      </DrawerSection>
      <DrawerSection title="Zamanında tamamlama (13 hafta)">
        <Kv
          rows={[
            ['Güncel termine göre', `${pct(otd.pct)} (${num(otd.on_time)}/${num(otd.total)})`],
            [
              'Önceki 13 hafta',
              isSet(otd.prev_pct) ? `${pct(otd.prev_pct)} (${num(otd.prev_total)} iş)` : '',
            ],
            ['İlk termine göre', isSet(otd.vs_original_pct) ? pct(otd.vs_original_pct) : ''],
            ['Not', otd.burst_flag ? 'Dönemde toplu tamamlama var' : ''],
          ]}
        />
      </DrawerSection>
      <DrawerSection title="Yaklaşan termin">
        <Kv
          rows={[
            ['7 gün', num(due.d7)],
            ['14 gün', dots(num(due.d14), formatTons(due.d14_kg))],
            ['30 gün', num(due.d30)],
            ['Çizimsiz (30 gün)', num(gate.no_release_due30)],
            [
              'Tasarım gecikmiş / hedefsiz',
              `${num(gate.design_late)} / ${num(gate.design_no_target)}`,
            ],
          ]}
        />
      </DrawerSection>
      {slips ? (
        <DrawerSection title="Termin değişiklikleri (30 gün)">
          <Kv
            rows={[
              ['Öteleme', num(slips.pushes)],
              ['Öne çekme', num(slips.pull_ins)],
              ['İş', num(slips.jobs)],
              [
                'Ortalama öteleme',
                isSet(slips.avg_push_days) ? `${num(slips.avg_push_days, 1)} gün` : '',
              ],
            ]}
          />
        </DrawerSection>
      ) : null}
      <DrawerSection
        title="Öngörü (üretim planı)"
        extra={fstate === 'ready' ? stampLabel(fc?.generated_at, 'Öngörü') : null}
      >
        {fstate !== 'ready' || !fc ? (
          <SlowNote state={fstate === 'ready' ? 'unavailable' : fstate} />
        ) : (
          <Kv
            rows={[
              ['Geç kalma riski', num(fc.late_risk)],
              ['Planda', num(fc.on_track)],
              ['Veri yok', num(fc.no_data)],
              ['Medyan sapma', isSet(fc.median_slip_wd) ? formatWd(fc.median_slip_wd) : ''],
              [
                '14 gün içinde riskli / veri yok',
                `${num(fc.due14_late_risk)} / ${num(fc.due14_no_data)}`,
              ],
            ]}
          />
        )}
      </DrawerSection>
      <Links
        links={[
          ['/projects/project-tracking?meeting=1', 'Sunum modu'],
          ['/management/reports/overview', 'Genel bakış raporu'],
          ['/design/release-approvals', 'Çizim onayları'],
        ]}
      />
    </>
  );
}

const RESOURCE_TYPE: Record<string, string> = {
  unassigned: 'atanmamış',
  subcontractor: 'taşeron',
  team: 'ekip',
};

function Production({ pr, ctx }: { pr: ProductionSection; ctx: PillarContext }) {
  const nk = pr.net_kg || {};
  const cap = pr.capacity;
  const cnc = pr.cnc_week || {};
  const cstate = slowState(cap, {
    slowStatus: ctx.slowStatus,
    errors: ctx.errors,
    section: 'production',
    sub: 'capacity',
  });
  return (
    <>
      <DrawerSection title="Net ilerleme">
        <Kv
          rows={[
            ['Son 4 tam hafta (net)', formatTons(nk.last4w)],
            ['Önceki 4 hafta (net)', formatTons(nk.prev4w)],
            ['Son 4 hafta (brüt)', formatTons(nk.gross_last4w)],
            ['Bu hafta (kısmi)', formatTons(nk.current_week_partial)],
          ]}
        />
      </DrawerSection>
      <DrawerSection
        title="Kaynak kapasitesi"
        extra={cstate === 'ready' ? stampLabel(cap?.generated_at, 'Kapasite') : null}
      >
        {cstate !== 'ready' || !cap ? (
          <SlowNote state={cstate === 'ready' ? 'unavailable' : cstate} />
        ) : (
          <>
            <Kv
              rows={[
                ['Açık kaynak işi', formatTons(cap.remaining_kg)],
                [
                  'Atanmamış',
                  dots(formatTons(cap.unassigned_kg), `${num(cap.unassigned_jobs)} iş`),
                ],
                [
                  'En uzun kuyruk',
                  isSet(cap.max_backlog_weeks)
                    ? `${num(cap.max_backlog_weeks, 1)} hafta${cap.max_backlog_resource ? ` (${cap.max_backlog_resource})` : ''}`
                    : '',
                ],
                [
                  'Aşırı yüklü / sıkışık / hızsız',
                  `${num(cap.overloaded)} / ${num(cap.tight)} / ${num(cap.no_rate)}`,
                ],
              ]}
            />
            <SimpleTable
              columns={[
                { label: 'Kaynak', cell: (r) => r.name || '—' },
                { label: 'Tür', cell: (r) => (r.type ? (RESOURCE_TYPE[r.type] ?? r.type) : '') },
                { label: 'Kalan', num: true, cell: (r) => formatTons(r.remaining_kg) || '—' },
                {
                  label: 'Hafta',
                  num: true,
                  cell: (r) => (isSet(r.weeks) ? num(r.weeks, 1) : '—'),
                },
                {
                  label: 'Durum',
                  cell: (r) => <Verdict map={CAPACITY_VERDICT} value={r.verdict} />,
                },
              ]}
              rows={cap.resources}
              empty="Kaynak yok"
            />
          </>
        )}
      </DrawerSection>
      <DrawerSection title="CNC kesim (bu hafta)">
        <Kv
          rows={[
            ['Kesilen', formatTons(cnc.kg)],
            ['Geçen hafta', formatTons(cnc.prev_week_kg)],
            ['Nest / parça', `${num(cnc.nests)} / ${num(cnc.parts)}`],
            ['Plaka bekleyen kesim', num(cnc.waiting_plate)],
          ]}
        />
      </DrawerSection>
      <Links
        links={[
          ['/planning/project-planning', 'Proje planlama (Kapasite)'],
          ['/manufacturing/cnc-cutting/dashboard', 'CNC kesim'],
          ['/management/reports/overview', 'Genel bakış raporu'],
        ]}
      />
    </>
  );
}

function QualitySafety({ qs }: { qs: QualitySafetySection }) {
  const ncr = qs.ncr_open || {};
  const qc = qs.qc || {};
  const isg = qs.isg || {};
  return (
    <>
      <DrawerSection title="Bloke eden açık NCR">
        <Kv
          rows={[
            ['Toplam', num(ncr.total)],
            [
              'Kritik / Majör / Minör',
              `${num(ncr.critical)} / ${num(ncr.major)} / ${num(ncr.minor)}`,
            ],
            ['30 günden eski', num(ncr.gt30d)],
            ["Departmanda / KK'de bekleyen", `${num(ncr.awaiting_dept)} / ${num(ncr.awaiting_qc)}`],
            ['Bu ay açılan / geçen ay', `${num(ncr.opened_month)} / ${num(ncr.opened_prev_month)}`],
            ['Sınıflandırılmamış', isSet(qs.unclassified_pct) ? pct(qs.unclassified_pct) : ''],
          ]}
        />
        <SimpleTable
          columns={[
            { label: 'İş Emri', cell: (r) => <JobLink jobNo={r.job_no} /> },
            {
              label: 'Ana iş',
              cell: (r) =>
                r.root_job_no && r.root_job_no !== r.job_no ? (
                  <JobLink jobNo={r.root_job_no} />
                ) : (
                  ''
                ),
            },
            { label: 'Müşteri', cell: (r) => r.customer || '—' },
            { label: 'NCR', num: true, cell: (r) => num(r.n) },
            { label: 'En ağır', cell: (r) => <Verdict map={NCR_SEVERITY} value={r.worst} /> },
            { label: 'Termin', cell: (r) => shortDate(r.target) || '—' },
          ]}
          rows={ncr.jobs}
          empty="Açık NCR olan canlı iş yok"
        />
      </DrawerSection>
      <DrawerSection title="KK kapısı">
        <Kv
          rows={[
            ['Bekleyen görev / inceleme', `${num(qc.pending_tasks)} / ${num(qc.pending_reviews)}`],
            [
              'En eski bekleyen',
              isSet(qc.oldest_pending_days) ? `${num(qc.oldest_pending_days)} gün` : '',
            ],
            [
              'Bu ay red oranı',
              n0(qc.reviewed)
                ? `${pct(qc.rejection_pct)} (${num(qc.rejected)}/${num(qc.reviewed)})`
                : '',
            ],
            ['Ortalama süre', isSet(qc.turnaround_days) ? `${num(qc.turnaround_days, 1)} gün` : ''],
          ]}
        />
      </DrawerSection>
      <DrawerSection title="İSG">
        {!isg.has_rows ? (
          <div className={classes.empty}>
            İSG kaydı yok — modül 18 Eyl 2026&apos;dan beri açık
            {isSet(isg.days_since_go_live) ? ` (${num(isg.days_since_go_live)} gün)` : ''}
          </div>
        ) : (
          <Kv
            rows={[
              ['Durum', <RagBadge word={isg.rag} />],
              [
                'Açık / devam eden / onay bekleyen',
                `${num(isg.open)} / ${num(isg.in_progress)} / ${num(isg.resolved)}`,
              ],
              ['Gecikmiş', num(isg.overdue)],
              ['Yüksek + kritik', num(isg.high_critical)],
              [
                'Bu ay kaza / ramak kala',
                `${num(isg.accidents_month)} / ${num(isg.near_miss_month)}`,
              ],
            ]}
          />
        )}
      </DrawerSection>
      <Links
        links={[
          ['/quality-control/ncrs?status__in=draft,submitted,rejected', 'Açık NCR listesi'],
          ['/quality-control/qc-reviews', 'KK incelemeleri'],
          ['/isg/issues?status__in=open,in_progress,resolved', 'İSG kayıtları'],
        ]}
      />
    </>
  );
}

function Material({ mt, ctx }: { mt: MaterialSection; ctx: PillarContext }) {
  const cr = mt.critical || {};
  const bl = mt.blocked;
  const rq = mt.requests || {};
  const bstate = slowState(bl, {
    slowStatus: ctx.slowStatus,
    errors: ctx.errors,
    section: 'material',
    sub: 'blocked',
  });
  return (
    <>
      <DrawerSection title="Bekleyen kritik kalemler">
        <Kv
          rows={[
            ['Kalem / iş', `${num(cr.count)} / ${num(cr.jobs)}`],
            ['Medyan yaş', isSet(cr.median_age_days) ? `${num(cr.median_age_days)} gün` : ''],
            ['Siparişsiz', num(cr.unordered)],
            ['Vaadi geçmiş', num(cr.overdue_promise)],
          ]}
        />
        <SimpleTable
          columns={[
            { label: 'İş Emri', cell: (r) => <JobLink jobNo={r.job_no} /> },
            { label: 'Müşteri', cell: (r) => r.customer || '—' },
            {
              label: 'Kalem',
              cell: (r) => (
                <>
                  {r.item_code || ''}
                  {r.item_name ? <span className={classes.muted}> {r.item_name}</span> : null}
                </>
              ),
            },
            {
              label: 'Miktar',
              num: true,
              cell: (r) =>
                [num(r.quantity, 0) || String(r.quantity ?? ''), r.unit || '']
                  .filter(Boolean)
                  .join(' '),
            },
            { label: 'Talep', cell: (r) => r.request_number || '—' },
            { label: 'Yaş', num: true, cell: (r) => `${num(r.age_days)} g` },
            {
              label: 'Vaat',
              cell: (r) =>
                r.promise_date ? (
                  r.promise_overdue ? (
                    <Tone tone="red">{shortDate(r.promise_date)}</Tone>
                  ) : (
                    shortDate(r.promise_date)
                  )
                ) : (
                  <Chip color="grey">siparişsiz</Chip>
                ),
            },
          ]}
          rows={cr.rows}
          empty="Bekleyen kritik kalem yok"
        />
      </DrawerSection>
      <DrawerSection
        title="Malzeme bekleyen iş (öngörü)"
        extra={bstate === 'ready' ? stampLabel(bl?.generated_at, 'Öngörü') : null}
      >
        {bstate !== 'ready' || !bl ? (
          <SlowNote state={bstate === 'ready' ? 'unavailable' : bstate} />
        ) : (
          <>
            <Kv
              rows={[
                ['İş', `${num(bl.count)} / ${num(bl.live_total)} (${pct(bl.share_pct, 1)})`],
                ['En uzun bekleme (en az)', isSet(bl.max_wait_wd) ? formatWd(bl.max_wait_wd) : ''],
              ]}
            />
            <SimpleTable
              columns={[
                { label: 'İş Emri', cell: (r) => <JobLink jobNo={r.job_no} /> },
                { label: 'Müşteri', cell: (r) => r.customer || '—' },
                { label: 'Bekleme', num: true, cell: (r) => formatWd(r.wait_wd) || '—' },
              ]}
              rows={bl.jobs}
              empty="Öngörü malzeme bekleyen iş göstermiyor"
            />
          </>
        )}
      </DrawerSection>
      <DrawerSection title="Planlama talep kuyruğu">
        <Kv
          rows={[
            ['Depo kontrolü', num(rq.pending_inventory)],
            ['ERP girişi', num(rq.pending_erp_entry)],
            ['Satın alma bekleyen', num(rq.ready)],
            ['90 günden eski açık talep', num(rq.open_gt90d)],
            ['Departman talebi (gönderilmiş)', num(rq.dept_submitted)],
            [
              'Bu hafta teslim alınan kalem',
              isSet(mt.deliveries_week)
                ? `${num(mt.deliveries_week)} (13 hafta ort. ${num(mt.deliveries_13w_avg)})`
                : '',
            ],
          ]}
        />
      </DrawerSection>
      <Links
        links={[
          ['/planning/items?is_critical=true&is_delivered=false', 'Kritik kalemler'],
          ['/manufacturing/material-tracking', 'Malzeme takibi'],
          ['/planning/department-requests', 'Departman talepleri'],
        ]}
      />
    </>
  );
}

function Finance({ fn, ctx }: { fn: FinanceSection; ctx: PillarContext }) {
  const cm = fn.committed || {};
  const pay = fn.payables || {};
  const mg = fn.margin;
  const money = ctx.money;
  const mstate = slowState(mg, {
    slowStatus: ctx.slowStatus,
    errors: ctx.errors,
    section: 'finance',
    sub: 'margin',
  });
  const fx = ctx.meta.fx;
  const series = Array.isArray(fn.committed_6m) ? fn.committed_6m : [];
  const sparkRows = series.map((r) => ({ label: monthLabel(r.month), eur: pf(r.eur) ?? 0 }));
  return (
    <>
      {!ctx.moneyVisible ? (
        <div className={classes.drawerRag}>
          <HiddenMoneyBadge /> Tutarlar için maliyet görüntüleme yetkisi gerekir; sayılar herkese
          açıktır.
        </div>
      ) : null}
      <DrawerSection title="Verilen sipariş">
        <Kv
          rows={[
            ['Durum', <RagBadge word={fn.rag} />],
            ['Bu ay', dots(money(cm.mtd_eur), `${num(cm.po_count_mtd)} sipariş`)],
            ['Geçen ay aynı gün', money(cm.prev_same_day_eur)],
            ['Geçen ay toplam', money(cm.prev_month_eur)],
            [
              'Kur',
              fx
                ? dots(
                    shortDate(fx.date, true),
                    isSet(fx.age_days) ? `${num(fx.age_days)} gün önce` : '',
                    fx.rates_available === false ? 'kur yok' : '',
                  )
                : '',
            ],
            ['Not', 'DBS alımları sipariş tutarlarına dahil değil'],
          ]}
        />
      </DrawerSection>
      {ctx.moneyVisible && series.length ? (
        <DrawerSection title="Aylık sipariş tutarı (6 ay)">
          {series.some((r) => pf(r.eur) !== null) ? (
            <TrendChart
              label="Aylık sipariş tutarı (6 ay)"
              data={sparkRows}
              categoryKey="label"
              categoryLabel="Ay"
              series={[{ key: 'eur', label: 'Tutar', color: ACCENT }]}
              area
              height={110}
              format={(v) => formatEurCompact(v)}
              axisFormat={(v) => formatEurCompact(v)}
            />
          ) : null}
          <SimpleTable
            columns={[
              { label: 'Ay', cell: (r) => monthLabel(r.month) },
              { label: 'Tutar', num: true, cell: (r) => money(r.eur) || '—' },
              { label: 'Sipariş', num: true, cell: (r) => num(r.po_count) },
            ]}
            rows={series}
            empty="Veri yok"
          />
        </DrawerSection>
      ) : series.length ? (
        <DrawerSection title="Aylık sipariş sayısı (6 ay)">
          <SimpleTable
            columns={[
              { label: 'Ay', cell: (r) => monthLabel(r.month) },
              { label: 'Sipariş', num: true, cell: (r) => num(r.po_count) },
            ]}
            rows={series}
            empty="Veri yok"
          />
        </DrawerSection>
      ) : null}
      <DrawerSection title="Ödemeler">
        <Kv
          rows={[
            ['Vadesi geçmiş', dots(money(pay.overdue_eur), `${num(pay.overdue_n)} ödeme`)],
            ['7 gün içinde', dots(money(pay.due7_eur), `${num(pay.due7_n)} ödeme`)],
            ['30 gün içinde', dots(money(pay.due30_eur), `${num(pay.due30_n)} ödeme`)],
            ['Tarihsiz', num(pay.undated_n)],
            [
              'Onay bekleyen hakediş',
              dots(`${num(pay.statements_submitted_n)}`, money(pay.statements_submitted_eur)),
            ],
          ]}
        />
      </DrawerSection>
      <DrawerSection
        title="Marj riski"
        extra={mstate === 'ready' ? stampLabel(mg?.generated_at) : null}
      >
        {mstate !== 'ready' || !mg ? (
          <SlowNote state={mstate === 'ready' ? 'unavailable' : mstate} />
        ) : (
          <>
            <Kv
              rows={[
                [
                  'Kritik / riskli / sağlıklı',
                  `${num(mg.critical)} / ${num(mg.risky)} / ${num(mg.healthy)}`,
                ],
                ['Fiyatsız / veri yok', `${num(mg.no_price)} / ${num(mg.no_data)}`],
                ['Maruziyet', money(mg.exposure_eur)],
                ['Yer tutucu fiyat', num(mg.placeholder_prices)],
                [
                  'Maliyet verisi en eski',
                  isSet(mg.cost_data_max_age_days) ? `${num(mg.cost_data_max_age_days)} gün` : '',
                ],
              ]}
            />
            <SimpleTable
              columns={[
                { label: 'İş Emri', cell: (r) => <JobLink jobNo={r.job_no} /> },
                { label: 'Müşteri', cell: (r) => r.customer || '—' },
                { label: 'Durum', cell: (r) => <Verdict map={MARGIN_VERDICT} value={r.verdict} /> },
                ...(ctx.moneyVisible
                  ? [
                      {
                        label: 'Fiyat',
                        num: true,
                        cell: (r: MarginJob) => money(r.price_eur) || '—',
                      },
                      {
                        label: 'Öngörülen maliyet',
                        num: true,
                        cell: (r: MarginJob) => money(r.projected_cost_eur) || '—',
                      },
                    ]
                  : []),
              ]}
              rows={mg.jobs}
              empty="Marj riski olan iş yok"
            />
          </>
        )}
      </DrawerSection>
      <Links
        links={[
          ['/management/reports/cash-flow', 'Nakit akışı'],
          ['/projects/cost-table', 'Maliyet tablosu'],
        ]}
      />
    </>
  );
}
type MarginJob = NonNullable<NonNullable<FinanceSection['margin']>['jobs']>[number];

function People({ pp, ctx }: { pp: PeopleSection; ctx: PillarContext }) {
  const ot = pp.overtime || {};
  const cost = pp.overtime_cost;
  const q = pp.queues || {};
  const hc = pp.headcount || {};
  const cstate = slowState(cost, {
    slowStatus: ctx.slowStatus,
    errors: ctx.errors,
    section: 'people',
    sub: 'overtime_cost',
  });
  return (
    <>
      <DrawerSection title="Fazla mesai (kişi-saat)">
        <Kv
          rows={[
            ['Son 30 gün', isSet(ot.last30_hours) ? `${num(ot.last30_hours)} sa` : ''],
            ['Önceki 30 gün', isSet(ot.prev30_hours) ? `${num(ot.prev30_hours)} sa` : ''],
            ['Bu ay', isSet(ot.mtd_hours) ? `${num(ot.mtd_hours)} sa` : ''],
          ]}
        />
        <SimpleTable
          columns={[
            { label: 'Ekip', cell: (r) => r.label || teamLabel(r.team) },
            { label: 'Saat', num: true, cell: (r) => num(r.hours) },
          ]}
          rows={Array.isArray(ot.by_team) ? ot.by_team : []}
          empty="Ekip verisi yok"
        />
      </DrawerSection>
      <DrawerSection
        title="Fazla mesai maliyeti"
        extra={cstate === 'ready' ? stampLabel(cost?.generated_at) : null}
      >
        {cstate !== 'ready' || !cost ? (
          <SlowNote state={cstate === 'ready' ? 'unavailable' : cstate} />
        ) : (
          <Kv
            rows={[
              [
                'Bu ay',
                ctx.moneyVisible ? (
                  ctx.money(cost.mtd_eur) || 'Bu ay onaylı mesai yok'
                ) : (
                  <HiddenMoneyBadge />
                ),
              ],
              ['Geçen ay', ctx.moneyVisible ? ctx.money(cost.prev_month_eur) : ''],
              ['Tahmini ücretli giriş', num(cost.estimated_entries)],
              ['Not', 'Öğle payı düşülmedi'],
            ]}
          />
        )}
      </DrawerSection>
      <DrawerSection title="İK kuyruğu">
        <Kv
          rows={[
            ['İzin — acil (7 gün içinde)', num(q.vacation_urgent)],
            ['İzin — tarihi geçmiş', num(q.vacation_past_dated)],
            ['İzin — diğer', num(q.vacation_other)],
            ['İptal talebi', num(q.cancellation_requested)],
            [
              'Mesai talebi',
              dots(
                num(q.overtime_pending),
                isSet(q.overtime_oldest_days) ? `en eski ${num(q.overtime_oldest_days)} gün` : '',
                n0(q.overtime_starts_2d) > 0
                  ? `${num(q.overtime_starts_2d)} tanesi 2 gün içinde`
                  : '',
              ),
            ],
            [
              'Çalışan',
              dots(
                num(hc.active),
                n0(hc.no_position) > 0 ? `${num(hc.no_position)} pozisyonsuz` : '',
              ),
            ],
          ]}
        />
      </DrawerSection>
      <Links
        links={[
          ['/general/overtime/cost-report', 'Mesai maliyet raporu'],
          ['/general/vacation/pending', 'Bekleyen izinler'],
          ['/general/overtime/pending', 'Bekleyen mesailer'],
        ]}
      />
    </>
  );
}

export interface DrawerContent {
  title: string;
  stamp: string;
  body: ReactNode;
}

/** Title, stamp and body of the 'Neden?' drawer for one pillar. */
export function drawerFor(pillarId: PillarId, ctx: PillarContext): DrawerContent {
  const p = PILLARS.find((x) => x.id === pillarId);
  const title = p ? p.title : pillarId;
  const sections = ctx.sections;
  const sec = sections[pillarId];
  if (!sec) {
    const why = ctx.errors[pillarId]
      ? `Bu blok yüklenemedi: ${ctx.errors[pillarId]}`
      : 'Bu bölüm için veri yok';
    return {
      title,
      stamp: stampLabel(ctx.meta.generated_at),
      body: <div className={classes.empty}>{why}</div>,
    };
  }
  let body: ReactNode;
  switch (pillarId) {
    case 'order_book':
      body = <OrderBook ob={sections.order_book!} ctx={ctx} />;
      break;
    case 'delivery':
      body = <Delivery dl={sections.delivery!} ctx={ctx} />;
      break;
    case 'production':
      body = <Production pr={sections.production!} ctx={ctx} />;
      break;
    case 'quality_safety':
      body = <QualitySafety qs={sections.quality_safety!} />;
      break;
    case 'material':
      body = <Material mt={sections.material!} ctx={ctx} />;
      break;
    case 'finance':
      body = <Finance fn={sections.finance!} ctx={ctx} />;
      break;
    case 'people':
      body = <People pp={sections.people!} ctx={ctx} />;
      break;
  }
  return {
    title,
    stamp: stampLabel(sec.generated_at),
    body: (
      <>
        {sec.rag ? (
          <div className={classes.drawerRag}>
            <RagBadge word={sec.rag} />
            <span>
              eşik kuralına göre durum (hedefi tutuyor · hedefi tutmuyor ama önceki dönemden iyi ·
              her ikisinden kötü)
            </span>
          </div>
        ) : null}
        {body}
      </>
    ),
  };
}
