import {
  machiningExclusionLabel,
  REFERENCE_FAMILY,
  REFERENCE_RELIABILITY,
  REFERENCE_REVIEW,
  REFERENCE_ROUTE,
  SCHEMA_LABELS,
  STRUCTURE_CLASS_LABELS,
} from '@/api/projects/estimator';
import { exclusionLabel, fmt } from '../estimate-report/reportModel';
import { formatDateTime } from '../estimate-report/reportParts';
import { Button, Text } from '@mantine/core';
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
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  Panel,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { ConfidenceBadge, LegacyBadge } from '../estimate-report/LegacyBadge';
import { MethodModal } from './MethodModal';
import css from './ReferencesPage.module.css';
import { ReviewModal, type ReviewStatus } from './ReviewModal';
import { SummaryCards } from './SummaryCards';
import { UnitsPanel } from './UnitsPanel';
import { WeldListModal } from './WeldListModal';

const JOB_STATUS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};
const RELIABILITY_TEXT: Record<string, string> = {
  ok: 'güvenilir',
  unreliable: 'güvenilmez, ≤ 10 h',
  none: 'kayıt yok',
};

const DEFAULTS = {
  search: '',
  family: [] as string[],
  route: [] as string[],
  reliability: [] as string[],
  review: [] as string[],
  status: [] as string[],
  class: [] as string[],
  schema: [] as string[],
};

const EMPTY_ROWS: ReferenceProfile[] = [];
const num = (digits: number) => (v: unknown) => (v == null ? '—' : fmt(v, digits));

/** Factor cell: bold when it calibrates, grey with a ban icon when it does not (legacy formatter). */
function Factor({
  value,
  out,
  tip,
}: {
  value: number | null | undefined;
  out: boolean;
  tip: string;
}) {
  const text = value == null ? '—' : fmt(value, 2);
  if (!out) {
    return (
      <span className={css.factor} title={tip}>
        {text}
      </span>
    );
  }
  return (
    <span className={css.out} title={tip}>
      {text}
      <FaIcon icon="fas fa-ban" className={css.outIcon} />
    </span>
  );
}

