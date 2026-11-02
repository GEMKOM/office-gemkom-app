// İstisnalar (render/exceptions.js) and Karar Kuyruğu (render/decisions.js).
import { Button, Loader } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import type {
  DecisionRow,
  DecisionsMine,
  DecisionsSection,
  ExceptionRow,
  ExceptionsSection,
  Num,
} from '@/api/management/dashboard';
import { AppLink, useAppNavigate } from '@/shell/AppLink';
import { FaIcon, Panel, StatusBadge, type StatusFamily } from '@/ui';
import {
  ALWAYS_VISIBLE_SUBJECTS,
  KIND_META,
  SEVERITY_COLORS,
  SUBJECT_META,
  SUBJECT_ORDER,
} from './labels';
import {
  decisionColor,
  dots,
  formatTons,
  mineColor,
  n0,
  num,
  slowState,
  stamp,
  type SlowStatus,
} from './model';
import { Chip, Dots, Muted, Tone } from './parts';
import classes from './dashboard.module.css';

// ------------------------------------------------------------------ decisions

function rowDetail(key: string, row: DecisionRow, money: (v: Num) => string): ReactNode {
  const parts: ReactNode[] = [];
  if (row.oldest_days !== null && row.oldest_days !== undefined && n0(row.count) > 0)
    parts.push(`en eski ${num(row.oldest_days)} gün`);
  if (key === 'purchase_request') {
    if (n0(row.critical) > 0) parts.push(<Tone tone="red">{num(row.critical)} kritik</Tone>);
    if (money(row.value_eur)) parts.push(money(row.value_eur));
  } else if (key === 'subcontractor_statement' || key === 'sales_offer') {
    if (money(row.value_eur)) parts.push(money(row.value_eur));
  } else if (key === 'overtime_request') {
    if (n0(row.starts_2d) > 0)
      parts.push(<Tone tone="red">{num(row.starts_2d)} tanesi 2 gün içinde</Tone>);
  } else if (key === 'vacation_request') {
    const sub: ReactNode[] = [];
    if (n0(row.urgent) > 0) sub.push(<Tone tone="red">{num(row.urgent)} acil</Tone>);
    if (n0(row.past_dated) > 0) sub.push(`${num(row.past_dated)} tarihi geçmiş`);
    if (n0(row.cancellation_requested) > 0)
      sub.push(`${num(row.cancellation_requested)} iptal talebi`);
    if (sub.length)
      parts.unshift(
        <>
          → <Dots parts={sub} />
        </>,
      );
  } else if (key === 'qc_review') {
    if (n0(row.reviews) > 0) parts.push(`${num(row.reviews)} inceleme`);
  }
  return <Dots parts={parts} />;
}

/** 'Sizi bekleyen' chip; nothing when the count is 0. */
export function MineChip({ mine }: { mine: DecisionsMine | null | undefined }) {
  if (!mine || n0(mine.count) <= 0) return null;
  const by = Object.entries(mine.by_type || {})
    .filter(([, v]) => n0(v) > 0)
    .map(([k, v]) => `${SUBJECT_META[k]?.label || k} ${num(v)}`);
  const text = dots(
    `Sizi bekleyen ${num(mine.count)}`,
    mine.oldest_days !== null && mine.oldest_days !== undefined
      ? `en eski ${num(mine.oldest_days)} gün`
      : '',
  );
  return (
    <div className={classes.mine} data-mine-count={n0(mine.count)}>
      <span title={by.join(' · ')}>
        <StatusBadge color={mineColor(mine)}>{text}</StatusBadge>
      </span>
      {by.length ? <span>{by.join(' · ')}</span> : null}
    </div>
  );
}

