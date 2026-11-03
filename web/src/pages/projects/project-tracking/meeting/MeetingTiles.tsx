import type { KeyboardEvent, ReactNode } from 'react';
import { fmtHours, fmtInt, fmtShortDate, fmtWd, isSet } from './format';
import s from './MeetingView.module.css';
import type {
  BriefFile,
  CuttingBrief,
  FilesBrief,
  FinancialBrief,
  MachiningBrief,
  MeetingBrief,
  ProcurementBrief,
  QualityBrief,
  RevisionsBrief,
  SectionKind,
  WeldingBrief,
} from './types';

// Section tiles on the slide (legacy meetingTiles.js): one row of headline
// figures out of /meeting-brief/. Each tile opens its section modal. House
// rules: no yellow, no exclamation marks, "iş günü" for working days.

export type TileTheme = 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'grey';

export const FINANCIAL_META: Record<string, { theme: TileTheme; label: string }> = {
  healthy: { theme: 'green', label: 'Finans · Sağlıklı' },
  risky: { theme: 'orange', label: 'Finans · Riskli' },
  critical: { theme: 'red', label: 'Finans · Kritik' },
  no_price: { theme: 'grey', label: 'Finans · Fiyat Yok' },
  no_data: { theme: 'grey', label: 'Finans · Veri Yok' },
};

export const FILE_GROUP_LABELS: [key: string, label: string][] = [
  ['job_order', 'İş Emri'],
  ['offer', 'Teklif'],
  ['task', 'Görev'],
  ['discussion', 'Tartışma'],
];

const FINANCIAL_ICONS: Record<string, string> = {
  healthy: 'fa-circle-check',
  risky: 'fa-triangle-exclamation',
  critical: 'fa-circle-exclamation',
  no_price: 'fa-tag',
  no_data: 'fa-circle-question',
};

/** Every file of the brief, newest first, with its group label. */
export function mergedFiles(files: FilesBrief | null | undefined): (BriefFile & { source: string })[] {
  const merged = FILE_GROUP_LABELS.flatMap(([key, label]) =>
    (files?.[key]?.items ?? []).map((f) => ({ ...f, source: label })),
  );
  merged.sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
  return merged;
}

/** Enter / Space on a tile behave like a click (role="button"). */
function activateOnKey(open: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
}

interface TileProps {
  kind: SectionKind;
  icon: string;
  title: string;
  big: ReactNode;
  label: ReactNode;
  subs?: ReactNode[];
  theme?: TileTheme;
  clickable?: boolean;
  alert?: boolean;
  onOpen: (kind: SectionKind) => void;
}

