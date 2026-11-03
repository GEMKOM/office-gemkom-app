// Kapasite drawer: GET /welding/planning/capacity/ next to the sheet (port of
// capacityPanel.js).
//
// Advisory only (user decision 2026-09-16): it explains which team or
// subcontractor is too full, which blocks will miss their deadline, what a plan
// for an unplanned job would look like and who could absorb unassigned kg.
// Nothing here writes to the plan; "Göster" only navigates the sheet. The one
// write is the resource's manual capacity, an attribute the planner owns.
//
// No overlay, no scroll lock, no focus trap: the sheet behind stays editable
// while the drawer is open.

import { Button, Drawer, Group, NumberInput, SegmentedControl, Text } from '@mantine/core';
import { useState } from 'react';
import type {
  CapacityBlock,
  CapacityReport,
  CapacityResource,
  CapacitySuggestion,
} from '@/api/welding/planning';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';
import {
  SUGGESTION_ICONS,
  backlogSentence,
  blockVerdictLabel,
  deadlineText,
  difficultySentence,
  fmtDateTr,
  fmtKgText,
  fmtPerWeek,
  formatTonnes,
  headcountSentence,
  lateBlocks,
  overdueBlocks,
  planOrder,
  planStartBlocks,
  pressureSentence,
  rateSentence,
  resourceVerdictSentence,
  suggestionSentence,
  summaryLine,
  verdictMeta,
  type Suggestion,
} from './model/capacityText';
import s from './ProjectPlanningPage.module.css';

const THEME_OF_BADGE: Record<string, 'green' | 'orange' | 'red' | 'grey'> = {
  'status-green': 'green',
  'status-orange': 'orange',
  'status-red': 'red',
  'status-grey': 'grey',
};

const SUGGESTION_TONE: Record<string, 'late' | 'move' | 'plan'> = {
  late_on_resource: 'late',
  no_alternative: 'late',
  no_capacity: 'late',
  deadline_passed: 'late',
  move_to: 'move',
  assign_to: 'move',
  start_earlier: 'move',
  no_plan: 'plan',
};

export interface LocateTarget {
  blockKey: string | null;
  resourceKey: string | null;
  jobNo: string | null;
}

export interface CapacityDrawerProps {
  opened: boolean;
  onClose: () => void;
  report: CapacityReport | undefined;
  loading: boolean;
  error: unknown;
  months: number;
  difficulty: boolean;
  onMonthsChange: (months: number) => void;
  onDifficultyChange: (on: boolean) => void;
  onRefresh: () => void;
  onLocate: (target: LocateTarget) => void;
  hasUnsavedChanges: boolean;
  onSaveCapacity: (resource: CapacityResource, value: number | null) => Promise<void>;
}

const num2 = (v: unknown) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

function blockKeyOf(b: CapacityBlock): string {
  return `${b.assignment_type}-${b.assignment_id}`;
}

function Chip({ block }: { block: CapacityBlock }) {
  const cls =
    block.verdict === 'late_risk'
      ? s.capLateChip
      : block.verdict === 'on_track' && block.late_cause !== 'plan_start'
        ? s.capEarlyChip
        : s.capMutedChip;
  return <span className={cls}>{blockVerdictLabel(block)}</span>;
}

function JobCell({ block }: { block: { job_no?: string; job_order_title?: string } }) {
  return (
    <span className={s.capJob}>
      {block.job_no}
      <span className={s.capJobSub}>{block.job_order_title || ''}</span>
    </span>
  );
}

