import { Button, Input, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createTopic,
  topicKeys,
  topicListQueryOptions,
  uploadTopicAttachment,
} from '@/api/projects/topics';
import { formatDateTime } from '@/lib/format';
import {
  FaIcon,
  FileDropzone,
  FormModal,
  ModalSection,
  notify,
  RichTextEditor,
  StatusBadge,
} from '@/ui';
import { DiscussionSummaryCard } from './DiscussionSummaryCard';
import css from './JobOrderDetail.module.css';
import { EmptyState, ErrorState, fieldErrors, LoadingState, priorityColor, Section } from './parts';

export const TOPIC_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
];

/** Legacy listTopics({ job_order, ordering: '-created_at' }). */
export const jobTopicsQueryOptions = (jobNo: string) =>
  topicListQueryOptions({ job_order: jobNo, ordering: '-created_at' });

interface TopicForm {
  title: string;
  content: string;
  priority: string;
}

/** Legacy showCreateTopicModal: title, rich text, priority, optional files. */
export function CreateTopicModal({ jobNo, onClose }: { jobNo: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const required = (v: string) => (v.trim() ? null : 'Bu alan gereklidir');
  const form = useForm<TopicForm>({
    initialValues: { title: '', content: '', priority: 'normal' },
    validate: { title: required, content: required, priority: required },
  });

  const save = async (values: TopicForm) => {
    setBusy(true);
    try {
      const topic = await createTopic({ job_order: jobNo, ...values });
      if (!topic?.id) throw new Error('Topic ID not found in response');
      let failed = false;
      for (const file of files) {
        try {
          await uploadTopicAttachment(topic.id, file);
        } catch (fileError) {
          console.error('Error uploading files:', fileError);
          failed = true;
          break;
        }
      }
      if (failed) notify.warning('Tartışma oluşturuldu ancak bazı dosyalar yüklenemedi');
      onClose();
      notify.success('Tartışma başarıyla oluşturuldu');
      await queryClient.invalidateQueries({ queryKey: topicKeys.all });
    } catch (error) {
      console.error('Error creating topic:', error);
      notify.error(fieldErrors(error, 'Tartışma oluşturulurken hata oluştu'));
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Tartışma Oluştur"
      icon="fas fa-plus-circle"
      size="lg"
      submitting={busy}
      onSubmit={form.onSubmit((values) => void save(values))}
    >
      <ModalSection title="Tartışma Bilgileri" icon="fas fa-info-circle">
        <Stack gap="sm">
          <TextInput
            label="Başlık"
            withAsterisk
            description="Tartışma başlığı"
            {...form.getInputProps('title')}
          />
          <RichTextEditor
            label="İçerik"
            withAsterisk
            description="Tartışma içeriği (biçimlendirme ve @etiketleme destekli)"
            rows={5}
            value={form.values.content}
            error={form.errors.content}
            onChange={(value) => form.setFieldValue('content', value)}
          />
          <Select
            label="Öncelik"
            withAsterisk
            data={TOPIC_PRIORITY_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('priority')}
          />
          <Input.Wrapper label="Dosyalar (Opsiyonel)" description="Birden fazla dosya seçebilirsiniz.">
            <FileDropzone
              compact
              onFiles={(picked) => setFiles((list) => [...list, ...picked])}
            />
          </Input.Wrapper>
          {files.length ? (
            <ul className={css.chips} aria-label="Eklenecek dosyalar">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className={css.chip}>
                  <FaIcon icon="fas fa-file" />
                  {file.name}
                  <button
                    type="button"
                    className={css.chipRemove}
                    aria-label={`${file.name} kaldır`}
                    onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                  >
                    <FaIcon icon="fas fa-times" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Stack>
      </ModalSection>
    </FormModal>
  );
}

/** Tartışmalar: the Neo summary, the job's topics, Yeni Tartışma (legacy renderTopicsUI). */
export function TopicsSection({
  jobNo,
  openTopic,
}: {
  jobNo: string;
  openTopic: (topicId: number) => void;
}) {
  const query = useQuery(jobTopicsQueryOptions(jobNo));
  const [creating, setCreating] = useState(false);
  const topics = query.data ?? [];

  return (
    <Section
      title={query.isSuccess ? `Tartışmalar (${topics.length})` : 'Tartışmalar'}
      icon="fas fa-comments"
      action={
        query.isSuccess ? (
          <Button
            size="xs"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setCreating(true)}
          >
            Yeni Tartışma
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState>Tartışmalar yüklenirken hata oluştu.</ErrorState>
      ) : (
        <>
          {/* Covers the whole subtree, so it shows even without topics of this job. */}
          <DiscussionSummaryCard jobNo={jobNo} openTopic={openTopic} />
          {topics.length === 0 ? (
            <EmptyState icon="fas fa-comments">Henüz tartışma yok.</EmptyState>
          ) : (
            topics.map((topic) => (
              <div key={topic.id} className={css.topicCard} data-topic-id={topic.id}>
                <button
                  type="button"
                  className={css.topicTitle}
                  onClick={() => openTopic(topic.id)}
                >
                  {topic.title || 'Başlıksız'}
                </button>
                <div className={css.topicMeta}>
                  <StatusBadge color={priorityColor(topic.priority)}>
                    {topic.priority_display || topic.priority}
                  </StatusBadge>
                  <span>{topic.created_by_name || 'Bilinmeyen'}</span>
                  <span>•</span>
                  <span>{topic.created_at ? formatDateTime(topic.created_at) : '-'}</span>
                  <span>•</span>
                  <span>
                    <FaIcon icon="fas fa-comments" /> {topic.comment_count || 0} yorum
                  </span>
                  <span>•</span>
                  <span>
                    <FaIcon icon="fas fa-users" /> {topic.participant_count || 0} katılımcı
                  </span>
                </div>
              </div>
            ))
          )}
        </>
      )}
      {creating ? <CreateTopicModal jobNo={jobNo} onClose={() => setCreating(false)} /> : null}
    </Section>
  );
}
