import { ActionIcon, Button, Group, Loader, Modal, Tooltip, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  myDiscussionsQueryOptions,
  myDiscussionSummaryQueryOptions,
  type DiscussionSource,
  type MyComment,
  type MyDiscussionFilters,
  type MyDiscussionTab,
  type MyTopic,
} from '@/api/general/myDiscussions';
import { formatDateTime, formatTime } from '@/lib/format';
import { useAppNavigate } from '@/shell/AppLink';
import {
  FaIcon,
  FilterBar,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  PageHeader,
  Panel,
  richTextToPlain,
  StatusBadge,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import { TopicDiscussion } from '../../shared/topic-discussion/TopicDiscussion';
import classes from './DiscussionsPage.module.css';

const PAGE_SIZE = 25;

const TABS: Record<MyDiscussionTab, { label: string; icon: string; noun: string }> = {
  topics: { label: 'Açtığım Konular', icon: 'fa-comments', noun: 'konu' },
  comments: { label: 'Yorumlarım', icon: 'fa-comment-dots', noun: 'yorum' },
};

/** Same squares as the notification rows, one per topic type. */
const TYPE_META: Record<string, { icon: string; family: string }> = {
  general: { icon: 'fa-comments', family: 'blue' },
  drawing_release: { icon: 'fa-compass-drafting', family: 'purple' },
  release_review: { icon: 'fa-clipboard-check', family: 'green' },
  revision_request: { icon: 'fa-code-branch', family: 'orange' },
};
const TYPE_FALLBACK = { icon: 'fa-comments', family: 'grey' };

const URL_DEFAULTS = {
  tab: 'topics',
  search: '',
  topic_type: '',
  replied: '',
  from: '',
  to: '',
  ordering: 'activity',
  page: '1',
};

type FilterKeys = 'search' | 'topic_type' | 'replied' | 'from' | 'to';
type FilterState = Record<FilterKeys, string>;
const EMPTY_FILTERS: FilterState = { search: '', topic_type: '', replied: '', from: '', to: '' };

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function dayKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Bugün", "Dün", else "02 Kasım 2026 Pazartesi". */
function dayLabel(value: string | null | undefined, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Bugün';
  if (dayKey(date) === dayKey(yesterday)) return 'Dün';
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  });
}

interface OpenThread {
  topicId: number;
  commentId: number | null;
  title: string;
  source: DiscussionSource | null;
}

/** A row: title, where it lives, the one sentence worth reading; time and reply state on the side. */
interface RowView {
  key: number;
  awaiting: boolean;
  type?: string;
  icon: string;
  title: string;
  titleExtra: ReactNode;
  facts: ReactNode[];
  line: ReactNode;
  time?: string;
  timeTitle: string;
  status: ReactNode;
  source: DiscussionSource | null;
  thread: OpenThread;
}

function sourceFact(source: DiscussionSource | null | undefined): ReactNode {
  if (!source?.label) return null;
  return (
    <>
      <span className={classes.factJob}>{source.label}</span>
      {source.detail ? ` ${source.detail}` : ''}
    </>
  );
}

function priorityBadge(priority?: string, label?: string): ReactNode {
  if (priority === 'urgent') return <StatusBadge color="red">{label}</StatusBadge>;
  if (priority === 'high') return <StatusBadge color="orange">{label}</StatusBadge>;
  return null;
}

