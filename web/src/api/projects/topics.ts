import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { MentionedGroup, MentionedUser } from '@/ui/RichText/renderRichText';
import { apiFetch, apiUpload, cleanParams, type ApiUploadOptions } from '../client';
import { extractResults } from '../types';

/**
 * Discussion topics and comments (apis/projects/topics.js), as much as the
 * shared discussion panel needs: one topic, its comments, posting and editing
 * a comment, and the attachments of both. A topic hangs off a job order, an
 * offer, an İSG issue or a drawing release; the panel does not care which.
 */

export interface DiscussionAttachment {
  id: number;
  /** Presigned URL; older payloads call it `file`. */
  file_url?: string | null;
  file?: string | null;
  name?: string | null;
  size?: number | null;
  file_size?: number | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  [key: string]: unknown;
}

export interface DiscussionTopic {
  id: number;
  title?: string;
  content?: string | null;
  priority?: string;
  priority_display?: string;
  topic_type?: string;
  topic_type_display?: string;
  created_by_name?: string;
  created_by_username?: string;
  created_at?: string;
  attachments_data?: DiscussionAttachment[];
  mentioned_users_data?: MentionedUser[];
  mentioned_groups_data?: MentionedGroup[];
  [key: string]: unknown;
}

export interface DiscussionComment {
  id: number;
  topic?: number;
  content: string;
  created_by_name?: string;
  created_by_username?: string;
  created_at?: string;
  is_edited?: boolean;
  attachments_data?: DiscussionAttachment[];
  mentioned_users_data?: MentionedUser[];
  mentioned_groups_data?: MentionedGroup[];
  [key: string]: unknown;
}

export const DISCUSSION_STALE_TIME = 30_000;

export const topicKeys = {
  all: ['discussionTopics'] as const,
  detail: (topicId: number) => ['discussionTopics', 'detail', topicId] as const,
  comments: (topicId: number) => ['discussionTopics', 'comments', topicId] as const,
};

/** Port of getTopic. */
export function topicQueryOptions(topicId: number) {
  return queryOptions({
    queryKey: topicKeys.detail(topicId),
    queryFn: ({ signal }) =>
      apiFetch<DiscussionTopic>(`/projects/discussion-topics/${topicId}/`, { signal }),
    staleTime: DISCUSSION_STALE_TIME,
  });
}

/** Port of getTopicComments: oldest first, as the server sends them. */
export function topicCommentsQueryOptions(topicId: number) {
  return queryOptions({
    queryKey: topicKeys.comments(topicId),
    queryFn: async ({ signal }) =>
      extractResults<DiscussionComment>(
        await apiFetch<unknown>(`/projects/discussion-topics/${topicId}/comments/`, { signal }),
      ),
    staleTime: DISCUSSION_STALE_TIME,
  });
}

function fileForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/** Port of uploadTopicAttachment. */
export function uploadTopicAttachment(topicId: number, file: File, options: ApiUploadOptions = {}) {
  return apiUpload<DiscussionAttachment>(
    `/projects/discussion-topics/${topicId}/upload_attachment/`,
    fileForm(file),
    options,
  );
}

/** Port of uploadCommentAttachment. */
export function uploadCommentAttachment(
  commentId: number,
  file: File,
  options: ApiUploadOptions = {},
) {
  return apiUpload<DiscussionAttachment>(
    `/projects/discussion-comments/${commentId}/upload_attachment/`,
    fileForm(file),
    options,
  );
}

/** Port of createComment. The server resolves @mentions and notifies. */
export function createComment(data: { topic: number; content: string }) {
  return apiFetch<DiscussionComment>('/projects/discussion-comments/', {
    method: 'POST',
    body: data,
  });
}

/** Port of updateComment (author only). */
export function updateComment(commentId: number, data: { content: string }) {
  return apiFetch<DiscussionComment>(`/projects/discussion-comments/${commentId}/`, {
    method: 'PATCH',
    body: data,
  });
}

/** Port of deleteAttachment (uploader only). */
export function deleteDiscussionAttachment(attachmentId: number) {
  return apiFetch<void>(`/projects/discussion-attachments/${attachmentId}/`, { method: 'DELETE' });
}

/**
 * Post a comment, then its files one by one (legacy order). A failed file does
 * not undo the comment: the result says how many went up.
 */
export function usePostComment(topicId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, files }: { content: string; files: File[] }) => {
      const comment = await createComment({ topic: topicId, content });
      let failedFiles = 0;
      for (const file of files) {
        try {
          await uploadCommentAttachment(comment.id, file);
        } catch (error) {
          console.error('Error uploading comment file:', error);
          failedFiles += 1;
        }
      }
      return { comment, failedFiles };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: topicKeys.comments(topicId) }),
  });
}

/** Edit a comment: new text, attachments removed, new files added (legacy saveEditComment). */
export function useEditComment(topicId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      commentId,
      content,
      removeAttachmentIds,
      files,
    }: {
      commentId: number;
      content: string;
      removeAttachmentIds: number[];
      files: File[];
    }) => {
      await updateComment(commentId, { content });
      for (const id of removeAttachmentIds) await deleteDiscussionAttachment(id);
      for (const file of files) await uploadCommentAttachment(commentId, file);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: topicKeys.comments(topicId) }),
  });
}

/** A row of the topic list (listTopics): the topic plus its counts and links. */
export interface DiscussionTopicListItem extends DiscussionTopic {
  comment_count?: number;
  participant_count?: number;
  /** Job order number, when the topic hangs off one. */
  job_order?: string | null;
  job_order_no?: string | null;
  /** release_review topics: the drawing release under review. */
  linked_release_id?: number | null;
}

export interface TopicListParams {
  job_order?: string;
  priority?: string;
  priority__in?: string;
  created_by?: number;
  search?: string;
  ordering?: string;
}

/** Port of listTopics: results unwrapped. */
export function topicListQueryOptions(params: TopicListParams) {
  return queryOptions({
    queryKey: [...topicKeys.all, 'list', cleanParams({ ...params })] as const,
    queryFn: async ({ signal }) =>
      extractResults<DiscussionTopicListItem>(
        await apiFetch<unknown>('/projects/discussion-topics/', { params: { ...params }, signal }),
      ),
    staleTime: DISCUSSION_STALE_TIME,
  });
}

/** Port of createTopic. The server resolves @mentions and notifies. */
export function createTopic(data: {
  job_order?: string;
  title: string;
  content: string;
  priority: string;
}) {
  return apiFetch<DiscussionTopic>('/projects/discussion-topics/', { method: 'POST', body: data });
}
