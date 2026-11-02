// The seven pillar cards' content (render/pillars.js): every value read from
// the API contract path; any section or sub-block may be null.
import type { ReactNode } from 'react';
import type {
  DashboardMeta,
  DashboardSections,
  DecisionsSection,
  Num,
} from '@/api/management/dashboard';
import { teamLabel, type PillarId } from './labels';
import {
  formatTons,
  formatWd,
  moneyFmt,
  n0,
  num,
  numTone,
  pct,
  pf,
  shortDate,
  slowState,
  stamp,
  stampLabel,
  type SlowStatus,
} from './model';
import {
  Chip,
  Dots,
  hasParts,
  HiddenMoneyBadge,
  Muted,
  RagBadge,
  SlowText,
  Tone,
  TrendBadge,
} from './parts';

export interface PillarContext {
  meta: DashboardMeta;
  sections: DashboardSections;
  errors: Record<string, string>;
  slowStatus: SlowStatus;
  money: (v: Num) => string;
  moneyVisible: boolean;
  decisions: DecisionsSection | null;
}

export function pillarContext(
  meta: DashboardMeta,
  sections: DashboardSections,
  errors: Record<string, string>,
  slowStatus: SlowStatus,
): PillarContext {
  const moneyVisible = !!meta.money_visible;
  return {
    meta,
    sections,
    errors,
    slowStatus,
    money: moneyFmt(moneyVisible),
    moneyVisible,
    decisions: sections.decisions ?? null,
  };
}

export interface PillarSub {
  key: string;
  node: ReactNode;
}

export interface PillarModel {
  rag: unknown;
  /** The big figure; '' shows a dash. */
  hero: ReactNode;
  heroTone?: 'red' | 'orange' | 'green' | null;
  label: ReactNode;
  context?: ReactNode;
  subs: PillarSub[];
  stamp: string;
}

const sub = (key: string, ...parts: (ReactNode | null | undefined | false)[]): PillarSub | null =>
  hasParts(parts) ? { key, node: <Dots parts={parts} /> } : null;

const muted = (key: string, text: string): PillarSub => ({ key, node: <Muted>{text}</Muted> });

function slowSub(
  key: string,
  label: string,
  state: 'pending' | 'unavailable' | 'failed',
): PillarSub {
  return { key, node: <SlowText label={label} state={state} /> };
}

const keep = (subs: (PillarSub | null)[]): PillarSub[] => subs.filter((s): s is PillarSub => !!s);

