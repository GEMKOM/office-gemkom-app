/**
 * Plan ve Sapmalar on its own page: the job order's dates, the legend and the
 * sheet, nothing else of the app (no rail, no band). Two doors in:
 *
 *   ?job_no=009-37[&cols=a,b&main=1&head=0&lang=en&collapsed=job-X&zoom=week&print=1]
 *       the office session. print=1 opens the browser's print dialog once the
 *       sheet is drawn; "Save as PDF" there gives a vector PDF laid out for A4
 *       landscape.
 *   ?share=<token>
 *       a customer's temporary link (PlanSheetShareLink): no login; the
 *       columns and options travel with the token. An EDITABLE link is the
 *       sales team's: every cell and the header's figures take a click, the
 *       edits are saved on the link (never on the plan), and the PDF prints
 *       them.
 *
 * lang=en (or the link's options.language) draws everything WE write in
 * English (features/plan-sheet/sheetLang.ts). The sales team's editing
 * controls stay Turkish.
 */
import { Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { getJobOrderPlanSheet, getSharedPlanSheet } from '@/api/projects/planSheet';
import { setSheetLang, tr } from '@/features/plan-sheet/sheetLang';
import type { SharedPlanSheet } from '@/features/plan-sheet/types';
import { FaIcon } from '@/ui/FaIcon';
import { PlanSheetView } from './PlanSheetView';
import classes from './PlanSheetPage.module.css';

export function PlanSheetPage() {
  const [params] = useSearchParams();
  const share = params.get('share');
  const jobNo = params.get('job_no');
  const urlLang = params.get('lang');

  const query = useQuery<SharedPlanSheet>({
    queryKey: share ? ['plan-sheet', 'shared', share] : ['plan-sheet', 'job', jobNo],
    queryFn: async ({ signal }) => {
      if (share) return getSharedPlanSheet(share, { lang: urlLang, signal });
      if (jobNo) return { sheet: await getJobOrderPlanSheet(jobNo, signal), link: null };
      throw new Error(tr('İş emri belirtilmedi.', 'No job order given.'));
    },
    // Loaded once: the view takes its starting state (columns, folds,
    // edits) from it, and a refetch must not reset an editor's work.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // The app is Turkish; whatever this page switched to ends with it.
  useEffect(() => () => setSheetLang('tr'), []);

  // A share link's page is not for search engines (the legacy page's meta).
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (query.data) {
    return <PlanSheetView data={query.data} share={share} params={params} />;
  }

  // An English link's own errors read in English before the link says so.
  setSheetLang(urlLang);
  return (
    <div className={classes.page}>
      <div className={classes.inner}>
        {query.isError ? (
          <div className={classes.error}>
            <FaIcon icon="fas fa-triangle-exclamation" />{' '}
            {query.error instanceof Error && query.error.message
              ? query.error.message
              : tr('Plan yüklenemedi.', 'The plan could not be loaded.')}
          </div>
        ) : (
          <div className={classes.loading}>
            <Loader size="xs" color="gray" /> {tr('Plan yükleniyor…', 'Loading the plan…')}
          </div>
        )}
      </div>
    </div>
  );
}
