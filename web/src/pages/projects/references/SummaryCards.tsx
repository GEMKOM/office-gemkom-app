import { REFERENCE_FAMILY, STRUCTURE_CLASS_LABELS } from '@legacy/apis/estimator.js';
import { fmt } from '@legacy/components/estimate-report/report-model.js';
import type { ReactNode } from 'react';
import type { Distribution, ReferenceSummary } from '@/api/projects/references';
import css from './ReferencesPage.module.css';

/** "Atölye 102–127 h/t (n=2) · Talaşlı 8–15 h/t": the recorded hours-per-tonne bands (p25–p75). */
function BandLine({ shop, mach }: { shop?: Distribution; mach?: Distribution }) {
  const one = (label: string, d?: Distribution) =>
    d && d.n ? (
      <span key={label}>
        {label}{' '}
        <strong>
          {fmt(d.p25, 0)}–{fmt(d.p75, 0)}
        </strong>{' '}
        h/t{' '}
        <span className={css.bandN}>
          (n={d.n}
          {d.n < 3 ? ', bant için az' : ''})
        </span>
      </span>
    ) : null;
  const parts = [one('Atölye', shop), one('Talaşlı', mach)].filter(Boolean);
  if (!parts.length) return null;
  return (
    <div
      className={css.cardBand}
      title="Kayıtlı saat ÷ birim kütle, çeyrekler arası (p25–p75); 3 referanstan az ise tahmin parametre bandını kullanır"
    >
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? ' · ' : null}
          {p}
        </span>
      ))}
    </div>
  );
}

function DistCard({
  title,
  dist,
  kind,
  bands,
  kicker = 'ortalama faktör',
}: {
  title: string;
  dist: Distribution | null | undefined;
  kind?: 'all' | 'class';
  bands?: ReactNode;
  kicker?: string;
}) {
  if (!dist || !dist.n) return null;
  return (
    <div className={css.card} data-kind={kind}>
      <div className={css.cardTitle}>
        <span>{title}</span>
        <span>n = {dist.n}</span>
      </div>
      <div className={css.cardValue}>
        {fmt(dist.mean, 2)} <small>{kicker}</small>
      </div>
      <div className={css.cardSub}>
        {dist.n > 1 ? (
          <>
            medyan {fmt(dist.median, 2)} · çeyrekler {fmt(dist.p25, 2)}–{fmt(dist.p75, 2)}
            <br />
            en düşük {fmt(dist.min, 2)} · en yüksek {fmt(dist.max, 2)}
          </>
        ) : (
          'tek iş: aralık yok'
        )}
      </div>
      {bands}
    </div>
  );
}

const byN = (a: [string, Distribution], b: [string, Distribution]) => (b[1].n || 0) - (a[1].n || 0);

/** The factor distribution cards above the table (legacy renderSummary). */
export function SummaryCards({ summary: s }: { summary: ReferenceSummary }) {
  const c = s.counts ?? {};
  const rs = c.review_status ?? {};
  const schemaCounts = c.schema_version ?? {};
  const bands = s.bands ?? {};
  const classLabels: Record<string, string> = { ...STRUCTURE_CLASS_LABELS, ...(s.class_labels ?? {}) };
  const m = s.machining ?? {};
  return (
    <div className={css.summary} title={s.population || undefined} data-testid="reference-summary">
      <div className={css.card}>
        <div className={css.cardTitle}>
          <span>Profiller</span>
          <span>{c.total ?? 0}</span>
        </div>
        <div className={css.countLine}>
          <span>Atölye kalibrasyonunda</span>
          <strong>{(s.jobs_used ?? []).length}</strong>
        </div>
        <div className={css.countLine}>
          <span>Talaşlı kalibrasyonunda</span>
          <strong>{(m.jobs_used ?? []).length}</strong>
        </div>
        <div className={css.countLine}>
          <span>Doğrulandı</span>
          <strong>{rs.verified || 0}</strong>
        </div>
        <div className={css.countLine}>
          <span>İncelenmedi</span>
          <strong>{rs.unreviewed || 0}</strong>
        </div>
        <div className={css.countLine}>
          <span>Hariç</span>
          <strong>{rs.excluded || 0}</strong>
        </div>
        {Object.keys(schemaCounts).length ? (
          <div className={css.countLine}>
            <span>plan v2 · v1 liste</span>
            <strong>
              {schemaCounts['2'] || 0} · {schemaCounts['1'] || 0}
            </strong>
          </div>
        ) : null}
      </div>
      <DistCard title="Tüm aileler · atölye" dist={s.all} kind="all" kicker="ortalama atölye faktörü" />
      {m.all && m.all.n ? (
        <div className={css.card} data-kind="mach">
          <div className={css.cardTitle}>
            <span>Talaşlı faktörü</span>
            <span>n = {m.all.n}</span>
          </div>
          <div className={css.cardValue}>
            {fmt(m.all.mean, 2)} <small>ortalama · medyan {fmt(m.all.median, 2)}</small>
          </div>
          <div className={css.cardSub}>
            {m.all.n > 1
              ? `çeyrekler ${fmt(m.all.p25, 2)}–${fmt(m.all.p75, 2)} · en düşük ${fmt(m.all.min, 2)} · en yüksek ${fmt(m.all.max, 2)}`
              : 'tek iş: aralık yok'}
          </div>
          {Object.entries(m.classes ?? {}).some(([, d]) => d && d.n) ? (
            <div className={css.cardLines}>
              {Object.entries(m.classes ?? {})
                .filter(([, d]) => d && d.n)
                .sort(byN)
                .map(([cls, d]) => (
                  <div key={cls} className={css.countLine}>
                    <span>{classLabels[cls] || cls}</span>
                    <strong>
                      {fmt(d.median, 2)}{' '}
                      <span className={css.bandN}>
                        {(d.n ?? 0) > 1 ? `(${fmt(d.p25, 2)}–${fmt(d.p75, 2)}, n=${d.n})` : '(n=1)'}
                      </span>
                    </strong>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={css.card} data-kind="mach">
          <div className={css.cardTitle}>
            <span>Talaşlı faktörü</span>
            <span>n = 0</span>
          </div>
          <div className={css.cardValue}>
            1,00 <small>referans yok</small>
          </div>
          <div className={css.cardSub}>
            Talaşlı faktörü için &gt; 10 h talaşlı saati kayıtlı, plan v2 şemalı ve hariç tutulmamış bir referans
            gerekiyor.
          </div>
        </div>
      )}
      {Object.entries(s.classes ?? {})
        .sort(byN)
        .map(([cls, dist]) => (
          <DistCard
            key={`c-${cls}`}
            title={`Sınıf: ${classLabels[cls] || cls}`}
            dist={dist}
            kind="class"
            bands={<BandLine shop={bands.shop?.class?.[cls]} mach={bands.mach?.class?.[cls]} />}
          />
        ))}
      {Object.entries(s.families ?? {})
        .sort(byN)
        .map(([fam, dist]) => (
          <DistCard
            key={`f-${fam}`}
            title={REFERENCE_FAMILY[fam] || fam}
            dist={dist}
            bands={<BandLine shop={bands.shop?.family?.[fam]} mach={bands.mach?.family?.[fam]} />}
          />
        ))}
      {!s.all || !s.all.n ? (
        <div className={css.summaryEmpty}>
          Faktör dağılımı için iç imalat, güvenilir saatli (&gt; 10 h) ve hariç tutulmamış bir referans gerekiyor.
        </div>
      ) : null}
    </div>
  );
}
