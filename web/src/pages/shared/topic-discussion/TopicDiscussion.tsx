import { ActionIcon, Avatar, Button, Group, Loader, Text, Tooltip } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  topicCommentsQueryOptions,
  topicKeys,
  topicQueryOptions,
  uploadTopicAttachment,
  useEditComment,
  usePostComment,
  type DiscussionAttachment,
  type DiscussionComment,
} from '@/api/projects/topics';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import {
  FaIcon,
  FileAttachments,
  FileDropzone,
  formatFileSize,
  notify,
  RichText,
  RichTextEditor,
  type AttachmentFile,
} from '@/ui';
import classes from './TopicDiscussion.module.css';

export function toAttachmentFile(att: DiscussionAttachment): AttachmentFile {
  return {
    id: att.id,
    url: att.file_url || att.file || '',
    name: att.name || 'Dosya',
    size: att.size ?? att.file_size ?? null,
    uploadedBy: att.uploaded_by || 'Bilinmeyen',
    uploadedAt: att.uploaded_at ?? null,
  };
}

/** Files picked for a comment, not sent yet: name, size and a remove button. */
function StagedFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className={classes.chips} aria-label="Eklenecek dosyalar">
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} className={classes.chip}>
          <FaIcon icon="fas fa-paperclip" />
          <span className={classes.chipName}>{file.name}</span>
          <span className={classes.chipSize}>{formatFileSize(file.size)}</span>
          <button
            type="button"
            className={classes.chipRemove}
            aria-label={`${file.name} kaldır`}
            onClick={() => onRemove(index)}
          >
            <FaIcon icon="fas fa-times" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CommentEditForm({
  topicId,
  comment,
  onDone,
  onChanged,
}: {
  topicId: number;
  comment: DiscussionComment;
  onDone: () => void;
  onChanged?: () => void;
}) {
  const [content, setContent] = useState(comment.content || '');
  const [kept, setKept] = useState(comment.attachments_data ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const edit = useEditComment(topicId);

  const save = async () => {
    const text = content.trim();
    if (!text) {
      notify.error('Yorum metni boş olamaz');
      return;
    }
    const keptIds = new Set(kept.map((att) => att.id));
    try {
      await edit.mutateAsync({
        commentId: comment.id,
        content: text,
        removeAttachmentIds: (comment.attachments_data ?? [])
          .map((att) => att.id)
          .filter((id) => !keptIds.has(id)),
        files,
      });
      notify.success('Yorum güncellendi');
      onChanged?.();
      onDone();
    } catch (error) {
      console.error('Error saving comment edit:', error);
      notify.error('Yorum güncellenirken hata oluştu');
    }
  };

  return (
    <div className={classes.editForm}>
      <RichTextEditor
        aria-label="Yorumu düzenle"
        value={content}
        onChange={setContent}
        mentionedUsers={comment.mentioned_users_data}
        mentionedGroups={comment.mentioned_groups_data}
        autoFocus
      />
      {kept.length ? (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Mevcut Ekler
          </Text>
          <ul className={classes.chips} aria-label="Mevcut ekler">
            {kept.map((att) => (
              <li key={att.id} className={classes.chip}>
                <FaIcon icon="fas fa-file" />
                <span className={classes.chipName}>{att.name || 'Dosya'}</span>
                <button
                  type="button"
                  className={classes.chipRemove}
                  aria-label={`${att.name || 'Dosya'} kaldır`}
                  onClick={() => setKept((list) => list.filter((entry) => entry.id !== att.id))}
                >
                  <FaIcon icon="fas fa-times" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <FileDropzone
        compact
        hint="Yeni ekler:"
        onFiles={(picked) => setFiles((list) => [...list, ...picked])}
      />
      <StagedFiles
        files={files}
        onRemove={(index) => setFiles((list) => list.filter((_, i) => i !== index))}
      />
      <Group gap="xs">
        <Button
          size="xs"
          leftSection={<FaIcon icon="fas fa-check" />}
          loading={edit.isPending}
          onClick={() => void save()}
        >
          Kaydet
        </Button>
        <Button size="xs" variant="default" disabled={edit.isPending} onClick={onDone}>
          İptal
        </Button>
      </Group>
    </div>
  );
}

function CommentItem({
  topicId,
  comment,
  mine,
  highlighted,
  onChanged,
}: {
  topicId: number;
  comment: DiscussionComment;
  mine: boolean;
  highlighted: boolean;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const name = comment.created_by_name || comment.created_by_username || 'Bilinmeyen';
  const attachments = comment.attachments_data ?? [];
  return (
    <article
      className={classes.comment}
      data-comment-id={comment.id}
      data-highlight={highlighted || undefined}
    >
      <Avatar name={name} color="initials" size={32} radius="xl" />
      <div className={classes.commentMain}>
        <header className={classes.commentHead}>
          <span className={classes.author}>{name}</span>
          <span className={classes.when}>
            {comment.created_at ? formatDateTime(comment.created_at) : '-'}
          </span>
          {comment.is_edited ? (
            <span className={classes.when}>
              <FaIcon icon="fas fa-edit" /> Düzenlendi
            </span>
          ) : null}
          {mine && !editing ? (
            <Tooltip label="Düzenle" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                className={classes.editButton}
                aria-label="Yorumu düzenle"
                onClick={() => setEditing(true)}
              >
                <FaIcon icon="fas fa-pencil-alt" />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </header>
        {editing ? (
          <CommentEditForm
            topicId={topicId}
            comment={comment}
            onDone={() => setEditing(false)}
            onChanged={onChanged}
          />
        ) : (
          <>
            <RichText
              content={comment.content}
              mentionedUsers={comment.mentioned_users_data}
              mentionedGroups={comment.mentioned_groups_data}
            />
            {attachments.length ? (
              <div className={classes.commentFiles}>
                <FileAttachments
                  files={attachments.map(toAttachmentFile)}
                  readOnly
                  thumbnailSize={36}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

export interface TopicDiscussionProps {
  topicId: number;
  /** Show the topic's own text above the comments. Default true. */
  showTopicBody?: boolean;
  /** Scroll to this comment and mark it once the thread has loaded. */
  highlightCommentId?: number | null;
  /** A comment was posted or edited, or a file uploaded. */
  onChanged?: () => void;
}

/**
 * A full discussion (legacy components/topic-discussion): the topic text, its
 * files, the comments with their files, posting with @mentions and files, and
 * editing your own comments. İSG issues, drawing releases and Tartışmalarım
 * all show a thread through this.
 */
export function TopicDiscussion({
  topicId,
  showTopicBody = true,
  highlightCommentId = null,
  onChanged,
}: TopicDiscussionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topic = useQuery(topicQueryOptions(topicId));
  const comments = useQuery(topicCommentsQueryOptions(topicId));
  const post = usePostComment(topicId);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Bring the highlighted comment into view inside the scrolling list, once.
  const scrolledTo = useRef<number | null>(null);
  const loaded = Boolean(comments.data);
  useEffect(() => {
    if (!highlightCommentId || !loaded || scrolledTo.current === highlightCommentId) return;
    scrolledTo.current = highlightCommentId;
    const el = listRef.current?.querySelector(`[data-comment-id="${highlightCommentId}"]`);
    // Wait for the modal's open transition, or the scroll lands mid-animation.
    const timer = window.setTimeout(
      () => el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [highlightCommentId, loaded]);

  if (topic.isPending || comments.isPending) {
    return (
      <div className={classes.state}>
        <Loader size="sm" color="gray" />
      </div>
    );
  }
  if (topic.isError || comments.isError) {
    return (
      <Text c="red" size="sm" role="alert">
        Tartışma yüklenirken hata oluştu.
      </Text>
    );
  }

  const list = comments.data;
  const topicFiles = (topic.data.attachments_data ?? []).map(toAttachmentFile);

  const submit = async () => {
    const content = draft.trim();
    if (!content) {
      notify.error('Lütfen yorum metni girin');
      return;
    }
    try {
      const { failedFiles } = await post.mutateAsync({ content, files });
      if (failedFiles) notify.warning('Yorum eklendi ancak bazı dosyalar yüklenemedi');
      else notify.success('Yorum eklendi');
      setDraft('');
      setFiles([]);
      onChanged?.();
    } catch (error) {
      console.error('Error adding comment:', error);
      notify.error('Yorum eklenirken hata oluştu');
    }
  };

  return (
    <div className={classes.root}>
      {showTopicBody && topic.data.content ? (
        <section>
          <h4 className={classes.heading}>
            <FaIcon icon="fas fa-align-left" /> Konu İçeriği
          </h4>
          <div className={classes.topicBody}>
            <RichText
              content={topic.data.content}
              mentionedUsers={topic.data.mentioned_users_data}
              mentionedGroups={topic.data.mentioned_groups_data}
            />
          </div>
        </section>
      ) : null}

      <section>
        <FileAttachments
          title="Konu Ekleri"
          layout="grid"
          files={topicFiles}
          emptyText="Konuya eklenmiş dosya yok."
          onUpload={(file, context) => uploadTopicAttachment(topicId, file, context)}
          onUploaded={({ uploaded, failed }) => {
            if (uploaded) {
              notify[failed ? 'warning' : 'success'](
                failed
                  ? `${uploaded} dosya yüklendi, ${failed} dosya yüklenemedi`
                  : 'Dosyalar yüklendi',
              );
              void queryClient.invalidateQueries({ queryKey: topicKeys.detail(topicId) });
              onChanged?.();
            } else if (failed) {
              notify.error('Dosya yüklenirken hata oluştu');
            }
          }}
        />
      </section>

      <section>
        <h4 className={classes.heading}>
          <FaIcon icon="fas fa-comments" /> Yorumlar ({list.length})
        </h4>
        <div ref={listRef} className={classes.comments} aria-label="Yorumlar">
          {list.length ? (
            list.map((comment) => (
              <CommentItem
                key={comment.id}
                topicId={topicId}
                comment={comment}
                mine={Boolean(user?.username) && comment.created_by_username === user.username}
                highlighted={comment.id === highlightCommentId}
                onChanged={onChanged}
              />
            ))
          ) : (
            <p className={classes.empty}>Henüz yorum yok.</p>
          )}
        </div>
      </section>

      <section className={classes.composer}>
        <RichTextEditor
          aria-label="Yorum"
          placeholder="Yorum yazın... (@ile kullanıcı etiketleyin)"
          value={draft}
          onChange={setDraft}
          disabled={post.isPending}
        />
        <FileDropzone
          compact
          hint="Yorum ekleri (opsiyonel):"
          disabled={post.isPending}
          onFiles={(picked) => setFiles((current) => [...current, ...picked])}
        />
        <StagedFiles
          files={files}
          onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))}
        />
        <div>
          <Button
            leftSection={<FaIcon icon="fas fa-paper-plane" />}
            loading={post.isPending}
            onClick={() => void submit()}
          >
            Yorum Ekle
          </Button>
        </div>
      </section>
    </div>
  );
}