function SuggestionList({
  suggestions,
  ctx,
  skip = [],
}: {
  suggestions: readonly (CapacitySuggestion | null | undefined)[] | undefined;
  ctx: { block?: CapacityBlock; resource?: CapacityResource };
  skip?: string[];
}) {
  const items = (suggestions || [])
    .filter((x): x is CapacitySuggestion => !!x && !skip.includes(x.kind))
    .map((x) => ({ x, text: suggestionSentence(x as Suggestion, ctx) }))
    .filter((i) => i.text);
  if (!items.length) return null;
  return (
    <ul className={s.capSugg}>
      {items.map(({ x, text }, i) => (
        <li key={`${x.kind}-${i}`} data-tone={SUGGESTION_TONE[x.kind]}>
          <i className={`fas ${SUGGESTION_ICONS[x.kind] || 'fa-circle-info'}`} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function CapacityEditor({
  res,
  report,
  onSave,
}: {
  res: CapacityResource;
  report: CapacityReport;
  onSave: (value: number | null) => Promise<void>;
}) {
  const manual =
    res.rate_source === 'manual' && res.rate_kg_per_wd != null ? res.rate_kg_per_wd : '';
  const [value, setValue] = useState<string | number>(manual);
  if (report.params?.ignore_manual_rates) {
    return (
      <div className={s.capEdit}>
        <span>Elle kapasite girişi bu ortamda kapalı — kapasite sütunları henüz uygulanmamış.</span>
      </div>
    );
  }
  const measured =
    res.rate_source !== 'manual' && res.rate_kg_per_wd != null
      ? `ölçülen ≈ ${Math.round(res.rate_kg_per_wd)}`
      : 'örn. 500';
  const perWeek = res.rate_kg_per_wd != null ? ` (≈ ${fmtPerWeek(res.rate_kg_per_wd)})` : '';
  const save = () => {
    const raw = String(value ?? '')
      .replace(',', '.')
      .trim();
    if (raw === '') return void onSave(null);
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return void onSave(Number.NaN);
    return void onSave(Math.round(n * 10) / 10);
  };
  return (
    <div className={s.capEdit}>
      <span>Kapasite</span>
      <NumberInput
        size="xs"
        w={110}
        min={0}
        step={10}
        hideControls
        decimalSeparator=","
        value={value}
        onChange={setValue}
        placeholder={measured}
        aria-label={`${res.display_name || res.name} kapasitesi`}
        title="Ortalama zorlukta bir iş için kg/iş günü. Boş bırakılırsa geçmişten ölçülür."
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
      />
      <span>kg-eş/iş günü{perWeek}</span>
      <Button size="compact-xs" variant="default" onClick={save}>
        Kaydet
      </Button>
      {res.rate_source === 'manual' ? (
        <Button
          size="compact-xs"
          variant="default"
          title="Elle girilen değeri kaldır, ölçüme dön"
          onClick={() => void onSave(null)}
        >
          Sil
        </Button>
      ) : null}
    </div>
  );
}

function LocateButton({
  target,
  label = 'Göster',
  onLocate,
}: {
  target: LocateTarget;
  label?: string;
  onLocate: (t: LocateTarget) => void;
}) {
  return (
    <button
      type="button"
      className={s.capLocate}
      title="Tabloda göster"
      onClick={() => onLocate(target)}
    >
      {label}
    </button>
  );
}

export function CapacityDrawer(props: CapacityDrawerProps) {
  const { opened, onClose, report, loading, error, months, difficulty } = props;
  const p = report?.params || {};
  const time = (() => {
    if (!report?.generated_at) return '';
    const d = new Date(report.generated_at);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  })();
  const ref =
    p.difficulty && p.reference_eur_per_kg != null
      ? ` · referans ${num2(p.reference_eur_per_kg)} €/kg`
      : p.difficulty
        ? ''
        : ' · zorluk ağırlığı kapalı';
  const stamp = report?.generated_at ? `Veri ${time}${ref}` : '';

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(760px, 96vw)"
      withOverlay={false}
      lockScroll={false}
      trapFocus={false}
      closeOnClickOutside={false}
      title={
        <div>
          <Text fw={700} size="md" c="#343a40">
            <FaIcon icon="fas fa-gauge-high" style={{ marginRight: 8 }} />
            Kapasite önerileri
          </Text>
          <span className={s.capStamp}>{stamp}</span>
        </div>
      }
    >
      <div className={s.capTools}>
        <span className={s.segmentWrap} title="Hız ölçümünde kullanılan geçmiş (tam aylar)">
          <span>Geçmiş</span>
          <SegmentedControl
            size="xs"
            aria-label="Geçmiş"
            value={String(months)}
            onChange={(v) => props.onMonthsChange(Number(v) || 6)}
            data={[
              { value: '3', label: '3 ay' },
              { value: '6', label: '6 ay' },
              { value: '12', label: '12 ay' },
            ]}
          />
        </span>
        <span
          className={s.segmentWrap}
          title="Kg'ları işin kg fiyatına göre ağırlıklandır — pahalı iş zor iştir"
        >
          <span>Zorluk</span>
          <SegmentedControl
            size="xs"
            aria-label="Zorluk ağırlığı"
            value={difficulty ? '1' : '0'}
            onChange={(v) => props.onDifficultyChange(v === '1')}
            data={[
              { value: '1', label: 'Açık' },
              { value: '0', label: 'Kapalı' },
            ]}
          />
        </span>
        <Button
          size="compact-sm"
          variant="default"
          title="Raporu yeniden hesapla"
          aria-label="Raporu yeniden hesapla"
          onClick={props.onRefresh}
          loading={loading && !!report}
        >
          <FaIcon icon="fas fa-rotate" />
        </Button>
      </div>
      <div className={s.capBody}>
        {!report ? (
          error ? (
            <>
              <div className={`${s.capNote} ${s.capNoteError}`}>
                Kapasite raporu yüklenemedi. {error instanceof Error ? error.message : ''}
              </div>
              <Button size="xs" variant="default" onClick={props.onRefresh}>
                Tekrar dene
              </Button>
            </>
          ) : (
            <div className={s.capEmpty}>
              <FaIcon icon="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />
              Kapasite hesaplanıyor…
            </div>
          )
        ) : (
          <ReportBody {...props} report={report} />
        )}
      </div>
    </Drawer>
  );
}

function ReportBody({
  report,
  months,
  hasUnsavedChanges,
  onLocate,
  onSaveCapacity,
}: CapacityDrawerProps & { report: CapacityReport }) {
  const resources = report.resources || [];
  const active = resources.filter(
    (r) => (r.open_blocks ?? 0) > 0 || (r.placeholder_blocks ?? 0) > 0,
  );
  const idle = resources.filter(
    (r) => !((r.open_blocks ?? 0) > 0 || (r.placeholder_blocks ?? 0) > 0),
  );
  const p = report.params || {};
  const refText = p.difficulty
    ? `Kg'lar işin kg fiyatına göre zorluk ağırlıklıdır${p.reference_eur_per_kg != null ? ` (referans ${num2(p.reference_eur_per_kg)} €/kg)` : ''}; fiyatı olmayan işler ×1 sayılır.`
    : "Zorluk ağırlığı kapalı: kg'lar olduğu gibi sayılır.";

  const resourceCard = (res: CapacityResource, compact = false) => {
    const meta = verdictMeta(res.verdict, 'resource');
    const theme = THEME_OF_BADGE[meta.badge] || 'grey';
    const facts: [string, string][] = [['Hız', rateSentence(res, months)]];
    if (res.resource_type === 'subcontractor') facts.push(['Kişi', headcountSentence(res)]);
    facts.push(['Açık iş', backlogSentence(res)]);
    if (!compact && res.required_eff_kg_per_wd != null)
      facts.push(['Baskı', pressureSentence(res)]);
    const plan = compact ? [] : planOrder(res.blocks || []);
    return (
      <div
        key={res.key}
        className={`${s.capCard}${compact ? ` ${s.capCardCompact}` : ''}`}
        data-theme={theme}
        data-resource-key={res.key}
      >
        <div className={s.capCardHead}>
          <i className={`fas ${res.resource_type === 'team' ? 'fa-users' : 'fa-industry'}`} />
          <span className={s.capCardName}>{res.display_name || res.name}</span>
          {res.resource_type === 'team' ? (
            <StatusBadge color="blue">Ekip</StatusBadge>
          ) : (
            <StatusBadge color="purple">Taşeron</StatusBadge>
          )}
          <span className={s.capVerdictBadge}>
            <StatusBadge color={theme as StatusFamily}>
              <i className={`fas ${meta.icon}`} style={{ marginRight: 4 }} />
              {meta.label}
            </StatusBadge>
          </span>
        </div>
        {compact ? null : (
          <div className={s.capCardVerdict} data-theme={theme}>
            <i className={`fas ${meta.icon}`} />
            <span>{resourceVerdictSentence(res)}</span>
          </div>
        )}
        <div className={s.capFacts}>
          {facts.map(([k, v]) => (
            <span key={k} style={{ display: 'contents' }}>
              <span className={s.capFactLabel}>{k}</span>
              <span className={s.capFactValue}>{v}</span>
            </span>
          ))}
        </div>
        {compact ? null : <SuggestionList suggestions={res.suggestions} ctx={{ resource: res }} />}
        {plan.length ? (
          <details className={s.capDetails}>
            <summary>Sıralı plan — {plan.length} blok</summary>
            <div className={s.capTableWrap}>
              <table className={s.capTable}>
                <thead>
                  <tr>
                    <th>İş</th>
                    <th className={s.capNum}>Kalan</th>
                    <th>Zorluk</th>
                    <th>Termin</th>
                    <th>En erken bitiş</th>
                    <th>Durum</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plan.map((b) => (
                    <tr
                      key={blockKeyOf(b)}
                      className={
                        b.verdict === 'late_risk'
                          ? (b.flags || []).includes('deadline_passed')
                            ? s.capRowOverdue
                            : s.capRowLate
                          : undefined
                      }
                    >
                      <td>
                        <JobCell block={b} />
                      </td>
                      <td className={s.capNum}>{fmtKgText(b.remaining_kg)} kg</td>
                      <td title={difficultySentence(b, report.params)}>
                        {b.difficulty != null ? `×${num2(b.difficulty)}` : '—'}
                      </td>
                      <td className={s.capDate} title={deadlineText(b.deadline, b.deadline_basis)}>
                        {fmtDateTr(b.deadline)}
                      </td>
                      <td className={s.capDate}>
                        {b.finish
                          ? fmtDateTr(b.finish)
                          : b.verdict === 'no_data'
                            ? '—'
                            : 'ufuk dışı'}
                      </td>
                      <td>
                        <Chip block={b} />
                      </td>
                      <td>
                        <LocateButton
                          onLocate={onLocate}
                          target={{
                            blockKey: blockKeyOf(b),
                            resourceKey: res.key ?? null,
                            jobNo: b.job_no ?? null,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
        <CapacityEditor
          key={`${res.rate_source}-${res.rate_kg_per_wd}`}
          res={res}
          report={report}
          onSave={(value) => onSaveCapacity(res, value)}
        />
      </div>
    );
  };

  const summary = report.summary || {};
  const chips: { text: string; cls: string }[] = [];
  const add = (n: number | undefined, text: string, cls: string) => {
    if (n) chips.push({ text: `${n} ${text}`, cls });
  };
  add(summary.late_blocks, 'blok gecikme riskinde', s.capChipRed!);
  add(summary.plan_start_late_blocks, 'blokta plan başlangıcı geç', s.capChipOrange!);
  add(summary.overloaded_resources, 'kaynak dolu', s.capChipRed!);
  add(summary.tight_resources, 'kaynak sıkışık', s.capChipOrange!);
  add(summary.no_rate_resources, 'kaynakta hız verisi yok', s.capChipGrey!);
  add(summary.overdue_blocks, 'blokta termin geçmiş', s.capChipGrey!);
  add(summary.unplanned_jobs, 'iş plansız', s.capChipGrey!);
  add(summary.unassigned_jobs, 'işte atanmamış kg', s.capChipGrey!);
  if (!chips.length) chips.push({ text: summaryLine(summary), cls: s.capChipGreen! });

  const late = lateBlocks(report);
  const planStart = planStartBlocks(report);
  const unplanned = report.unplanned_jobs || [];
  const unassigned = report.unassigned || [];
  const overdue = overdueBlocks(report);

  return (
    <>
      <div className={s.capSummary}>
        {chips.map((c) => (
          <span key={c.text} className={`${s.capChip} ${c.cls}`}>
            {c.text}
          </span>
        ))}
      </div>
      {hasUnsavedChanges ? (
        <div className={`${s.capNote} ${s.capNoteUnsaved}`}>
          Kaydedilmemiş değişiklikler var — rapor son kaydedilen plana göre.
        </div>
      ) : null}
      <div className={s.capSection}>Kaynaklar</div>
      {active.length ? (
        active.map((r) => resourceCard(r))
      ) : (
        <div className={s.capEmpty}>Açık işi olan kaynak yok.</div>
      )}
      {idle.length ? (
        <details className={s.capDetailsMuted}>
          <summary>+{idle.length} boş kaynak</summary>
          {idle.map((r) => resourceCard(r, true))}
        </details>
      ) : null}

      <div className={s.capSection}>
        Termine yetişmeyen bloklar{late.length ? ` (${late.length})` : ''}
      </div>
      {!late.length ? (
        <div className={s.capEmpty}>Termine yetişmeyen blok yok.</div>
      ) : (
        <div className={s.capTableWrap}>
          <table className={s.capTable}>
            <thead>
              <tr>
                <th>İş</th>
                <th>Kaynak</th>
                <th className={s.capNum}>Kalan</th>
                <th>Termin</th>
                <th>En erken bitiş</th>
                <th>Gecikme</th>
                <th>Öneriler</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {late.map(({ block, resource }) => (
                <tr key={blockKeyOf(block)} className={s.capRowLate}>
                  <td>
                    <JobCell block={block} />
                  </td>
                  <td>{resource.display_name || resource.name}</td>
                  <td className={s.capNum}>{fmtKgText(block.remaining_kg)} kg</td>
                  <td
                    className={s.capDate}
                    title={deadlineText(block.deadline, block.deadline_basis)}
                  >
                    {fmtDateTr(block.deadline)}
                  </td>
                  <td className={s.capDate}>
                    {block.relaxed_finish ? fmtDateTr(block.relaxed_finish) : 'ufuk dışı'}
                  </td>
                  <td>
                    <Chip block={block} />
                  </td>
                  <td>
                    <SuggestionList
                      suggestions={block.suggestions}
                      ctx={{ block, resource }}
                      skip={['no_plan', 'late_on_resource']}
                    />
                  </td>
                  <td>
                    <LocateButton
                      onLocate={onLocate}
                      target={{
                        blockKey: blockKeyOf(block),
                        resourceKey: resource.key ?? null,
                        jobNo: block.job_no ?? null,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {planStart.length ? (
        <>
          <div className={s.capSection}>Plan başlangıcı geç kalan bloklar ({planStart.length})</div>
          <div className={s.capTableWrap}>
            <table className={s.capTable}>
              <thead>
                <tr>
                  <th>İş</th>
                  <th>Kaynak</th>
                  <th>Öneri</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {planStart.map(({ block, resource }) => (
                  <tr key={blockKeyOf(block)}>
                    <td>
                      <JobCell block={block} />
                    </td>
                    <td>{resource.display_name || resource.name}</td>
                    <td>
                      <SuggestionList
                        suggestions={block.suggestions}
                        ctx={{ block, resource }}
                        skip={['no_plan']}
                      />
                    </td>
                    <td>
                      <LocateButton
                        onLocate={onLocate}
                        target={{
                          blockKey: blockKeyOf(block),
                          resourceKey: resource.key ?? null,
                          jobNo: block.job_no ?? null,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {unplanned.length ? (
        <>
          <div className={s.capSection}>Plan girilmemiş işler ({unplanned.length})</div>
          <div className={s.capTableWrap}>
            <table className={s.capTable}>
              <thead>
                <tr>
                  <th>İş</th>
                  <th>Termin</th>
                  <th>Öneri</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {unplanned.map((u) => (
                  <tr key={u.job_no}>
                    <td>
                      <JobCell block={u} />
                    </td>
                    <td className={s.capDate} title={deadlineText(u.deadline, u.deadline_basis)}>
                      {fmtDateTr(u.deadline)}
                    </td>
                    <td>
                      <SuggestionList suggestions={[u]} ctx={{}} />
                    </td>
                    <td>
                      <LocateButton
                        onLocate={onLocate}
                        target={{ blockKey: null, resourceKey: 'all', jobNo: u.job_no }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {unassigned.length ? (
        <>
          <div className={s.capSection}>Atanmamış işler ({unassigned.length})</div>
          {unassigned.map((u) => (
            <div key={u.job_no} className={s.capUnassigned}>
              <div className={s.capUnassignedHead}>
                <span className={s.capJob}>{u.job_no}</span>
                <span>{u.job_order_title || ''}</span>
                <span className={s.capMutedChip}>
                  {formatTonnes(u.remaining_weight_kg)} atanmamış
                </span>
                <span className={s.muted}>{deadlineText(u.deadline, u.deadline_basis)}</span>
                <LocateButton
                  onLocate={onLocate}
                  label="Tümü sekmesinde göster"
                  target={{ blockKey: null, resourceKey: 'all', jobNo: u.job_no }}
                />
              </div>
              <SuggestionList suggestions={[u.suggestion]} ctx={{}} />
            </div>
          ))}
        </>
      ) : null}

      {overdue.length ? (
        <details className={s.capDetailsMuted}>
          <summary>
            Termini geçmiş {overdue.length} açık blok — hedefi güncelleyin ya da işi kapatın
          </summary>
          <div className={s.capTableWrap}>
            <table className={s.capTable}>
              <thead>
                <tr>
                  <th>İş</th>
                  <th>Kaynak</th>
                  <th className={s.capNum}>Kalan</th>
                  <th>Termin</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overdue.map(({ block, resource }) => (
                  <tr key={blockKeyOf(block)} className={s.capRowOverdue}>
                    <td>
                      <JobCell block={block} />
                    </td>
                    <td>{resource.display_name || resource.name}</td>
                    <td className={s.capNum}>{fmtKgText(block.remaining_kg)} kg</td>
                    <td className={s.capDate}>{fmtDateTr(block.deadline)}</td>
                    <td>
                      <LocateButton
                        onLocate={onLocate}
                        target={{
                          blockKey: blockKeyOf(block),
                          resourceKey: resource.key ?? null,
                          jobNo: block.job_no ?? null,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <Group className={s.capFoot}>
        <span>
          Sıralı simülasyon: her kaynak açık işlerini termin önceliğiyle, ölçülen hızıyla art arda
          işler; &quot;en erken bitiş&quot; o sıradaki bitiştir, plan tarihi değildir. Hızlar son{' '}
          {months} ayın verisinden; hız verisi olmayan kaynaklar için tarih üretilmez. {refText}{' '}
          Kaydedilmemiş değişiklikler hesaba katılmaz.
          {report.timing_ms != null ? ` Hesap ${report.timing_ms} ms.` : ''}
        </span>
      </Group>
    </>
  );
}
