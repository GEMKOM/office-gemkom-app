import { Center, Loader, Modal } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { topicKeys, topicQueryOptions, type DiscussionTopic } from '@/api/projects/topics';
import { formatDateTime } from '@/lib/format';
import { TopicDiscussion } from '@/pages/shared/topic-discussion/TopicDiscussion';
import { useAppNavigate } from '@/shell/AppLink';
import {
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  RichText,
  StatusBadge,
} from '@/ui';
import { discussionSummaryKey } from './DiscussionSummaryCard';
import css from './JobOrderDetail.module.css';
import { FieldRow, FieldSection, priorityColor } from './parts';

/**
 * Legacy redirectToReleaseReview: a drawing release's review topic lives on
 * the release approvals page, not here. Returns where to go, or null.
 */
export function releaseReviewUrl(topic: unknown): string | null {
  if (!topic || typeof topic !== 'object') return null;
  const t = topic as { topic_type?: unknown; linked_release_id?: unknown };
  if (t.topic_type === 'release_review' && t.linked_release_id) {
    return `/design/release-approvals/?release_id=${encodeURIComponent(String(t.linked_release_id))}`;
  }
  return null;
}

export interface TopicDetailModalProps {
  topicId: number;
  /** The job order the topic belongs to; null when opened without one (deep link fallback). */
  jobNo: string | null;
  onClose: () => void;
}

/**
 * Legacy viewTopicDetail: "Tartışma: <title>" with the topic's fields, its
 * text and files, the comments and the comment box (shared TopicDiscussion).
 * A release review topic goes to the release approvals page instead.
 */
export function TopicDetailModal({ topicId, jobNo, onClose }: TopicDetailModalProps) {
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();
  const query = useQuery(topicQueryOptions(topicId));
  const topic = query.data as (DiscussionTopic & { job_order?: string | null }) | undefined;
  const redirect = releaseReviewUrl(topic);

  useEffect(() => {
    if (redirect) navigate(redirect);
  }, [redirect, navigate]);

  useEffect(() => {
    if (query.isError) {
      notify.error('Tartışma detayları yüklenirken hata oluştu');
      onClose();
    }
  }, [query.isError, onClose]);

  const resolvedJobNo = jobNo || topic?.job_order || null;

  // A comment written in the thread makes the topic list counts and the Neo summary stale.
  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: [...topicKeys.all, 'list'] });
  };
  const close = () => {
    if (resolvedJobNo) {
      void queryClient.invalidateQueries({ queryKey: discussionSummaryKey(resolvedJobNo) });
    }
    onClose();
  };

  if (redirect) return null;

  return (
    <Modal
      opened
      onClose={close}
      fullScreen
      zIndex={300}
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader
        title={topic ? `Tartışma: ${topic.title ?? ''}` : 'Tartışma'}
        icon="fas fa-comments"
      />
      <ModalBody>
        {!topic ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <>
            <FieldSection title="Tartışma Detayı" icon="fas fa-info-circle">
              <FieldRow label="Başlık" icon="fas fa-heading">
                {topic.title || '-'}
              </FieldRow>
              <FieldRow label="Öncelik" icon="fas fa-exclamation-triangle">
                <span>
                  <StatusBadge color={priorityColor(topic.priority)}>
                    {topic.priority_display || '-'}
                  </StatusBadge>
                </span>
              </FieldRow>
              <FieldRow label="Oluşturan" icon="fas fa-user">
                {topic.created_by_name || '-'}
              </FieldRow>
              <FieldRow label="Oluşturulma" icon="fas fa-calendar">
                {topic.created_at ? formatDateTime(topic.created_at) : '-'}
              </FieldRow>
            </FieldSection>
            <ModalSection title="İçerik" icon="fas fa-align-left">
              <div className={css.topicBody}>
                <RichText
                  content={topic.content}
                  mentionedUsers={topic.mentioned_users_data}
                  mentionedGroups={topic.mentioned_groups_data}
                />
              </div>
            </ModalSection>
            <TopicDiscussion topicId={topicId} showTopicBody={false} onChanged={refreshLists} />
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
