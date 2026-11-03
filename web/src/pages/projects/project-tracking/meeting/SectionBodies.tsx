import type { ReactNode } from 'react';
import { StatusBadge, type StatusFamily } from '@/ui';
import { TASK_STATUS_FAMILIES } from '../forecast';
import { fmtEur, fmtHours, fmtInt, fmtPerKg, fmtQty2, fmtShortDate, isSet } from './format';
import { FILE_GROUP_LABELS, FINANCIAL_META, mergedFiles } from './MeetingTiles';
import s from './MeetingView.module.css';
import type { MeetingBrief, ProcurementRow, SectionDetail, SectionKind } from './types';

// The bodies of the in-slide section modals (legacy *ModalHtml builders in
// meetingView.js). Welding and files read the brief; the rest read their
// meeting-brief/{section}/ detail.

export const SECTION_MODAL_TITLES: Record<SectionKind, string> = {
  welding: 'Kaynaklı İmalat Detayı',
  machining: 'Talaşlı İmalat Detayı',
  cutting: 'CNC Kesim Detayı',
  quality: 'Kalite · NCR Detayı',
  procurement: 'Satın Alma Detayı',
  revisions: 'Dizayn Detayı',
  financial: 'Finans Detayı',
  files: 'Dosyalar',
};

/** The PDF's file name word per kind (legacy downloadModalPdf). */
export function pdfKindLabel(kind: SectionKind): string {
  return kind === 'welding' ? 'Kaynak Detayı' : SECTION_MODAL_TITLES[kind];
}

/** Sections whose rows come from meeting-brief/{section}/. */
export const FETCHED_SECTIONS: ReadonlySet<SectionKind> = new Set([
  'machining',
  'cutting',
  'quality',
  'procurement',
  'revisions',
  'financial',
]);

// The PDF exporter breaks pages at these legacy class names, so the blocks
// carry them next to their module class.
const STATS = `${s.modalStats} pp-modal-stats`;
const NOTE = `${s.modalNote} pp-modal-note`;
const SECTION = `${s.modalSection} pp-modal-section`;

type Header = string | { label: string; num: true };