function orderBook(ctx: PillarContext): PillarModel | null {
  const { sections, errors, slowStatus, money, moneyVisible } = ctx;
  const ob = sections.order_book;
  if (!ob) return null;
  const live = n0(ob.live_roots);
  const b2b = ob.book_to_bill || null;
  const intake = ob.intake || null;
  const value = ob.value;

  const hero = live > 0 ? formatTons(ob.remaining_kg) || '' : '';
  const label =
    live > 0 ? (
      <Dots
        parts={[
          'Kalan iş (ton)',
          formatTons(ob.total_kg) ? `${formatTons(ob.total_kg)} toplam` : '',
          `${num(live)} iş / ${num(ob.customers)} müşteri`,
          n0(ob.unweighted_roots) > 0 ? `${num(ob.unweighted_roots)} iş ağırlıksız` : '',
        ]}
      />
    ) : (
      'Canlı iş emri yok'
    );

  const ctxParts: ReactNode[] = [];
  if (ob.opened_month !== null && ob.opened_month !== undefined) {
    ctxParts.push(`bu ay ${num(ob.opened_month)} yeni iş (geçen ay ${num(ob.opened_prev_month)})`);
  }
  if (intake) {
    const won = `bu ay kazanılan teklif ${num(intake.won_month)}`;
    const wonEur = moneyVisible ? money(intake.won_month_eur) : '';
    ctxParts.push(wonEur ? `${won} (${wonEur})` : won);
  }
  if (n0(ob.manual_hold_roots) > 0) ctxParts.push(`park edilmiş ${num(ob.manual_hold_roots)}`);

  const subs: (PillarSub | null)[] = [];
  if (b2b) {
    const ratio = pf(b2b.ratio_kg);
    const basis = b2b.basis === 'count' ? 'count' : 'kg';
    const completedN = n0(b2b.completed_n);
    if (completedN === 0 && n0(b2b.intake_n) === 0) {
      subs.push(muted('book_to_bill', 'Son 3 ayda tamamlanan iş yok'));
    } else {
      subs.push(
        sub(
          'book_to_bill',
          <Tone tone={numTone(ob.rag)}>Giren / çıkan {ratio === null ? '—' : num(ratio, 1)}</Tone>,
          basis === 'count' && (
            <Chip color="grey" title="Ağırlık verisi yetersiz; adet oranı">
              adet bazlı
            </Chip>
          ),
          basis === 'kg' &&
            `${formatTons(b2b.intake_kg)} giren / ${formatTons(b2b.completed_kg)} çıkan`,
          `${num(b2b.intake_n)} / ${num(completedN)} iş`,
          b2b.burst_flag && (
            <Chip
              color="grey"
              title="Bu dönemde toplu tamamlama var; çıkan iş sayısı şişkin olabilir"
            >
              toplu tamamlama
            </Chip>
          ),
        ),
      );
    }
  }
  const vstate = slowState(value, { slowStatus, errors, section: 'order_book', sub: 'value' });
  if (vstate !== 'ready' || !value) {
    subs.push(slowSub('value', 'Defter değeri', vstate === 'ready' ? 'unavailable' : vstate));
  } else if (!moneyVisible) {
    subs.push(
      sub(
        'value',
        <>
          Defter değeri <HiddenMoneyBadge />
        </>,
        n0(value.unpriced_roots) > 0 && (
          <Tone tone="orange">{num(value.unpriced_roots)} iş fiyatsız</Tone>
        ),
      ),
    );
  } else {
    const v = money(value.value_eur);
    const share = pf(value.top_customer_share_pct);
    subs.push(
      sub(
        'value',
        v ? `${v} defter` : <Muted>Fiyatlı iş yok</Muted>,
        n0(value.unpriced_roots) > 0 && (
          <Tone tone="orange">{num(value.unpriced_roots)} iş fiyatsız</Tone>
        ),
        share !== null && (
          <Tone tone={share >= 40 ? 'orange' : null}>en büyük müşteri {pct(share)}</Tone>
        ),
      ),
    );
  }

  return {
    rag: ob.rag,
    hero,
    label,
    context: <Dots parts={ctxParts} />,
    subs: keep(subs),
    stamp: stampLabel(ob.generated_at),
  };
}

