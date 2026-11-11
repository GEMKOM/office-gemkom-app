import type { OccasionDesign } from '@/api/general/specialDays';
import { Motif } from '@/shell/occasion/Motif';
import { WelcomeTemplate } from '@/shell/occasion/WelcomeTemplate';
import { Panel } from '@/ui';
import css from './design.module.css';

export interface DesignPreviewProps {
  design: OccasionDesign;
  kicker: string;
  title: string;
  body: string;
  note: string;
  numeral: string;
  /** e.g. "29 Ekim Perşembe", under the band's greeting. */
  dateLabel: string;
  colorBand: boolean;
}

/** The welcome as it will open, and the band every page shows while the day runs. */
export function DesignPreview({
  design,
  kicker,
  title,
  body,
  note,
  numeral,
  dateLabel,
  colorBand,
}: DesignPreviewProps) {
  return (
    <div className={css.previewColumn}>
      <Panel title="Karşılama ekranı" icon="fas fa-display">
        <div className={css.welcomeBox} data-testid="design-welcome-preview">
          <WelcomeTemplate
            mode="stage"
            design={design}
            kicker={kicker}
            title={title || ' '}
            body={body}
            note={note}
            numeral={design.layout === 'flag' ? numeral : ''}
          />
        </div>
      </Panel>
      <Panel title="Bant, gün boyu her sayfada" icon="fas fa-panorama">
        <div
          className={css.band}
          style={colorBand ? { background: design.tone, color: design.ink } : undefined}
          data-testid="design-band-preview"
        >
          {colorBand ? (
            <span className={css.bandMotif}>
              <Motif motif={design.motif} color={design.ink} accent={design.accent} size={120} />
            </span>
          ) : null}
          <span className={css.bandCrumb}>Ana Sayfa</span>
          <span className={css.bandTitle}>Günaydın, Ayşe</span>
          <span className={css.bandLine}>
            {title}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </span>
        </div>
        {colorBand ? null : (
          <p className={css.muted}>Bant bu gün kırmızı kalır; yalnızca karşılama ekranı değişir.</p>
        )}
      </Panel>
    </div>
  );
}
