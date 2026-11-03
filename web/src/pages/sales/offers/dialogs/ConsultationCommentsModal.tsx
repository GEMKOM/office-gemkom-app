import { Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createComment, topicCommentsQueryOptions, topicKeys } from '@/api/projects/topics';
import { consultationTaskQueryOptions } from '@/api/sales/offers';
import {
  FaIcon,
  ModalBody,
  ModalHeader,
  modalClassNames,
  notify,
  RichText,
  RichTextEditor,
} from '@/ui';
import css from '../OffersPage.module.css';

/** Legacy showConsultationCommentsModal: the task's discussion comments and a box to add one. */
export function ConsultationCommentsModal({
  offerId,
  taskId,
  onClose,
}: {
  offerId: number;
  taskId: number;
  onClose: () => void;
}) {
  const task = useQuery(consultationTaskQueryOptions(offerId, taskId));
  const topicId = task.data?.discussion_topic?.id ?? null;

  useEffect(() => {
    if (task.isError) {
      notify.error(
        task.error instanceof Error && task.error.message
          ? task.error.message
          : 'Danışma görevi yüklenemedi',
      );
      onClose();
    } else if (task.data && !topicId) {
      notify.warning('Bu görev için tartışma konusu bulunamadı');
      onClose();
    }
  }, [task.isError, task.error, task.data, topicId, onClose]);

  if (!task.data || !topicId) return null;
  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader
        title={`${task.data.title || 'Danışma Görevi'} - Yorumlar`}
        icon="fas fa-comments"
      />
      <ModalBody>
        <Comments topicId={topicId} />
      </ModalBody>
    </Modal>
  );
}

function Comments({ topicId }: { topicId: number }) {
  const queryClient = useQueryClient();
  const comments = useQuery(topicCommentsQueryOptions(topicId));
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const list = comments.data ?? [];

  const post = async () => {
    const content = text.trim();
    if (!content) {
      notify.warning('Lütfen yorum metni girin');
      return;
    }
    setPosting(true);
    try {
      await createComment({ topic: topicId, content });
      notify.success('Yorum eklendi');
      setText('');
      await queryClient.invalidateQueries({ queryKey: topicKeys.comments(topicId) });
    } catch (error) {
      console.error('Error creating consultation comment:', error);
      notify.error('Yorum eklenirken hata oluştu');
    } finally {
      setPosting(false);
    }
  };

  if (comments.isPending) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  return (
    <Stack gap="md">
      <Text fw={600}>
        <FaIcon icon="fas fa-comments" /> Yorumlar ({list.length})
      </Text>
      {list.length ? (
        <div>
          {list.map((c) => (
            <div key={c.id} className={css.comment}>
              <Group gap="xs" mb={4}>
                <Text fw={600} size="sm">
                  {String(c.created_by_name || c.created_by_username || 'Kullanıcı')}
                </Text>
                <Text size="xs" c="dimmed">
                  {c.created_at ? new Date(c.created_at).toLocaleString('tr-TR') : '-'}
                </Text>
              </Group>
              <RichText
                content={c.content}
                mentionedUsers={c.mentioned_users_data}
                mentionedGroups={c.mentioned_groups_data}
              />
            </div>
          ))}
        </div>
      ) : (
        <Text c="dimmed" ta="center" py="md">
          Henüz yorum yok.
        </Text>
      )}
      <div className={css.commentForm}>
        <Text size="sm" fw={500} mb={4}>
          <FaIcon icon="fas fa-pen" /> Yeni Yorum
        </Text>
        <RichTextEditor value={text} onChange={setText} placeholder="Yorum yazın..." />
        <Button
          mt="xs"
          size="xs"
          loading={posting}
          leftSection={<FaIcon icon="fas fa-paper-plane" />}
          onClick={() => void post()}
        >
          Yorum Ekle
        </Button>
      </div>
    </Stack>
  );
}