function topicRow(topic: MyTopic, ordering: string): RowView {
  // Someone answered and the user has not spoken since.
  const awaiting = (topic.reply_count ?? 0) > 0 && !topic.last_comment_by_me;
  let line: ReactNode = null;
  if (awaiting && topic.last_comment_excerpt) {
    line = (
      <div className={classes.line} data-kind="reply">
        <FaIcon icon="fas fa-reply" className={classes.replyIcon} />
        <span className={classes.who}>{topic.last_comment_by || 'Bilinmeyen'}</span>{' '}
        {richTextToPlain(topic.last_comment_excerpt)}
      </div>
    );
  } else if (topic.excerpt) {
    line = <div className={classes.line}>{richTextToPlain(topic.excerpt)}</div>;
  }
  let status: ReactNode;
  if (awaiting) status = <StatusBadge color="blue">Yeni yanıt</StatusBadge>;
  else if (topic.reply_count) {
    status = (
      <span className={classes.stateText}>
        <FaIcon icon="fas fa-check" /> Son yorum sizde
      </span>
    );
  } else status = <span className={classes.stateText}>Yanıt yok</span>;

  return {
    key: topic.id,
    awaiting,
    type: topic.topic_type,
    icon: (TYPE_META[topic.topic_type ?? ''] ?? TYPE_FALLBACK).icon,
    title: topic.title || '-',
    titleExtra: priorityBadge(topic.priority, topic.priority_display),
    facts: [
      sourceFact(topic.source),
      topic.topic_type !== 'general' ? topic.topic_type_display : null,
      topic.revision_status_display || null,
      `${topic.comment_count ?? 0} yorum`,
    ],
    line,
    time: ordering === 'created' ? topic.created_at : topic.last_activity_at,
    timeTitle: `Açıldı: ${topic.created_at ? formatDateTime(topic.created_at) : '-'}`,
    status,
    source: topic.source ?? null,
    thread: {
      topicId: topic.id,
      commentId: null,
      title: topic.title || '',
      source: topic.source ?? null,
    },
  };
}

function commentRow(comment: MyComment, ordering: string): RowView {
  const topic = comment.topic ?? { id: 0 };
  // Answered after this comment, and the answer is still the topic's last word.
  const awaiting =
    (comment.reply_count ?? 0) > 0 &&
    Boolean(comment.last_reply_at) &&
    comment.last_reply_at === topic.last_comment_at;
  let status: ReactNode;
  if (awaiting) {
    status = (
      <span
        title={`${comment.last_reply_by || ''} · ${comment.last_reply_at ? formatDateTime(comment.last_reply_at) : ''}`}
      >
        <StatusBadge color="blue">Yeni yanıt</StatusBadge>
      </span>
    );
  } else if (comment.reply_count) {
    status = (
      <span className={classes.stateText} title={`Son yanıt: ${comment.last_reply_by || ''}`}>
        <FaIcon icon="fas fa-reply" /> {comment.reply_count} yanıt
      </span>
    );
  } else status = <span className={classes.stateText}>Yanıt yok</span>;

  return {
    key: comment.id,
    awaiting,
    type: topic.topic_type,
    icon: 'fa-comment-dots',
    title: topic.title || '-',
    titleExtra: null,
    facts: [
      sourceFact(comment.source),
      topic.is_mine ? 'Sizin konunuz' : `Konu: ${topic.created_by || '-'}`,
      topic.topic_type !== 'general' ? topic.topic_type_display : null,
      comment.attachment_count ? (
        <>
          <FaIcon icon="fas fa-paperclip" /> {comment.attachment_count}
        </>
      ) : null,
      comment.is_edited ? 'düzenlendi' : null,
    ],
    line: (
      <div className={classes.line} data-kind="own">
        {richTextToPlain(comment.content)}
      </div>
    ),
    time: ordering === 'created' ? comment.created_at : comment.last_activity_at,
    timeTitle: `Yazıldı: ${comment.created_at ? formatDateTime(comment.created_at) : '-'}`,
    status,
    source: comment.source ?? null,
    thread: {
      topicId: topic.id,
      commentId: comment.id,
      title: topic.title || '',
      source: comment.source ?? null,
    },
  };
}

function StateBlock({
  icon,
  title,
  children,
}: {
  icon?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={classes.state}>
      {icon ? (
        <FaIcon icon={icon} className={classes.stateIcon} />
      ) : (
        <Loader size="sm" color="gray" />
      )}
      <div className={classes.stateTitle}>{title}</div>
      {children}
    </div>
  );
}

