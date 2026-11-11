import { useElementSize } from '@mantine/hooks';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { OccasionDesign } from '@/api/general/specialDays';
import { ensureFont, fontStack, titleMetrics } from './fonts';
import { Motif } from './Motif';
import css from './welcome.module.css';

/**
 * The one welcome template from the designs, in four layouts:
 *   celebration  centred; the motif scattered four times, faint, plus a badge
 *   flag         text on the left, a 600px motif on the right, optional numeral
 *   solemn       dark and quiet: small motif, thin rule, serif title
 *   split        a 540px tone panel with the motif, then paper
 * It is drawn on a 1280×800 stage scaled to fit; on a small screen (or a
 * small box) it falls back to one centred column.
 */

const STAGE_W = 1280;
const STAGE_H = 800;
const SPLIT_W = 540;

// The scattered motifs of the celebration layout: x, y, size, rotation, opacity.
const SCATTER = [
  [70, 60, 150, -12, 0.18],
  [1050, 70, 170, 14, 0.18],
  [110, 560, 180, 10, 0.16],
  [1000, 560, 160, -8, 0.18],
] as const;

export interface WelcomeTemplateProps {
  design: OccasionDesign;
  kicker: string;
  title: string;
  body?: string;
  note?: string;
  numeral?: string;
  /** The button; omit `onCta` for a still preview (the button is then inert). */
  onCta?: () => void;
  /** id for the title, for aria-labelledby. */
  titleId?: string;
  /** Under the note: e.g. the celebration messages. */
  extra?: ReactNode;
  /** More buttons beside the main one. */
  actions?: ReactNode;
  /** 'stage' always draws the scaled 1280×800 stage (the HR preview). */
  mode?: 'auto' | 'stage';
}

export function WelcomeTemplate(props: WelcomeTemplateProps) {
  const { design, mode = 'auto' } = props;
  const { ref, width, height } = useElementSize();

  useEffect(() => {
    ensureFont(design.font);
  }, [design.font]);

  const scale = Math.min(width / STAGE_W, height / STAGE_H);
  const staged = mode === 'stage' || (width >= 768 && height >= 480);
  const left = (width - STAGE_W * scale) / 2;
  const top = (height - STAGE_H * scale) / 2;
  const background =
    design.layout === 'split' && staged
      ? `linear-gradient(90deg, ${design.tone} 0 ${left + SPLIT_W * scale}px, ${design.paper} ${left + SPLIT_W * scale}px)`
      : design.tone;

  return (
    <div
      ref={ref}
      className={css.root}
      style={{ background, color: design.ink }}
      data-layout={design.layout}
      data-testid="welcome-template"
    >
      {staged ? (
        <div
          className={css.stage}
          style={{
            width: STAGE_W,
            height: STAGE_H,
            left,
            top,
            transform: `scale(${scale || 0})`,
          }}
        >
          <StageLayout {...props} />
        </div>
      ) : (
        <CompactLayout {...props} />
      )}
    </div>
  );
}

function Title({ design, title, titleId, solemn }: WelcomeTemplateProps & { solemn?: boolean }) {
  const metrics = titleMetrics(design.font);
  return (
    <h1
      id={titleId}
      className={css.title}
      style={{
        fontFamily: fontStack(design.font),
        fontSize: solemn ? 48 : metrics.size,
        fontWeight: solemn ? 600 : metrics.weight,
      }}
    >
      {title}
    </h1>
  );
}

function Button({
  design,
  onCta,
  variant,
}: Pick<WelcomeTemplateProps, 'design' | 'onCta'> & { variant: 'ink' | 'outline' | 'tone' }) {
  const style: CSSProperties =
    variant === 'outline'
      ? { background: 'transparent', color: design.ink, border: '1px solid rgba(255,255,255,.5)' }
      : variant === 'tone'
        ? { background: design.tone, color: '#ffffff' }
        : { background: design.ink, color: design.tone };
  return (
    <button
      type="button"
      className={css.cta}
      style={style}
      onClick={onCta}
      tabIndex={onCta ? undefined : -1}
      data-autofocus={onCta ? true : undefined}
    >
      {design.cta}
    </button>
  );
}