function delivery(ctx: PillarContext): PillarModel | null {
  const { sections, errors, slowStatus } = ctx;
  const dl = sections.delivery;
  if (!dl) return null;
  const od = dl.overdue || {};
  const otd = dl.otd_13w || null;
  const due = dl.due || null;
  const gate = dl.design_gate || null;
  const fc = dl.forecast;
  const liveTotal = n0(od.live_total);

  const share = pf(od.share_kg_pct);
  const none = n0(od.count) === 0;
  const hero = none ? '' : share === null ? num(od.count) : pct(share);
  const label = none ? (
    'Termini geçen iş yok'
  ) : (
    <Dots parts={['Termini geçen iş (kalan tonajın %)', `${num(od.count)}/${num(liveTotal)} iş`]} />
  );
  const context = none ? null : (
    <Dots
      parts={[
        formatTons(od.remaining_kg),
        od.median_late_wd !== null && od.median_late_wd !== undefined
          ? `medyan ${formatWd(od.median_late_wd)}`
          : '',
        n0(od.unweighted) > 0 ? `${num(od.unweighted)} iş ağırlıksız` : '',
      ]}
    />
  );

  const subs: (PillarSub | null)[] = [];
  if (otd) {
    const total = n0(otd.total);
    if (total === 0) {
      subs.push(muted('otd', 'Son 13 haftada tamamlanan iş yok'));
    } else {
      const small = total < 5;
      const p = pct(otd.pct);
      subs.push(
        sub(
          'otd',
          small ? (
            <>
              Zamanında {p} <Muted>(az veri)</Muted>
            </>
          ) : (
            <>
              Zamanında <Tone tone={numTone(dl.rag)}>{p}</Tone>
            </>
          ),
          `${num(otd.on_time)}/${num(total)} iş`,
          otd.prev_pct !== null && otd.prev_pct !== undefined
            ? `önceki 13 hafta ${pct(otd.prev_pct)}`
            : '',
          otd.burst_flag && (
            <Chip color="grey" title="Dönemde toplu tamamlama var">
              toplu tamamlama
            </Chip>
          ),
        ),
      );
    }
  }
  if (due) {
    if (n0(due.d30) === 0) {
      subs.push(muted('due', '30 gün içinde termini olan iş yok'));
    } else {
      const kg = formatTons(due.d14_kg);
      subs.push(
        sub(
          'due',
          `7 gün ${num(due.d7)}`,
          `14 gün ${num(due.d14)}${kg ? ` (${kg})` : ''}`,
          `30 gün ${num(due.d30)}`,
        ),
      );
    }
  }
  const fstate = slowState(fc, { slowStatus, errors, section: 'delivery', sub: 'forecast' });
  const gateParts: ReactNode[] = [];
  if (fstate === 'ready' && fc) {
    const d14 = n0(due?.d14);
    const risk = n0(fc.due14_late_risk);
    const riskHot = d14 >= 4 && risk >= d14 * 0.5;
    gateParts.push(
      riskHot ? (
        <Chip
          color="red"
          title="Öngörü: 14 gün içindeki işlerin yarısından fazlası geç kalma riskinde"
        >
          risk {num(risk)}
        </Chip>
      ) : (
        `risk ${num(risk)}`
      ),
    );
    gateParts.push(`veri yok ${num(fc.due14_no_data)}`);
    gateParts.push(<Muted>(Öngörü {stamp(fc.generated_at)})</Muted>);
  } else if (fstate === 'pending') {
    gateParts.push(<SlowText label="öngörü" state="pending" />);
  } else {
    gateParts.push(
      <Chip
        color="grey"
        title={
          fstate === 'failed'
            ? 'Öngörü bloğu yüklenemedi'
            : 'Üretim planı öngörüsü henüz hesaplanmadı'
        }
      >
        öngörü yok
      </Chip>,
    );
  }
  if (gate) {
    if (n0(gate.no_release_due30) >= 1) {
      gateParts.push(
        <Chip color="purple" title="30 gün içinde termini olan, çizimi yayınlanmamış işler">
          çizimsiz {num(gate.no_release_due30)} iş
        </Chip>,
      );
    }
    if (n0(gate.design_late) > 0) gateParts.push(`tasarım gecikmiş ${num(gate.design_late)}`);
  }
  subs.push(sub('forecast', ...gateParts));

  return {
    rag: dl.rag,
    hero,
    heroTone: numTone(dl.rag),
    label,
    context,
    subs: keep(subs),
    stamp: stampLabel(dl.generated_at),
  };
}

