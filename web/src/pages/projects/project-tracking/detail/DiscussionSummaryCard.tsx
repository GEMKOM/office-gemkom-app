import { Button, Loader } from '@mantine/core';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  generateDiscussionSummary,
  getDiscussionSummary,
  type DiscussionSummaryState,
} from '@/api/assistant';
import { isApiError } from '@/api/client';
import { formatDateTime } from '@/lib/format';
import { FaIcon, notify, renderRichText, StatusBadge } from '@/ui';
import css from './JobOrderDetail.module.css';

// Port of components/discussion-summary: "Neo Özeti", the shared AI summary of
// every discussion on a job order and its sub-jobs. The saved text is read for
// free; Özetle / Güncelle only appear when there is something new to read.

const POLL_MS = 4000;
const POLL_MAX = 60;
const COLLAPSED_KEY = 'neoSummaryCollapsed';

export const discussionSummaryKey = (jobNo: string) => ['discussionSummary', jobNo] as const;

function discussionSummaryQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: discussionSummaryKey(jobNo),
    queryFn: ({ signal }) => getDiscussionSummary(jobNo, signal),
    staleTime: 0,
    retry: false,
  });
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // a per-viewer nicety; fine to lose
  }
}

/** Legacy summaryFetch: the server's `detail`, else the default message. */
function summaryError(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const data = error.data as { detail?: unknown } | undefined;
    return typeof data?.detail === 'string' && data.detail ? data.detail : fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The prompt asks for sections each opened by a line that is only
 * **Başlık**; those lines become headings.
 */
function splitSections(content: string) {
  const sections: { title: string | null; lines: string[] }[] = [];
  let current: { title: string | null; lines: string[] } = { title: null, lines: [] };
  for (const line of String(content || '').split('\n')) {
    const heading = /^\s*\*\*([^*\n]+?)\*\*\s*:?\s*$/.exec(line);
    if (heading) {
      sections.push(current);
      current = { title: heading[1]!.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections
    .map((s) => ({ title: s.title, body: s.lines.join('\n').trim() }))
    .filter((s) => s.title || s.body);
}

type Refs = NonNullable<DiscussionSummaryState['topic_refs']>;

/**
 * One section's text: renderRichText's output, then each [#id] the server
 * knows becomes a button (built with DOM calls, so nothing is parsed as HTML);
 * unknown ids are dropped rather than shown as a dead reference.
 */
function SummaryText({ body, refs }: { body: string; refs: Refs }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderRichText(body), [body]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (/\[#\d+\]/.test(node.data)) nodes.push(node);
    }
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const match of node.data.matchAll(/\[#(\d+)\]/g)) {
        fragment.append(node.data.slice(last, match.index));
        last = match.index + match[0].length;
        const id = match[1]!;
        const info = refs[id];
        if (!info) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'neo-summary-ref';
        button.dataset.topicId = id;
        button.title = `${info.job_no ? `${info.job_no} · ` : ''}${info.title ?? ''}`;
        button.textContent = `#${id}`;
        fragment.append(button);
      }
      fragment.append(node.data.slice(last));
      node.replaceWith(fragment);
    }
  }, [html, refs]);

  return <div ref={ref} className={css.neoText} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DiscussionSummaryCard({
  jobNo,
  openTopic,
}: {
  jobNo: string;
  openTopic: (topicId: number) => void;
}) {
  const queryClient = useQueryClient();
  const options = discussionSummaryQueryOptions(jobNo);
  const [polls, setPolls] = useState(0);
  const query = useQuery({
    ...options,
    // While someone's summary is being written, re-read it (at most 4 minutes).
    refetchInterval: (q) => (q.state.data?.generating && polls < POLL_MAX ? POLL_MS : false),
  });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const data = query.data;
  // Count the polls so a stuck "generating" flag stops after POLL_MAX reads.
  const [seenUpdate, setSeenUpdate] = useState(query.dataUpdatedAt);
  if (query.dataUpdatedAt !== seenUpdate) {
    setSeenUpdate(query.dataUpdatedAt);
    setPolls((n) => (data?.generating ? n + 1 : 0));
  }

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setActionError(null);
    setCollapsed(false);
    try {
      const result = await generateDiscussionSummary(jobNo);
      queryClient.setQueryData(options.queryKey, result);
      if (!result.created) {
        notify.info('Özet zaten güncel — yeni bir konu ya da yorum gelmemiş.');
      }
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        // Someone else is writing it right now; wait for theirs.
        queryClient.setQueryData(options.queryKey, (old) =>
          old ? { ...old, generating: true } : old,
        );
      } else {
        setActionError(summaryError(error, 'Özet oluşturulamadı'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const el = (event.target as Element).closest?.<HTMLElement>('.neo-summary-ref');
    if (!el) return;
    const id = Number.parseInt(el.dataset.topicId ?? '', 10);
    if (id) openTopic(id);
  };

  if (query.isError) {
    // No Neo access: no card.
    if (isApiError(query.error) && query.error.status === 403) return null;
    return (
      <div className={`${css.neo} ${css.neoError}`}>
        <FaIcon icon="fas fa-wand-magic-sparkles" /> Neo özeti yüklenemedi.
        <Button variant="subtle" size="compact-xs" onClick={() => void query.refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }
  if (!data || !data.current?.topic_count) return null;

  const busy = generating || Boolean(data.generating);
  const summary = data.summary;
  const expanded = Boolean(summary) && !busy && !collapsed;
  const counts = `${data.current.topic_count} konu, ${data.current.comment_count} yorum`;
  const when = summary?.created_at ? formatDateTime(summary.created_at) : '';
  const who = summary?.created_by ? ` · ${summary.created_by}` : '';

  return (
    <div className={css.neo} data-open={expanded || undefined} onClick={onClick}>
      <div className={css.neoHead}>
        <div className={css.neoHeading}>
          <span className={css.neoIcon}>
            <FaIcon icon="fas fa-wand-magic-sparkles" />
          </span>
          <div>
            <div className={css.neoTitle}>
              Neo Özeti <span className={css.neoScope}>alt iş emirleri dahil</span>
            </div>
            <div className={css.neoSub}>
              {busy ? (
                <>
                  <Loader size={12} />
                  Neo {counts} okuyor… Büyük işlerde bir dakika kadar sürebilir.
                </>
              ) : !summary ? (
                `Henüz özet yok · ${counts} özetlenebilir.`
              ) : data.is_stale ? (
                <>
                  <StatusBadge color="orange">Özetten sonra yeni hareket var</StatusBadge>
                  <span>
                    {when}
                    {who}
                  </span>
                </>
              ) : (
                <>
                  <StatusBadge color="green">
                    <FaIcon icon="fas fa-check" /> Güncel
                  </StatusBadge>
                  <span>
                    {when}
                    {who}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {!busy ? (
          <div className={css.neoActions}>
            {!summary || data.is_stale ? (
              <Button
                size="xs"
                color="red.9"
                leftSection={
                  <FaIcon icon={summary ? 'fas fa-rotate' : 'fas fa-wand-magic-sparkles'} />
                }
                onClick={() => void generate()}
              >
                {summary ? 'Güncelle' : 'Özetle'}
              </Button>
            ) : null}
            {summary ? (
              <Button
                size="xs"
                variant="default"
                aria-expanded={!collapsed}
                leftSection={<FaIcon icon={`fas fa-chevron-${collapsed ? 'down' : 'up'}`} />}
                onClick={() => {
                  setCollapsed(!collapsed);
                  writeCollapsed(!collapsed);
                }}
              >
                {collapsed ? 'Göster' : 'Gizle'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {actionError ? (
        <div className={css.neoAlert}>
          <FaIcon icon="fas fa-circle-exclamation" />
          {actionError}
        </div>
      ) : null}
      {expanded && summary ? (
        <>
          <div className={css.neoBody}>
            {splitSections(summary.content).map((section, i) => (
              <section key={i} className={css.neoSection}>
                {section.title ? <h6 className={css.neoSectionTitle}>{section.title}</h6> : null}
                {/^[-*]?\s*yok\.?$/i.test(section.body) ? (
                  <div className={css.neoNone}>Yok</div>
                ) : (
                  <SummaryText body={section.body} refs={data.topic_refs ?? {}} />
                )}
              </section>
            ))}
          </div>
          <div className={css.neoFoot}>
            {summary.topic_count} konu ve {summary.comment_count} yorum okundu.{' '}
            {summary.omitted_topic_count
              ? `En eski ${summary.omitted_topic_count} konu metin sınırı nedeniyle dahil edilmedi. `
              : ''}
            Yapay zekâ özetidir; önemli kararları konunun kendisinden doğrulayın.
          </div>
        </>
      ) : null}
    </div>
  );
}