function StageLayout(props: WelcomeTemplateProps) {
  const { design, kicker, body, note, numeral, extra, actions } = props;
  const metrics = titleMetrics(design.font);
  const accentOnInk = design.accent_on_ink || design.tone;

  if (design.layout === 'celebration') {
    return (
      <>
        {SCATTER.map(([x, y, size, rotate, opacity]) => (
          <div
            key={`${x}-${y}`}
            className={css.abs}
            style={{ left: x, top: y, transform: `rotate(${rotate}deg)`, opacity }}
          >
            <Motif motif={design.motif} color={design.ink} accent={design.accent} size={size} />
          </div>
        ))}
        <div className={css.center}>
          <div className={css.column} style={{ width: 820 }}>
            <div className={css.badge} style={{ background: design.ink }}>
              <Motif motif={design.motif} color={design.tone} accent={accentOnInk} size={76} />
            </div>
            <span className={css.kicker}>{kicker}</span>
            <Title {...props} />
            {body ? (
              <p className={css.body} style={{ maxWidth: 600 }}>
                {body}
              </p>
            ) : null}
            {note ? <span className={css.pill}>{note}</span> : null}
            {extra}
            <div className={css.actions}>
              {actions}
              <Button design={design} onCta={props.onCta} variant="ink" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (design.layout === 'solemn') {
    return (
      <div className={css.center}>
        <div className={css.column} style={{ width: 680 }}>
          <Motif motif={design.motif} color={design.accent} accent={design.accent} size={96} />
          <span className={css.rule} style={{ background: design.accent }} />
          <span className={`${css.kicker} ${css.kickerSolemn}`}>{kicker}</span>
          <Title {...props} solemn />
          {body ? (
            <p className={css.body} style={{ maxWidth: 560, lineHeight: 1.6, opacity: 0.88 }}>
              {body}
            </p>
          ) : null}
          {note ? (
            <span className={css.pillOutline} style={{ borderColor: design.accent }}>
              {note}
            </span>
          ) : null}
          {extra}
          <div className={css.actions} style={{ marginTop: 14 }}>
            {actions}
            <Button design={design} onCta={props.onCta} variant="outline" />
          </div>
        </div>
      </div>
    );
  }

  if (design.layout === 'split') {
    return (
      <>
        <div className={css.splitTone} style={{ width: SPLIT_W, background: design.tone }}>
          <Motif motif={design.motif} color={design.ink} accent={design.accent} size={400} />
        </div>
        <div
          className={css.splitPaper}
          style={{ left: SPLIT_W, background: design.paper, color: design.tone }}
        >
          <span className={css.kicker} style={{ opacity: 0.85 }}>
            {kicker}
          </span>
          <Title {...props} />
          {body ? (
            <p className={css.body} style={{ color: '#3d3a3c', lineHeight: 1.6 }}>
              {body}
            </p>
          ) : null}
          {note ? <span className={css.noteSplit}>{note}</span> : null}
          {extra}
          <div className={css.actionsStart}>
            {actions}
            <Button design={design} onCta={props.onCta} variant="tone" />
          </div>
        </div>
      </>
    );
  }

  // flag
  return (
    <>
      <div className={css.abs} style={{ left: 690, top: 100, opacity: 0.95 }}>
        <Motif motif={design.motif} color={design.ink} accent={design.accent} size={600} />
      </div>
      <div className={css.flagText}>
        <span className={css.kicker}>{kicker}</span>
        {numeral ? (
          <span
            className={css.numeral}
            style={{
              fontFamily: fontStack(design.font),
              fontWeight: metrics.weight,
              color: design.accent,
            }}
          >
            {numeral}
          </span>
        ) : null}
        <Title {...props} />
        {body ? <p className={css.body}>{body}</p> : null}
        {note ? <span className={`${css.pill} ${css.selfStart}`}>{note}</span> : null}
        {extra}
        <div className={css.actionsStart}>
          {actions}
          <Button design={design} onCta={props.onCta} variant="ink" />
        </div>
      </div>
    </>
  );
}

/** One centred column for phones and small boxes; the split keeps its two parts, stacked. */
function CompactLayout(props: WelcomeTemplateProps) {
  const { design, kicker, body, note, numeral, extra, actions } = props;
  const split = design.layout === 'split';
  const solemn = design.layout === 'solemn';
  const metrics = titleMetrics(design.font);
  const textColor = split ? design.tone : design.ink;
  return (
    <div className={css.compact}>
      <div className={css.compactArt} style={split ? { background: design.tone } : undefined}>
        <Motif
          motif={design.motif}
          color={solemn ? design.accent : design.ink}
          accent={design.accent}
          size={split ? 140 : 96}
        />
      </div>
      <div
        className={css.compactText}
        style={split ? { background: design.paper, color: textColor } : undefined}
      >
        <span className={css.kicker}>{kicker}</span>
        {numeral && design.layout === 'flag' ? (
          <span
            className={css.numeralCompact}
            style={{
              fontFamily: fontStack(design.font),
              fontWeight: metrics.weight,
              color: design.accent,
            }}
          >
            {numeral}
          </span>
        ) : null}
        <h1
          id={props.titleId}
          className={css.titleCompact}
          style={{ fontFamily: fontStack(design.font), fontWeight: solemn ? 600 : metrics.weight }}
        >
          {props.title}
        </h1>
        {body ? (
          <p className={css.bodyCompact} style={split ? { color: '#3d3a3c' } : undefined}>
            {body}
          </p>
        ) : null}
        {note ? <span className={solemn ? css.pillOutline : css.pill}>{note}</span> : null}
        {extra}
        <div className={css.actions}>
          {actions}
          <Button
            design={design}
            onCta={props.onCta}
            variant={solemn ? 'outline' : split ? 'tone' : 'ink'}
          />
        </div>
      </div>
    </div>
  );
}
