import { Button, Modal, Radio, Stack, Text, Textarea } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import {
  EXCLUSION_CATEGORIES,
  EXCLUSION_EFFECT,
  setEstimateExclusion,
  STRUCTURE_CLASS_LABELS,
  type ExcludedEntry,
  type ExclusionKind,
  type ReportAdjustments,
} from '@/api/projects/estimator';
import { confirm, errorMessage, FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { formatDateTime, JobLink, money, Section, SimilarityCell, useReport } from './reportParts';
import { fmt, type Payload } from './reportModel';

// Excluding references from a finished report without rerunning it (2026-11-04): every
// İş referansı the shop factor was chosen from (and the machining same-part reference) and
// every Geçmiş maliyet row the report read gets a checkbox. Unchecking asks for a category
// and a reason; the server recomputes the shop factor, wages, labour rows, TOPLAM, €/kg and
// the archive band, saves them on the report and keeps the reason on the reference
// (services/exclusions.py). Re-checking restores the figures.

export interface ExclusionTarget {
  kind: ExclusionKind;
  key: string;
  label: string;
}

interface RefRow {
  key: string;
  row: Payload;
  shop: boolean;
  samePart: boolean;
}

function adjustmentsOf(r: Payload): ReportAdjustments {
  return (r.adjustments as ReportAdjustments | undefined) ?? {};
}

function excludedOf(r: Payload, kind: ExclusionKind): Record<string, ExcludedEntry> {
  return adjustmentsOf(r).excluded?.[kind] ?? {};
}

/** The in-house references (the top-10 the shop factor was chosen from) and the same-part one. */
export function referenceRows(r: Payload): RefRow[] {
  const h = r.hours || {};
  const used = new Set<string>(h.calibration?.in_house?.references_used || []);
  const sp = h.calibration?.machining?.same_part?.job_no as string | undefined;
  const excluded = excludedOf(r, 'reference');
  const rows: RefRow[] = (h.references?.in_house || [])
    .filter((x: Payload) => x?.job_no)
    .map((x: Payload) => ({ key: String(x.job_no), row: x, shop: used.has(String(x.job_no)), samePart: sp === x.job_no }));
  // a same-part reference outside the top-10, or one excluded (no longer in calibration.machining)
  for (const no of [sp, ...Object.keys(excluded)]) {
    if (no && !rows.some((x) => x.key === no)) rows.push({ key: no, row: { job_no: no }, shop: false, samePart: no === sp });
  }
  return rows;
}

export function archiveRows(r: Payload): Payload[] {
  return ((r.hours?.historical_costs?.items as Payload[] | undefined) || []).filter((x) => x && x.id != null);
}

function EffectBadge({ row }: { row: Payload }) {
  const effect = row.exclusion_effect as string | undefined;
  const notes = (row.exclusion_notes as Payload[] | undefined) || [];
  if (!notes.length) return null;
  const entry = effect ? EXCLUSION_EFFECT[effect] : null;
  const title = notes.map((n) => `${n.report || ''} · ${n.category}: ${n.reason}`).join('\n');
  return (
    <span className={`status-badge ${entry?.badge ?? 'status-grey'}`} title={`Önceki raporlarda hariç tutuldu:\n${title}`}>
      <i className="fas fa-clock-rotate-left" aria-hidden /> {notes.length} not{entry ? ` · ${entry.label}` : ''}
    </span>
  );
}

function ExcludedNote({ entry }: { entry: ExcludedEntry }) {
  return (
    <div className="est-excl-reason">
      <strong>{entry.category_label || entry.category}:</strong> {entry.reason}
      <span className="est-muted">
        {' '}
        · {entry.by || '—'}
        {entry.at ? `, ${formatDateTime(entry.at)}` : ''}
      </span>
    </div>
  );
}

/** A checkbox per reference; unchecking opens the reason modal, checking asks to confirm. */
function IncludeBox({
  checked,
  label,
  busy,
  onChange,
}: {
  checked: boolean;
  label: string;
  busy: boolean;
  onChange: (include: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="form-check-input est-excl-box"
      aria-label={`${label} raporda kullanılsın`}
      title={checked ? 'İşareti kaldır: bu raporda hariç tut (gerekçe istenir)' : 'İşaretle: yeniden dahil et'}
      checked={checked}
      disabled={busy}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

export interface ReasonModalProps {
  target: ExclusionTarget;
  categories: { value: string; label: string }[];
  onClose: () => void;
  onSubmit: (category: string, reason: string) => Promise<void>;
}

/** Category + reason (both required) for one exclusion. */
export function ReasonModal({ target, categories, onClose, onSubmit }: ReasonModalProps) {
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!category) return setError('Gerekçe türünü seçin.');
    if (!reason.trim()) return setError('Gerekçe yazın: sonraki raporlar bunu okur.');
    setSaving(true);
    try {
      await onSubmit(category, reason.trim());
    } catch (e) {
      setError(errorMessage(e, 'Kaydedilemedi'));
      setSaving(false);
    }
  };
  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader icon="fas fa-ban" title={`Hariç tut: ${target.label}`} />
      <ModalBody>
        <Text size="sm" mb="sm">
          {target.kind === 'reference'
            ? 'Bu iş referansı bu raporun atölye faktöründen (ve aynı parçaysa talaşlı saatinden) çıkarılır; işçilik, toplamlar, €/kg ve aralıklar rapor yeniden çalıştırılmadan güncellenir.'
            : 'Bu geçmiş maliyet satırı bu raporun arşiv bandından çıkarılır; TOPLAM aralığı ve €/kg yeniden hesaplanır.'}{' '}
          Gerekçe referansın kendisine kaydedilir ve sonraki raporlar onu dikkate alır.
        </Text>
        <Radio.Group
          label="Gerekçe türü"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setError('');
          }}
          mb="sm"
        >
          <Stack gap={6} mt={6}>
            {categories.map((c) => (
              <Radio key={c.value} value={c.value} label={c.label} />
            ))}
          </Stack>
        </Radio.Group>
        <Textarea
          label="Gerekçe"
          aria-label="Gerekçe"
          rows={3}
          placeholder="Neden? (zorunlu — ör. kapsamda taşerona verilen talaşlı imalat var, TL € olarak girilmiş)"
          value={reason}
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setError('');
          }}
          data-autofocus
        />
        {error ? (
          <Text c="red" size="sm" mt="xs" role="alert">
            {error}
          </Text>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose} disabled={saving}>
          Vazgeç
        </Button>
        <Button color="red" leftSection={<FaIcon icon="fas fa-ban" />} loading={saving} onClick={() => void save()}>
          Hariç tut
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** The "Referanslar ve hariç tutma" section of a done report. */
export function ExclusionsSection({ r }: { r: Payload }) {
  const { actions } = useReport();
  const [target, setTarget] = useState<ExclusionTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = referenceRows(r);
  const arch = archiveRows(r);
  const hc = r.hours?.historical_costs as Payload | undefined;
  if (!refs.length && !arch.length && !hc) return null;
  const exRefs = excludedOf(r, 'reference');
  const exArch = excludedOf(r, 'archive');
  const categories: { value: string; label: string }[] =
    (r.exclusion_categories as { value: string; label: string }[] | undefined) ?? EXCLUSION_CATEGORIES;
  const contribution = (r.cost_table?.archive ?? hc?.contribution) as Payload | undefined;
  const band = new Set<string>(((contribution?.rows as Payload[] | undefined) || []).map((x) => String(x.id)));

  const send = async (kind: ExclusionKind, key: string, excluded: boolean, category = '', reason = '') => {
    setBusy(true);
    try {
      const updated = await setEstimateExclusion(r.id, excluded ? { kind, key, excluded, category, reason } : { kind, key, excluded });
      actions.reportUpdated?.(updated);
      notify.success(excluded ? 'Hariç tutuldu; rapor güncellendi.' : 'Yeniden dahil edildi; rapor güncellendi.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (t: ExclusionTarget, include: boolean) => {
    if (!include) {
      setTarget(t);
      return;
    }
    const ok = await confirm({
      title: 'Yeniden dahil et',
      message: `${t.label} bu raporda yeniden kullanılsın mı? Değerler hariç tutmadan önceki hâline döner (gerekçe geçmişte kalır).`,
      confirmLabel: 'Dahil et',
    });
    if (!ok) return;
    try {
      await send(t.kind, t.key, false);
    } catch (e) {
      notify.error(errorMessage(e, 'Kaydedilemedi'));
    }
  };

  const nEx = Object.keys(exRefs).length + Object.keys(exArch).length;
  return (
    <Section
      secKey="haric"
      title="Referanslar ve hariç tutma"
      count={nEx || null}
      sub="işareti kaldır → gerekçe → rapor yeniden çalıştırılmadan güncellenir"
    >
      {refs.length ? (
        <>
          <div className="est-sub-title">
            İş referansları <span className="est-muted">· atölye faktörü en benzer {fmt(3, 0)} referanstan (önce aynı yapı sınıfı)</span>
          </div>
          <div className="est-table-wrap">
            <table className="est-table est-excl" data-testid="excl-references">
              <thead>
                <tr>
                  <th aria-label="Kullan" />
                  <th>İş</th>
                  <th>Kullanım</th>
                  <th>Sınıf</th>
                  <th className="num">Benzerlik</th>
                  <th className="num">Faktör</th>
                  <th className="num">€/h</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {refs.map(({ key, row, shop, samePart }) => {
                  const ex = exRefs[key];
                  return (
                    <tr key={key} className={ex ? 'is-excluded' : undefined}>
                      <td>
                        <IncludeBox
                          checked={!ex}
                          label={key}
                          busy={busy}
                          onChange={(inc) => void toggle({ kind: 'reference', key, label: key }, inc)}
                        />
                      </td>
                      <td className="est-job-cell">
                        <JobLink no={key} />
                        {row.title ? <div className="est-job-title">{row.title}</div> : null}
                      </td>
                      <td>
                        {shop ? <span className="est-tag est-tag-cal">atölye faktörü</span> : null}
                        {samePart ? <span className="est-tag est-tag-cal">talaşlı · aynı parça</span> : null}
                        {!shop && !samePart && !ex ? <span className="est-muted small">yedek</span> : null}
                      </td>
                      <td>{row.structure_class ? STRUCTURE_CLASS_LABELS[row.structure_class] || row.structure_class : '—'}</td>
                      <td className="num">
                        <SimilarityCell s={row.similarity_to_target} />
                      </td>
                      <td className="num">{row.factor != null ? fmt(row.factor, 2) : '—'}</td>
                      <td className="num">{row.labor_eur_per_h != null ? fmt(row.labor_eur_per_h, 2) : '—'}</td>
                      <td>
                        {ex ? <ExcludedNote entry={ex} /> : null}
                        <EffectBadge row={row} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="est-sub-title mt-3">
        Geçmiş maliyetler <span className="est-muted">· MALİYET arşivi, bugüne endekslenmiş</span>
      </div>
      {!hc ? (
        <div className="est-note-line">
          <i className="fas fa-circle-info" aria-hidden />
          Bu rapor geçmiş maliyet satırlarını kaydetmeden önce oluşturuldu; satırları hariç tutmak için Yenile ile yeni sürüm alın.
        </div>
      ) : (
        <>
          <ContributionLine c={contribution} />
          {arch.length ? (
            <div className="est-table-wrap">
              <table className="est-table est-excl" data-testid="excl-archive">
                <thead>
                  <tr>
                    <th aria-label="Kullan" />
                    <th>İş / kalem</th>
                    <th className="num">kg/adet</th>
                    <th>Ay</th>
                    <th className="num">Bugün €/kg</th>
                    <th className="num">Tasarım mesafesi</th>
                    <th>Not</th>
                  </tr>
                </thead>
                <tbody>
                  {arch.map((x) => {
                    const key = String(x.id);
                    const ex = exArch[key];
                    const label = [x.job_no, x.product].filter(Boolean).join(' · ') || `#${key}`;
                    return (
                      <tr key={key} className={ex ? 'is-excluded' : undefined}>
                        <td>
                          <IncludeBox
                            checked={!ex}
                            label={label}
                            busy={busy}
                            onChange={(inc) => void toggle({ kind: 'archive', key, label }, inc)}
                          />
                        </td>
                        <td className="est-job-cell">
                          <strong>{x.job_no || '—'}</strong>
                          {x.same_customer ? <span className="est-tag est-tag-cal">aynı müşteri</span> : null}
                          {band.has(key) && contribution?.applied && !ex ? <span className="est-tag">bant</span> : null}
                          <div className="est-job-title">
                            {x.product || ''}
                            {x.customer ? <span className="est-muted"> · {x.customer}</span> : null}
                          </div>
                        </td>
                        <td className="num">{x.kg_each != null ? fmt(x.kg_each, 0) : '—'}</td>
                        <td>{x.cost_month || '—'}</td>
                        <td className="num">{x.now?.eur_per_kg != null ? fmt(x.now.eur_per_kg, 2) : '—'}</td>
                        <td className="num">{x.design_distance != null ? fmt(x.design_distance, 2) : '—'}</td>
                        <td>
                          {ex ? <ExcludedNote entry={ex} /> : null}
                          <EffectBadge row={x} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="est-muted small">Bu ailede arşiv satırı yok.</div>
          )}
        </>
      )}
      {target ? (
        <ReasonModal
          target={target}
          categories={categories}
          onClose={() => setTarget(null)}
          onSubmit={async (category, reason) => {
            await send(target.kind, target.key, true, category, reason);
            setTarget(null);
          }}
        />
      ) : null}
    </Section>
  );
}

function ContributionLine({ c }: { c: Payload | undefined }) {
  if (!c) return null;
  const band = c.eur_per_kg as Payload | null;
  const eur = c.band_eur as Payload | null;
  let text: ReactNode;
  if (c.applied) {
    text = (
      <>
        <strong>Arşiv katkısı:</strong> TOPLAM düşük / yüksek {band ? `${fmt(band.low, 2)}–${fmt(band.high, 2)} €/kg` : ''} bandına
        {eur ? ` (${money(eur.low)} – ${money(eur.high)})` : ''} kadar {c.widened ? 'genişletildi' : 'genişletilecekti; çizim aralığı zaten kapsıyor'};
        beklenen değer çizimden.
      </>
    );
  } else {
    text = (
      <>
        <strong>Yalnızca çapraz kontrol:</strong> {c.reason || 'koşullar sağlanmadı'}.
      </>
    );
  }
  return (
    <div className="est-note-line" data-testid="excl-contribution">
      <i className="fas fa-scale-balanced" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

/** The banner over a report whose references were excluded after it was written. */
export function AdjustmentBanner({ r }: { r: Payload }) {
  const { actions } = useReport();
  const adj = adjustmentsOf(r);
  const refs = Object.keys(adj.excluded?.reference ?? {});
  const arch = Object.values(adj.excluded?.archive ?? {});
  if (!refs.length && !arch.length) return null;
  const eff = adj.effects ?? {};
  const before = eff.shop_factor?.before?.factor;
  const after = eff.shop_factor?.after?.factor;
  const stale = eff.stale_sections ?? [];
  const names = [...refs, ...arch.map((a) => a.label || '')].filter(Boolean);
  return (
    <div className="est-notice est-adjusted" role="status" data-testid="excl-banner">
      <i className="fas fa-ban" aria-hidden />
      <div>
        <div>
          <strong>Rapordan sonra hariç tutuldu:</strong> {names.join(', ')}. Atölye faktörü, işçilik, toplamlar, €/kg ve aralıklar
          güncellendi{before !== after && (before != null || after != null) ? ` (faktör ${fmt(before, 2)} → ${after != null ? fmt(after, 2) : '1,00'})` : ''}.
          {eff.labour_recomputable === false ? ' Bu raporda işçilik satırları yeniden hesaplanamadı (eski rapor); yalnızca kayıt tutuldu.' : ''}
        </div>
        {stale.length ? (
          <div className="small mt-1">
            Metnin şu kısımları eski değerlerle yazıldı:{' '}
            {stale.map((s, i) => (
              <span key={s.key + i}>
                {i ? '; ' : ''}
                <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => actions.goto(s.key)}>
                  {s.label}
                </button>
              </span>
            ))}
            .
          </div>
        ) : null}
      </div>
      <button type="button" className="btn btn-sm btn-link p-0 ms-auto" onClick={() => actions.goto('haric')}>
        Hariç tutulanlar
      </button>
    </div>
  );
}
