import { daysSince, relativeDayLabel } from '@legacy/components/daily-summary/render.js';
import { Button, CloseButton } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { getDailySummary } from '@/api/assistant';
import { useAuth } from '@/auth/AuthProvider';
import { FaIcon } from '@/ui/FaIcon';
import { runDailySummaryCheck, snoozeSummary } from './dailySummary';
import classes from './neo.module.css';
import { neoLinkTarget } from './neoLinks';
import { setSummaryPrompt, useNeo } from './neoStore';
import { neoKeys } from './queries';
import { SummaryModal } from './NeoSummaries';

// Where the page was entered from: the first page of a visit is the sign-in
// page's successor (the React sign-in page lives in the same document, so the
// document loaded on /login), or a tab with no referrer (typed address,
// bookmark), or the legacy sign-in page. Read once, when the bundle loads.
const FIRST_PAGE_ENTRY = (() => {
  const referrer = document.referrer || '';
  return (
    window.location.pathname.startsWith('/login') || !referrer || referrer.includes('/login/')
  );
})();

/** A dialog is already up (the page's own, or ours): don't stack on it. */
function dialogOpen() {
  return !!document.querySelector('[role="dialog"]');
}

/**
 * The morning check for the daily summary: mounted once in the layout, it asks
 * the API when the app opens (and when a tab left open comes back into view)
 * and puts the popup or the banner up when today's brief is unread. See
 * dailySummary.ts for the rules.
 */
export function DailySummaryPrompt() {
  const { user, isImpersonating } = useAuth();
  const queryClient = useQueryClient();
  const prompt = useNeo((s) => s.summaryPrompt);
  const location = useLocation();
  // Deep links open Neo straight into a pane; don't compete with a popup there.
  const quiet = useRef(neoLinkTarget(location.search) !== null);
  // Only the first load of a visit may open the popup.
  const first = useRef(FIRST_PAGE_ENTRY);

  useEffect(() => {
    // An admin browsing as someone else must not read their summary for them.
    if (isImpersonating) return;
    const controller = new AbortController();
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        await runDailySummaryCheck({
          uid: user.id,
          quiet: quiet.current,
          firstPage: first.current,
          dialogOpen,
          onDetail: (summary) => queryClient.setQueryData(neoKeys.summary(summary.id), summary),
          signal: controller.signal,
        });
      } finally {
        running = false;
      }
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user.id, isImpersonating, queryClient]);

  if (!prompt) return null;
  if (prompt.kind === 'modal') {
    return (
      <SummaryModal
        summary={{ ...prompt.summary, summary_date: prompt.summary.summary_date ?? '' }}
        latest
        source={prompt.source ?? 'modal'}
        onClose={() => setSummaryPrompt(null)}
      />
    );
  }
  return <SummaryBanner summary={prompt.summary} />;
}

function SummaryBanner({ summary }: { summary: { id: number; summary_date: string | null; generated_at: string | null } }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const today = !summary.summary_date || daysSince(summary.summary_date) === 0;
  const text = today
    ? 'Bugünün özeti hazır'
    : `Günlük özet hazır · ${relativeDayLabel(summary.summary_date ?? '')}`;

  const read = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const detail = await getDailySummary(summary.id);
      queryClient.setQueryData(neoKeys.summary(detail.id), detail);
      setSummaryPrompt({ kind: 'modal', summary, source: 'banner' });
    } catch {
      setOpening(false);
    }
  };

  return (
    <div className={classes.dsBanner} role="status" data-testid="daily-summary-banner">
      <FaIcon icon="fas fa-newspaper" className={classes.dsBannerIcon} />
      <span className={classes.dsBannerText}>{text}</span>
      <Button size="compact-sm" variant="default" loading={opening} onClick={read}>
        Oku
      </Button>
      <CloseButton
        size="sm"
        aria-label="Daha sonra"
        title="Daha sonra"
        onClick={() => snoozeSummary(user.id, summary)}
      />
    </div>
  );
}