const columns: DataTableColumn<ReferenceProfile>[] = [
  {
    key: 'job_no',
    header: 'İş',
    width: 95,
    render: (r) => (
      <>
        <strong>{r.job_no}</strong>
        <span className={css.jobStatus}>
          {JOB_STATUS[r.job_status ?? ''] || r.job_status || ''}
        </span>
      </>
    ),
  },
  {
    key: 'title',
    header: 'Başlık',
    render: (r) => (
      <span className={css.title} title={r.title || ''}>
        {r.title}
      </span>
    ),
  },
  { key: 'customer', header: 'Müşteri' },
  {
    key: 'family',
    header: 'Aile',
    accessor: (r) => REFERENCE_FAMILY[r.family ?? ''] || r.family || '',
  },
  {
    key: 'route',
    header: 'Güzergâh',
    render: (r) => <LegacyBadge entry={REFERENCE_ROUTE[r.route ?? '']} fallback={r.route || '—'} />,
    exportValue: (r) => REFERENCE_ROUTE[r.route ?? '']?.label ?? r.route ?? '',
  },
  {
    key: 'structure_class',
    header: 'Sınıf',
    accessor: (r) =>
      r.structure_class_label ||
      STRUCTURE_CLASS_LABELS[r.structure_class ?? ''] ||
      r.structure_class ||
      '',
    render: (r) => (
      <>
        <span className={css.cls}>
          {r.structure_class_label ||
            STRUCTURE_CLASS_LABELS[r.structure_class ?? ''] ||
            r.structure_class ||
            '—'}
        </span>
        {r.schema_version != null ? (
          <LegacyBadge entry={SCHEMA_LABELS[Number(r.schema_version) >= 2 ? 2 : 1]} />
        ) : null}
      </>
    ),
  },
  { key: 'quantity', header: 'Adet', align: 'right' },
  {
    key: 'unit_mass_kg',
    header: 'Birim kg',
    align: 'right',
    render: (r) => num(0)(r.unit_mass_kg),
  },
  {
    key: 'weld_m_total',
    header: 'Kaynak m',
    align: 'right',
    render: (r) => num(1)(r.weld_m_total),
  },
  { key: 'joints_total', header: 'Birleşim', align: 'right' },
  {
    key: 'recorded_welding_h_per_unit',
    header: 'Kayıtlı h/adet',
    align: 'right',
    render: (r) => num(1)(r.recorded_welding_h_per_unit),
  },
  {
    key: 'shop_h_per_unit',
    header: 'Atölye h/adet',
    align: 'right',
    // Plan hours of the welding shop (the factor's denominator); the whole plan in the tooltip.
    render: (r) => {
      const total = r.total_h_per_unit ?? r.bottom_up_h_per_unit;
      const centres = (r.work_centres ?? [])
        .filter((wc) => Number(wc.hours))
        .map((wc) => `${wc.label}: ${fmt(wc.hours, 1)} h`)
        .join('\n');
      const share =
        r.shop_in_house_h_per_unit != null &&
        r.shop_h_per_unit != null &&
        Math.abs(r.shop_in_house_h_per_unit - r.shop_h_per_unit) > 0.05
          ? `İç imalat payı ${fmt(r.shop_in_house_h_per_unit, 1)} h (taşeron kilosu düşüldü)`
          : '';
      const tip = [
        total != null ? `Plan toplamı ${fmt(total, 1)} h/adet (tüm iş merkezleri)` : '',
        centres,
        share,
      ]
        .filter(Boolean)
        .join('\n');
      return <span title={tip}>{num(1)(r.shop_h_per_unit)}</span>;
    },
  },
  {
    key: 'mach_h_per_unit',
    header: 'Talaşlı h/adet',
    align: 'right',
    render: (r) =>
      r.mach_h_per_unit == null ? (
        '—'
      ) : (
        <span
          title={
            r.recorded_machining_h_per_unit != null
              ? `Kayıtlı talaşlı saati ${fmt(r.recorded_machining_h_per_unit, 1)} h/adet`
              : 'Kayıtlı talaşlı saati yok'
          }
        >
          {fmt(r.mach_h_per_unit, 1)}
        </span>
      ),
  },
  {
    key: 'factor',
    header: (
      <span title="Kayıtlı kaynakçı saati ÷ planın atölye saati (çatım, kaynak, taşlama, doğrultma, çevirme, montaj)">
        Faktör
      </span>
    ),
    exportHeader: 'Faktör',
    align: 'right',
    render: (r) => {
      // The hours guard (Saat kaydı) lives here: it rarely fires, and when it does it greys the factor.
      const hours = `Kayıtlı kaynak saati: ${fmt(r.recorded_welding_h_total, 0)} h (${RELIABILITY_TEXT[r.hours_reliability ?? ''] || r.hours_reliability || '—'})`;
      const calc =
        r.recorded_welding_h_per_unit != null && r.shop_in_house_h_per_unit != null
          ? `${fmt(r.recorded_welding_h_per_unit, 1)} ÷ ${fmt(r.shop_in_house_h_per_unit, 1)} h/adet (kayıtlı ÷ plan atölye)`
          : 'kayıtlı ÷ plan atölye saati';
      if (!r.in_house_exclusion)
        return <Factor value={r.factor} out={false} tip={`${calc}\n${hours}`} />;
      return (
        <Factor
          value={r.factor}
          out
          tip={`İç imalat kalibrasyonunda kullanılmaz: ${exclusionLabel(r.in_house_exclusion)}\n${calc}\n${hours}`}
        />
      );
    },
  },
  {
    key: 'factor_mach',
    header: (
      <span title="Kayıtlı talaşlı saati ÷ planın talaşlı saati (plan v2 ve > 10 h talaşlı kaydı gerekir)">
        Talaşlı faktörü
      </span>
    ),
    exportHeader: 'Talaşlı faktörü',
    align: 'right',
    render: (r) =>
      r.factor_mach != null && !r.machining_exclusion ? (
        <Factor
          value={r.factor_mach}
          out={false}
          tip={`${fmt(r.recorded_machining_h_per_unit, 1)} ÷ ${fmt(r.mach_h_per_unit, 1)} h/adet (kayıtlı ÷ plan talaşlı)`}
        />
      ) : (
        <Factor
          value={r.factor_mach}
          out
          tip={`Talaşlı kalibrasyonunda kullanılmaz: ${machiningExclusionLabel(r.machining_exclusion) || 'Talaşlı kalibrasyonunda kullanılmaz'}`}
        />
      ),
  },
  {
    // Model confidence of the weld list; sort ascending to see the shaky lists first.
    key: 'weld_schedule_confidence',
    header: 'Güven',
    render: (r) => (
      <ConfidenceBadge
        value={r.weld_schedule_confidence}
        title={
          r.weld_schedule_version
            ? `Kaynak listesi v${r.weld_schedule_version}: modelin kendi güven puanı`
            : undefined
        }
      />
    ),
  },
  {
    key: 'review_status',
    header: 'İnceleme',
    render: (r) => (
      <LegacyBadge
        entry={REFERENCE_REVIEW[r.review_status ?? ''] ?? REFERENCE_REVIEW.unreviewed}
        title={[
          r.review_note,
          r.reviewed_by_name && `${r.reviewed_by_name} · ${formatDateTime(r.reviewed_at)}`,
        ]
          .filter(Boolean)
          .join('\n')}
      />
    ),
    exportValue: (r) =>
      (REFERENCE_REVIEW[r.review_status ?? ''] ?? REFERENCE_REVIEW.unreviewed)!.label,
  },
];

