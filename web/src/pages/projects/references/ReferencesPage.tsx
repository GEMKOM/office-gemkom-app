import { Button, Tabs } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { costHistoryKeys, costHistoryQueryOptions } from '@/api/projects/costHistory';
import { referenceKeys } from '@/api/projects/references';
import { FaIcon, PageHeader, Panel } from '@/ui';
import { CalibrationTab } from './CalibrationTab';
import { CostHistoryTab } from './CostHistoryTab';
import { MethodModal } from './MethodModal';
import css from './RefTabs.module.css';
import { UnitsPanel } from './UnitsPanel';

type Tab = 'jobs' | 'archive' | 'units';
const TABS: Tab[] = ['jobs', 'archive', 'units'];

/**
 * Referanslar (2026-11-04 redesign): what the estimator learns from past work, in
 * three tabs. İş referansları: jobs in the app with a plan and recorded hours (the
 * calibration factors). Geçmiş maliyetler: the MALİYET archive of post-job cost
 * sheets, restated to today. Birim süreler: the unit times the plans are priced with.
 */
export function ReferencesPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'jobs';
  const [methodOpen, setMethodOpen] = useState(false);
  const [methodStale, setMethodStale] = useState(false);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const archive = useQuery(costHistoryQueryOptions());

  const setTab = (next: string | null) => {
    if (!next || next === tab) return;
    // Each tab keeps its own filters; a tab switch starts the other one clean.
    setParams(next === 'jobs' ? {} : { tab: next });
  };

  return (
    <>
      <PageHeader
        title="Referanslar"
        subtitle="Tahminin geçmiş işlerden öğrendikleri"
        icon="fas fa-book-open"
        backTo="/projects/"
        actions={
          <>
            <Button variant="default" leftSection={<FaIcon icon="fas fa-circle-question" />} onClick={() => setMethodOpen(true)}>
              Nasıl çalışır?
            </Button>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: referenceKeys.all });
                void queryClient.invalidateQueries({ queryKey: costHistoryKeys.all });
              }}
            >
              Yenile
            </Button>
          </>
        }
      />

      {/* The tab strip sits on a white panel (the page header is a coloured band); the content follows outside it. */}
      <Panel className={css.tabs}>
        <Tabs value={tab} onChange={setTab} variant="pills">
          <Tabs.List>
            <Tabs.Tab value="jobs" leftSection={<FaIcon icon="fas fa-industry" />}>
              İş referansları
              {jobCount != null ? <span className={css.tabCount}>{jobCount}</span> : null}
            </Tabs.Tab>
            <Tabs.Tab value="archive" leftSection={<FaIcon icon="fas fa-box-archive" />}>
              Geçmiş maliyetler
              {archive.data ? <span className={css.tabCount}>{archive.data.count}</span> : null}
            </Tabs.Tab>
            <Tabs.Tab value="units" leftSection={<FaIcon icon="fas fa-sliders" />}>
              Birim süreler
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Panel>

      {tab === 'jobs' ? <CalibrationTab onCount={setJobCount} /> : null}
      {tab === 'archive' ? <CostHistoryTab /> : null}
      {tab === 'units' ? (
        <>
          <p className={css.intro}>
            İmalat planının saatleri bu birim sürelerle hesaplanır (kaynak metali, çatım, kesim, büküm, talaşlı
            işlemler…). Bir değeri değiştirince bütün referansların plan saati ve faktörü yeniden hesaplanır; mevcut
            tahmin raporları Yenile'ye basılana kadar eski değerle kalır.
          </p>
          <UnitsPanel onSaved={() => setMethodStale(true)} />
        </>
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
