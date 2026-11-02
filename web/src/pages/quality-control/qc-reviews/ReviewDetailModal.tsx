import { Anchor, Badge, Button, Group, Stack, Table, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import {
  useCreateDiscussionComment,
  type DiscussionTopic,
  type QCReview,
} from '@/api/quality-control/qcReviews';
import { DetailModal, FaIcon, notify, RichText } from '@/ui';
import { isPendingReview, NcrLink, OpenNcrCount } from './columns';

export interface PartRow {
  position_no?: unknown;
  drawing_no?: unknown;
  location?: unknown;
  quantity_inspected?: unknown;
  notes?: unknown;
  [key: string]: unknown;
}

const isRow = (row: unknown): row is PartRow => Boolean(row) && typeof row === 'object';

/** Legacy normalizePartDataRows: an array, { parts: [...] }, a numbered object, or one part. */
export function partRows(partData: unknown): PartRow[] {
  if (partData == null) return [];
  if (Array.isArray(partData)) return partData.filter(isRow);
  if (typeof partData === 'object') {
    const data = partData as Record<string, unknown>;
    if (Array.isArray(data.parts)) return data.parts.filter(isRow);
    const keys = Object.keys(data);
    if (keys.length === 0) return [];
    if (keys.every((k) => /^\d+$/.test(k))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => data[k])
        .filter(isRow);
    }
    return [data];
  }
  return [];
}

const cell = (value: unknown) => (value != null && value !== '' ? String(value) : '-');

