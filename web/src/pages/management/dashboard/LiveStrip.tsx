// ŞU AN FABRİKADA (render/live.js): six items, refreshed by the 60 s poll.
import type { ReactNode } from 'react';
import type { LiveSection } from '@/api/management/dashboard';
import { AppLink } from '@/shell/AppLink';
import { FaIcon } from '@/ui';
import { LIVE_DEPT, teamLabel } from './labels';
import { n0, num, shortDate, stamp } from './model';
import { Chip, Dots } from './parts';
import classes from './dashboard.module.css';

interface ItemProps {
  liveKey: string;
  icon: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  chips?: ReactNode[];
  href?: string;
  title?: string;
}

function Item({ liveKey, icon, label, value, sub, chips = [], href, title }: ItemProps) {
  const body = (
    <>
      <span className={classes.liveLabel}>
        <FaIcon icon={`fas fa-${icon}`} />
        {label}
      </span>
      <span className={classes.liveValue}>{value}</span>
      {sub ? <span className={classes.sub}>{sub}</span> : null}
      {chips.length ? <span className={classes.sub}>{chips}</span> : null}
    </>
  );
  return href ? (
    <AppLink to={href} className={classes.liveItem} data-live={liveKey} title={title || undefined}>
      {body}
    </AppLink>
  ) : (
    <div className={classes.liveItem} data-live={liveKey} title={title || undefined}>
      {body}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <span className={classes.liveEmpty}>{children}</span>
);
const Unit = ({ children }: { children: ReactNode }) => (
  <span className={classes.liveUnit}>{children}</span>
);

function items(live: LiveSection): ReactNode[] {
  const out: ReactNode[] = [];
  const pe = live.people;
  if (pe) {
    const total = n0(pe.total);
    const by = pe.by_department || {};
    const deptParts = Object.keys(LIVE_DEPT)
      .filter((k) => n0(by[k]) > 0)
      .map((k) => `${LIVE_DEPT[k]} ${num(by[k])}`);
    out.push(
      <Item
        key="people"
        liveKey="people"
        icon="stopwatch"
        label="Sayaçta çalışan"
        value={
          total > 0 ? (
            <>
              {num(total)} <Unit>kişi</Unit>
            </>
          ) : (
            <Empty>Şu an açık sayaç yok</Empty>
          )
        }
        sub={deptParts.join(' · ')}
        chips={
          n0(pe.stale_count) >= 1
            ? [
                <Chip key="stale" color="orange" title="12 saatten uzun süredir açık sayaçlar">
                  unutulmuş {num(pe.stale_count)}
                  {pe.stale_oldest_hours ? ` (${num(pe.stale_oldest_hours, 0)} sa)` : ''}
                </Chip>,
              ]
            : []
        }
        href="/manufacturing/machining/dashboard"
      />,
    );
  }
  const mc = live.machines;
  if (mc) {
    const total = n0(mc.total);
    const down = n0(mc.down);
    const list = Array.isArray(mc.down_list) ? mc.down_list : [];
    const longest = list.length ? Math.max(...list.map((d) => n0(d.hours_down))) : 0;
    out.push(
      <Item
        key="machines"
        liveKey="machines"
        icon="gears"
        label="Makineler"
        value={
          total > 0 ? (
            <>
              {num(mc.running)}/{num(total)} <Unit>çalışıyor</Unit>
            </>
          ) : (
            <Empty>Üretim makinesi tanımlı değil</Empty>
          )
        }
        sub={
          total > 0 ? (
            down >= 1 ? (
              <>
                <Chip color="red">{num(down)} arızada</Chip>
                {longest ? (
                  <span className={classes.muted}> en uzun {num(longest, 0)} sa</span>
                ) : null}
              </>
            ) : (
              'arıza yok'
            )
          ) : null
        }
        href="/manufacturing/maintenance/dashboard"
        title={list.map((d) => `${d.name || ''} ${num(d.hours_down, 1)} sa`).join(', ')}
      />,
    );
  }
  const dt = live.downtime;
  if (dt) {
    const waiting = n0(dt.waiting_material) + n0(dt.waiting_tools);
    const any = n0(dt.break) + waiting + n0(dt.fault) + n0(dt.other) > 0;
    const waitText = `Malzeme bekliyor ${num(dt.waiting_material)} · Takım ${num(dt.waiting_tools)}`;
    out.push(
      <Item
        key="downtime"
        liveKey="downtime"
        icon="mug-hot"
        label="Mola / duruş"
        value={any ? `Mola ${num(dt.break)}` : <Empty>Duruş yok</Empty>}
        sub={
          any ? (
            <Dots
              parts={[
                waiting >= 1 ? <Chip color="orange">{waitText}</Chip> : waitText,
                `Arıza ${num(dt.fault)}`,
                n0(dt.other) > 0 && `Diğer ${num(dt.other)}`,
              ]}
            />
          ) : null
        }
        href="/manufacturing/maintenance/dashboard"
      />,
    );
  }
  const wl = live.welding_last;
  if (wl) {
    const stale = n0(wl.days_since_wd) > 3;
    out.push(
      <Item
        key="welding_last"
        liveKey="welding_last"
        icon="fire"
        label="Kaynak son giriş"
        value={
          wl.date ? (
            stale ? (
              <Chip color="orange" title={`${num(wl.days_since_wd)} iş günü önce`}>
                {shortDate(wl.date)}
              </Chip>
            ) : (
              shortDate(wl.date)
            )
          ) : (
            <Empty>Kaynak saati girilmemiş</Empty>
          )
        }
        sub={
          wl.date ? (
            <Dots
              parts={[
                `${num(wl.hours)} sa`,
                `${num(wl.welders)} kaynakçı`,
                stale && `${num(wl.days_since_wd)} iş günü önce`,
              ]}
            />
          ) : null
        }
        href="/manufacturing/welding/reports"
        title="Kaynak saatleri elle ve gecikmeli girilir"
      />,
    );
  }
  const ot = live.overtime_tonight;
  if (ot) {
    const approved = n0(ot.approved_people);
    const pending = n0(ot.pending_people);
    const teams = Object.entries(ot.by_team || {})
      .filter(([, v]) => n0(v) > 0)
      .map(([k, v]) => `${teamLabel(k)} ${num(v)}`);
    out.push(
      <Item
        key="overtime_tonight"
        liveKey="overtime_tonight"
        icon="moon"
        label="Bu akşam mesai"
        value={
          approved + pending > 0 ? (
            <>
              {num(approved)} <Unit>kişi onaylı</Unit>
            </>
          ) : (
            <Empty>Bu akşam mesai planı yok</Empty>
          )
        }
        sub={teams.join(' · ')}
        chips={
          pending >= 1
            ? [
                <Chip key="p" color="orange">
                  {num(pending)} onay bekliyor
                </Chip>,
              ]
            : []
        }
        href="/general/overtime/pending"
      />,
    );
  }
  const of = live.office;
  if (of) {
    out.push(
      <Item
        key="office"
        liveKey="office"
        icon="building"
        label="Ofis yoklama"
        value={
          n0(of.tracked_30d) > 0 ? (
            `${num(of.present)}/${num(of.tracked_30d)}`
          ) : (
            <Empty>Yoklama kaydı yok</Empty>
          )
        }
        sub={
          n0(of.tracked_30d) > 0 ? (
            <span className={classes.muted}>
              kapsam {num(of.tracked_30d)}/{num(of.active_users)}
            </span>
          ) : null
        }
        title={`Yalnızca ofis IP girişleri · kapsam ${num(of.tracked_30d)}/${num(of.active_users)}`}
      />,
    );
  }
  return out;
}

const Title = () => (
  <>
    <FaIcon icon="fas fa-tower-broadcast" /> ŞU AN FABRİKADA
  </>
);

/**
 * `live` undefined: loading; null: failed (the reason from errors.live);
 * otherwise the six items. `offline` adds the "bağlantı yok" chip.
 */
export function LiveStrip({
  live,
  error,
  offline,
}: {
  live: LiveSection | null | undefined;
  error?: string;
  offline: boolean;
}) {
  if (live === undefined) {
    return (
      <div className={classes.live} data-state="loading">
        <div className={classes.liveHead}>
          <Title />
        </div>
        <div className={classes.liveItems}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={classes.liveItem}>
              <div className={classes.skeletonLine} style={{ width: '70%' }} />
              <div className={classes.skeletonLine} style={{ width: '40%', height: 16 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!live) {
    return (
      <div className={classes.live} data-state="error">
        <div className={classes.liveHead}>
          <Title />
          <Chip color="red">bağlantı yok</Chip>
        </div>
        <div className={classes.empty}>
          {error ? `Canlı şerit yüklenemedi: ${error}` : 'Canlı şerit yüklenemedi'}
        </div>
      </div>
    );
  }
  const at = stamp(live.generated_at);
  const list = items(live);
  return (
    <div className={classes.live} data-state="ready" id="dash-live">
      <div className={classes.liveHead}>
        <Title />
        {at ? <span data-live-stamp>· {at}</span> : null}
        {offline ? (
          <Chip color="red">bağlantı yok</Chip>
        ) : (
          <span className={classes.pulse} title="60 sn'de bir yenilenir" aria-hidden />
        )}
      </div>
      <div className={classes.liveItems}>
        {list.length ? list : <div className={classes.empty}>Canlı veri yok</div>}
      </div>
    </div>
  );
}
