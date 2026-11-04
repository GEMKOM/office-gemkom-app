import {
  machiningExclusionLabel,
  REFERENCE_FAMILY,
  REFERENCE_REVIEW,
  REFERENCE_ROUTE,
  STRUCTURE_CLASS_LABELS,
} from '@/api/projects/estimator';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  referenceKeys,
  referencesQueryOptions,
  referenceSummaryQueryOptions,
  type ReferenceList,
  type ReferenceProfile,
} from '@/api/projects/references';
import {
  DataTable,
  FilterBar,
  notify,
  StatCards,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { exclusionLabel, fmt } from '../estimate-report/reportModel';
import { formatDateTime } from '../estimate-report/reportParts';
import { LegacyBadge } from '../estimate-report/LegacyBadge';
import { useSearchParams } from 'react-router';
import { costHistoryQueryOptions } from '@/api/projects/costHistory';
import { CrossLink, ExclusionNotesBadge } from './costHistoryParts';
import { FactorBreakdown } from './FactorBreakdown';
import { ReviewModal, type ReviewStatus } from './ReviewModal';
import { WeldListModal } from './WeldListModal';
import css from './RefTabs.module.css';

const JOB_STATUS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

const DEFAULTS = {
  search: '',
  family: [] as string[],
  use: [] as string[],
  review: [] as string[],
  route: [] as string[],
  status: [] as string[],
  class: [] as string[],
};

const EMPTY_ROWS: ReferenceProfile[] = [];
const num = (digits: number) => (v: unknown) => (v == null ? '—' : fmt(v, digits));
const classLabel = (r: ReferenceProfile) =>
  r.structure_class_label || STRUCTURE_CLASS_LABELS[r.structure_class ?? ''] || r.structure_class || '';

/** in_house | subcontract | out: how the reference takes part in the estimate. */
function usage(r: ReferenceProfile): 'in_house' | 'subcontract' | 'out' {
  if (r.review_status === 'excluded') return 'out';
  if (r.route === 'subcontract') return 'subcontract';
  return r.in_house_exclusion ? 'out' : 'in_house';
}

function UseCell({ r }: { r: ReferenceProfile }) {
  const u = usage(r);
  if (u === 'in_house') return <StatusBadge color="green">Kalibrasyonda</StatusBadge>;
  if (u === 'subcontract') return <StatusBadge color="purple">Taşeron referansı</StatusBadge>;
  const why = r.review_status === 'excluded' ? `Hariç tutuldu${r.review_note ? `: ${r.review_note}` : ''}` : exclusionLabel(r.in_house_exclusion, r);
  return (
    <>
      <StatusBadge color="grey">Kullanılmıyor</StatusBadge>
      <span className={css.reason} title={why}>
        {why}
      </span>
    </>
  );
}

const buildColumns = (
  archive: Map<string, number | null>,
  openArchive: (jobNo: string) => void,
): DataTableColumn<ReferenceProfile>[] => [
  {
    key: 'job_no',
    header: 'İş',
    width: 120,
    render: (r) => (
      <>
        <span className={css.main}>{r.job_no}</span>
        <span className={css.sub}>{JOB_STATUS[r.job_status ?? ''] || r.job_status || ''}</span>
        {archive.has(r.job_no) ? (
          <CrossLink
            title="Bu işin iş sonu maliyet tablosu Geçmiş maliyetler sekmesinde (bugüne taşınmış €/kg)"
            onClick={() => openArchive(r.job_no)}
          >
            arşivde{archive.get(r.job_no) != null ? ` · ${fmt(archive.get(r.job_no), 2)} €/kg` : ''}
          </CrossLink>
        ) : null}
      </>
    ),
  },
  {
    key: 'title',
    header: 'Ürün',
    render: (r) => (
      <>
        <span className={css.clip} title={r.title || ''}>
          {r.title}
        </span>
        <span className={css.sub}>{r.customer || '—'}</span>
      </>
    ),
  },
  {
    key: 'family',
    header: 'Aile / sınıf',
    accessor: (r) => REFERENCE_FAMILY[r.family ?? ''] || r.family || '',
    render: (r) => (
      <>
        {REFERENCE_FAMILY[r.family ?? ''] || r.family || '—'}
        <span className={css.sub}>{classLabel(r) || '—'}</span>
      </>
    ),
  },
  {
    key: 'unit_mass_kg',
    header: 'Birim kg',
    align: 'right',
    render: (r) => (
      <>
        {num(0)(r.unit_mass_kg)}
        {r.quantity && r.quantity !== 1 ? <span className={css.sub}>× {r.quantity} adet</span> : null}
      </>
    ),
  },
  {
    key: 'recorded_welding_h_per_unit',
    header: <span title="Kaynakçıların bu işe yazdığı saat, adet başına">Gerçek saat</span>,
    exportHeader: 'Gerçek kaynakçı h/adet',
    align: 'right',
    render: (r) => num(1)(r.recorded_welding_h_per_unit),
  },
  {
    key: 'shop_h_per_unit',
    header: <span title="İmalat planının kaynak atölyesi saati (çatım, kaynak, taşlama, doğrultma, çevirme, montaj), adet başına">Plan saati</span>,
    exportHeader: 'Plan atölye h/adet',
    align: 'right',
    render: (r) => {
      const centres = (r.work_centres ?? [])
        .filter((wc) => Number(wc.hours))
        .map((wc) => `${wc.label}: ${fmt(wc.hours, 1)} h`)
        .join('\n');
      const total = r.total_h_per_unit ?? r.bottom_up_h_per_unit;
      const tip = [total != null ? `Planın tamamı ${fmt(total, 1)} h/adet` : '', centres].filter(Boolean).join('\n');
      return <span title={tip}>{num(1)(r.shop_h_per_unit)}</span>;
    },
  },
  {
    key: 'factor',
    header: <span title="Gerçek saat ÷ plan saati. 1,20 = plan saati %20 az tahmin etmiş; tahmin bu oranla düzeltilir.">Faktör</span>,
    exportHeader: 'Faktör',
    align: 'right',
    render: (r) => {
      const calc =
        r.recorded_welding_h_per_unit != null && r.shop_in_house_h_per_unit != null
          ? `${fmt(r.recorded_welding_h_per_unit, 1)} ÷ ${fmt(r.shop_in_house_h_per_unit, 1)} h/adet`
          : 'gerçek ÷ plan saati';
      const tip = r.in_house_exclusion ? `${calc}\nİç imalat kalibrasyonunda kullanılmaz: ${exclusionLabel(r.in_house_exclusion, r)}` : calc;
      return (
        <span className={usage(r) === 'in_house' ? css.strong : css.dim} title={tip}>
          {r.factor == null ? '—' : fmt(r.factor, 2)}
        </span>
      );
    },
  },
  {
    key: 'use',
    header: 'Tahminde',
    accessor: (r) => usage(r),
    render: (r) => <UseCell r={r} />,
    exportValue: (r) => ({ in_house: 'Kalibrasyonda', subcontract: 'Taşeron referansı', out: 'Kullanılmıyor' })[usage(r)],
  },
  {
    key: 'review_status',
    header: 'İnceleme',
    render: (r) => (
      <>
        <LegacyBadge
          entry={REFERENCE_REVIEW[r.review_status ?? ''] ?? REFERENCE_REVIEW.unreviewed}
          title={[r.review_note, r.reviewed_by_name && `${r.reviewed_by_name} · ${formatDateTime(r.reviewed_at)}`]
            .filter(Boolean)
            .join('\n')}
        />
        <ExclusionNotesBadge notes={r.exclusion_notes} effect={r.exclusion_effect} />
      </>
    ),
    exportValue: (r) => (REFERENCE_REVIEW[r.review_status ?? ''] ?? REFERENCE_REVIEW.unreviewed)!.label,
  },
  // In the Excel export only: the detail the old page showed as columns.
  { key: 'route', header: 'Güzergâh', exportOnly: true, accessor: (r) => REFERENCE_ROUTE[r.route ?? '']?.label ?? r.route ?? '' },
  { key: 'structure_class', header: 'Yapı sınıfı', exportOnly: true, accessor: classLabel },
  { key: 'schema_version', header: 'Şema', exportOnly: true },
  { key: 'weld_m_total', header: 'Kaynak m', exportOnly: true },
  { key: 'joints_total', header: 'Birleşim', exportOnly: true },
  { key: 'mach_h_per_unit', header: 'Plan talaşlı h/adet', exportOnly: true },
  { key: 'recorded_machining_h_per_unit', header: 'Gerçek talaşlı h/adet', exportOnly: true },
  { key: 'factor_mach', header: 'Talaşlı oranı (çapraz kontrol)', exportOnly: true },
  { key: 'machining_note', header: 'Talaşlı not', exportOnly: true, accessor: (r) => machiningExclusionLabel(r.machining_exclusion) || '' },
  { key: 'weld_schedule_confidence', header: 'Liste güveni', exportOnly: true },
];

/**
 * İş referansları: finished jobs in the app with a manufacturing plan and recorded
 * welder hours. factor = recorded ÷ plan shop hours; the estimate corrects its plan
 * hours by the factors of similar references.
 */
export function CalibrationTab({ onCount }: { onCount?: (n: number) => void }) {
  const queryClient = useQueryClient();
  const filters = useUrlFilters(DEFAULTS);
  const { values } = filters;
  const apiFilters = useMemo(
    () => ({
      search: values.search.trim() || undefined,
      family: values.family.join(',') || undefined,
      route: values.route.join(',') || undefined,
      review_status: values.review.join(',') || undefined,
      status: values.status.join(',') || undefined,
    }),
    [values.search, values.family, values.route, values.review, values.status],
  );
  // The archive rows of the same job numbers (their cost sheet, €/kg today), for the cross-links.
  const archiveList = useQuery(costHistoryQueryOptions());
  const [, setParams] = useSearchParams();
  const columns = useMemo(() => {
    const byJob = new Map<string, number | null>();
    for (const a of archiveList.data?.results ?? []) {
      if (!a.job_no) continue;
      // A job costed as several rows: the first row with a €/kg stands for it.
      if (!byJob.has(a.job_no) || byJob.get(a.job_no) == null) byJob.set(a.job_no, a.now?.eur_per_kg ?? null);
    }
    return buildColumns(byJob, (jobNo) => setParams({ tab: 'archive', aq: jobNo }));
  }, [archiveList.data, setParams]);
  const listOptions = referencesQueryOptions(apiFilters);
  const list = useQuery({ ...listOptions, placeholderData: keepPreviousData });
  const summary = useQuery(referenceSummaryQueryOptions());
  const [weldRow, setWeldRow] = useState<ReferenceProfile | null>(null);
  const [review, setReview] = useState<{ row: ReferenceProfile; status: ReviewStatus } | null>(null);

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Referanslar yüklenemedi' });
  }, [list.isError, list.error]);

  const total = summary.data?.counts?.total ?? list.data?.results.length ?? 0;
  useEffect(() => onCount?.(total), [total, onCount]);

  // Usage and class filter on the page: the list endpoint has no such parameters.
  const rows = useMemo(() => {
    const all = list.data?.results ?? EMPTY_ROWS;
    const uses = new Set(values.use);
    const classes = new Set(values.class);
    if (!uses.size && !classes.size) return all;
    return all.filter(
      (r) => (!uses.size || uses.has(usage(r))) && (!classes.size || classes.has(r.structure_class || 'other')),
    );
  }, [list.data, values.use, values.class]);

  const families = list.data?.families;
  const filterConfig = useMemo<FilterConfig<keyof typeof DEFAULTS>[]>(() => {
    const known = Object.keys(REFERENCE_FAMILY);
    const familyKeys = families
      ? [...known.filter((k) => families.includes(k)), ...families.filter((k) => !REFERENCE_FAMILY[k])]
      : known;
    return [
      { key: 'search', type: 'text', placeholder: 'İş emri, ürün, müşteri…' },
      {
        key: 'family',
        type: 'multiselect',
        label: 'Aile',
        options: familyKeys.map((value) => ({ value, label: REFERENCE_FAMILY[value] || value })),
      },
      {
        key: 'use',
        type: 'multiselect',
        label: 'Tahminde',
        options: [
          { value: 'in_house', label: 'Kalibrasyonda' },
          { value: 'subcontract', label: 'Taşeron referansı' },
          { value: 'out', label: 'Kullanılmıyor' },
        ],
      },
      {
        key: 'review',
        type: 'multiselect',
        label: 'İnceleme',
        options: Object.entries(REFERENCE_REVIEW).map(([value, r]) => ({ value, label: r.label })),
      },
      {
        key: 'route',
        type: 'multiselect',
        label: 'Güzergâh',
        options: Object.entries(REFERENCE_ROUTE).map(([value, r]) => ({ value, label: r.label })),
      },
      {
        key: 'class',
        type: 'multiselect',
        label: 'Yapı sınıfı',
        options: Object.entries(STRUCTURE_CLASS_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'status',
        type: 'multiselect',
        label: 'İş durumu',
        options: Object.entries(JOB_STATUS).map(([value, label]) => ({ value, label })),
      },
    ];
  }, [families]);

  const filtered = Object.values(values).some((v) => (Array.isArray(v) ? v.length : String(v).trim() !== ''));

  const replaceRow = (updated: ReferenceProfile) => {
    queryClient.setQueryData<ReferenceList>(listOptions.queryKey, (prev) =>
      prev ? { ...prev, results: prev.results.map((r) => (r.job_no === updated.job_no ? updated : r)) } : prev,
    );
    void queryClient.invalidateQueries({ queryKey: referenceKeys.summary });
  };

  const rowActions = (r: ReferenceProfile): RowAction<ReferenceProfile>[] => [
    { key: 'weld', label: 'Kaynak listesi', icon: 'fas fa-list-ol', color: 'primary', onClick: (row) => setWeldRow(row) },
    {
      key: 'verify',
      label: 'Doğrula',
      icon: 'fas fa-check',
      color: 'success',
      hidden: r.review_status === 'verified',
      onClick: (row) => setReview({ row, status: 'verified' }),
    },
    {
      key: 'exclude',
      label: 'Hariç tut',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: r.review_status === 'excluded',
      onClick: (row) => setReview({ row, status: 'excluded' }),
    },
    {
      key: 'reset',
      label: 'İncelemeyi geri al',
      icon: 'fas fa-rotate-left',
      color: 'secondary',
      hidden: !r.review_status || r.review_status === 'unreviewed',
      onClick: (row) => setReview({ row, status: 'unreviewed' }),
    },
  ];

  const s = summary.data;
  const rs = s?.counts?.review_status ?? {};
  const shop = s?.all;
  const mach = s?.machining?.all;

  return (
    <>
      <p className={css.intro}>
        Uygulamada imalat planı ve <strong>gerçek kaynakçı saati</strong> olan işler. Tahmin, yeni işin plan saatini
        benzer referansların <strong>faktörüyle</strong> düzeltir: faktör = gerçek saat ÷ plan saati (1,20 = plan
        %20 az tahmin etmiş). Talaşlı saat referansla düzeltilmez; çizim analizinden gelir.
      </p>

      <div className={css.stats}>
        <StatCards
          loading={summary.isLoading}
          cards={[
            {
              id: 'total',
              title: 'Referans',
              value: (
                <>
                  <span data-testid="reference-count">
                    {filtered ? `${rows.length} / ${total} referans` : `${total} referans`}
                  </span>
                  <span className={css.statSub}>{(s?.jobs_used ?? []).length} tanesi kalibrasyonda</span>
                </>
              ),
              icon: 'fas fa-book-open',
              color: 'blue',
              onClick: () => filters.apply({ use: ['in_house'] }),
            },
            {
              id: 'shop',
              title: 'Atölye faktörü',
              value: (
                <>
                  {shop && shop.n ? fmt(shop.median, 2) : '1,00'}
                  <span className={css.statSub}>
                    {shop && shop.n ? `medyan · ortadaki yarı ${fmt(shop.p25, 2)}–${fmt(shop.p75, 2)}` : 'referans yok'}
                  </span>
                </>
              ),
              icon: 'fas fa-scale-balanced',
              color: 'green',
              tooltip: 'Kalibrasyondaki referansların faktör medyanı; her tahmin önce hedefle aynı yapı sınıfındakileri kullanır',
            },
            {
              id: 'mach',
              title: 'Talaşlı faktörü',
              value: (
                <>
                  1,00
                  <span className={css.statSub}>
                    çizimden hesaplanır{mach && mach.n ? ` · referans oranı ${fmt(mach.median, 2)}` : ''}
                  </span>
                </>
              ),
              icon: 'fas fa-gears',
              color: 'grey',
              tooltip: 'Talaşlı iş parçaya özgüdür: saat çizimdeki işlemlerden hesaplanır. Aynı parça daha önce yapıldıysa o işin saati kullanılır.',
            },
            {
              id: 'review',
              title: 'İncelenmedi',
              value: (
                <>
                  {rs.unreviewed || 0}
                  <span className={css.statSub}>
                    {rs.verified || 0} doğrulandı · {rs.excluded || 0} hariç
                  </span>
                </>
              ),
              icon: 'fas fa-clipboard-check',
              color: 'orange',
              onClick: () => filters.apply({ review: ['unreviewed'] }),
            },
          ]}
        />
      </div>

      {s ? <FactorBreakdown summary={s} /> : null}

      <DataTable
        data={list.data ? rows : EMPTY_ROWS}
        columns={columns}
        getRowId={(r) => r.job_no}
        loading={list.isFetching}
        sortable
        pagination={{ pageSize: 50 }}
        rowActions={rowActions}
        onRowClick={(r) => setWeldRow(r)}
        rowStyle={(r) => (usage(r) === 'out' ? { opacity: 0.65 } : undefined)}
        exportable={{ fileName: 'tahmin-referanslari' }}
        emptyMessage="Filtreye uyan referans yok"
        verticalSpacing="xs"
        filters={<FilterBar inline filters={filterConfig} values={values} onApply={filters.apply} onClear={filters.reset} />}
      />

      {weldRow ? (
        <WeldListModal key={weldRow.job_no} row={weldRow} onClose={() => setWeldRow(null)} onProfileSaved={replaceRow} />
      ) : null}
      {review ? (
        <ReviewModal
          row={review.row}
          status={review.status}
          onClose={() => setReview(null)}
          onSaved={(updated) => {
            replaceRow(updated);
            setReview(null);
            notify.success(`${updated.job_no}: ${REFERENCE_REVIEW[updated.review_status ?? '']?.label || updated.review_status}`);
          }}
        />
      ) : null}
    </>
  );
}