function Tile({ kind, icon, title, big, label, subs = [], theme = 'grey', clickable = true, alert = false, onOpen }: TileProps) {
  const open = () => onOpen(kind);
  const className = [s.tile, clickable ? s.tileClick : '', alert ? s.tileAlert : ''].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      data-theme={theme}
      data-tile={kind}
      title={clickable ? 'Detayı aç' : undefined}
      {...(clickable
        ? { role: 'button', tabIndex: 0, onClick: open, onKeyDown: activateOnKey(open) }
        : {})}
    >
      <div className={s.tileHead}>
        <i className={`fas fa-${icon}`} aria-hidden />
        {title}
        {clickable ? (
          <span className={s.tileHint}>
            <i className="fas fa-expand" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className={s.tileBig}>{big}</div>
      <div className={s.tileLabel}>{label}</div>
      {subs
        .filter((sub) => sub !== null && sub !== undefined && sub !== '' && sub !== false)
        .map((sub, i) => (
          <div key={i} className={s.tileSub}>
            {sub}
          </div>
        ))}
    </div>
  );
}

type Open = { onOpen: (kind: SectionKind) => void };

function QualityTile({ quality, onOpen }: { quality: QualityBrief } & Open) {
  const open = Number(quality.open) || 0;
  const sev = quality.open_by_severity ?? {};
  const parts: ReactNode[] = [];
  if (sev.critical) parts.push(<span key="c" className={s.numRed}>Kritik {fmtInt(sev.critical)}</span>);
  if (sev.major) parts.push(<span key="m" className={s.numOrange}>Majör {fmtInt(sev.major)}</span>);
  if (sev.minor) parts.push(<span key="n">Minör {fmtInt(sev.minor)}</span>);
  const first = quality.open_list?.[0];
  return (
    <Tile
      kind="quality"
      icon="clipboard-check"
      title="Kalite · NCR"
      theme={open ? 'red' : 'green'}
      alert={open > 0}
      onOpen={onOpen}
      big={
        open ? (
          <span className={s.numRed}>{fmtInt(open)}</span>
        ) : (
          <span className={s.numGreen}>
            <i className="fas fa-circle-check" aria-hidden />
          </span>
        )
      }
      label={open ? 'açık NCR' : 'açık NCR yok'}
      subs={[
        parts.length ? joinNodes(parts, ' · ') : `toplam ${fmtInt(quality.total)} NCR`,
        first ? (
          <>
            <strong>{first.ncr_number}</strong> {first.title || ''}
          </>
        ) : null,
      ]}
    />
  );
}

function joinNodes(nodes: ReactNode[], separator: string): ReactNode {
  return nodes.map((node, i) => (
    <span key={i}>
      {i > 0 ? separator : null}
      {node}
    </span>
  ));
}

function RevisionsTile({ revisions, onOpen }: { revisions: RevisionsBrief } & Open) {
  const drawing = revisions.drawing ?? {};
  const targets = revisions.design_targets ?? {};
  const latest = drawing.latest;
  const theme: TileTheme = drawing.in_revision_count ? 'orange' : latest ? 'green' : 'grey';
  const revLine = (
    <>
      <span className={drawing.revision_count ? s.numOrange : undefined}>
        {fmtInt(drawing.revision_count)} kez revize edildi
      </span>
      {drawing.in_revision_count ? (
        <>
          {' · '}
          <span className={s.numOrange}>{fmtInt(drawing.in_revision_count)} yayın revizyonda</span>
        </>
      ) : null}
    </>
  );
  const targetLine = targets.total
    ? `Hedef ${targets.latest ? fmtShortDate(targets.latest) : '—'} · ${fmtInt(targets.with_target)}/${fmtInt(targets.total)} dizayn görevinde tarih`
    : '';
  return (
    <Tile
      kind="revisions"
      icon="pen-ruler"
      title="Dizayn"
      theme={theme}
      onOpen={onOpen}
      big={latest ? fmtShortDate(latest.released_at) : '—'}
      label={
        latest
          ? `son yayın · Rev ${latest.revision_code || `R${latest.revision_number ?? ''}`}`
          : 'teknik resim yayını yok'
      }
      subs={[revLine, targetLine]}
    />
  );
}

function ProcurementTile({ procurement, onOpen }: { procurement: ProcurementBrief } & Open) {
  const waiting = Number(procurement.items_waiting) || 0;
  const total = Number(procurement.items_total) || 0;
  const pct = procurement.progress_pct;
  const pulls = procurement.material_pulls;
  const theme: TileTheme = procurement.critical_waiting ? 'red' : waiting ? 'orange' : 'green';
  const pullLine =
    pulls && Number(pulls.items_pulled) > 0 ? (
      <>
        Depodan çekilen {fmtInt(pulls.items_pulled)} kalem
        {Number(pulls.pending) > 0 ? (
          <>
            {' · '}
            <span className={s.numOrange}>{fmtInt(pulls.pending)} talep bekliyor</span>
          </>
        ) : null}
      </>
    ) : (
      ''
    );
  return (
    <Tile
      kind="procurement"
      icon="cart-shopping"
      title="Satın Alma"
      theme={theme}
      onOpen={onOpen}
      big={
        <>
          <span className={waiting ? s.numOrange : s.numGreen}>{fmtInt(waiting)}</span>
          <span className={s.tileBigDim}>/{fmtInt(total)}</span>
        </>
      }
      label="bekleyen kalem"
      subs={[
        <>
          <span className={s.numGreen}>
            %{isSet(pct) ? Number(pct).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : 0}
          </span>{' '}
          tedarik · talebe dönüşmedi {fmtInt(procurement.not_yet_requested)}
          {procurement.partially_delivered ? ` · kısmi teslim ${fmtInt(procurement.partially_delivered)}` : ''}
        </>,
        procurement.critical_waiting ? (
          <span className={s.numRed}>Kritik bekleyen {fmtInt(procurement.critical_waiting)}: imalatı tutuyor</span>
        ) : (
          pullLine
        ),
      ]}
    />
  );
}

function CuttingTile({ cutting, onOpen }: { cutting: CuttingBrief } & Open) {
  const waiting = Number(cutting.parts_waiting) || 0;
  const material = Number(cutting.parts_waiting_material) || 0;
  return (
    <Tile
      kind="cutting"
      icon="scissors"
      title="CNC Kesim"
      theme={material ? 'orange' : waiting ? 'blue' : 'green'}
      onOpen={onOpen}
      big={<span className={waiting ? s.numOrange : s.numGreen}>{fmtInt(waiting)}</span>}
      label="parça kesim bekliyor"
      subs={[
        `Kesilen ${fmtInt(cutting.parts_cut)} / ${fmtInt(cutting.parts_total)} parça · ${fmtInt(cutting.weight_cut)} / ${fmtInt(cutting.weight_total)} kg`,
        material ? (
          <span className={s.numOrange}>
            {fmtInt(material)} parça · {fmtInt(cutting.weight_waiting_material)} kg malzeme bekliyor
          </span>
        ) : (
          ''
        ),
      ]}
    />
  );
}

function MachiningTile({ machining, onOpen }: { machining: MachiningBrief } & Open) {
  const waiting = Number(machining.operations_waiting) || 0;
  return (
    <Tile
      kind="machining"
      icon="gears"
      title="Talaşlı İmalat"
      theme={waiting ? 'blue' : 'green'}
      onOpen={onOpen}
      big={<span className={waiting ? s.numOrange : s.numGreen}>{fmtInt(waiting)}</span>}
      label="operasyon bekliyor"
      subs={[
        `${fmtInt(machining.operations_completed)} / ${fmtInt(machining.operations_total)} tamamlandı · ${fmtInt(machining.parts_completed)} / ${fmtInt(machining.parts_total)} parça`,
        `Tahmini ${fmtHours(machining.estimated_hours_total)} s · harcanan ${fmtHours(machining.hours_spent)} s · kalan ~${fmtHours(machining.hours_remaining)} s`,
      ]}
    />
  );
}

function WeldingTile({ welding, onOpen }: { welding: WeldingBrief } & Open) {
  const resources = welding.resources ?? [];
  const overall = welding.weighted_progress_pct;
  const taskPct = welding.task_progress_pct;
  const usingTask = !isSet(overall) && isSet(taskPct);
  const big = usingTask ? taskPct : overall;
  const wait = welding.material_wait ?? {};
  const waitParts: string[] = [];
  if (wait.pipe_profile_items_pending) waitParts.push(`${fmtInt(wait.pipe_profile_items_pending)} boru/profil`);
  if (wait.critical_items_pending) waitParts.push(`${fmtInt(wait.critical_items_pending)} kritik kalem`);
  const lost = wait.days_lost_wd;
  const hasLoss = typeof lost === 'number' && lost > 0;
  const subs: ReactNode[] = [
    resources.length
      ? `${fmtInt(resources.length)} kaynak · ${fmtInt(welding.allocated_kg_total)} kg tahsis`
      : 'Kaynak ataması yok',
  ];
  if (waitParts.length) {
    subs.push(
      <span className={s.numOrange}>
        {waitParts.join(' · ')} malzeme bekliyor{hasLoss ? ` · ${fmtWd(lost)} iş günü kayıp` : ''}
      </span>,
    );
  } else if (hasLoss) {
    subs.push(<span className={s.numOrange}>Malzeme bekleme kaybı {fmtWd(lost)} iş günü</span>);
  } else if (resources.length) {
    const names = resources.slice(0, 2).map((r) => r.name ?? '');
    subs.push(names.join(' · ') + (resources.length > 2 ? ` +${resources.length - 2}` : ''));
  }
  return (
    <Tile
      kind="welding"
      icon="fire"
      title="Kaynaklı İmalat"
      theme={waitParts.length ? 'orange' : 'blue'}
      onOpen={onOpen}
      big={isSet(big) ? `%${fmtInt(big)}` : '—'}
      label={usingTask ? 'görev ilerlemesi' : 'ağırlıklı ilerleme'}
      subs={subs}
    />
  );
}

function FilesTile({ files, onOpen }: { files: FilesBrief } & Open) {
  const total = FILE_GROUP_LABELS.reduce((n, [key]) => n + (Number(files[key]?.total) || 0), 0);
  const newest = mergedFiles(files)[0];
  const counts = FILE_GROUP_LABELS.map(([key, label]) => `${label} ${fmtInt(files[key]?.total)}`).join(' · ');
  return (
    <Tile
      kind="files"
      icon="folder-open"
      title="Dosyalar"
      theme="grey"
      clickable={total > 0}
      onOpen={onOpen}
      big={fmtInt(total)}
      label="dosya"
      subs={[
        counts,
        newest ? `Son: ${newest.name || 'dosya'} · ${fmtShortDate(newest.uploaded_at)}` : 'Dosya yok',
      ]}
    />
  );
}

/**
 * Finans as a seal: the verdict word only (the slide is company-public: no
 * ratios, no amounts); the reason stays in the tooltip. Cost-permitted users
 * click through to the amounts; the section endpoint re-checks server-side.
 */
function FinancialTile({ financial, onOpen }: { financial: FinancialBrief } & Open) {
  const verdict = financial.verdict ?? 'no_data';
  const meta = FINANCIAL_META[verdict] ?? FINANCIAL_META.no_data!;
  const clickable = !!financial.can_view_details;
  const reason =
    (financial.reason || '') +
    (financial.price_is_derived ? ' · satış fiyatı türetilmiş' : '') +
    (clickable ? ' · detay için tıklayın' : '');
  const open = () => onOpen('financial');
  return (
    <div
      className={[s.tile, s.tileFin, clickable ? s.tileClick : ''].filter(Boolean).join(' ')}
      data-theme={meta.theme}
      data-tile="financial"
      title={reason || undefined}
      {...(clickable ? { role: 'button', tabIndex: 0, onClick: open, onKeyDown: activateOnKey(open) } : {})}
    >
      <div className={s.tileHead}>
        <i className="fas fa-coins" aria-hidden />
        Finans
        {clickable ? (
          <span className={s.tileHint}>
            <i className="fas fa-expand" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className={s.finSeal}>
        <i className={`fas ${FINANCIAL_ICONS[verdict] ?? FINANCIAL_ICONS.no_data}`} aria-hidden />
        <span className={s.finWord}>{meta.label.replace('Finans · ', '')}</span>
      </div>
      <div className={s.tileLabel}>maliyet durumu</div>
    </div>
  );
}

/** The whole tile row for a brief, in slide order. */
export function MeetingTiles({ brief, onOpen }: { brief: MeetingBrief } & Open) {
  return (
    <>
      {brief.quality ? <QualityTile quality={brief.quality} onOpen={onOpen} /> : null}
      {brief.revisions ? <RevisionsTile revisions={brief.revisions} onOpen={onOpen} /> : null}
      {brief.procurement ? <ProcurementTile procurement={brief.procurement} onOpen={onOpen} /> : null}
      {brief.cutting ? <CuttingTile cutting={brief.cutting} onOpen={onOpen} /> : null}
      {brief.machining ? <MachiningTile machining={brief.machining} onOpen={onOpen} /> : null}
      {brief.welding ? <WeldingTile welding={brief.welding} onOpen={onOpen} /> : null}
      {brief.files ? <FilesTile files={brief.files} onOpen={onOpen} /> : null}
      {brief.financial ? <FinancialTile financial={brief.financial} onOpen={onOpen} /> : null}
    </>
  );
}

export function TilesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${s.tile} ${s.tileSkeleton}`} data-theme="grey" aria-hidden>
          <div className={`${s.skeleton} ${s.skeletonTitle}`} />
          <div className={`${s.skeleton} ${s.skeletonBig}`} />
          <div className={`${s.skeleton} ${s.skeletonShort}`} />
        </div>
      ))}
    </>
  );
}

/** The brief failed and there is nothing cached to show. */
export function TilesError() {
  return (
    <div className={s.tile} data-theme="red">
      <div className={s.tileHead}>
        <i className="fas fa-triangle-exclamation" aria-hidden />
        Özet
      </div>
      <div className={`${s.tileLabel} ${s.textDanger}`}>Toplantı özeti yüklenemedi.</div>
    </div>
  );
}
