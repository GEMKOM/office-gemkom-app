import { Button, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  isgIssueFilesQueryOptions,
  isgIssueQueryOptions,
  useDeleteIsgIssueFile,
  type IsgIssue,
} from '@/api/isg/issues';
import { DetailModal, downloadFilesAsZip, FaIcon, FileAttachments, notify } from '@/ui';
import { TopicDiscussion } from '../../shared/topic-discussion/TopicDiscussion';
import { Assignees, DueDate, IsgSeverityBadge, IsgStatusBadge, toAttachmentFile } from './columns';

export type IsgDetailAction = 'start' | 'resolve' | 'edit' | 'reopen' | 'close' | 'upload';

export interface IsgIssueDetailModalProps {
  issueId: number;
  /** False while a modal opened from here is on top: one modal at a time. */
  opened: boolean;
  canManage: boolean;
  /** May the user work this issue (İSG, or one of its assignees)? */
  canAct: (issue: IsgIssue) => boolean;
  onAction: (action: IsgDetailAction, issue: IsgIssue) => void;
  onClose: () => void;
}

function MultiLine({ text }: { text?: string | null }) {
  return (
    <div style={{ whiteSpace: 'pre-line', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
      {text || '-'}
    </div>
  );
}

/** The full-screen issue (legacy showIssueDetails): facts, files, discussion and the workflow buttons. */
export function IsgIssueDetailModal({
  issueId,
  opened,
  canManage,
  canAct,
  onAction,
  onClose,
}: IsgIssueDetailModalProps) {
  const detail = useQuery(isgIssueQueryOptions(issueId));
  const files = useQuery(isgIssueFilesQueryOptions(issueId));
  const deleteFile = useDeleteIsgIssueFile();
  const [zipping, setZipping] = useState(false);
  const issue = detail.data;
  const attachments = (files.data ?? []).map(toAttachmentFile);

  const downloadAll = async () => {
    if (!issue) return;
    setZipping(true);
    try {
      notify.info('Dosyalar indiriliyor...');
      const result = await downloadFilesAsZip(attachments, issue.issue_number, 'ISG');
      if (result.status === 'empty') notify.warning('İndirilecek dosya yok');
      else if (result.status === 'nothing-added')
        notify.warning('Zip içine eklenecek geçerli dosya bulunamadı');
      else notify.success(`${result.count} dosya zip olarak indirildi`);
    } catch (error) {
      console.error('Error creating zip file:', error);
      notify.error('Zip dosyası oluşturulurken hata oluştu');
    } finally {
      setZipping(false);
    }
  };

  const actions = issue ? (
    <>
      {issue.status === 'open' && canAct(issue) ? (
        <Button
          variant="default"
          leftSection={<FaIcon icon="fas fa-play" />}
          onClick={() => onAction('start', issue)}
        >
          İşleme Al
        </Button>
      ) : null}
      {['open', 'in_progress'].includes(issue.status) && canAct(issue) ? (
        <Button
          variant="default"
          leftSection={<FaIcon icon="fas fa-check" />}
          onClick={() => onAction('resolve', issue)}
        >
          Giderildi
        </Button>
      ) : null}
      {canManage ? (
        <Button
          variant="default"
          leftSection={<FaIcon icon="fas fa-edit" />}
          onClick={() => onAction('edit', issue)}
        >
          Düzenle
        </Button>
      ) : null}
      {canManage && ['resolved', 'closed', 'cancelled'].includes(issue.status) ? (
        <Button
          variant="default"
          leftSection={<FaIcon icon="fas fa-rotate-left" />}
          onClick={() => onAction('reopen', issue)}
        >
          Yeniden Aç
        </Button>
      ) : null}
      {canManage && ['open', 'in_progress', 'resolved'].includes(issue.status) ? (
        <Button
          color="green"
          leftSection={<FaIcon icon="fas fa-lock" />}
          onClick={() => onAction('close', issue)}
        >
          Kapat ve Onayla
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <DetailModal
      opened={opened}
      onClose={onClose}
      size="full"
      icon="fas fa-helmet-safety"
      title={issue ? `${issue.issue_number} — ${issue.title}` : 'İSG Bildirimi'}
      subtitle={
        issue
          ? [issue.category_display, issue.location].filter(Boolean).join(' · ') || undefined
          : undefined
      }
      loading={detail.isPending}
      footerActions={actions}
      sections={
        issue
          ? [
              {
                title: 'Genel Bilgiler',
                icon: 'fas fa-circle-info',
                fields: [
                  { label: 'Durum', span: 4, render: <IsgStatusBadge issue={issue} /> },
                  { label: 'Önem Derecesi', span: 4, render: <IsgSeverityBadge issue={issue} /> },
                  { label: 'Kategori', span: 4, value: issue.category_display },
                  { label: 'Yer', span: 4, value: issue.location },
                  { label: 'Termin', span: 4, render: <DueDate issue={issue} detail /> },
                  { label: 'Bildiren', span: 4, value: issue.created_by_name },
                  { label: 'Oluşturulma', span: 4, value: issue.created_at, type: 'datetime' },
                  { label: 'Açıklama', span: 12, render: <MultiLine text={issue.description} /> },
                ],
              },
              {
                title: 'Atanan Kişiler',
                icon: 'fas fa-users',
                content: <Assignees issue={issue} />,
              },
              {
                title: 'Yapılan İşlem',
                icon: 'fas fa-screwdriver-wrench',
                hidden: !(issue.corrective_action || issue.resolved_at),
                fields: [
                  {
                    label: 'Açıklama',
                    span: 12,
                    render: <MultiLine text={issue.corrective_action} />,
                  },
                  { label: 'Bildiren', span: 6, value: issue.resolved_by_name },
                  { label: 'Tarih', span: 6, value: issue.resolved_at, type: 'datetime' },
                ],
              },
              {
                title: 'Kapanış',
                icon: 'fas fa-lock',
                hidden: !issue.closed_at,
                fields: [
                  {
                    label: 'Kapanış Notu',
                    span: 12,
                    render: <MultiLine text={issue.closing_note} />,
                  },
                  { label: 'Kapatan', span: 6, value: issue.closed_by_name },
                  { label: 'Tarih', span: 6, value: issue.closed_at, type: 'datetime' },
                ],
              },
              {
                title: 'Dosyalar',
                icon: 'fas fa-paperclip',
                content: (
                  <FileAttachments
                    layout="grid"
                    files={attachments}
                    loading={files.isPending}
                    error={files.error}
                    title={
                      <Text span size="sm" c="dimmed" fw={400}>
                        Bulgu fotoğrafları ve ilgili dokümanlar
                      </Text>
                    }
                    actions={
                      <>
                        <Button
                          size="xs"
                          variant="default"
                          loading={zipping}
                          leftSection={<FaIcon icon="fas fa-file-zipper" />}
                          onClick={() => void downloadAll()}
                        >
                          Tümünü İndir (ZIP)
                        </Button>
                        {canAct(issue) ? (
                          <Button
                            size="xs"
                            leftSection={<FaIcon icon="fas fa-upload" />}
                            onClick={() => onAction('upload', issue)}
                          >
                            Dosya Yükle
                          </Button>
                        ) : null}
                      </>
                    }
                    onDelete={async (file) => {
                      await deleteFile.mutateAsync({ issueId: issue.id, fileId: Number(file.id) });
                      notify.success('Dosya silindi');
                    }}
                  />
                ),
              },
              {
                title: 'Tartışma',
                icon: 'fas fa-comments',
                content: issue.discussion_topic_id ? (
                  <TopicDiscussion topicId={issue.discussion_topic_id} showTopicBody={false} />
                ) : (
                  <Text c="dimmed" size="sm">
                    Bu bildirim için tartışma konusu bulunamadı.
                  </Text>
                ),
              },
            ]
          : []
      }
    />
  );
}
