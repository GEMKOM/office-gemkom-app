import { Button, Collapse } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  archiveFlagLabel,
  costHistoryKeys,
  costHistoryQueryOptions,
  planShopHoursPerTonne,
  type CostHistoryList,
  type CostHistoryRow,
} from '@/api/projects/costHistory';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  Panel,
  StatCards,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { useSearchParams } from 'react-router';
import { referencesQueryOptions, type ReferenceProfile } from '@/api/projects/references';
import { fmt } from '../estimate-report/reportModel';
import { CostHistoryDetail } from './CostHistoryDetail';
import { CrossLink, ExclusionNotesBadge, monthLabel, PlanSourceBadge, ReliabilityBadge, ReviewBadge } from './costHistoryParts';
import css from './RefTabs.module.css';

// Filter keys carry an "a" prefix: the calibration tab shares the URL.
const DEFAULTS = {
  aq: '',
  afamily: [] as string[],
  areview: [] as string[],
  aplan: [] as string[],
  aminkg: '',
};

const EMPTY: CostHistoryRow[] = [];
const isOutlier = (r: CostHistoryRow) => (r.flags ?? []).includes('per_kg_outlier');

const buildColumns = (
  refs: Map<string, ReferenceProfile>,
  openRef: (jobNo: string) => void,
): DataTableColumn<CostHistoryRow>[] => [
  {
    key: 'job_no',
    header: 'İş',
    width: 120,
    render: (r) => {
      const ref = r.job_no ? refs.get(r.job_no) : undefined;
      return (
        <>
          <span className={css.main}>{r.job_no || '—'}</span>
          <span className={css.sub}>{r.in_app ? 'uygulamada' : 'arşiv'}</span>
          {ref ? (
            <CrossLink
              title="Bu işin kaynakçı saatleri İş referansları sekmesinde: faktörü orada hesaplanır"
              onClick={() => openRef(r.job_no!)}
            >
              iş referansı{ref.factor != null ? ` · faktör ${fmt(ref.factor, 2)}` : ''}
            </CrossLink>
          ) : null}
        </>
      );
    },
  },
  {
    key: 'product',
    header: 'Ürün',
    accessor: (r) => r.product || '',
    render: (r) => (
      <>
        <span className={css.clip} title={r.product || ''}>
          {r.product || '—'}
        </span>
        <span className={css.sub}>{r.customer || '—'}</span>
      </>
    ),
  },
  { key: 'family_label', header: 'Aile' },
  {
    key: 'kg_each',
    header: 'kg / adet',
    align: 'right',
    render: (r) => (
      <>
        {fmt(r.kg_each, 0)}
        {r.qty && r.qty !== 1 ? <span className={css.sub}>× {fmt(r.qty, 0)} adet</span> : null}
      </>
    ),
  },
  {
    key: 'cost_month',
    header: 'Maliyet ayı',
    render: (r) => monthLabel(r.cost_month),
  },
  {
    key: 'then_eur_per_kg',
    header: 'O gün €/kg',
    align: 'right',
    accessor: (r) => r.then?.eur_per_kg ?? null,
    render: (r) => <span className={css.dim}>{fmt(r.then?.eur_per_kg, 2)}</span>,
  },
  {
    key: 'now_eur_per_kg',
    header: (
      <span title="Bugüne endekslenmiş: işçilik TR imalat işçilik maliyetiyle, malzeme AB çelik fiyatıyla, genel gider bugünkü orana">
        Bugün €/kg
      </span>
    ),
    exportHeader: 'Bugün €/kg',
    align: 'right',
    accessor: (r) => r.now?.eur_per_kg ?? null,
    render: (r) => <span className={css.strong}>{fmt(r.now?.eur_per_kg, 2)}</span>,
  },
  {
    key: 'plan',
    header: (
      <span title="Çizimlerden okunan imalat planı: atölye saati / ton ve birleşim sayısı. Eşleşme bu tasarım bilgisiyle yapılır.">
        Çizim planı
      </span>
    ),
    exportHeader: 'Plan atölye h/t',
    accessor: (r) => planShopHoursPerTonne(r.plan),
    render: (r) =>
      r.plan ? (
        <>
          {fmt(planShopHoursPerTonne(r.plan), 0)} h/t · {fmt(r.plan.joints, 0)} birleşim
          <span className={css.sub}>
            <PlanSourceBadge source={r.plan_source} />
          </span>
        </>
      ) : (
        <span className={css.dim}>okunmadı</span>
      ),
  },
  {
    key: 'review',
    header: 'Durum',
    accessor: (r) => r.review,
    render: (r) => {
      const flags = (r.flags ?? []).filter((f) => !f.startsWith('date_from_pdm'));
      return (
        <>
          <ReviewBadge status={r.review} />
          <ExclusionNotesBadge notes={r.exclusion_notes} effect={r.exclusion_effect} />
          {r.review === 'excluded' && r.review_note ? (
            <span className={css.reason} title={r.review_note}>
              {r.review_note}
            </span>
          ) : isOutlier(r) ? (
            <span className={css.reason}>{archiveFlagLabel('per_kg_outlier')}</span>
          ) : flags.length ? (
            <span className={css.reason}>{flags.map(archiveFlagLabel).join(' · ')}</span>
          ) : null}
        </>
      );
    },
    exportValue: (r) => r.review,
  },
  { key: 'customer', header: 'Müşteri', exportOnly: true },
  { key: 'labour_now', header: 'İşçilik bugün €', exportOnly: true, accessor: (r) => r.now?.labour ?? null },
  { key: 'material_now', header: 'Malzeme bugün €', exportOnly: true, accessor: (r) => r.now?.material ?? null },
  { key: 'total_now', header: 'Toplam bugün €', exportOnly: true, accessor: (r) => r.now?.total ?? null },
  { key: 'total_then', header: 'Toplam o gün €', exportOnly: true, accessor: (r) => r.then?.total ?? null },
  { key: 'source_file', header: 'Kaynak dosya', exportOnly: true },
];

