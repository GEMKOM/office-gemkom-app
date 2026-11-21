import {
  Badge,
  Button,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import {
  completeConsultTask,
  deleteConsultTaskFile,
  departmentTaskKeys,
  startConsultTask,
  uncompleteDepartmentTask,
  uploadConsultTaskFile,
  type DepartmentTask,
  type TaskComment,
  type TaskFile,
} from '@/api/projects/departmentTasks';
import { createComment, updateComment } from '@/api/projects/topics';
import {
  confirm,
  downloadFilesAsZip,
  FaIcon,
  FileDropInput,
  FileAttachments,
  notify,
  RichText,
  RichTextEditor,
  type AttachmentFile,
} from '@/ui';
import { useDepartmentTasks } from '../context';
import classes from '../DepartmentTasks.module.css';
import { TabTitle } from './SimpleTabs';

export function toAttachment(file: TaskFile): AttachmentFile {
  return {
    id: file.id,
    url: file.file_url,
    name: file.filename || file.name || 'Dosya',
    size: file.file_size ?? null,
    typeLabel: file.file_type_display || file.file_type || null,
    description: file.name ? `İsim: ${file.name}` : null,
  };
}

/** Legacy getSiblingConsultationStatusBadgeClass. */
export function siblingStatusColor(status: string | undefined): string {
  if (status === 'completed') return 'green';
  if (status === 'in_progress') return 'blue';
  if (status === 'skipped') return 'gray';
  return 'yellow';
}

function Card({
  title,
  icon,
  actions,
  children,
}: {
  title: ReactNode;
  icon: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper withBorder mb="md">
      <Group
        justify="space-between"
        px="md"
        py={8}
        style={{ background: 'var(--gk-surface-subtle)', borderBottom: '1px solid var(--gk-line)' }}
      >
        <Text fw={600} size="sm">
          <FaIcon icon={icon} style={{ marginRight: 8 }} />
          {title}
        </Text>
        {actions}
      </Group>
      <div style={{ padding: 'var(--mantine-spacing-md)' }}>{children}</div>
    </Paper>
  );
}

function ZipButton({ files, name }: { files: TaskFile[]; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="compact-xs"
      variant="outline"
      color="green"
      loading={busy}
      leftSection={<FaIcon icon="fas fa-download" />}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFilesAsZip(files.map(toAttachment), name);
        } finally {
          setBusy(false);
        }
      }}
    >
      Tümünü İndir (ZIP)
    </Button>
  );
}

function Comment({
  comment,
  mine,
  onSaved,
}: {
  comment: TaskComment;
  mine: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.content || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) return void notify.error('Yorum metni boş olamaz');
    setBusy(true);
    try {
      await updateComment(comment.id, { content: text.trim() });
      notify.success('Yorum güncellendi');
      setEditing(false);
      await onSaved();
    } catch {
      notify.error('Yorum güncellenirken hata oluştu');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ borderBottom: '1px solid var(--gk-line)', paddingBottom: 8, marginBottom: 8 }}>
      <Group gap="xs" mb={4}>
        <strong>{comment.created_by_name || comment.created_by_username || 'Kullanıcı'}</strong>
        <small className={classes.muted}>
          {comment.created_at ? new Date(comment.created_at).toLocaleString('tr-TR') : '-'}
        </small>
        {comment.is_edited ? (
          <small className={classes.muted}>
            <FaIcon icon="fas fa-edit" style={{ marginRight: 4 }} />
            Düzenlendi
          </small>
        ) : null}
        {mine && !editing ? (
          <UnstyledButton
            ml="auto"
            title="Düzenle"
            aria-label="Düzenle"
            onClick={() => setEditing(true)}
            className={classes.muted}
          >
            <FaIcon icon="fas fa-pencil-alt" size={11} />
          </UnstyledButton>
        ) : null}
      </Group>
      {editing ? (
        <Stack gap={6}>
          <RichTextEditor
            value={text}
            onChange={setText}
            rows={3}
            autoFocus
            mentionedUsers={comment.mentioned_users_data}
            mentionedGroups={comment.mentioned_groups_data}
          />
          <Group gap="xs">
            <Button
              size="xs"
              loading={busy}
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => void save()}
            >
              Kaydet
            </Button>
            <Button
              size="xs"
              variant="outline"
              color="gray"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              İptal
            </Button>
          </Group>
        </Stack>
      ) : (
        <RichText
          content={comment.content}
          mentionedUsers={comment.mentioned_users_data}
          mentionedGroups={comment.mentioned_groups_data}
        />
      )}
    </div>
  );
}