function PartTable({ partData }: { partData: unknown }) {
  const rows = partRows(partData);
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Parça bilgisi bulunamadı
      </Text>
    );
  }
  // The # column only when there is more than one part, as legacy.
  const numbered = rows.length > 1;
  return (
    <Table striped withTableBorder withColumnBorders fz="sm" verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          {numbered ? <Table.Th w={48}>#</Table.Th> : null}
          <Table.Th w={90}>Pozisyon No</Table.Th>
          <Table.Th w={180}>Çizim No</Table.Th>
          <Table.Th w={140}>Konum</Table.Th>
          <Table.Th w={110}>İncelenen Miktar</Table.Th>
          <Table.Th>Notlar</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row, index) => (
          <Table.Tr key={index}>
            {numbered ? <Table.Td>{index + 1}</Table.Td> : null}
            <Table.Td>{cell(row.position_no)}</Table.Td>
            <Table.Td>{cell(row.drawing_no)}</Table.Td>
            <Table.Td>{cell(row.location)}</Table.Td>
            <Table.Td>{cell(row.quantity_inspected)}</Table.Td>
            <Table.Td>{cell(row.notes)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function commentDate(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('tr-TR');
}

/** Legacy renderDiscussionTopicCustomHtml + setupQcReviewDiscussionListeners. */
function Discussion({
  topic,
  onCommented,
}: {
  topic: DiscussionTopic | null;
  onCommented: () => void;
}) {
  const [text, setText] = useState('');
  const create = useCreateDiscussionComment();

  if (!topic?.id) {
    return (
      <Text size="sm" c="dimmed">
        Bu inceleme için tartışma konusu bulunamadı.
      </Text>
    );
  }
  const topicId = topic.id;
  const comments = Array.isArray(topic.comments) ? topic.comments : [];
  const attachments = Array.isArray(topic.attachments_data) ? topic.attachments_data : [];

  const add = async () => {
    const content = text.trim();
    if (!content) {
      notify.warning('Lütfen yorum metni girin');
      return;
    }
    try {
      await create.mutateAsync({ topic: topicId, content });
      notify.success('Yorum eklendi');
      setText('');
      onCommented();
    } catch (error) {
      console.error('Error adding QC review discussion comment:', error);
      notify.error('Yorum ekleme hatası');
    }
  };

  return (
    <Stack gap="sm">
      <Group gap={6}>
        <Text size="sm" fw={600}>
          {topic.title || ''}
        </Text>
        {topic.priority_display ? (
          <Badge variant="light" color="gray">
            {topic.priority_display}
          </Badge>
        ) : null}
        {topic.topic_type_display ? (
          <Badge variant="light" color="gray">
            {topic.topic_type_display}
          </Badge>
        ) : null}
      </Group>
      {topic.content ? (
        <RichText
          content={topic.content}
          mentionedUsers={topic.mentioned_users_data}
          mentionedGroups={topic.mentioned_groups_data}
        />
      ) : null}
      {attachments.length ? (
        <Stack gap={2}>
          <Text size="xs" fw={600}>
            Ekler
          </Text>
          {attachments.map((a, i) => (
            <Group key={i} gap={6}>
              <FaIcon icon="fas fa-paperclip" />
              <Anchor
                href={a.file_url || a.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
              >
                {a.filename || a.name || 'Dosya'}
              </Anchor>
            </Group>
          ))}
        </Stack>
      ) : null}
      <Stack gap="xs">
        {comments.length === 0 ? (
          <Text size="sm" c="dimmed">
            Henüz yorum yok.
          </Text>
        ) : (
          comments.map((comment, i) => (
            <div
              key={comment.id ?? i}
              style={{ borderBottom: '1px solid var(--gk-line, #e5e7eb)', paddingBottom: 8 }}
            >
              <Group gap="xs" mb={2}>
                <Text size="sm" fw={600}>
                  {comment.created_by_name || comment.created_by_username || 'Kullanıcı'}
                </Text>
                <Text size="xs" c="dimmed">
                  {commentDate(comment.created_at)}
                </Text>
              </Group>
              <RichText
                content={comment.content}
                mentionedUsers={comment.mentioned_users_data}
                mentionedGroups={comment.mentioned_groups_data}
              />
            </div>
          ))
        )}
      </Stack>
      <Textarea
        label="Yeni Yorum"
        placeholder="Yorum yazın..."
        rows={3}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <Group>
        <Button
          size="xs"
          loading={create.isPending}
          leftSection={<FaIcon icon="fas fa-paper-plane" />}
          onClick={() => void add()}
        >
          Yorum Ekle
        </Button>
      </Group>
    </Stack>
  );
}

export interface ReviewDetailModalProps {
  review: QCReview | undefined;
  loading: boolean;
  canDecide: boolean;
  onClose: () => void;
  onDecide: (review: QCReview, approve: boolean) => void;
  onCommented: () => void;
}

/** The "KK İnceleme Detayları" modal (legacy showReviewDetails). */
export function ReviewDetailModal({
  review,
  loading,
  canDecide,
  onClose,
  onDecide,
  onCommented,
}: ReviewDetailModalProps) {
  const topic = review ? review.discussion_topic_data || review.discussion_topic || null : null;
  const comments = Array.isArray(topic?.comments) ? topic.comments.length : 0;
  const decidable = Boolean(review) && canDecide && isPendingReview(review);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={review ? `KK İnceleme #${review.id}` : 'KK İnceleme Detayları'}
      icon="fas fa-search"
      size="lg"
      loading={loading}
      sections={
        review
          ? [
              {
                title: 'Genel Bilgiler',
                icon: 'fas fa-info-circle',
                fields: [
                  { label: 'İş Emri', value: review.job_order },
                  { label: 'Görev', value: review.task_title },
                  { label: 'NCR No', render: <NcrLink ncrNumber={review.ncr_number} /> },
                  { label: 'Açık NCR', render: <OpenNcrCount count={review.open_ncr_count} /> },
                ],
              },
              {
                title: 'Parça Bilgileri',
                icon: 'fas fa-cog',
                content: <PartTable partData={review.part_data} />,
              },
              {
                title: 'Yorum',
                icon: 'fas fa-comment',
                fields: [{ label: 'Yorum', value: review.comment, span: 12 }],
              },
              {
                title: `Tartışma Yorumları (${comments})`,
                icon: 'fas fa-comments',
                content: <Discussion topic={topic} onCommented={onCommented} />,
              },
            ]
          : []
      }
      footerActions={
        decidable && review ? (
          <>
            <Button
              color="red"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={() => onDecide(review, false)}
            >
              Reddet
            </Button>
            <Button
              color="green"
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => onDecide(review, true)}
            >
              Onayla
            </Button>
          </>
        ) : null
      }
    />
  );
}
