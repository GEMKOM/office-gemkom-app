import { Alert } from '@mantine/core';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { DashboardMeta } from '@/api/management/dashboard';
import { FaIcon } from '@/ui';
import { PILLARS, type PillarDef, type PillarId } from './labels';
import { ragText, ragWord, stamp } from './model';
import { PILLAR_BUILDERS, type PillarContext, type PillarModel } from './pillarModels';
import { RagBadge, Tone } from './parts';
import classes from './dashboard.module.css';

function Skeleton() {
  return (
    <>
      <div className={classes.skeletonLine} style={{ width: '40%', height: 22 }} />
      <div className={classes.skeletonLine} style={{ width: '80%' }} />
      <div className={classes.skeletonLine} style={{ width: '65%' }} />
    </>
  );
}

function Card({
  def,
  model,
  message,
  stampText,
  onOpen,
}: {
  def: PillarDef;
  model: PillarModel | null;
  message?: string;
  stampText: string;
  onOpen: (id: PillarId) => void;
}) {
  const rag = ragWord(model?.rag);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onOpen(def.id);
  };
  return (
    <div
      id={`pillar-${def.id}`}
      className={classes.pillar}
      data-rag={rag}
      data-pillar={def.id}
      role="button"
      tabIndex={0}
      aria-label={`${def.title} — ${ragText(rag)} — Neden?`}
      title="Neden? Ayrıntı için tıklayın"
      style={{ '--mob-order': def.mobileOrder } as CSSProperties}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        onOpen(def.id);
      }}
      onKeyDown={onKey}
    >
      <div className={classes.pillarHead}>
        <FaIcon icon={`fas fa-${def.icon}`} />
        <span className={classes.pillarTitle}>{def.title}</span>
        <span className={classes.why}>Neden?</span>
      </div>
      {model ? (
        <>
          <div className={classes.hero}>
            {model.hero ? (
              <Tone tone={model.heroTone}>{model.hero}</Tone>
            ) : (
              <span className={classes.heroDim}>—</span>
            )}
          </div>
          <div className={classes.label}>{model.label}</div>
          {model.context ? (
            <div className={`${classes.sub} ${classes.ctx}`}>{model.context}</div>
          ) : null}
          {model.subs.map((s) => (
            <div key={s.key} className={classes.sub} data-sub={s.key}>
              {s.node}
            </div>
          ))}
        </>
      ) : (
        <>
          <div className={classes.hero}>
            <span className={classes.heroDim}>—</span>
          </div>
          <div className={`${classes.label} ${classes.muted}`}>{message}</div>
        </>
      )}
      <div className={classes.pillarFoot}>
        <RagBadge word={rag} />
        <span className={classes.stamp}>{model ? model.stamp : stampText}</span>
      </div>
    </div>
  );
}

/** The seven cards; a card's click opens its 'Neden?' drawer. */
export function PillarGrid({
  ctx,
  onOpen,
}: {
  ctx: PillarContext | null;
  onOpen: (id: PillarId) => void;
}) {
  if (!ctx) {
    return (
      <div className={classes.pillars} data-state="loading">
        {PILLARS.map((p) => (
          <div
            key={p.id}
            className={classes.pillar}
            data-rag="grey"
            data-loading
            style={{ '--mob-order': p.mobileOrder } as CSSProperties}
          >
            <div className={classes.pillarHead}>
              <FaIcon icon={`fas fa-${p.icon}`} />
              <span className={classes.pillarTitle}>{p.title}</span>
            </div>
            <Skeleton />
          </div>
        ))}
      </div>
    );
  }
  const serveStamp = stamp(ctx.meta.generated_at);
  return (
    <div className={classes.pillars} data-state="ready">
      {PILLARS.map((p) => {
        let model: PillarModel | null = null;
        try {
          model = PILLAR_BUILDERS[p.id](ctx);
        } catch (err) {
          console.error(`pillar ${p.id} render failed`, err);
        }
        const message = ctx.errors[p.id]
          ? `Bu blok yüklenemedi${serveStamp ? ` (${serveStamp})` : ''}`
          : 'Veri yok';
        return (
          <Card
            key={p.id}
            def={p}
            model={model}
            message={message}
            stampText={serveStamp ? `Veri ${serveStamp}` : ''}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

export function PillarError({ message }: { message: string }) {
  return (
    <Alert color="red" icon={<FaIcon icon="fas fa-triangle-exclamation" />}>
      {message}
    </Alert>
  );
}

/** Phone: seven dots with the pillar initials and the verdict; a tap scrolls to the card. */
export function RagDots({ meta }: { meta: DashboardMeta | undefined }) {
  const rs = meta?.rag_summary ?? {};
  const go = (id: PillarId) => {
    const card = document.getElementById(`pillar-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.setAttribute('data-flash', '');
    window.setTimeout(() => card.removeAttribute('data-flash'), 1200);
  };
  return (
    <nav className={classes.ragDots} aria-label="Sütun durumları">
      {PILLARS.map((p) => {
        const w = ragWord(rs[p.id]);
        return (
          <button
            key={p.id}
            type="button"
            className={classes.ragDot}
            data-rag={w}
            title={`${p.title} · ${ragText(w)}`}
            aria-label={`${p.title}: ${ragText(w)}`}
            onClick={() => go(p.id)}
          >
            <span className={classes.ragMark} aria-hidden />
            {p.initials}
          </button>
        );
      })}
    </nav>
  );
}
