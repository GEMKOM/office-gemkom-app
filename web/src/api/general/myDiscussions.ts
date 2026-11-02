import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated, type Paginated } from '../types';

/**
 * Tartışmalarım: the signed-in user's own topics and comments
 * (apis/projects/myDiscussions.js). Base URL /projects/my-discussions/.
 */

/** Where a topic lives: a job order, a task, an offer, an İSG issue, a release review. */
export interface DiscussionSource {
  kind?: string;
  label?: string;
  detail?: string | null;
  link?: string | null;
}

export interface MyTopic {
  id: number;
  title?: string;
  topic_type?: string;
  topic_type_display?: string;
  priority?: string;
  priority_display?: string;
  revision_status_display?: string | null;
  comment_count?: number;
  /** Comments by other people. */
  reply_count?: number;
  /** The user wrote the topic's latest comment. */
  last_comment_by_me?: boolean;
  last_comment_by?: string | null;
  last_comment_excerpt?: string | null;
  excerpt?: string | null;
  created_at?: string;
  last_activity_at?: string;
  source?: DiscussionSource | null;
}

export interface MyComment {
  id: number;
  content?: string;
  created_at?: string;
  last_activity_at?: string;
  /** Comments others wrote on the topic after this one. */
  reply_count?: number;
  last_reply_at?: string | null;
  last_reply_by?: string | null;
  attachment_count?: number;
  is_edited?: boolean;
  source?: DiscussionSource | null;
  topic?: {
    id: number;
    title?: string;
    topic_type?: string;
    topic_type_display?: string;
    created_by?: string;
    is_mine?: boolean;
    last_comment_at?: string | null;
  };
}

export interface MyDiscussionSummary {
  /** Tab counts under the current filters. */
  topics?: number;
  comments?: number;
  /** Unfiltered totals, to tell "nothing yet" from "nothing matches". */
  total_topics?: number;
  total_comments?: number;
  /** The topic-type facet for the tab asked for. */
  types?: { value: string; label: string; count: number }[];
}

export interface MyDiscussionFilters {
  search?: string;
  topic_type?: string;
  /** 'true' | 'false' */
  replied?: string;
  created_at__date__gte?: string;
  created_at__date__lte?: string;
}

export type MyDiscussionTab = 'topics' | 'comments';

export interface MyDiscussionListParams extends MyDiscussionFilters {
  /** 'activity' (default) | 'created' */
  ordering?: string;
  page?: number;
  page_size?: number;
}

export const MY_DISCUSSIONS_STALE_TIME = 30_000;

/** Port of listMyTopics / listMyComments. */
export function myDiscussionsQueryOptions<T extends MyDiscussionTab>(
  tab: T,
  params: MyDiscussionListParams,
) {
  return queryOptions({
    queryKey: ['myDiscussions', tab, params] as const,
    queryFn: async ({ signal }) =>
      toPaginated<T extends 'topics' ? MyTopic : MyComment>(
        await apiFetch<unknown>(`/projects/my-discussions/${tab}/`, {
          params: { ...params },
          signal,
        }),
      ) as Paginated<T extends 'topics' ? MyTopic : MyComment>,
    staleTime: MY_DISCUSSIONS_STALE_TIME,
  });
}

/** Port of getMyDiscussionSummary: tab counts and the type facet, without paging or order. */
export function myDiscussionSummaryQueryOptions(
  tab: MyDiscussionTab,
  filters: MyDiscussionFilters,
) {
  return queryOptions({
    queryKey: ['myDiscussions', 'summary', tab, filters] as const,
    queryFn: ({ signal }) =>
      apiFetch<MyDiscussionSummary>('/projects/my-discussions/summary/', {
        params: { ...filters, tab },
        signal,
      }),
    staleTime: MY_DISCUSSIONS_STALE_TIME,
  });
}
