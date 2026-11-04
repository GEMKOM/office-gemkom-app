import { Button, Collapse } from '@mantine/core';
import { useState } from 'react';
import { REFERENCE_FAMILY, STRUCTURE_CLASS_LABELS } from '@/api/projects/estimator';
import type { Distribution, ReferenceSummary } from '@/api/projects/references';
import { FaIcon, Panel } from '@/ui';
import { fmt } from '../estimate-report/reportModel';
import css from './RefTabs.module.css';

interface Line {
  key: string;
  label: string;
  kind: 'all' | 'class' | 'family';
  dist: Distribution;
  band?: Distribution;
}

const range = (d: Distribution | undefined, digits: number) =>
  d && d.n ? (d.n > 1 ? `${fmt(d.p25, digits)}–${fmt(d.p75, digits)}` : 'tek iş') : '—';

/**
 * The shop-factor distribution as one table: all references, then each structure
 * class and each family (n, median, interquartile range, recorded shop h/t band).
 * Replaces the card wall the old page drew for every class and family.
 */
export function FactorBreakdown({ summary: s }: { summary: ReferenceSummary }) {
  const [open, setOpen] = useState(false);
  const classLabels: Record<string, string> = { ...STRUCTURE_CLASS_LABELS, ...(s.class_labels ?? {}) };
  const bands = s.bands ?? {};
  const byN = (a: [string, Distribution], b: [string, Distribution]) => (b[1].n || 0) - (a[1].n || 0);
  const lines: Line[] = [];
  if (s.all && s.all.n) lines.push({ key: 'all', label: 'Tüm aileler', kind: 'all', dist: s.all });
  for (const [cls, d] of Object.entries(s.classes ?? {}).filter(([, d]) => d && d.n).sort(byN)) {
    lines.push({ key: `c-${cls}`, label: classLabels[cls] || cls, kind: 'class', dist: d, band: bands.shop?.class?.[cls] });
  }
  for (const [fam, d] of Object.entries(s.families ?? {}).filter(([, d]) => d && d.n).sort(byN)) {
    lines.push({ key: `f-${fam}`, label: REFERENCE_FAMILY[fam] || fam, kind: 'family', dist: d, band: bands.shop?.family?.[fam] });
  }

  return (
    <Panel className={css.breakdown}>
      <div className={css.breakdownHead}>
        <div>
          <div className={css.breakdownTitle}>Yapı sınıfı ve aileye göre faktör</div>
          <div className={css.breakdownHint}>
            Tahmin, hedefle aynı yapı sınıfındaki referansları önce kullanır. Aralık = referansların ortadaki yarısı
            (p25–p75).
          </div>
        </div>
        <Button
          size="xs"
          variant="subtle"
          rightSection={<FaIcon icon={open ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} />}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? 'Gizle' : `Göster (${lines.length})`}
        </Button>
      </div>
      <Collapse expanded={open}>
        {lines.length ? (
          <table className={css.groupTable} data-testid="reference-summary">
            <thead>
              <tr>
                <th>Grup</th>
                <th className={css.num}>Referans</th>
                <th className={css.num}>Faktör (medyan)</th>
                <th className={css.num}>Faktör aralığı</th>
                <th className={css.num} title="Kayıtlı kaynakçı saati ÷ birim kütle (ton); 3'ten az referansta tahmin parametre bandını kullanır">
                  Gerçek atölye h/t
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} data-kind={l.kind}>
                  <td>
                    {l.label} <span className={css.kind}>{l.kind === 'class' ? 'sınıf' : l.kind === 'family' ? 'aile' : ''}</span>
                  </td>
                  <td className={css.num}>{l.dist.n}</td>
                  <td className={css.num}>
                    <strong>{fmt(l.dist.median, 2)}</strong>
                  </td>
                  <td className={css.num}>{range(l.dist, 2)}</td>
                  <td className={css.num}>{l.band && l.band.n ? `${range(l.band, 0)} (n=${l.band.n})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={css.breakdownHint}>
            Faktör dağılımı için iç imalat, güvenilir saatli (&gt; 10 h) ve hariç tutulmamış bir referans gerekiyor.
          </p>
        )}
      </Collapse>
    </Panel>
  );
}