/** Geçmiş maliyetler: the MALİYET archive the estimate report cross-checks against. */
export function CostHistoryTab() {
  const queryClient = useQueryClient();
  const filters = useUrlFilters(DEFAULTS);
  const { values } = filters;
  const list = useQuery(costHistoryQueryOptions());
  // The job references (welder hours, factor) of the same job numbers, for the cross-links.
  const references = useQuery(referencesQueryOptions({}));
  const [, setParams] = useSearchParams();
  const refs = useMemo(
    () => new Map((references.data?.results ?? []).map((r) => [r.job_no, r] as const)),
    [references.data],
  );
  const columns = useMemo(() => buildColumns(refs, (jobNo) => setParams({ search: jobNo })), [refs, setParams]);
  const [detail, setDetail] = useState<CostHistoryRow | null>(null);
  const [familiesOpen, setFamiliesOpen] = useState(false);

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Geçmiş maliyetler yüklenemedi' });
  }, [list.isError, list.error]);

  const all = list.data?.results ?? EMPTY;
  const rows = useMemo(() => {
    const q = values.aq.trim().toLocaleLowerCase('tr');
    const fam = new Set(values.afamily);
    const rev = new Set(values.areview);
    const plan = new Set(values.aplan);
    const minKg = Number(String(values.aminkg).replace(',', '.')) || 0;
    return all.filter(
      (r) =>
        (!q || [r.job_no, r.product, r.customer].some((v) => (v || '').toLocaleLowerCase('tr').includes(q))) &&
        (!fam.size || fam.has(r.family)) &&
        (!rev.size || rev.has(r.review || 'unreviewed')) &&
        (!plan.size || plan.has(r.plan ? 'yes' : 'no')) &&
        (!minKg || (r.kg_each ?? 0) >= minKg),
    );
  }, [all, values]);

  const families = list.data?.families ?? [];
  const filterConfig = useMemo<FilterConfig<keyof typeof DEFAULTS>[]>(
    () => [
      { key: 'aq', type: 'text', placeholder: 'İş no, ürün, müşteri…' },
      {
        key: 'afamily',
        type: 'multiselect',
        label: 'Aile',
        searchable: true,
        options: [...new Map(all.map((r) => [r.family, r.family_label])).entries()]
          .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
          .map(([value, label]) => ({ value, label })),
      },
      {
        key: 'areview',
        type: 'multiselect',
        label: 'İnceleme',
        options: [
          { value: 'unreviewed', label: 'İncelenmedi' },
          { value: 'verified', label: 'Doğrulandı' },
          { value: 'excluded', label: 'Hariç' },
        ],
      },
      {
        key: 'aplan',
        type: 'multiselect',
        label: 'Çizim planı',
        options: [
          { value: 'yes', label: 'Okundu' },
          { value: 'no', label: 'Okunmadı' },
        ],
      },
      { key: 'aminkg', type: 'text', inputType: 'number', label: 'En az kg / adet', placeholder: 'ör. 1000' },
    ],
    [all],
  );

  const jobs = new Set(all.map((r) => r.job_no).filter(Boolean)).size;
  const withPlan = all.filter((r) => r.plan).length;
  const used = all.filter((r) => r.review !== 'excluded' && !isOutlier(r)).length;
  const excluded = all.filter((r) => r.review === 'excluded').length;

  const onReviewed = (id: number, status: string, note: string) => {
    queryClient.setQueryData<CostHistoryList>(costHistoryKeys.all, (prev) =>
      prev ? { ...prev, results: prev.results.map((r) => (r.id === id ? { ...r, review: status, review_note: note } : r)) } : prev,
    );
    void queryClient.invalidateQueries({ queryKey: costHistoryKeys.all });
    const row = all.find((r) => r.id === id);
    notify.success(`${row?.job_no || 'Kalem'}: ${status === 'verified' ? 'Doğrulandı' : status === 'excluded' ? 'Hariç tutuldu' : 'İnceleme geri alındı'}`);
    setDetail(null);
  };

  return (
    <>
      <p className={css.intro}>
        MALİYET arşivindeki <strong>iş sonu maliyet tabloları</strong> (gerçekleşen maliyet). Her kalemin o günkü
        maliyeti bugüne taşınır. Tahmin raporu aynı ailenin en yakın kalemlerini, önce aynı müşterinin ve çizimden
        okunmuş tasarımı en çok benzeyenlerini, <strong>çapraz kontrol</strong> olarak gösterir. Hariç tutulan ve
        aykırı €/kg'lı kalemler kullanılmaz.
      </p>

      <div className={css.stats}>
        <StatCards
          loading={list.isLoading}
          cards={[
            { id: 'rows', title: 'Arşiv kalemi', value: <>{all.length}<span className={css.statSub}>{jobs} iş</span></>, icon: 'fas fa-box-archive', color: 'blue' },
            {
              id: 'plan',
              title: 'Çizimi okunan',
              value: <>{withPlan}<span className={css.statSub}>tasarımla eşleşir</span></>,
              icon: 'fas fa-drafting-compass',
              color: 'green',
              onClick: () => filters.apply({ aplan: ['yes'] }),
              tooltip: 'Bu kalemlerde eşleşme ağırlık yerine çizimden okunan tasarıma bakar',
            },
            { id: 'used', title: 'Eşleşmede kullanılan', value: used, icon: 'fas fa-check', color: 'gemkom' },
            {
              id: 'excluded',
              title: 'Hariç tutulan',
              value: excluded,
              icon: 'fas fa-ban',
              color: 'grey',
              onClick: () => filters.apply({ areview: ['excluded'] }),
            },
          ]}
        />
      </div>

      <Panel className={css.breakdown}>
        <div className={css.breakdownHead}>
          <div>
            <div className={css.breakdownTitle}>Aileler</div>
            <div className={css.breakdownHint}>
              Bugünkü €/kg medyanı ve ailenin arşivden ne kadar iyi tahmin edildiği. Zayıf ailelerde rapor geniş bir
              aralık verir.
            </div>
          </div>
          <Button
            size="xs"
            variant="subtle"
            rightSection={<FaIcon icon={familiesOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} />}
            onClick={() => setFamiliesOpen((v) => !v)}
          >
            {familiesOpen ? 'Gizle' : `Göster (${families.length})`}
          </Button>
        </div>
        <Collapse expanded={familiesOpen}>
          <table className={css.groupTable} data-testid="archive-families">
            <thead>
              <tr>
                <th>Aile</th>
                <th className={css.num}>Kalem</th>
                <th className={css.num}>Bugün €/kg (medyan)</th>
                <th>Güvenilirlik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {families.map((f) => (
                <tr key={f.family}>
                  <td>{f.label}</td>
                  <td className={css.num}>{f.n}</td>
                  <td className={css.num}>
                    <strong>{fmt(f.median_eur_per_kg_now, 2)}</strong>
                  </td>
                  <td>
                    <ReliabilityBadge value={f.reliability} />
                  </td>
                  <td>
                    <Button size="compact-xs" variant="subtle" onClick={() => filters.apply({ afamily: [f.family] })}>
                      Listele
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapse>
      </Panel>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.id)}
        loading={list.isFetching}
        sortable
        pagination={{ pageSize: 50 }}
        onRowClick={(r) => setDetail(r)}
        rowStyle={(r) => (r.review === 'excluded' || isOutlier(r) ? { opacity: 0.6 } : undefined)}
        exportable={{ fileName: 'gecmis-maliyetler' }}
        emptyMessage="Filtreye uyan kalem yok"
        verticalSpacing="xs"
        filters={
          <FilterBar inline filters={filterConfig} values={values} onApply={filters.apply} onClear={filters.reset} />
        }
      />

      {detail ? (
        <CostHistoryDetail
          key={detail.id}
          row={detail}
          reference={detail.job_no ? refs.get(detail.job_no) : undefined}
          onOpenReference={(jobNo) => setParams({ search: jobNo })}
          onClose={() => setDetail(null)}
          onReviewed={onReviewed}
        />
      ) : null}
    </>
  );
}