function production(ctx: PillarContext): PillarModel | null {
  const { sections, errors, slowStatus } = ctx;
  const pr = sections.production;
  if (!pr) return null;
  const nk = pr.net_kg || null;
  const cap = pr.capacity;
  const cnc = pr.cnc_week || null;

  const last4 = nk ? pf(nk.last4w) : null;
  const hero = last4 === null ? '' : `${num(last4)} kg`;
  const label =
    last4 === null ? 'Son 4 haftada ilerleme kaydı yok' : 'Net ilerleme (kg) · son 4 hafta';
  const context = nk ? (
    <Dots
      parts={[
        nk.prev4w !== null && nk.prev4w !== undefined
          ? `önceki 4 hafta ${formatTons(nk.prev4w)}`
          : '',
        <TrendBadge
          cur={nk.last4w}
          prev={nk.prev4w}
          goodWhen="up"
          title={`brüt ${formatTons(nk.gross_last4w) || '—'}`}
        />,
        nk.current_week_partial !== null && nk.current_week_partial !== undefined
          ? `bu hafta (kısmi) ${formatTons(nk.current_week_partial)}`
          : '',
      ]}
    />
  ) : null;

  const subs: (PillarSub | null)[] = [];
  const cstate = slowState(cap, { slowStatus, errors, section: 'production', sub: 'capacity' });
  if (cstate !== 'ready' || !cap) {
    subs.push(
      slowSub('capacity', 'Kaynak kapasitesi', cstate === 'ready' ? 'unavailable' : cstate),
    );
  } else {
    const rem = formatTons(cap.remaining_kg);
    const weeks = pf(cap.max_backlog_weeks);
    subs.push(
      sub(
        'capacity',
        rem ? `${rem} açık` : 'Kapasite raporu henüz hesaplanmadı',
        weeks !== null && (
          <>
            en uzun kuyruk <Tone tone={numTone(pr.rag)}>{num(weeks, 1)} hafta</Tone>
            {cap.max_backlog_resource ? ` (${cap.max_backlog_resource})` : ''}
          </>
        ),
        n0(cap.unassigned_jobs) > 0 && `atanmamış ${num(cap.unassigned_jobs)} iş`,
        n0(cap.overloaded) > 0 ? (
          <Chip color="red">aşırı yüklü {num(cap.overloaded)}</Chip>
        ) : (
          n0(cap.tight) > 0 && <Chip color="orange">sıkışık {num(cap.tight)}</Chip>
        ),
        <Muted>(Kapasite {stamp(cap.generated_at)})</Muted>,
      ),
    );
  }
  if (cnc) {
    const kg = pf(cnc.kg);
    const plate =
      n0(cnc.waiting_plate) > 0 ? (
        <Chip color={n0(cnc.waiting_plate) >= 5 ? 'orange' : 'grey'}>
          {num(cnc.waiting_plate)} kesim plaka bekliyor
        </Chip>
      ) : null;
    if (kg === null || (kg === 0 && n0(cnc.nests) === 0)) {
      subs.push(sub('cnc', <Muted>Bu hafta kesim yok</Muted>, plate));
    } else {
      subs.push(
        sub(
          'cnc',
          `CNC ${formatTons(kg)}`,
          `${num(cnc.nests)} nest`,
          cnc.prev_week_kg !== null &&
            cnc.prev_week_kg !== undefined &&
            `geçen hafta ${formatTons(cnc.prev_week_kg)}`,
          plate,
        ),
      );
    }
  }
  return {
    rag: pr.rag,
    hero,
    label,
    context,
    subs: keep(subs),
    stamp: stampLabel(pr.generated_at),
  };
}

function qualitySafety(ctx: PillarContext): PillarModel | null {
  const qs = ctx.sections.quality_safety;
  if (!qs) return null;
  const ncr = qs.ncr_open || null;
  const qc = qs.qc || null;
  const isg = qs.isg || null;

  const total = ncr ? n0(ncr.total) : 0;
  const hero = ncr ? num(total) : '';
  const label = !ncr ? (
    'NCR verisi yok'
  ) : total === 0 ? (
    'Bloke eden açık NCR yok'
  ) : (
    <Dots
      parts={[
        'Bloke eden açık NCR',
        <Tone tone={n0(ncr.critical) > 0 ? 'red' : null}>Kritik {num(ncr.critical)}</Tone>,
        <Tone tone={n0(ncr.major) >= 3 ? 'orange' : null}>Majör {num(ncr.major)}</Tone>,
        `Minör ${num(ncr.minor)}`,
      ]}
    />
  );
  const context = ncr ? (
    <Dots
      parts={[
        total > 0 && (
          <Tone tone={n0(ncr.gt30d) > 0 ? 'orange' : null}>
            {num(ncr.gt30d)} tanesi 30 günden eski
          </Tone>
        ),
        ncr.opened_month !== null && ncr.opened_month !== undefined
          ? `bu ay açılan ${num(ncr.opened_month)} (geçen ay ${num(ncr.opened_prev_month)})`
          : '',
      ]}
    />
  ) : null;

  const subs: (PillarSub | null)[] = [];
  if (qc) {
    const pending = n0(qc.pending_tasks);
    const parts: ReactNode[] = [];
    if (pending === 0) parts.push(<Muted>KK bekleyen görev yok</Muted>);
    else {
      parts.push(`KK ${num(pending)} görev bekliyor`);
      const oldest = n0(qc.oldest_pending_days);
      parts.push(
        oldest > 14 ? (
          <Chip color="orange">en eski {num(oldest)} gün</Chip>
        ) : (
          `en eski ${num(oldest)} gün`
        ),
      );
    }
    const reviewed = n0(qc.reviewed);
    if (reviewed > 0) {
      const rate =
        reviewed < 5 ? (
          `red ${pct(qc.rejection_pct)}`
        ) : (
          <>
            red{' '}
            <Tone tone={n0(qc.rejection_pct) > 0 ? null : 'green'}>{pct(qc.rejection_pct)}</Tone>
          </>
        );
      parts.push(
        <>
          bu ay {rate} ({num(qc.rejected)}/{num(reviewed)})
        </>,
      );
      if (qc.turnaround_days !== null && qc.turnaround_days !== undefined)
        parts.push(`${num(qc.turnaround_days, 1)} gün`);
    }
    subs.push(sub('qc', ...parts));
  }
  if (isg) {
    if (!isg.has_rows) {
      const days = isg.days_since_go_live;
      subs.push(
        sub(
          'isg',
          <Chip color="grey">İSG kayıt yok</Chip>,
          days !== null && days !== undefined
            ? `modül ${num(days)} gündür açık`
            : "modül 18 Eyl 2026'dan beri açık",
        ),
      );
    } else {
      subs.push(
        sub(
          'isg',
          <RagBadge word={isg.rag} text="İSG" />,
          `Açık ${num(isg.open)}`,
          `Onay bekleyen ${num(isg.resolved)}`,
          <Tone tone={n0(isg.overdue) > 0 ? 'red' : null}>Gecikmiş {num(isg.overdue)}</Tone>,
          n0(isg.high_critical) > 0 && (
            <Tone tone="red">yüksek/kritik {num(isg.high_critical)}</Tone>
          ),
          `Ramak kala (ay) ${num(isg.near_miss_month)}`,
          n0(isg.accidents_month) > 0 && (
            <Tone tone="red">kaza (ay) {num(isg.accidents_month)}</Tone>
          ),
        ),
      );
    }
  }
  return {
    rag: qs.rag,
    hero,
    heroTone: total > 0 ? numTone(qs.rag) : null,
    label,
    context,
    subs: keep(subs),
    stamp: stampLabel(qs.generated_at),
  };
}