/** Legacy renderConsultationTab + setupConsultationTabListeners. */
export function ConsultationTab({ task }: { task: DepartmentTask }) {
  const { openDialog, reloadList, applyTask } = useDepartmentTasks();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const summary = task.offer_summary ?? {};
  const shared = task.shared_files ?? [];
  const completion = task.completion_files ?? [];
  const siblings = Array.isArray(task.sibling_consult_tasks) ? task.sibling_consult_tasks : [];
  const topic = task.discussion_topic ?? null;
  const comments = Array.isArray(topic?.comments) ? topic.comments : [];
  const offerLabel = summary.offer_no || 'Teklif';

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState(task.notes || '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /** Every action re-reads the task (legacy re-rendered the tab from a fresh GET). */
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: departmentTaskKeys.detail(task.id) });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const upload = () =>
    run('upload', async () => {
      if (!file) return void notify.warning('Lütfen dosya seçin');
      try {
        await uploadConsultTaskFile(task.id, file, fileName.trim());
        notify.success('Dosya yüklendi');
        setFile(null);
        setFileName('');
        await reload();
      } catch {
        notify.error('Dosya yükleme hatası');
      }
    });

  const start = () =>
    run('start', async () => {
      try {
        await startConsultTask(task.id);
        notify.success('Görev başlatıldı');
        await Promise.all([reload(), reloadList()]);
      } catch (error) {
        notify.error(error, { fallback: 'Başlatma hatası' });
      }
    });

  const complete = () =>
    run('complete', async () => {
      try {
        await completeConsultTask(task.id, notes);
        notify.success('Görev tamamlandı');
        await Promise.all([reload(), reloadList()]);
      } catch (error) {
        notify.error(error, { fallback: 'Tamamlama hatası' });
      }
    });

  const uncomplete = async () => {
    const ok = await confirm({
      message: 'Bu görevin tamamlanma durumunu geri almak istediğinize emin misiniz?',
      confirmLabel: 'Evet, Geri Al',
    });
    if (!ok) return;
    await run('uncomplete', async () => {
      try {
        const response = await uncompleteDepartmentTask(task.id);
        notify.success('Görev tamamlanma durumu geri alındı');
        applyTask(response?.task);
        await reload();
      } catch (error) {
        notify.error(error, { fallback: 'Tamamlanma geri alma hatası' });
      }
    });
  };

  const addComment = () =>
    run('comment', async () => {
      if (!topic?.id) return void notify.error('Tartışma konusu bulunamadı');
      if (!comment.trim()) return void notify.warning('Lütfen yorum metni girin');
      try {
        await createComment({ topic: topic.id, content: comment.trim() });
        notify.success('Yorum eklendi');
        setComment('');
        await reload();
      } catch {
        notify.error('Yorum ekleme hatası');
      }
    });

  return (
    <>
      <TabTitle icon="fas fa-handshake">Teklif Danışma</TabTitle>

      <Card title="Teklif Bilgisi" icon="fas fa-file-invoice-dollar">
        <Grid gap="xs">
          <Grid.Col span={6}>
            <strong>Teklif No:</strong> {summary.offer_no || '-'}
          </Grid.Col>
          <Grid.Col span={6}>
            <strong>Termin:</strong>{' '}
            {summary.delivery_date_requested
              ? new Date(summary.delivery_date_requested).toLocaleDateString('tr-TR')
              : '-'}
          </Grid.Col>
          <Grid.Col span={6}>
            <strong>Teklif Sahibi:</strong> {summary.offer_owner_name || '-'}
          </Grid.Col>
          <Grid.Col span={6}>
            <strong>Müşteri / Firma:</strong> {summary.customer_name || '-'}
          </Grid.Col>
          {task.department === 'logistics' ? (
            <>
              <Grid.Col span={6}>
                <strong>Incoterms:</strong> {summary.incoterms || '-'}
              </Grid.Col>
              <Grid.Col span={6}>
                <strong>Teslim Yeri:</strong> {summary.delivery_place || '-'}
              </Grid.Col>
            </>
          ) : null}
        </Grid>
        <Text mt="xs" size="sm">
          <strong>Başlık:</strong> {summary.title || '-'}
        </Text>
        {summary.description ? (
          <Text mt={4} size="sm">
            <strong>Açıklama:</strong>{' '}
            <span style={{ whiteSpace: 'pre-wrap' }}>{summary.description}</span>
          </Text>
        ) : null}
      </Card>

      {task.description ? (
        <Card title="Danışma Notu" icon="fas fa-sticky-note">
          <pre className={classes.pre}>{task.description}</pre>
        </Card>
      ) : null}

      {task.notes && task.status !== 'in_progress' ? (
        <Card title="Yanıt Notu" icon="fas fa-reply">
          <pre className={classes.pre}>{task.notes}</pre>
        </Card>
      ) : null}

      {shared.length > 0 ? (
        <Card
          title={`Paylaşılan Dosyalar (${shared.length})`}
          icon="fas fa-folder-open"
          actions={<ZipButton files={shared} name={`${offerLabel} - Paylaşılan Dosyalar`} />}
        >
          <FileAttachments files={shared.map(toAttachment)} readOnly />
        </Card>
      ) : null}

      {siblings.length > 0 ? (
        <Card title={`Diğer Departman Danışmaları (${siblings.length})`} icon="fas fa-layer-group">
          <Stack gap={0}>
            {siblings.map((s) => (
              <UnstyledButton
                key={s.id}
                onClick={() => openDialog({ kind: 'sibling', taskId: s.id })}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--gk-line)',
                }}
              >
                <span>
                  <FaIcon
                    icon="fas fa-building"
                    className={classes.muted}
                    style={{ marginRight: 8 }}
                  />
                  {s.department_display}
                </span>
                <Badge color={siblingStatusColor(s.status)}>{s.status_display}</Badge>
              </UnstyledButton>
            ))}
          </Stack>
        </Card>
      ) : null}

      <Card
        title={`Yanıt Dosyaları (${completion.length})`}
        icon="fas fa-upload"
        actions={
          completion.length > 0 ? (
            <ZipButton
              files={completion}
              name={`${offerLabel} - ${task.department_display || 'Yanıt'} Yanıt Dosyaları`}
            />
          ) : null
        }
      >
        <FileAttachments
          files={completion.map(toAttachment)}
          emptyText="Henüz dosya yüklenmemiş."
          onDelete={async (f) => {
            try {
              await deleteConsultTaskFile(task.id, Number(f.id));
              notify.success('Dosya silindi');
              await reload();
            } catch (error) {
              notify.error('Silme hatası');
              throw error;
            }
          }}
        />
        <Grid mt="sm" pt="sm" gap="xs" style={{ borderTop: '1px solid var(--gk-line)' }}>
          <Grid.Col span={5}>
            <FileDropInput
              size="xs"
              aria-label="Dosya"
              placeholder="Dosya seçin veya sürükleyin"
              value={file}
              onChange={setFile}
              clearable
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <TextInput
              size="xs"
              placeholder="Dosya adı (opsiyonel)"
              value={fileName}
              onChange={(e) => setFileName(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <Button
              size="xs"
              color="green"
              fullWidth
              loading={busy === 'upload'}
              leftSection={<FaIcon icon="fas fa-upload" />}
              onClick={() => void upload()}
            >
              Yükle
            </Button>
          </Grid.Col>
        </Grid>
      </Card>

      {task.status === 'pending' ? (
        <Button
          mb="md"
          loading={busy === 'start'}
          leftSection={<FaIcon icon="fas fa-play" />}
          onClick={() => void start()}
        >
          Göreve Başla
        </Button>
      ) : null}
      {task.status === 'in_progress' ? (
        <Stack gap="xs" mb="md">
          <Textarea
            label={
              <>
                <FaIcon icon="fas fa-sticky-note" style={{ marginRight: 4 }} />
                Yanıt Notu
              </>
            }
            rows={3}
            placeholder="Değerlendirme notlarınızı yazın..."
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
          <div>
            <Button
              color="green"
              loading={busy === 'complete'}
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => void complete()}
            >
              Görevi Tamamla
            </Button>
          </div>
        </Stack>
      ) : null}
      {task.status === 'completed' ? (
        <Button
          mb="md"
          color="yellow"
          loading={busy === 'uncomplete'}
          leftSection={<FaIcon icon="fas fa-undo" />}
          onClick={() => void uncomplete()}
        >
          Tamamlanmayı Geri Al
        </Button>
      ) : null}

      <Card title={`Tartışma Yorumları (${comments.length})`} icon="fas fa-comments">
        {topic?.id ? (
          <>
            {comments.length === 0 ? (
              <Text c="dimmed" mb="md">
                Henüz yorum yok.
              </Text>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {comments.map((c) => (
                  <Comment
                    key={c.id}
                    comment={c}
                    mine={Boolean(user?.username) && c.created_by_username === user.username}
                    onSaved={async () => {
                      await reload();
                    }}
                  />
                ))}
              </div>
            )}
            <RichTextEditor
              label={
                <>
                  <FaIcon icon="fas fa-pen" style={{ marginRight: 4 }} />
                  Yeni Yorum
                </>
              }
              placeholder="Yorum yazın... (@ile kullanıcı etiketleyin)"
              rows={3}
              value={comment}
              onChange={setComment}
            />
            <Button
              mt="xs"
              size="xs"
              loading={busy === 'comment'}
              leftSection={<FaIcon icon="fas fa-paper-plane" />}
              onClick={() => void addComment()}
            >
              Yorum Ekle
            </Button>
          </>
        ) : (
          <Text c="dimmed">Bu görev için tartışma konusu bulunamadı.</Text>
        )}
      </Card>
    </>
  );
}