export function DecisionsPanel({
  decisions,
  loading,
  error,
  serveStamp,
  money,
}: {
  decisions: DecisionsSection | null | undefined;
  loading: boolean;
  error: boolean;
  serveStamp: string;
  money: (v: Num) => string;
}) {
  const head = {
    title: 'Karar Kuyruğu',
    icon: 'fas fa-clipboard-check',
    actions: decisions?.generated_at ? (
      <span className={classes.stamp}>Veri {stamp(decisions.generated_at)}</span>
    ) : null,
  };
  if (loading) {
    return (
      <Panel {...head}>
        <div className={classes.skeletonLine} style={{ width: '60%' }} />
        <div className={classes.skeletonLine} />
        <div className={classes.skeletonLine} />
      </Panel>
    );
  }
  if (!decisions) {
    return (
      <Panel {...head}>
        <div className={classes.empty}>
          {error
            ? `Bu blok yüklenemedi${serveStamp ? ` (${serveStamp})` : ''}`
            : 'Karar verisi yok'}
        </div>
      </Panel>
    );
  }
  const byType = decisions.by_type || {};
  const rows: ReactNode[] = [];
  for (const key of SUBJECT_ORDER) {
    const row = byType[key];
    if (row === null || row === undefined) continue; // crane_request null: table empty, hidden
    const count = n0(row.count);
    if (count === 0 && !ALWAYS_VISIBLE_SUBJECTS.has(key)) continue;
    const meta = SUBJECT_META[key] || { label: key, url: '#', icon: 'circle' };
    const url = row.url || meta.url;
    const color: StatusFamily = count === 0 ? 'grey' : decisionColor(key, row);
    rows.push(
      <AppLink key={key} to={url} className={classes.decRow} data-subject={key} data-count={count}>
        <span className={classes.decIcon}>
          <FaIcon icon={`fas fa-${meta.icon}`} />
        </span>
        <span className={classes.decLabel}>{meta.label}</span>
        <span className={classes.decDetail}>
          {count === 0 ? <Muted>bekleyen yok</Muted> : rowDetail(key, row, money)}
        </span>
        <StatusBadge color={color}>{String(count)}</StatusBadge>
        <FaIcon icon="fas fa-chevron-right" className={classes.decChev} />
      </AppLink>,
    );
  }
  const z = decisions.zombies || null;
  const zombie =
    z && (n0(z.pr_workflows) > 0 || n0(z.no_approver_stages) > 0) ? (
      <AppLink to="/it/approvals" className={classes.zombie}>
        <StatusBadge color="purple">Onay sistemi</StatusBadge>
        {dots(
          n0(z.pr_workflows) > 0
            ? `${num(z.pr_workflows)} iptal edilmiş satın alma talebinin onay akışı hâlâ açık`
            : '',
          n0(z.no_approver_stages) > 0 ? `${num(z.no_approver_stages)} aşamada onaylayıcı yok` : '',
        )}
      </AppLink>
    ) : null;
  return (
    <Panel {...head}>
      <MineChip mine={decisions.mine} />
      {rows.length ? (
        <div className={classes.decRows}>{rows}</div>
      ) : (
        <div className={classes.empty}>Karar bekleyen talep yok</div>
      )}
      {zombie}
    </Panel>
  );
}

// ------------------------------------------------------------------ exceptions

const PHONE_VISIBLE = 5;

function KindBadge({ row }: { row: ExceptionRow }) {
  const meta = (row.kind && KIND_META[row.kind]) || {
    label: row.kind_label || row.kind || '—',
    color: 'grey' as StatusFamily,
  };
  const color = SEVERITY_COLORS.includes(row.severity as StatusFamily)
    ? (row.severity as StatusFamily)
    : meta.color;
  return <StatusBadge color={color}>{row.kind_label || meta.label}</StatusBadge>;
}

function impact(row: ExceptionRow, money: (v: Num) => string): ReactNode {
  const parts: ReactNode[] = [];
  const kg = formatTons(row.impact_kg);
  if (kg) parts.push(kg);
  const eur = money(row.impact_eur);
  if (eur) parts.push(eur);
  const flags = Array.isArray(row.flags) ? row.flags : [];
  if (!kg && flags.includes('ağırlık yok')) parts.push(<Chip color="grey">ağırlık yok</Chip>);
  return parts.length ? <Dots parts={parts} /> : '—';
}

function urgency(row: ExceptionRow): string {
  if (row.urgency === null || row.urgency === undefined) return '—';
  return `${num(row.urgency)} ${row.urgency_unit || ''}`.trim();
}

export function rowUrl(row: ExceptionRow): string {
  return (
    row.url ||
    (row.job_no ? `/projects/project-tracking?job_no=${encodeURIComponent(row.job_no)}` : '')
  );
}