function material(ctx: PillarContext): PillarModel | null {
  const { sections, errors, slowStatus } = ctx;
  const mt = sections.material;
  if (!mt) return null;
  const cr = mt.critical || null;
  const bl = mt.blocked;
  const rq = mt.requests || null;

  const count = cr ? n0(cr.count) : 0;
  const hero = cr ? num(count) : '';
  const label = !cr ? (
    'Kritik kalem verisi yok'
  ) : count === 0 ? (
    'Bekleyen kritik kalem yok'
  ) : (
    <Dots
      parts={[
        'Bekleyen kritik kalem',
        `${num(cr.jobs)} iş`,
        cr.median_age_days !== null && cr.median_age_days !== undefined
          ? `medyan ${num(cr.median_age_days)} gün`
          : '',
      ]}
    />
  );
  const context =
    cr && count > 0 ? (
      <Dots
        parts={[
          <Tone tone={n0(cr.unordered) > 0 ? 'orange' : null}>{num(cr.unordered)} siparişsiz</Tone>,
          <Tone tone={n0(cr.overdue_promise) > 0 ? 'red' : null}>
            {num(cr.overdue_promise)} vaadi geçmiş
          </Tone>,
        ]}
      />
    ) : null;

  const subs: (PillarSub | null)[] = [];
  const bstate = slowState(bl, { slowStatus, errors, section: 'material', sub: 'blocked' });
  if (bstate !== 'ready' || !bl) {
    subs.push(
      bstate === 'pending'
        ? slowSub('blocked', 'Malzeme bekleyen iş (öngörü)', 'pending')
        : sub(
            'blocked',
            'Malzeme bekleyen iş',
            <Chip
              color="grey"
              title={bstate === 'failed' ? 'Öngörü bloğu yüklenemedi' : 'Öngörü henüz hesaplanmadı'}
            >
              öngörü yok
            </Chip>,
          ),
    );
  } else if (n0(bl.count) === 0) {
    subs.push(muted('blocked', 'Öngörü malzeme bekleyen iş göstermiyor'));
  } else {
    subs.push(
      sub(
        'blocked',
        <>
          Malzeme bekleyen{' '}
          <Tone tone={n0(bl.share_pct) > 15 ? 'orange' : null}>
            {num(bl.count)}/{num(bl.live_total)} iş
          </Tone>
        </>,
        bl.max_wait_wd !== null && bl.max_wait_wd !== undefined
          ? `en az ${formatWd(bl.max_wait_wd)}`
          : '',
        <Muted>(Öngörü {stamp(bl.generated_at)})</Muted>,
      ),
    );
  }
  if (rq) {
    const open = n0(rq.pending_inventory) + n0(rq.pending_erp_entry) + n0(rq.ready);
    if (open === 0 && n0(rq.dept_submitted) === 0) {
      subs.push(muted('requests', 'Bekleyen planlama talebi yok'));
    } else {
      const gt90 = n0(rq.open_gt90d);
      subs.push(
        sub(
          'requests',
          `Depo ${num(rq.pending_inventory)}`,
          `ERP ${num(rq.pending_erp_entry)}`,
          `Satın alma ${num(rq.ready)}`,
          gt90 > 0 &&
            (gt90 > 100 ? (
              <Chip color="orange">{num(gt90)} talep 90 günden eski</Chip>
            ) : (
              `${num(gt90)} talep 90 günden eski`
            )),
          n0(rq.dept_submitted) > 0 && `DT ${num(rq.dept_submitted)}`,
        ),
      );
    }
  }
  return {
    rag: mt.rag,
    hero,
    heroTone: count > 0 ? numTone(mt.rag) : null,
    label,
    context,
    subs: keep(subs),
    stamp: stampLabel(mt.generated_at),
  };
}