/**
 * Port of projects/references (references.js), Referanslar: the estimator's
 * reference library. Every job with a weld list, its recorded hours, the plan
 * hours under the current unit times and the factor; review, weld-list
 * correction (Düzenle), unit times and the method text.
 */
export function ReferencesPage() {
  const queryClient = useQueryClient();
  const filters = useUrlFilters(DEFAULTS);
  const { values } = filters;
  const apiFilters = useMemo(
    () => ({
      search: values.search.trim() || undefined,
      family: values.family.join(',') || undefined,
      route: values.route.join(',') || undefined,
      reliability: values.reliability.join(',') || undefined,
      review_status: values.review.join(',') || undefined,
      status: values.status.join(',') || undefined,
    }),
    [values.search, values.family, values.route, values.reliability, values.review, values.status],
  );
  const listOptions = referencesQueryOptions(apiFilters);
  const list = useQuery({ ...listOptions, placeholderData: keepPreviousData });
  const summary = useQuery(referenceSummaryQueryOptions());
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [methodStale, setMethodStale] = useState(false);
  const [weldRow, setWeldRow] = useState<ReferenceProfile | null>(null);
  const [review, setReview] = useState<{ row: ReferenceProfile; status: ReviewStatus } | null>(
    null,
  );

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Referanslar yüklenemedi' });
  }, [list.isError, list.error]);

  // The class and schema filters run here: the list endpoint has no such parameters.
  const rows = useMemo(() => {
    const all = list.data?.results ?? EMPTY_ROWS;
    const classes = new Set(values.class);
    const schemas = new Set(values.schema);
    if (!classes.size && !schemas.size) return all;
    return all.filter(
      (r) =>
        (!classes.size || classes.has(r.structure_class || 'other')) &&
        (!schemas.size || schemas.has(String(Number(r.schema_version) >= 2 ? 2 : 1))),
    );
  }, [list.data, values.class, values.schema]);

  // Only the families that have profiles, in the label order (legacy updateFilterOptions).
  const families = list.data?.families;
  const filterConfig = useMemo<FilterConfig<Exclude<keyof typeof DEFAULTS, never>>[]>(() => {
    const known = Object.keys(REFERENCE_FAMILY);
    const familyKeys = families
      ? [
          ...known.filter((k) => families.includes(k)),
          ...families.filter((k) => !REFERENCE_FAMILY[k]),
        ]
      : known;
    return [
      { key: 'search', type: 'text', placeholder: 'İş emri, başlık, müşteri…' },
      {
        key: 'family',
        type: 'multiselect',
        label: 'Aile',
        options: familyKeys.map((value) => ({ value, label: REFERENCE_FAMILY[value] || value })),
      },
      {
        key: 'route',
        type: 'multiselect',
        label: 'Güzergâh',
        options: Object.entries(REFERENCE_ROUTE).map(([value, r]) => ({ value, label: r.label })),
      },
      {
        key: 'reliability',
        type: 'multiselect',
        label: 'Saat kaydı',
        options: Object.entries(REFERENCE_RELIABILITY).map(([value, r]) => ({
          value,
          label: value === 'unreliable' ? 'Güvenilmez (≤ 10 h)' : r.label,
        })),
      },
      {
        key: 'review',
        type: 'multiselect',
        label: 'İnceleme',
        options: Object.entries(REFERENCE_REVIEW).map(([value, r]) => ({ value, label: r.label })),
      },
      {
        key: 'status',
        type: 'multiselect',
        label: 'İş durumu',
        options: Object.entries(JOB_STATUS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'class',
        type: 'multiselect',
        label: 'Yapı sınıfı',
        options: Object.entries(STRUCTURE_CLASS_LABELS).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'schema',
        type: 'multiselect',
        label: 'Şema',
        options: [
          { value: '2', label: 'plan v2' },
          { value: '1', label: 'v1 liste' },
        ],
      },
    ];
  }, [families]);

  const filtered = Object.values(values).some((v) =>
    Array.isArray(v) ? v.length : String(v).trim() !== '',
  );
  const total = summary.data?.counts?.total ?? list.data?.results.length ?? 0;

  /** Puts a saved row into the loaded list and refreshes the summary. */
  const replaceRow = (updated: ReferenceProfile) => {
    queryClient.setQueryData<ReferenceList>(listOptions.queryKey, (prev) =>
      prev
        ? { ...prev, results: prev.results.map((r) => (r.job_no === updated.job_no ? updated : r)) }
        : prev,
    );
    void queryClient.invalidateQueries({ queryKey: referenceKeys.summary });
  };

  const rowActions = (r: ReferenceProfile): RowAction<ReferenceProfile>[] => [
    {
      key: 'weld',
      label: 'Kaynak listesi',
      icon: 'fas fa-list-ol',
      color: 'primary',
      onClick: (row) => setWeldRow(row),
    },
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

  return (
    <>
      <PageHeader
        title="Referanslar"
        subtitle="Tahminde kullanılan bitmiş işler: kaynak listesi, kayıtlı saat, faktör ve inceleme"
        icon="fas fa-book-open"
        backTo="/projects/"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            loading={list.isFetching || summary.isFetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: referenceKeys.all })}
          >
            Yenile
          </Button>
        }
      />

      <Panel className={css.toolbarPanel}>
        <div className={css.toolbar}>
          <div className={css.toolbarText}>
            İmalat planı (ya da kaynak listesi) çıkarılmış her iş: kayıtlı kaynakçı saati ÷ planın
            atölye saati = <strong>faktör</strong>, kayıtlı talaşlı saati ÷ planın talaşlı saati ={' '}
            <strong>talaşlı faktörü</strong>. Hariç tutulan işler hiçbir tahminde kullanılmaz.
          </div>
          <div className={css.toolbarButtons}>
            <span className={css.count} aria-live="polite" data-testid="reference-count">
              {filtered ? (
                <>
                  <strong>{rows.length}</strong> / {total} referans{' '}
                  <Text span c="dimmed" size="sm">
                    (filtreli)
                  </Text>
                </>
              ) : (
                <>
                  <strong>{total}</strong> referans
                </>
              )}
            </span>
            <Button
              size="xs"
              variant={unitsOpen ? 'filled' : 'outline'}
              leftSection={<FaIcon icon="fas fa-sliders" />}
              aria-expanded={unitsOpen}
              onClick={() => setUnitsOpen((v) => !v)}
            >
              Birim süreler
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-circle-question" />}
              onClick={() => setMethodOpen(true)}
            >
              Nasıl çalışır?
            </Button>
          </div>
        </div>
      </Panel>

      {summary.data ? (
        <SummaryCards summary={summary.data} />
      ) : summary.isError ? (
        <div className={css.summary}>
          <div className={css.summaryEmpty} style={{ color: 'var(--gk-danger)' }}>
            {summary.error instanceof Error ? summary.error.message : 'Özet yüklenemedi'}
          </div>
        </div>
      ) : null}

      {unitsOpen ? <UnitsPanel onSaved={() => setMethodStale(true)} /> : null}

      <DataTable
        data={list.data ? rows : EMPTY_ROWS}
        columns={columns}
        getRowId={(r) => r.job_no}
        loading={list.isFetching}
        sortable
        pagination={{ pageSize: 50 }}
        rowActions={rowActions}
        onRowClick={(r) => setWeldRow(r)}
        exportable={{ fileName: 'tahmin-referanslari' }}
        emptyMessage="Filtreye uyan referans yok"
        verticalSpacing="xs"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={values}
            onApply={filters.apply}
            onClear={filters.reset}
          />
        }
      />

      {weldRow ? (
        <WeldListModal
          key={weldRow.job_no}
          row={weldRow}
          onClose={() => setWeldRow(null)}
          onProfileSaved={replaceRow}
        />
      ) : null}
      {review ? (
        <ReviewModal
          row={review.row}
          status={review.status}
          onClose={() => setReview(null)}
          onSaved={(updated) => {
            replaceRow(updated);
            setReview(null);
            notify.success(
              `${updated.job_no}: ${REFERENCE_REVIEW[updated.review_status ?? '']?.label || updated.review_status}`,
            );
          }}
        />
      ) : null}
      {methodOpen ? (
        <MethodModal
          fresh={methodStale}
          onClose={() => {
            setMethodOpen(false);
            setMethodStale(false);
          }}
        />
      ) : null}
    </>
  );
}