export function ExceptionsPanel({
  exceptions,
  loading,
  slowStatus,
  errors,
  money,
}: {
  exceptions: ExceptionsSection | null | undefined;
  loading: boolean;
  slowStatus: SlowStatus;
  errors: Record<string, string>;
  money: (v: Num) => string;
}) {
  const navigate = useAppNavigate();
  const [open, setOpen] = useState(false);
  const title = (
    <>
      İstisnalar <span className={classes.panelSub}>Bu hafta dikkat isteyen işler</span>
    </>
  );
  const at = exceptions ? stamp(exceptions.generated_at) : '';
  const head = {
    title,
    icon: 'fas fa-exclamation-circle',
    actions: at ? <span className={classes.stamp}>Veri {at}</span> : null,
  };
  if (loading) {
    return (
      <Panel {...head}>
        <div className={classes.skeletonLine} />
        <div className={classes.skeletonLine} />
        <div className={classes.skeletonLine} style={{ width: '70%' }} />
      </Panel>
    );
  }
  const state = slowState(exceptions, { slowStatus, errors, section: 'exceptions', sub: null });
  if (state !== 'ready' || !exceptions) {
    const reason = errors.exceptions || errors['slow.exceptions'];
    const text =
      state === 'failed'
        ? `Bu blok yüklenemedi${reason ? `: ${reason}` : ''}`
        : state === 'pending'
          ? 'İstisna listesi hesaplanıyor…'
          : 'İstisna listesi henüz hesaplanmadı';
    return (
      <Panel {...head} actions={null}>
        <div className={classes.empty} data-slow-state={state}>
          {state === 'pending' ? <Loader size="xs" mr={8} /> : null}
          {text}
        </div>
      </Panel>
    );
  }
  const rows = Array.isArray(exceptions.rows) ? exceptions.rows.slice(0, 8) : [];
  const footer = (
    <div className={classes.excFoot}>
      {dots(
        `${num(exceptions.total_candidates)} aday`,
        'sıralama: öncelik × iş günü',
        at ? `hesaplama ${at}` : '',
      )}
    </div>
  );
  if (!rows.length) {
    return (
      <Panel {...head}>
        <div className={classes.empty}>
          <FaIcon icon="fas fa-check-circle" color="#1f8a57" /> Bu hafta istisna yok
        </div>
        {footer}
      </Panel>
    );
  }
  return (
    <Panel {...head}>
      <div className={classes.scroll}>
        <table className={classes.excTable} data-rows={rows.length}>
          <thead>
            <tr>
              <th>Tür</th>
              <th>İş Emri</th>
              <th>Müşteri</th>
              <th>İş Adı</th>
              <th>Etki</th>
              <th>Aciliyet</th>
              <th>Sorumlu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const url = rowUrl(row);
              const flags = Array.isArray(row.flags)
                ? row.flags.filter((f) => f !== 'ağırlık yok' && f !== 'pinned')
                : [];
              return (
                <tr
                  key={index}
                  data-kind={row.kind || ''}
                  data-url={url || undefined}
                  data-more={index >= PHONE_VISIBLE || undefined}
                  data-open={open || undefined}
                  tabIndex={url ? 0 : undefined}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a') || !url) return;
                    navigate(url);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && url && !(e.target as HTMLElement).closest('a'))
                      navigate(url);
                  }}
                >
                  <td data-label="Tür">
                    <KindBadge row={row} />
                  </td>
                  <td data-label="İş Emri">
                    {row.job_no ? (
                      <AppLink to={url} className={classes.jobLink}>
                        <code>{row.job_no}</code>
                      </AppLink>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Müşteri">{row.customer || '—'}</td>
                  <td data-label="İş Adı">
                    {row.title || '—'}
                    {flags.length ? (
                      <span className={classes.muted}> ({flags.join(', ')})</span>
                    ) : null}
                  </td>
                  <td data-label="Etki">{impact(row, money)}</td>
                  <td data-label="Aciliyet">{urgency(row)}</td>
                  <td data-label="Sorumlu">{row.owner || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > PHONE_VISIBLE ? (
        <Button
          variant="default"
          size="xs"
          className={classes.excMore}
          hiddenFrom="sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Daha az göster' : `Tümünü gör (${rows.length})`}
        </Button>
      ) : null}
      {footer}
    </Panel>
  );
}