function finance(ctx: PillarContext): PillarModel | null {
  const { sections, errors, slowStatus, money, moneyVisible, decisions } = ctx;
  const fn = sections.finance;
  if (!fn) return null;
  const cm = fn.committed || null;
  const pay = fn.payables || null;
  const mg = fn.margin;
  const mstate = slowState(mg, { slowStatus, errors, section: 'finance', sub: 'margin' });

  if (!moneyVisible) {
    // Verdict and counts, never amounts.
    const prRow = decisions?.by_type?.purchase_request;
    const prCount = prRow ? n0(prRow.count) : null;
    const subs: (PillarSub | null)[] = [];
    if (pay) {
      subs.push(
        sub(
          'payables',
          <>
            vadesi geçmiş{' '}
            <Tone tone={n0(pay.overdue_n) > 0 ? 'red' : null}>{num(pay.overdue_n)} ödeme</Tone>
          </>,
          `7 gün ${num(pay.due7_n)}`,
          `30 gün ${num(pay.due30_n)}`,
          n0(pay.undated_n) > 0 && `${num(pay.undated_n)} tarihsiz`,
        ),
      );
    }
    if (mstate !== 'ready' || !mg)
      subs.push(slowSub('margin', 'Marj riski', mstate === 'ready' ? 'unavailable' : mstate));
    else
      subs.push(
        sub(
          'margin',
          <>
            kritik marj <Tone tone={n0(mg.critical) > 0 ? 'red' : null}>{num(mg.critical)} iş</Tone>
          </>,
          `riskli ${num(mg.risky)}`,
          `sağlıklı ${num(mg.healthy)}`,
        ),
      );
    if (prCount !== null)
      subs.push({ key: 'purchase', node: `onay bekleyen ${num(prCount)} satın alma talebi` });
    return {
      rag: fn.rag,
      hero: <RagBadge word={fn.rag} />,
      label: (
        <Dots parts={[<HiddenMoneyBadge />, 'Tutarlar için maliyet görüntüleme yetkisi gerekir']} />
      ),
      context: cm ? `bu ay ${num(cm.po_count_mtd)} sipariş` : null,
      subs: keep(subs),
      stamp: stampLabel(fn.generated_at),
    };
  }

  const mtd = cm ? money(cm.mtd_eur) : '';
  const hero = cm ? mtd || '' : '';
  const label = !cm ? (
    'Sipariş verisi yok'
  ) : !mtd && n0(cm.po_count_mtd) === 0 ? (
    'Bu ay sipariş verilmedi'
  ) : (
    <Dots parts={['Bu ay verilen sipariş (€)', `${num(cm.po_count_mtd)} sipariş`]} />
  );
  const context = cm ? (
    <Dots
      parts={[
        money(cm.prev_same_day_eur) && (
          <>
            geçen ay aynı gün {money(cm.prev_same_day_eur)}{' '}
            <TrendBadge
              cur={cm.mtd_eur}
              prev={cm.prev_same_day_eur}
              goodWhen="down"
              title="Taahhüt edilen harcama; düşüş iyi okunur"
            />
          </>
        ),
        money(cm.prev_month_eur) && `geçen ay toplam ${money(cm.prev_month_eur)}`,
        ctx.meta.fx?.date && `Kur ${shortDate(ctx.meta.fx.date)}`,
      ]}
    />
  ) : null;

  const subs: (PillarSub | null)[] = [];
  if (pay) {
    const anyOpen = n0(pay.overdue_n) + n0(pay.due7_n) + n0(pay.due30_n) + n0(pay.undated_n) > 0;
    if (!anyOpen) subs.push(muted('payables', 'Açık ödeme yok'));
    else {
      const ov = money(pay.overdue_eur);
      subs.push(
        sub(
          'payables',
          <>
            Vadesi geçmiş{' '}
            <Tone tone={n0(pay.overdue_n) > 0 ? 'red' : null}>
              {ov || num(pay.overdue_n)}
              {ov ? ` (${num(pay.overdue_n)})` : ' ödeme'}
            </Tone>
          </>,
          `7 gün ${[money(pay.due7_eur), `(${num(pay.due7_n)})`].filter(Boolean).join(' ')}`,
          `30 gün ${[money(pay.due30_eur), `(${num(pay.due30_n)})`].filter(Boolean).join(' ')}`,
          n0(pay.undated_n) > 0 && `${num(pay.undated_n)} tarihsiz`,
          n0(pay.statements_submitted_n) > 0 &&
            `hakediş ${num(pay.statements_submitted_n)}${money(pay.statements_submitted_eur) ? ` (${money(pay.statements_submitted_eur)})` : ''}`,
        ),
      );
    }
  }
  if (mstate !== 'ready' || !mg)
    subs.push(slowSub('margin', 'Marj riski', mstate === 'ready' ? 'unavailable' : mstate));
  else {
    const cov = n0(mg.critical) + n0(mg.risky) + n0(mg.healthy);
    if (cov === 0 && n0(mg.no_price) === 0)
      subs.push(muted('margin', 'Maliyet özeti olan canlı iş yok'));
    else
      subs.push(
        sub(
          'margin',
          <>
            Marj: <Tone tone={n0(mg.critical) > 0 ? 'red' : null}>Kritik {num(mg.critical)}</Tone>
          </>,
          <Tone tone={n0(mg.risky) > 0 ? 'orange' : null}>Riskli {num(mg.risky)}</Tone>,
          `Sağlıklı ${num(mg.healthy)}`,
          n0(mg.no_price) > 0 && `fiyatsız ${num(mg.no_price)}`,
          money(mg.exposure_eur) && `${money(mg.exposure_eur)} maruziyet`,
          n0(mg.placeholder_prices) > 0 && (
            <Chip color="purple">{num(mg.placeholder_prices)} yer tutucu fiyat</Chip>
          ),
        ),
      );
  }
  return {
    rag: fn.rag,
    hero,
    label,
    context,
    subs: keep(subs),
    stamp: stampLabel(fn.generated_at),
  };
}

