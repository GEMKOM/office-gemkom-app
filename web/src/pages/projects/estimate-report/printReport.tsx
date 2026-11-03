import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { REVIEW_LABELS, type EstimateReport, type WeldSchedule } from '@/api/projects/estimator';
import { Markdown } from './Markdown';
import { costRowLabel, formatDateTime, JOINT_TYPE_LABELS, MATERIAL_LABELS, money, processLabel, ROUTE_LABELS } from './reportParts';
import { fmt, reportModel, type Payload } from './reportModel';

// "PDF": the printable report in a new window (port of the legacy
// printReport). The page is rendered by React into the new window's
// document, so every payload value stays text.

const PRINT_CSS = `
  body { font: 11pt/1.45 "Segoe UI", Arial, sans-serif; color: #111; margin: 18mm 16mm; }
  h1 { font-size: 16pt; margin: 0 0 2mm; } h2 { font-size: 13pt; margin: 8mm 0 2mm; color: #3b1a8a; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 5mm 0 1.5mm; } h4, h5, h6 { font-size: 11pt; margin: 4mm 0 1mm; }
  .meta { color: #555; font-size: 9.5pt; margin-bottom: 4mm; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 2mm 0 4mm; page-break-inside: auto; }
  th, td { border: 1px solid #bbb; padding: 1.2mm 1.8mm; vertical-align: top; } th { background: #f1eafe; text-align: left; }
  table.summary th { width: 38%; } table.summary td { font-weight: 600; }
  td.n, th.n, .text-end { text-align: right; font-variant-numeric: tabular-nums; }
  .text-center { text-align: center; }
  tr.total td { font-weight: 700; background: #f8f6ff; } td.basis { color: #555; }
  tr { page-break-inside: avoid; } ul, ol { margin: 0 0 2mm; padding-left: 5mm; } p { margin: 0 0 2mm; }
  blockquote { margin: 0 0 3mm; padding: 1mm 3mm; border-left: 2pt solid #c4b5fd; color: #444; font-size: 9.5pt; }
  .foot { margin-top: 6mm; font-size: 8.5pt; color: #666; border-top: 1px solid #ddd; padding-top: 2mm; }
  @page { size: A4; margin: 12mm; }
`;

const SRC: Record<string, string> = { drawn: 'çizim', deduced: 'çıkarım', rule: 'kural' };

export function printTitle(report: Payload): string {
  return `Tahmin raporu v${report.version} · ${report.subject_key}${report.title ? ` · ${report.title}` : ''}`;
}