function ModalTable({ headers, rows }: { headers: Header[]; rows: ReactNode[] }) {
  if (!rows.length) return <div className={`${s.textMuted} ${s.empty}`}>Kayıt yok.</div>;
  return (
    <table className={s.table}>
      <thead>
        <tr>
          {headers.map((h, i) =>
            typeof h === 'object' ? (
              <th key={i} className={s.thNum}>
                {h.label}
              </th>
            ) : (
              <th key={i}>{h}</th>
            ),
          )}
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

const num = (label: string) => ({ label, num: true }) as const;

function MiniBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
  return (
    <div className={s.miniBar}>
      <div className={s.miniFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

const pctOrDash = (v: number | null | undefined) => (isSet(v) ? `%${fmtInt(v)}` : '—');

// ---- welding (from the brief) ---------------------------------------------

export function WeldingBody({ brief }: { brief: MeetingBrief }) {
  const welding = brief.welding ?? {};
  // The panel leads with the biggest allocations; the modal reads as a
  // job-order listing.
  const resources = [...(welding.resources ?? [])].sort(
    (a, b) =>
      (a.job_no || '').localeCompare(b.job_no || '', undefined, { numeric: true }) ||
      Number(a.planned ?? 0) - Number(b.planned ?? 0) ||
      (Number(b.allocated_weight_kg) || 0) - (Number(a.allocated_weight_kg) || 0),
  );
  const rows = resources.map((r, i) => (
    <tr key={i}>
      <td>
        {r.kind === 'subcontractor' ? (
          <StatusBadge color="purple">Taşeron</StatusBadge>
        ) : (
          <StatusBadge color="blue">Dahili</StatusBadge>
        )}
      </td>
      <td className={s.tdMain} title={r.name}>
        {r.name}
      </td>
      <td>{r.job_no}</td>
      <td className={s.tdNum}>{fmtInt(r.allocated_weight_kg)} kg</td>
      <td>
        {r.planned ? (
          <span className={s.textMuted}>
            plan
            {r.planned_start_date
              ? ` · ${fmtShortDate(r.planned_start_date)} – ${fmtShortDate(r.planned_end_date)}`
              : ''}
          </span>
        ) : (
          <>
            <MiniBar ratio={(Number(r.progress_pct) || 0) / 100} /> <strong>%{fmtInt(r.progress_pct)}</strong>
          </>
        )}
      </td>
    </tr>
  ));
  const hours = welding.hours ?? {};
  return (
    <>
      <div className={STATS}>
        <span>
          Ağırlıklı ilerleme <strong>{pctOrDash(welding.weighted_progress_pct)}</strong>
        </span>
        <span>
          Görev ilerlemesi <strong>{pctOrDash(welding.task_progress_pct)}</strong>
        </span>
        <span>
          Tahsis <strong>{fmtInt(welding.allocated_kg_total)} kg</strong>
        </span>
        <span>
          İşçilik <strong>{fmtHours(hours.regular)} s</strong>
        </span>
        <span>
          Fazla mesai <strong>{fmtHours(hours.after_hours)} s</strong>
        </span>
        <span>
          Tatil <strong>{fmtHours(hours.holiday)} s</strong>
        </span>
      </div>
      <ModalTable headers={['Tür', 'Kaynak', 'İş Emri', num('Tahsis'), 'İlerleme']} rows={rows} />
    </>
  );
}

// ---- files (from the brief) ------------------------------------------------

export function FilesBody({ brief }: { brief: MeetingBrief }) {
  const files = brief.files ?? {};
  const rows = mergedFiles(files).map((f, i) => {
    const name = f.name || 'dosya';
    return (
      <tr key={i}>
        <td className={s.tdMain}>
          {f.url ? (
            <a href={f.url} target="_blank" rel="noopener noreferrer" title={name}>
              {name}
            </a>
          ) : (
            <span title={name}>{name}</span>
          )}
        </td>
        <td>
          {f.source}
          {f.label ? ` · ${f.label}` : ''}
        </td>
        <td>{fmtShortDate(f.uploaded_at)}</td>
      </tr>
    );
  });
  return (
    <>
      <div className={STATS}>
        {FILE_GROUP_LABELS.map(([key, label]) => (
          <span key={key}>
            {label} <strong>{fmtInt(files[key]?.total)}</strong>
          </span>
        ))}
      </div>
      <ModalTable headers={['Dosya', 'Kaynak', 'Yüklendi']} rows={rows} />
    </>
  );
}

// ---- machining ---------------------------------------------------------------

function MachiningBody({ brief, detail }: { brief: MeetingBrief; detail: SectionDetail }) {
  const machining = brief.machining ?? {};
  const rows = (detail.operations ?? []).map((op, i) => {
    // A part shared with other job orders: this job's share and its
    // allocated quantity next to the part name (hours are already scaled).
    const share = Number(op.share);
    const isShared = Number.isFinite(share) && share > 0 && share < 1;
    return (
      <tr key={i}>
        <td className={s.tdMain} title={op.name || op.key}>
          {op.name || op.key}
        </td>
        <td className={s.tdMuted} title={op.part_name || ''}>
          {op.part_name || '—'}
          {isShared ? (
            <>
              {' '}
              <span className={s.textMuted} title="Bu iş emrine düşen pay">
                ×{share.toFixed(2)}
              </span>
              {isSet(op.allocated_quantity) ? (
                <>
                  {' '}
                  <span className={s.textMuted}>({fmtInt(op.allocated_quantity)} adet)</span>
                </>
              ) : null}
            </>
          ) : null}
        </td>
        <td>{op.job_no || ''}</td>
        <td className={s.tdNum}>{fmtHours(op.estimated_hours)} s</td>
        <td className={s.tdNum}>{fmtHours(op.hours_spent)} s</td>
        <td>
          {op.completed ? (
            <StatusBadge color="green">Tamam</StatusBadge>
          ) : (
            <StatusBadge color="blue">Açık</StatusBadge>
          )}
        </td>
      </tr>
    );
  });
  return (
    <>
      <div className={STATS}>
        <span>
          Operasyon{' '}
          <strong>
            {fmtInt(machining.operations_completed)} / {fmtInt(machining.operations_total)}
          </strong>
        </span>
        <span>
          Tahmini <strong>{fmtHours(machining.estimated_hours_total)} s</strong>
        </span>
        <span>
          Harcanan <strong>{fmtHours(machining.hours_spent)} s</strong>
        </span>
        <span>
          Kalan <strong>~{fmtHours(machining.hours_remaining)} s</strong>
        </span>
        <span>
          Parça{' '}
          <strong>
            {fmtInt(machining.parts_completed)} / {fmtInt(machining.parts_total)}
          </strong>
        </span>
      </div>
      <ModalTable
        headers={['Operasyon', 'Parça', 'İş Emri', num('Tahmini'), num('Harcanan'), 'Durum']}
        rows={rows}
      />
    </>
  );
}

// ---- cutting -------------------------------------------------------------------

function CuttingBody({ brief, detail }: { brief: MeetingBrief; detail: SectionDetail }) {
  const cutting = brief.cutting ?? {};
  const rows = (detail.parts ?? []).map((p, i) => (
    <tr key={i}>
      <td className={s.tdMain}>
        {p.image_no || '—'}
        {p.position_no ? (
          <>
            {' '}
            <span className={s.textMuted}>/ {p.position_no}</span>
          </>
        ) : null}
      </td>
      <td className={s.tdMuted}>{p.nesting || '—'}</td>
      <td>{p.job_no || ''}</td>
      <td className={s.tdNum}>{fmtInt(p.quantity)} adet</td>
      <td className={s.tdNum}>{fmtInt(p.weight_kg)} kg</td>
      <td>
        {p.cut ? (
          <StatusBadge color="green">Kesildi</StatusBadge>
        ) : p.material_pending ? (
          <span
            title={`Plaka teslim edilmedi${p.plate_item_code ? ' — ' + p.plate_item_code : ''} (satın alma)`}
          >
            <StatusBadge color="orange">Malzeme Bekliyor</StatusBadge>
          </span>
        ) : (
          <StatusBadge color="orange">Bekliyor</StatusBadge>
        )}
      </td>
    </tr>
  ));
  const materialWaiting = Number(cutting.parts_waiting_material) || 0;
  return (
    <>
      <div className={STATS}>
        <span>
          Bekleyen{' '}
          <strong>
            {fmtInt(cutting.parts_waiting)} parça · {fmtInt(cutting.weight_waiting)} kg
          </strong>
        </span>
        {materialWaiting ? (
          <span>
            Malzeme bekleyen{' '}
            <strong className={s.numOrange}>
              {fmtInt(materialWaiting)} parça · {fmtInt(cutting.weight_waiting_material)} kg
            </strong>
          </span>
        ) : null}
        <span>
          Kesilen{' '}
          <strong>
            {fmtInt(cutting.parts_cut)} / {fmtInt(cutting.parts_total)} parça
          </strong>
        </span>
        <span>
          Ağırlık{' '}
          <strong>
            {fmtInt(cutting.weight_cut)} / {fmtInt(cutting.weight_total)} kg
          </strong>
        </span>
      </div>
      <div className={NOTE}>
        Bekleyenler üstte, ağır olan önce. &quot;Malzeme Bekliyor&quot; = plaka teslim edilmedi, gecikme satın
        almada.
      </div>
      <ModalTable
        headers={['Resim / Poz', 'Nesting', 'İş Emri', num('Adet'), num('Ağırlık'), 'Durum']}
        rows={rows}
      />
    </>
  );
}

// ---- quality --------------------------------------------------------------------

const NCR_SEVERITY_FAMILIES: Record<string, StatusFamily> = {
  critical: 'red',
  major: 'orange',
  minor: 'grey',
};

function QualityBody({ brief, detail }: { brief: MeetingBrief; detail: SectionDetail }) {
  const quality = brief.quality ?? {};
  const rows = (detail.list ?? []).map((n, i) => (
    <tr key={i}>
      <td>
        <strong>{n.ncr_number}</strong>
      </td>
      <td className={s.tdMain} title={n.title ?? ''}>
        {n.title}
      </td>
      <td>
        <StatusBadge color={NCR_SEVERITY_FAMILIES[n.severity ?? ''] ?? 'grey'}>{n.severity_display}</StatusBadge>
      </td>
      <td>
        <StatusBadge color={['approved', 'closed'].includes(n.status ?? '') ? 'green' : 'red'}>
          {n.status_display}
        </StatusBadge>
      </td>
      <td>{n.job_no}</td>
      <td>{fmtShortDate(n.created_at)}</td>
    </tr>
  ));
  const sev = quality.open_by_severity ?? {};
  return (
    <>
      <div className={STATS}>
        <span>
          Açık <strong className={quality.open ? s.numRed : s.numGreen}>{fmtInt(quality.open)}</strong>
        </span>
        <span>
          Kritik <strong>{fmtInt(sev.critical)}</strong>
        </span>
        <span>
          Majör <strong>{fmtInt(sev.major)}</strong>
        </span>
        <span>
          Minör <strong>{fmtInt(sev.minor)}</strong>
        </span>
        <span>
          Toplam <strong>{fmtInt(quality.total)}</strong>
        </span>
      </div>
      <ModalTable headers={['NCR', 'Başlık', 'Önem', 'Durum', 'İş Emri', 'Tarih']} rows={rows} />
    </>
  );
}

// ---- procurement -------------------------------------------------------------------

const PROCUREMENT_STAGE_BADGES: Record<string, ReactNode> = {
  not_requested: <StatusBadge color="orange">Talebe dönüşmedi</StatusBadge>,
  requested: <StatusBadge color="blue">Talepte · bekliyor</StatusBadge>,
  partial: <StatusBadge color="purple">Kısmi teslim</StatusBadge>,
  delivered: <StatusBadge color="green">Teslim edildi</StatusBadge>,
};

/**
 * Teslim tarihi: delivered rows show the actual date (green); pending rows
 * the last open PO line's promise (red + "gecikti" once passed); no live PO =
 * no date to promise.
 */
function DeliveryCell({ row: w }: { row: ProcurementRow }) {
  if (w.stage === 'delivered') {
    return <span className={s.numGreen}>{w.delivered_at ? fmtShortDate(w.delivered_at) : 'teslim edildi'}</span>;
  }
  const partial =
    w.stage === 'partial' ? (
      <>
        <span className={s.numOrange} title="Kısmi teslim">
          {fmtQty2(w.delivered_quantity)} / {fmtQty2(w.quantity)} {w.item_unit || ''} alındı
        </span>
        <br />
      </>
    ) : null;
  if (w.projected_delivery) {
    return (
      <>
        {partial}
        {w.delivery_overdue ? (
          <span className={s.numRed} title="Söz verilen teslim tarihi geçti">
            {fmtShortDate(w.projected_delivery)} · gecikti
          </span>
        ) : (
          <span title="Öngörülen teslim (sipariş + teslim süresi)">~{fmtShortDate(w.projected_delivery)}</span>
        )}
      </>
    );
  }
  return (
    <>
      {partial}
      <span className={s.textMuted} title="Açık sipariş yok — teslim tarihi öngörülemiyor">
        sipariş yok
      </span>
    </>
  );
}

export interface CriticalToggleProps {
  /** Pending toggles: item id -> the value being saved. */
  pending: ReadonlyMap<number, boolean>;
  onToggle: (row: ProcurementRow, critical: boolean) => void;
}

function ProcurementBody({
  brief,
  detail,
  critical,
}: {
  brief: MeetingBrief;
  detail: SectionDetail;
  critical: CriticalToggleProps;
}) {
  const procurement = brief.procurement ?? {};
  const rows = (detail.items ?? []).map((w, i) => {
    const saving = w.id !== undefined ? critical.pending.get(w.id) : undefined;
    return (
      <tr key={w.id ?? `i${i}`}>
        <td className={s.tdMain} title={w.item_name || ''}>
          {w.item_name || '—'} <span className={s.textMuted}>{w.item_code || ''}</span>
        </td>
        <td className={s.tdMuted}>{w.request_number || '—'}</td>
        <td>{w.job_no || ''}</td>
        <td className={s.tdNum}>{fmtInt(w.quantity_to_purchase)}</td>
        <td>{PROCUREMENT_STAGE_BADGES[w.stage ?? ''] ?? null}</td>
        <td className={s.tdDate}>
          <DeliveryCell row={w} />
        </td>
        <td className={s.tdCrit}>
          {w.id !== undefined ? (
            <input
              type="checkbox"
              className={s.critToggle}
              checked={saving ?? !!w.is_critical}
              disabled={saving !== undefined}
              aria-label={`Kritik: ${w.item_name || w.item_code || w.id}`}
              title="Kritik: imalat bu kalem teslim edilmeden devam edemez"
              onChange={(e) => critical.onToggle(w, e.currentTarget.checked)}
            />
          ) : null}
        </td>
      </tr>
    );
  });

  // Depodan çekilen malzemeler: one row per pulled item line.
  const pullRows = (detail.pull_requests ?? []).flatMap((p, pi) => {
    const kindBadge =
      p.kind === 'subcontractor' ? (
        <StatusBadge color="purple">Taşeron</StatusBadge>
      ) : (
        <StatusBadge color="blue">Ekip</StatusBadge>
      );
    const statusBadge =
      p.status === 'transferred' ? (
        <StatusBadge color="green">{p.status_label || 'Teslim Edildi'}</StatusBadge>
      ) : (
        <StatusBadge color="orange">{p.status_label || 'Beklemede'}</StatusBadge>
      );
    const who =
      p.status === 'transferred' && p.confirmed_by
        ? `${p.confirmed_by} · ${fmtShortDate(p.confirmed_at || p.requested_at)}`
        : `${p.requested_by || '—'} · ${fmtShortDate(p.requested_at)}`;
    return (p.items ?? []).map((item, ii) => (
      <tr key={`${pi}-${ii}`}>
        <td className={s.tdMuted}>
          <strong>{p.number}</strong>
        </td>
        <td className={s.tdMain} title={p.destination || ''}>
          {p.destination || '—'} {kindBadge}
        </td>
        <td className={s.tdMain} title={item.item_name || ''}>
          {item.item_name || '—'} <span className={s.textMuted}>{item.item_code || ''}</span>
        </td>
        <td>{item.job_no || ''}</td>
        <td className={s.tdNum}>
          {fmtInt(item.quantity)} {item.item_unit || ''}
        </td>
        <td>{statusBadge}</td>
        <td className={s.tdDate}>{who}</td>
      </tr>
    ));
  });
  const pulls = procurement.material_pulls ?? {};
  return (
    <>
      <div className={STATS}>
        <span>
          Bekleyen <strong>{fmtInt(procurement.items_waiting)}</strong>
        </span>
        <span>
          Talebe dönüşmedi <strong>{fmtInt(procurement.not_yet_requested)}</strong>
        </span>
        <span>
          Talepte <strong>{fmtInt(procurement.requested_waiting)}</strong>
        </span>
        <span>
          Teslim edildi{' '}
          <strong className={s.numGreen}>
            {fmtInt(procurement.items_delivered)} / {fmtInt(procurement.items_total)}
          </strong>
        </span>
        {procurement.partially_delivered ? (
          <span>
            Kısmi teslim <strong className={s.numOrange}>{fmtInt(procurement.partially_delivered)}</strong>
          </span>
        ) : null}
        {procurement.critical_waiting ? (
          <span>
            Kritik bekleyen <strong className={s.numRed}>{fmtInt(procurement.critical_waiting)}</strong>
          </span>
        ) : null}
      </div>
      <ModalTable
        headers={['Malzeme', 'Talep', 'İş Emri', num('Miktar'), 'Aşama', 'Teslim Tarihi', 'Kritik']}
        rows={rows}
      />
      {pullRows.length ? (
        <>
          <div className={SECTION}>
            Depodan Çekilen Malzemeler{' '}
            <span className={s.textMuted}>
              · {fmtInt(pulls.transferred)} talep teslim edildi / {fmtInt(pulls.pending)} bekliyor
            </span>
          </div>
          <ModalTable
            headers={['Talep', 'Hedef', 'Malzeme', 'İş Emri', num('Miktar'), 'Durum', 'Kim · Tarih']}
            rows={pullRows}
          />
        </>
      ) : null}
    </>
  );
}

// ---- revisions -------------------------------------------------------------------

const RELEASE_STATUS_FAMILIES: Record<string, StatusFamily> = {
  released: 'green',
  superseded: 'grey',
  in_revision: 'orange',
  pending_approval: 'blue',
  rejected: 'red',
};

function RevisionsBody({ brief, detail }: { brief: MeetingBrief; detail: SectionDetail }) {
  const drawing = brief.revisions?.drawing ?? {};
  const targets = brief.revisions?.design_targets ?? {};
  const releaseRows = (detail.releases ?? []).map((r, i) => (
    <tr key={i}>
      <td>
        <strong>Rev {r.revision_code || `R${r.revision_number ?? ''}`}</strong>
      </td>
      <td>
        <StatusBadge color={RELEASE_STATUS_FAMILIES[r.status ?? ''] ?? 'grey'}>{r.status_display}</StatusBadge>
      </td>
      <td>{r.job_no}</td>
      <td>{fmtShortDate(r.released_at)}</td>
    </tr>
  ));
  const taskRows = (detail.design_tasks ?? []).map((t, i) => (
    <tr key={i}>
      <td className={s.tdMain} title={t.title || ''}>
        {t.title || '—'}
      </td>
      <td>{t.job_no}</td>
      <td>
        {t.target_completion_date ? (
          <strong>{fmtShortDate(t.target_completion_date)}</strong>
        ) : (
          <span className={s.numOrange}>Girilmemiş</span>
        )}
      </td>
      <td>
        <StatusBadge color={TASK_STATUS_FAMILIES[t.status ?? ''] ?? 'grey'}>{t.status_display}</StatusBadge>
      </td>
    </tr>
  ));
  return (
    <>
      <div className={SECTION}>
        Teknik Resim Yayınları <span className={s.textMuted}>· {fmtInt(drawing.revision_count)} kez revize</span>
      </div>
      <ModalTable headers={['Revizyon', 'Durum', 'İş Emri', 'Tarih']} rows={releaseRows} />
      <div className={SECTION}>
        Dizayn Görevleri Hedef Tarihleri{' '}
        <span className={s.textMuted}>
          · {fmtInt(targets.with_target)}/{fmtInt(targets.total)} görevde tarih
        </span>
      </div>
      <ModalTable headers={['Görev', 'İş Emri', 'Hedef Tarih', 'Durum']} rows={taskRows} />
    </>
  );
}

// ---- financial ---------------------------------------------------------------------

const VERDICT_FAMILIES: Record<string, StatusFamily> = { green: 'green', red: 'red', orange: 'orange' };

function FinancialBody({ detail: d }: { detail: SectionDetail }) {
  const meta = FINANCIAL_META[d.verdict ?? ''] ?? FINANCIAL_META.no_data!;
  const perKgNote = (v: number | null | undefined) =>
    isSet(v) ? (
      <>
        {' '}
        <span className={s.tdMutedSm}>({fmtPerKg(v)})</span>
      </>
    ) : null;
  // Kâr oranı = (satış − öngörülen maliyet) / satış: profit, not cost coverage.
  const profit = isSet(d.profit_pct) ? (
    <span className={d.profit_pct < 0 ? s.numRed : s.numGreen}>%{d.profit_pct.toLocaleString('tr-TR')}</span>
  ) : (
    '—'
  );
  const margin = isSet(d.margin_eur) ? (
    <span className={d.margin_eur < 0 ? s.numRed : s.numGreen}>{fmtEur(d.margin_eur)}</span>
  ) : (
    '—'
  );
  const categories = d.categories ?? [];
  const rows = categories.map((c, i) => (
    <tr key={i}>
      <td className={s.tdMain}>{c.label}</td>
      <td className={s.tdNum}>{fmtEur(c.amount_eur)}</td>
      <td className={s.tdNum}>{fmtPerKg(c.eur_per_kg)}</td>
    </tr>
  ));
  if (rows.length) {
    rows.push(
      <tr key="total">
        <td className={s.tdMain}>
          <strong>Toplam (gerçekleşen)</strong>
        </td>
        <td className={s.tdNum}>
          <strong>{fmtEur(d.actual_total_eur)}</strong>
        </td>
        <td className={s.tdNum}>
          <strong>{fmtPerKg(d.actual_eur_per_kg)}</strong>
        </td>
      </tr>,
    );
  }
  return (
    <>
      <div className={STATS}>
        <span>
          <StatusBadge color={VERDICT_FAMILIES[meta.theme] ?? 'grey'}>{meta.label}</StatusBadge>
        </span>
        <span>
          Satış Fiyatı <strong>{fmtEur(d.price_eur)}</strong>
          {perKgNote(d.price_eur_per_kg)}
          {d.price_is_derived ? (
            <>
              {' '}
              <StatusBadge color="grey">türetilmiş</StatusBadge>
            </>
          ) : null}
        </span>
        <span>
          Gerçekleşen <strong>{fmtEur(d.actual_total_eur)}</strong>
          {perKgNote(d.actual_eur_per_kg)}
        </span>
        <span>
          Öngörülen Toplam <strong>{fmtEur(d.projected_total_eur)}</strong>
          {perKgNote(d.projected_eur_per_kg)}
        </span>
        <span>
          Kâr <strong>{profit}</strong>
        </span>
        <span>
          Marj <strong>{margin}</strong>
        </span>
        {d.total_weight_kg ? (
          <span>
            Ağırlık <strong>{fmtInt(d.total_weight_kg)} kg</strong>
          </span>
        ) : null}
      </div>
      <div className={NOTE}>
        {d.reason || ''}
        {d.delivered_uncosted_deduction_eur
          ? ` (maliyeti girilmemiş teslim alınan kalemler için ${fmtEur(d.delivered_uncosted_deduction_eur)} düşüldü)`
          : ''}
      </div>
      <div className={SECTION}>Gerçekleşen Maliyet Dağılımı</div>
      <ModalTable headers={['Kalem', num('Tutar'), num('€/kg')]} rows={rows} />
    </>
  );
}

/** The body of a fetched section, from the brief and its detail payload. */
export function SectionBody({
  kind,
  brief,
  detail,
  critical,
}: {
  kind: SectionKind;
  brief: MeetingBrief;
  detail: SectionDetail;
  critical: CriticalToggleProps;
}) {
  switch (kind) {
    case 'machining':
      return <MachiningBody brief={brief} detail={detail} />;
    case 'cutting':
      return <CuttingBody brief={brief} detail={detail} />;
    case 'quality':
      return <QualityBody brief={brief} detail={detail} />;
    case 'procurement':
      return <ProcurementBody brief={brief} detail={detail} critical={critical} />;
    case 'revisions':
      return <RevisionsBody brief={brief} detail={detail} />;
    case 'financial':
      return <FinancialBody detail={detail} />;
    case 'welding':
      return <WeldingBody brief={brief} />;
    case 'files':
      return <FilesBody brief={brief} />;
  }
}