function people(ctx: PillarContext): PillarModel | null {
  const { sections, errors, slowStatus, money, moneyVisible } = ctx;
  const pp = sections.people;
  if (!pp) return null;
  const ot = pp.overtime || null;
  const cost = pp.overtime_cost;
  const q = pp.queues || null;
  const hc = pp.headcount || null;

  const last30 = ot ? pf(ot.last30_hours) : null;
  const hero = last30 === null || last30 === 0 ? '' : `${num(last30)} sa`;
  const label =
    last30 === null
      ? 'Fazla mesai verisi yok'
      : last30 === 0
        ? 'Son 30 günde onaylı fazla mesai yok'
        : 'Fazla mesai (kişi-saat, son 30 gün)';
  const teams = ot && Array.isArray(ot.by_team) ? ot.by_team.slice(0, 3) : [];
  const context = ot ? (
    <Dots
      parts={[
        ot.prev30_hours !== null && ot.prev30_hours !== undefined
          ? `önceki 30 gün ${num(ot.prev30_hours)} sa`
          : '',
        <TrendBadge
          cur={ot.last30_hours}
          prev={ot.prev30_hours}
          goodWhen="down"
          minPrev={50}
          title="Fazla mesai artışı olumsuz okunur"
        />,
        teams.map((t) => `${t.label || teamLabel(t.team)} ${num(t.hours)}`).join(' · '),
        ot.mtd_hours !== null && ot.mtd_hours !== undefined ? `bu ay ${num(ot.mtd_hours)} sa` : '',
      ]}
    />
  ) : null;

  const subs: (PillarSub | null)[] = [];
  const cstate = slowState(cost, { slowStatus, errors, section: 'people', sub: 'overtime_cost' });
  if (cstate !== 'ready' || !cost)
    subs.push(
      slowSub('overtime_cost', 'Mesai maliyeti', cstate === 'ready' ? 'unavailable' : cstate),
    );
  else if (!moneyVisible) {
    subs.push(
      sub(
        'overtime_cost',
        <>
          Mesai maliyeti <HiddenMoneyBadge />
        </>,
        n0(cost.estimated_entries) > 0 && (
          <Chip color="orange">{num(cost.estimated_entries)} giriş tahmini ücret</Chip>
        ),
      ),
    );
  } else {
    const mtd = money(cost.mtd_eur);
    subs.push(
      sub(
        'overtime_cost',
        mtd ? `Mesai maliyeti ${mtd} bu ay` : <Muted>Bu ay onaylı mesai yok</Muted>,
        money(cost.prev_month_eur) && `geçen ay ${money(cost.prev_month_eur)}`,
        n0(cost.estimated_entries) > 0 && (
          <Chip color="orange" title="Ücreti tahmini olan girişler · öğle payı düşülmedi">
            {num(cost.estimated_entries)} giriş tahmini
          </Chip>
        ),
      ),
    );
  }
  if (q) {
    const anyQ =
      n0(q.vacation_urgent) +
        n0(q.vacation_past_dated) +
        n0(q.vacation_other) +
        n0(q.overtime_pending) +
        n0(q.cancellation_requested) >
      0;
    const parts: ReactNode[] = [];
    if (!anyQ) parts.push(<Muted>Bekleyen İK talebi yok</Muted>);
    else {
      const vac = n0(q.vacation_urgent) + n0(q.vacation_past_dated) + n0(q.vacation_other);
      parts.push(`İzin ${num(vac)}`);
      if (n0(q.vacation_urgent) > 0)
        parts.push(
          <Chip color="red" title="Başlangıcı 7 gün içinde">
            {num(q.vacation_urgent)} acil
          </Chip>,
        );
      if (n0(q.vacation_past_dated) > 0)
        parts.push(<Chip color="grey">{num(q.vacation_past_dated)} tarihi geçmiş</Chip>);
      if (n0(q.cancellation_requested) > 0)
        parts.push(`${num(q.cancellation_requested)} iptal talebi`);
      parts.push(
        `Mesai ${num(q.overtime_pending)}${
          q.overtime_oldest_days !== null && q.overtime_oldest_days !== undefined
            ? ` (en eski ${num(q.overtime_oldest_days)} g)`
            : ''
        }`,
      );
      if (n0(q.overtime_starts_2d) > 0)
        parts.push(<Chip color="red">{num(q.overtime_starts_2d)} mesai 2 gün içinde</Chip>);
    }
    if (hc)
      parts.push(
        `${num(hc.active)} çalışan${n0(hc.no_position) > 0 ? `, ${num(hc.no_position)} pozisyonsuz` : ''}`,
      );
    subs.push(sub('queues', ...parts));
  }
  return {
    rag: pp.rag,
    hero,
    heroTone: numTone(pp.rag),
    label,
    context,
    subs: keep(subs),
    stamp: stampLabel(pp.generated_at),
  };
}

export const PILLAR_BUILDERS: Record<PillarId, (ctx: PillarContext) => PillarModel | null> = {
  order_book: orderBook,
  delivery,
  production,
  quality_safety: qualitySafety,
  material,
  finance,
  people,
};