/** The printable report: summary, cost table, correction note, the report text and the weld list. */
export function PrintDocument({ report, weldSchedule }: { report: Payload; weldSchedule: Payload }) {
  const ct = report.cost_table || {};
  const rows: Payload[] = (ct.rows || []).map((r: Payload) => ({ ...r, label: costRowLabel(r), basis: r.basis || '' }));
  const routes: string[] = ct.routes?.length ? ct.routes : ['in_house'];
  const m = report.status === 'done' ? reportModel(report) : null;
  const exp = ct.expected_total || {};
  const kg = ct.eur_per_kg || {};
  const u = report.usage?.report || {};
  const cells = (r: Payload, route: string) =>
    ['low', 'expected', 'high'].map((lvl) => {
      const v = r[route]?.[lvl];
      return (
        <td key={`${route}-${lvl}`} className="n">
          {v == null ? '—' : fmt(v, r.key === 'eur_per_kg' ? 2 : 0)}
        </td>
      );
    });
  const hasSource = (weldSchedule?.joints || []).some((j: Payload) => j && j.source);
  const review = report.review_decision ? REVIEW_LABELS[report.review_decision] : null;
  return (
    <>
      <h1>{printTitle(report)}</h1>
      <div className="meta">
        {report.customer || ''}
        {report.customer ? ' · ' : ''}
        {formatDateTime(report.created_at)}
        {report.created_by_name ? ` · ${report.created_by_name}` : ''}
        {report.review_decision
          ? ` · ${review?.label ?? ''}${report.reviewed_by_name ? ` (${report.reviewed_by_name})` : ''}`
          : ''}
      </div>
      {m ? (
        <table className="summary">
          <tbody>
            {m.price ? (
              <tr>
                <th>Önerilen fiyat</th>
                <td>
                  {money(m.price.total ?? m.price.raw)}
                  {m.price.perUnit != null ? ` · ${money(m.price.perUnit)}/adet` : ''}
                  {m.price.perKg != null ? ` · ${fmt(m.price.perKg, 2)} €/kg` : ''}
                </td>
              </tr>
            ) : null}
            {m.floor ? (
              <tr>
                <th>Taban fiyat</th>
                <td>
                  {money(m.floor.total ?? m.floor.raw)}
                  {m.floor.perUnit != null ? ` · ${money(m.floor.perUnit)}/adet` : ''}
                </td>
              </tr>
            ) : null}
            {routes
              .filter((k) => exp[k] != null)
              .map((k) => (
                <tr key={k}>
                  <th>Beklenen maliyet · {ROUTE_LABELS[k] || k}</th>
                  <td>
                    {money(exp[k])}
                    {kg[k] != null ? ` · ${fmt(kg[k], 2)} €/kg` : ''}
                    {k === m.basis?.key && routes.length > 1 ? ' (fiyat dayanağı)' : ''}
                  </td>
                </tr>
              ))}
            {m.quantity != null ? (
              <tr>
                <th>Adet · ağırlık</th>
                <td>
                  {fmt(m.quantity, 0)} adet
                  {m.unitKg != null ? ` · ${fmt(m.unitKg, 0)} kg/adet` : ''}
                  {m.totalKg != null ? ` · ${fmt(m.totalKg, 0)} kg toplam` : ''}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {rows.length ? (
        <>
          <h2>Maliyet tablosu (€, toplam adet)</h2>
          <table className="cost">
            <thead>
              <tr>
                <th>Kalem</th>
                {routes.includes('in_house') ? (
                  <>
                    <th>İç imalat Düşük</th>
                    <th>İç imalat Beklenen</th>
                    <th>İç imalat Yüksek</th>
                  </>
                ) : null}
                {routes.includes('subcontract') ? (
                  <>
                    <th>Taşeron Düşük</th>
                    <th>Taşeron Beklenen</th>
                    <th>Taşeron Yüksek</th>
                  </>
                ) : null}
                <th>Dayanak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.key === 'total' ? 'total' : ''}>
                  <td>{r.label}</td>
                  {routes.includes('in_house') ? cells(r, 'in_house') : null}
                  {routes.includes('subcontract') ? cells(r, 'subcontract') : null}
                  <td className="basis">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {report.review_decision === 'correct' && report.review_note ? (
        <>
          <h2>Düzeltme notu</h2>
          <p>{report.review_note}</p>
        </>
      ) : null}
      <Markdown source={report.markdown} />
      {weldSchedule ? (
        <>
          <h2>
            Kaynak listesi (1 adet) · v{weldSchedule.version}
          </h2>
          <table className="weld">
            <thead>
              <tr>
                <th>No</th>
                <th>Birleşim</th>
                <th>Tip</th>
                <th>Malzeme</th>
                <th>Ölçü</th>
                <th>Proses</th>
                <th className="n">Adet</th>
                <th className="n">m/birleşim</th>
                <th className="n">m toplam</th>
                <th>NDT</th>
                {hasSource ? <th>Kaynak</th> : null}
              </tr>
            </thead>
            <tbody>
              {(weldSchedule.joints || []).map((j: Payload, i: number) => (
                <tr key={i}>
                  <td>{j.joint_id || ''}</td>
                  <td>{j.description || ''}</td>
                  <td>{JOINT_TYPE_LABELS[j.joint_type] || j.joint_type || ''}</td>
                  <td>{MATERIAL_LABELS[j.material] || j.material || ''}</td>
                  <td>{j.size || ''}</td>
                  <td>{processLabel(j.process)}</td>
                  <td className="n">{j.count_per_unit ?? ''}</td>
                  <td className="n">{fmt(j.length_m_each, 3)}</td>
                  <td className="n">{fmt(j.total_m_per_unit, 2)}</td>
                  <td>{j.ndt || ''}</td>
                  {hasSource ? <td>{SRC[j.source] || j.source || ''}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <div className="foot">
        {report.model || ''} · {u.seconds ? `${Math.round(u.seconds / 60)} dk · ` : ''}
        {report.usage_usd != null ? `${fmt(Number(report.usage_usd), 2)} USD · ` : ''}
        Yapay zekâ tahminidir; fiyatları ve saatleri referans işlerle doğrulayın.
      </div>
    </>
  );
}

/** Opens the printable report in a new window; `onBlocked` runs when a pop-up blocker stops it. */
export function printReport(
  report: EstimateReport | null,
  weldSchedule: WeldSchedule | null,
  { onBlocked }: { onBlocked?: () => void } = {},
): void {
  if (!report) return;
  const win = window.open('', '_blank');
  if (!win) {
    onBlocked?.();
    return;
  }
  const doc = win.document;
  doc.open();
  doc.write('<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title></title></head><body></body></html>');
  doc.close();
  doc.title = printTitle(report);
  const style = doc.createElement('style');
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<PrintDocument report={report} weldSchedule={weldSchedule} />));
  win.addEventListener('beforeunload', () => root.unmount());
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* the user can print from the window */
    }
  }, 400);
}
