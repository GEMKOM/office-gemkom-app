import {
  compareLeaves,
  JOB_STATUS,
  kalemName,
  KIND_LABEL,
  monthlyPerPerson,
  num,
  STATEMENT_STATUS,
  subName,
  trCompare,
  type Lookup,
} from './overviewTree';

type Cell = string | number;

/**
 * Port of legacy exportToExcel: three sheets — Aylık İş (every fact), Kalan
 * İş (the backlog) and Kişi Başı (per statement, then a monthly average per
 * subcontractor). Numbers stay numbers.
 */
export async function exportOverview(lookup: Lookup): Promise<void> {
  const { report } = lookup;
  // SheetJS stays out of the page bundle until the first export.
  const XLSX = await import('xlsx');
  const sub = (id: number) => subName(lookup, String(id));
  const kalem = (key: string) => kalemName(lookup, key);

  const facts = [...report.facts].sort(
    (a, b) =>
      trCompare(sub(a.subcontractor_id), sub(b.subcontractor_id)) ||
      a.period.localeCompare(b.period) ||
      trCompare(kalem(a.kalem_key), kalem(b.kalem_key)) ||
      compareLeaves(lookup, a, b),
  );
  const workRows: Cell[][] = [
    [
      'Taşeron',
      'Ay',
      'Fiyat Kalemi',
      'İş Emri',
      'İş Adı',
      'Müşteri',
      'İş Emri Durumu',
      'Tür',
      'Hakediş Durumu',
      'Önceki İlerleme (%)',
      'Sonraki İlerleme (%)',
      'Sözleşme (kg)',
      'Yapılan İş (kg)',
      'Birim Fiyat',
      'Tutar',
      'Para Birimi',
      'Açıklama',
    ],
  ];
  for (const f of facts) {
    const isAdj = f.kind === 'adjustment';
    const noProgress = (v: unknown) => v === null || v === undefined;
    workRows.push([
      sub(f.subcontractor_id),
      f.period,
      kalem(f.kalem_key),
      f.job_no,
      f.job_title || '',
      f.customer_name || '',
      JOB_STATUS[f.job_status ?? ''] || '',
      isAdj
        ? f.adjustment_type === 'deduction'
          ? 'Kesinti'
          : 'Ek Ödeme'
        : (KIND_LABEL[f.kind] ?? ''),
      STATEMENT_STATUS[f.statement_status ?? '']?.label || '',
      isAdj || noProgress(f.previous_progress) ? '' : num(f.previous_progress),
      isAdj || noProgress(f.current_progress) ? '' : num(f.current_progress),
      isAdj ? '' : num(f.allocated_weight_kg),
      isAdj ? '' : num(f.weight_kg),
      f.price_per_kg === null || f.price_per_kg === undefined ? '' : num(f.price_per_kg),
      num(f.amount),
      f.currency || 'TRY',
      isAdj ? f.reason || '' : '',
    ]);
  }

  const backlogRows: Cell[][] = [
    [
      'Taşeron',
      'Fiyat Kalemi',
      'İş Emri',
      'İş Adı',
      'Müşteri',
      'İş Emri Durumu',
      'Sözleşme (kg)',
      'Yapılan (kg)',
      'Kalan (kg)',
      'Sözleşme Tutarı',
      'Kalan Tutar',
      'Para Birimi',
    ],
  ];
  [...report.backlog]
    .sort(
      (a, b) =>
        trCompare(sub(a.subcontractor_id), sub(b.subcontractor_id)) ||
        trCompare(kalem(a.kalem_key), kalem(b.kalem_key)) ||
        String(a.job_no).localeCompare(String(b.job_no), 'tr', { numeric: true }),
    )
    .forEach((b) =>
      backlogRows.push([
        sub(b.subcontractor_id),
        kalem(b.kalem_key),
        b.job_no,
        b.job_title || '',
        b.customer_name || '',
        JOB_STATUS[b.job_status ?? ''] || '',
        num(b.allocated_weight_kg),
        num(b.done_weight_kg),
        num(b.remaining_weight_kg),
        num(b.contract_amount),
        num(b.remaining_amount),
        b.currency || 'TRY',
      ]),
    );

  const perPersonRows: Cell[][] = [
    ['Taşeron', 'Ay', 'Hakediş Durumu', 'Dönem Toplamı', 'Çalışan', 'Kişi Başı', 'Para Birimi'],
  ];
  [...report.statements]
    .sort(
      (a, b) =>
        trCompare(sub(a.subcontractor_id), sub(b.subcontractor_id)) ||
        a.period.localeCompare(b.period),
    )
    .forEach((st) => {
      const total = lookup.monthTotals.get(`${st.subcontractor_id}|${st.period}`) || 0;
      const count = num(st.employee_count);
      perPersonRows.push([
        sub(st.subcontractor_id),
        st.period,
        STATEMENT_STATUS[st.status]?.label || st.status,
        total,
        st.employee_count ?? '',
        count > 0 && total ? Number((total / count).toFixed(2)) : '',
        st.currency || 'TRY',
      ]);
    });
  // One monthly-average row per subcontractor: Dönem Toplamı ÷ Çalışan ÷ ay
  // over the months with a headcount (= Kişi Başı on the table).
  for (const s of report.subcontractors) {
    const pp = monthlyPerPerson(lookup, new Set([String(s.id)]));
    if (pp.value === null) continue;
    perPersonRows.push([
      sub(s.id),
      `Aylık ortalama (${pp.months} ay)`,
      pp.skipped ? `${pp.skipped} ay çalışansız, hariç` : '',
      Number(pp.total.toFixed(2)),
      Number((pp.personMonths / pp.months).toFixed(2)),
      Number(pp.value.toFixed(2)),
      s.default_currency || 'TRY',
    ]);
  }

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(workRows), 'Aylık İş');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(backlogRows), 'Kalan İş');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(perPersonRows), 'Kişi Başı');

  const { start, end } = report.period;
  const suffix = start || end ? `${start || 'baslangic'}_${end || 'bugun'}` : 'tum-donemler';
  XLSX.writeFile(book, `taseron-aylik-is-raporu_${suffix}.xlsx`);
}