/**
 * Port of general/discussions (discussions.js): every topic the user opened
 * and every comment they wrote. The question it answers first is "did anyone
 * answer me?": the default order is by latest activity, and every row says
 * whether a reply came. Rows open the thread in place.
 */
export function DiscussionsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const navigate = useAppNavigate();
  const tab: MyDiscussionTab = values.tab === 'comments' ? 'comments' : 'topics';
  const ordering = values.ordering === 'created' ? 'created' : 'activity';
  const page = positiveInt(values.page, 1);

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      topic_type: values.topic_type,
      replied: values.replied,
      from: values.from,
      to: values.to,
    }),
    [values.search, values.topic_type, values.replied, values.from, values.to],
  );
  const apiFilters: MyDiscussionFilters = {
    search: filters.search || undefined,
    topic_type: filters.topic_type || undefined,
    replied: filters.replied || undefined,
    created_at__date__gte: filters.from || undefined,
    created_at__date__lte: filters.to || undefined,
  };

  const list = useQuery({
    ...myDiscussionsQueryOptions(tab, { ...apiFilters, ordering, page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    ...myDiscussionSummaryQueryOptions(tab, apiFilters),
    placeholderData: keepPreviousData,
  });
  const summary = summaryQuery.data;
  const count = list.data?.count ?? 0;

  // Rows under day headers, dated by whatever the list is sorted by.
  const rows = useMemo(() => {
    const results = list.data?.results ?? [];
    const views =
      tab === 'comments'
        ? (results as MyComment[]).map((row) => commentRow(row, ordering))
        : (results as MyTopic[]).map((row) => topicRow(row, ordering));
    return views.map((row, index) => {
      const previous = views[index - 1];
      const newDay = !previous || dayKey(previous.time) !== dayKey(row.time);
      return { ...row, day: newDay ? dayLabel(row.time) : null };
    });
  }, [list.data, tab, ordering]);

  // ---- the thread modal ----
  const [thread, setThread] = useState<OpenThread | null>(null);
  // Set when the user comments from the modal, so the list only reloads when
  // its counts can actually have moved.
  const changed = useRef(false);
  const openThread = (next: OpenThread) => {
    if (!next.topicId) return;
    changed.current = false;
    setThread(next);
  };
  const closeThread = () => {
    setThread(null);
    if (changed.current) {
      changed.current = false;
      void list.refetch();
      void summaryQuery.refetch();
    }
  };

  const refresh = () => {
    if (page === 1) {
      void list.refetch();
      void summaryQuery.refetch();
    } else apply({ page: '1' });
  };

  const goToPage = (next: number) => {
    apply({ page: String(next) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const typeOptions = useMemo(
    () => (summary?.types ?? []).map((t) => ({ value: t.value, label: `${t.label} (${t.count})` })),
    [summary?.types],
  );
  const filterConfig: FilterConfig<FilterKeys>[] = [
    {
      type: 'text',
      key: 'search',
      label: 'Ara',
      placeholder: 'İş emri no, konu başlığı, metin...',
    },
    {
      type: 'select',
      key: 'topic_type',
      label: 'Konu Türü',
      placeholder: 'Tümü',
      options: typeOptions,
    },
    {
      type: 'select',
      key: 'replied',
      label: 'Yanıt',
      placeholder: 'Tümü',
      searchable: false,
      options: [
        { value: 'true', label: 'Yanıt gelenler' },
        { value: 'false', label: 'Yanıt gelmeyenler' },
      ],
    },
    { type: 'date', key: 'from', label: 'Başlangıç' },
    { type: 'date', key: 'to', label: 'Bitiş' },
  ];

  let body: ReactNode;
  if (list.isPending) {
    body = <StateBlock title="Yükleniyor…" />;
  } else if (list.isError && !list.data) {
    body = (
      <StateBlock icon="fas fa-triangle-exclamation" title="Tartışmalar yüklenirken hata oluştu.">
        <Button size="xs" variant="default" onClick={() => void list.refetch()}>
          Tekrar dene
        </Button>
      </StateBlock>
    );
  } else if (!rows.length) {
    const total = (tab === 'comments' ? summary?.total_comments : summary?.total_topics) ?? 0;
    body = total ? (
      <StateBlock
        icon="fas fa-magnifying-glass"
        title={`Bu filtrelere uyan ${TABS[tab].noun} bulunamadı.`}
      >
        <div>Filtreleri temizleyip tekrar deneyin.</div>
      </StateBlock>
    ) : (
      <StateBlock
        icon={tab === 'comments' ? 'fas fa-comment-slash' : 'fas fa-comments'}
        title={
          tab === 'comments'
            ? 'Henüz bir yorum yazmadınız.'
            : 'Henüz bir tartışma konusu açmadınız.'
        }
      >
        <div>İş emirlerinde açtığınız konular ve yazdığınız yorumlar burada toplanır.</div>
      </StateBlock>
    );
  } else {
    body = (
      <div className={classes.list} data-fetching={list.isFetching || undefined}>
        {rows.map((row) => {
          const meta = TYPE_META[row.type ?? ''] ?? TYPE_FALLBACK;
          const facts = row.facts.filter(Boolean);
          return (
            <Fragment key={row.key}>
              {row.day !== null ? <div className={classes.day}>{row.day}</div> : null}
              <div
                className={classes.row}
                data-awaiting={row.awaiting || undefined}
                data-testid={`disc-row-${row.key}`}
              >
                <span className={classes.icon} data-family={meta.family} aria-hidden>
                  <FaIcon icon={`fas ${row.icon}`} />
                </span>
                <UnstyledButton
                  component="div"
                  role="button"
                  tabIndex={0}
                  className={classes.main}
                  onClick={() => openThread(row.thread)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openThread(row.thread);
                    }
                  }}
                >
                  <div className={classes.title}>
                    <span className={classes.titleText}>{row.title}</span>
                    {row.titleExtra}
                  </div>
                  <div className={classes.facts}>
                    {facts.map((fact, index) => (
                      <Fragment key={index}>
                        {index > 0 ? <span className={classes.sep}>·</span> : null}
                        {fact}
                      </Fragment>
                    ))}
                  </div>
                  {row.line}
                </UnstyledButton>
                <div className={classes.side}>
                  <span className={classes.time} title={row.timeTitle}>
                    {row.time ? formatTime(row.time) : ''}
                  </span>
                  {row.status}
                  <div className={classes.actions}>
                    <Tooltip label="Tartışmayı aç" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Tartışmayı aç"
                        onClick={() => openThread(row.thread)}
                      >
                        <FaIcon icon="fas fa-comments" />
                      </ActionIcon>
                    </Tooltip>
                    {row.source?.link ? (
                      <Tooltip label="Kaynağa git" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label="Kaynağa git"
                          onClick={() => navigate(row.source!.link!)}
                        >
                          <FaIcon icon="fas fa-arrow-up-right-from-square" />
                        </ActionIcon>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const noun = TABS[tab].noun;
  const pager =
    list.data && rows.length > 0 ? (
      <div className={classes.pager}>
        {totalPages <= 1 ? (
          <span>
            {count} {noun}
          </span>
        ) : (
          <>
            <span>
              {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, count)} / {count} {noun}
            </span>
            <Group gap="sm">
              <Button
                size="xs"
                variant="default"
                disabled={page <= 1}
                leftSection={<FaIcon icon="fas fa-chevron-left" />}
                onClick={() => goToPage(page - 1)}
              >
                Önceki
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                size="xs"
                variant="default"
                disabled={page >= totalPages}
                rightSection={<FaIcon icon="fas fa-chevron-right" />}
                onClick={() => goToPage(page + 1)}
              >
                Sonraki
              </Button>
            </Group>
          </>
        )}
      </div>
    ) : null;

  const figure = (value: number | undefined) =>
    value === undefined ? '–' : value.toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="Tartışmalarım"
        subtitle="Açtığınız konular ve yazdığınız yorumlar — arayın, yanıt gelenleri görün, yerinde yanıtlayın"
        icon="fas fa-comments"
        stats={[
          {
            id: 'disc-topics-count',
            label: 'Açtığım Konular',
            value: figure(summary?.total_topics),
          },
          {
            id: 'disc-comments-count',
            label: 'Yorumlarım',
            value: figure(summary?.total_comments),
          },
        ]}
      />

      <Panel
        padded={false}
        headerLeft={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            // Ordering lives on the tab bar, not in the filter card.
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        actions={
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
            loading={list.isFetching && !list.isPending}
          >
            Yenile
          </Button>
        }
        footer={pager}
      >
        <div className={classes.toolbar}>
          <div className={classes.tabs} role="tablist" aria-label="Tartışmalar">
            {(Object.keys(TABS) as MyDiscussionTab[]).map((key) => {
              const active = tab === key;
              return (
                <UnstyledButton
                  key={key}
                  role="tab"
                  aria-selected={active}
                  className={classes.tab}
                  data-active={active || undefined}
                  // The type facet is per tab; a type picked on one may not exist on the other.
                  onClick={() => !active && apply({ tab: key, topic_type: '', page: '1' })}
                >
                  <FaIcon icon={`fas ${TABS[key].icon}`} />
                  {TABS[key].label}
                  <span className={classes.tabCount}>{summary?.[key] ?? 0}</span>
                </UnstyledButton>
              );
            })}
          </div>
          <div className={classes.sort} role="group" aria-label="Sıralama">
            <span className={classes.sortLabel}>Sırala:</span>
            <UnstyledButton
              className={classes.sortButton}
              data-active={ordering === 'activity' || undefined}
              aria-pressed={ordering === 'activity'}
              title={tab === 'comments' ? 'Son yanıta göre' : 'Son yoruma göre'}
              onClick={() => apply({ ordering: 'activity', page: '1' })}
            >
              Son hareket
            </UnstyledButton>
            <UnstyledButton
              className={classes.sortButton}
              data-active={ordering === 'created' || undefined}
              aria-pressed={ordering === 'created'}
              title={tab === 'comments' ? 'Yazdığınız tarihe göre' : 'Açtığınız tarihe göre'}
              onClick={() => apply({ ordering: 'created', page: '1' })}
            >
              {tab === 'comments' ? 'Yazma tarihi' : 'Açılış tarihi'}
            </UnstyledButton>
          </div>
        </div>
        {body}
      </Panel>

      <Modal
        opened={Boolean(thread)}
        onClose={closeThread}
        size="xl"
        withCloseButton={false}
        classNames={modalClassNames}
      >
        {thread ? (
          <>
            <ModalHeader
              title={thread.title || 'Tartışma'}
              subtitle={
                thread.source?.label
                  ? [thread.source.label, thread.source.detail].filter(Boolean).join(' ')
                  : undefined
              }
              icon="fas fa-comments"
            />
            <ModalBody>
              <TopicDiscussion
                topicId={thread.topicId}
                highlightCommentId={thread.commentId}
                onChanged={() => {
                  changed.current = true;
                }}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                variant="default"
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={closeThread}
              >
                Kapat
              </Button>
              {thread.source?.link ? (
                <Button
                  leftSection={<FaIcon icon="fas fa-arrow-up-right-from-square" />}
                  onClick={() => navigate(thread.source!.link!)}
                >
                  Kaynağa git
                </Button>
              ) : null}
            </ModalFooter>
          </>
        ) : null}
      </Modal>
    </>
  );
}
