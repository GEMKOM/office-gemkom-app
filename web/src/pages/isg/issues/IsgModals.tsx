import { Grid, MultiSelect, Select, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  ISG_CATEGORY_CHOICES,
  ISG_FILE_TYPE_OPTIONS,
  ISG_SEVERITY_CHOICES,
  isgKeys,
  uploadIsgIssueFile,
  useCreateIsgIssue,
  useIsgAction,
  useUpdateIsgIssue,
  type IsgIssue,
} from '@/api/isg/issues';
import { useUsers } from '@/api/reference/users';
import {
  FileDropzone,
  FormModal,
  ModalSection,
  notify,
  UploadQueueList,
  useUploadQueue,
} from '@/ui';

const REQUIRED = 'Bu alan gereklidir';

const issueSchema = z.object({
  title: z.string().trim().min(1, REQUIRED),
  description: z.string().trim().min(1, REQUIRED),
  category: z.string().min(1, REQUIRED),
  severity: z.string().min(1, REQUIRED),
  location: z.string(),
  due_date: z.string(),
  assigned_to: z.array(z.string()).min(1, 'En az bir kişi atamalısınız'),
});
type IssueFormValues = z.infer<typeof issueSchema>;

/** Create or edit an issue (legacy buildIssueFormSections). Mount to open. */
export function IsgIssueFormModal({
  issue,
  onClose,
  onSaved,
}: {
  issue?: IsgIssue | null;
  onClose: () => void;
  onSaved?: (issue: IsgIssue) => void;
}) {
  const users = useUsers();
  const userOptions = useMemo(
    () =>
      (users.data ?? []).map((u) => ({
        value: String(u.id),
        label: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
      })),
    [users.data],
  );
  const form = useForm<IssueFormValues>({
    initialValues: {
      title: issue?.title || '',
      description: issue?.description || '',
      category: issue?.category || 'other',
      severity: issue?.severity || 'medium',
      location: issue?.location || '',
      due_date: issue?.due_date || '',
      assigned_to: (issue?.assigned_to ?? []).map(String),
    },
    validate: zod4Resolver(issueSchema),
  });
  const create = useCreateIsgIssue();
  const update = useUpdateIsgIssue();

  const save = async (values: IssueFormValues) => {
    const data = {
      title: values.title.trim(),
      description: values.description.trim(),
      category: values.category || 'other',
      severity: values.severity || 'medium',
      location: values.location.trim(),
      due_date: values.due_date || null,
      assigned_to: values.assigned_to.map((v) => Number.parseInt(v, 10)).filter(Number.isFinite),
    };
    try {
      if (issue) {
        const saved = await update.mutateAsync({ id: issue.id, data });
        notify.success('Bildirim güncellendi');
        onSaved?.(saved);
      } else {
        const created = await create.mutateAsync(data);
        notify.success(`${created.issue_number} oluşturuldu`);
        onSaved?.(created);
      }
      onClose();
    } catch (error) {
      notify.error(error, {
        fallback: issue
          ? 'Bildirim güncellenirken hata oluştu'
          : 'Bildirim oluşturulurken hata oluştu',
      });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={issue ? 'İSG Bildirimini Düzenle' : 'Yeni İSG Bildirimi'}
      subtitle={
        issue ? `${issue.issue_number} · ${issue.title}` : 'Bulgu, sınıflandırma ve atanan kişiler'
      }
      icon={issue ? 'fas fa-edit' : 'fas fa-helmet-safety'}
      size={760}
      submitLabel={issue ? 'Kaydet' : 'Oluştur'}
      submitting={create.isPending || update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Bulgu">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput
              label="Başlık"
              withAsterisk
              placeholder="Örn. Kaynakhanede baret kullanılmıyor"
              {...form.getInputProps('title')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              withAsterisk
              rows={4}
              placeholder="Bulgunun detayı, ne zaman ve nasıl tespit edildiği"
              {...form.getInputProps('description')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
      <ModalSection title="Sınıflandırma">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Kategori"
              withAsterisk
              searchable
              allowDeselect={false}
              data={ISG_CATEGORY_CHOICES}
              {...form.getInputProps('category')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Önem Derecesi"
              withAsterisk
              allowDeselect={false}
              data={ISG_SEVERITY_CHOICES}
              {...form.getInputProps('severity')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Yer"
              placeholder="Örn. Kaynakhane B blok"
              {...form.getInputProps('location')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Termin Tarihi" type="date" {...form.getInputProps('due_date')} />
          </Grid.Col>
        </Grid>
      </ModalSection>
      <ModalSection title="Atama">
        <MultiSelect
          label="Atanan Kişiler"
          withAsterisk
          searchable
          placeholder="Bir veya daha fazla kişi seçin"
          nothingFoundMessage="Kişi bulunamadı"
          data={userOptions}
          {...form.getInputProps('assigned_to')}
        />
      </ModalSection>
    </FormModal>
  );
}

export type IsgWorkflowKind = 'resolve' | 'close' | 'reopen';

/** Giderildi / Kapat / Yeniden Aç: one text field (and a new due date on reopen). */
export function IsgWorkflowModal({
  kind,
  issue,
  onClose,
  onDone,
}: {
  kind: IsgWorkflowKind;
  issue: IsgIssue;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState(issue.due_date || '');
  const [error, setError] = useState<string | null>(null);
  const action = useIsgAction();

  const config = {
    resolve: {
      title: 'Giderildi Olarak İşaretle',
      icon: 'fas fa-check',
      submit: 'Gönder',
      section: 'Yapılan İşlem',
      label: 'Ne yapıldı?',
      placeholder:
        'Alınan aksiyonu kısaca açıklayın. İSG bu açıklamayı doğrulayıp bildirimi kapatacak.',
      success: 'Bildirim İSG onayına gönderildi',
    },
    close: {
      title: 'Bildirimi Kapat',
      icon: 'fas fa-lock',
      submit: 'Kapat',
      section: 'Kapanış',
      label: 'Kapanış Notu',
      placeholder: 'Doğrulama notu (opsiyonel)',
      success: 'Bildirim kapatıldı',
    },
    reopen: {
      title: 'Bildirimi Yeniden Aç',
      icon: 'fas fa-rotate-left',
      submit: 'Yeniden Aç',
      section: 'Yeniden Açma',
      label: 'Gerekçe',
      placeholder: 'Neden yeniden açılıyor? Atananlara bildirim olarak gider.',
      success: 'Bildirim yeniden açıldı',
    },
  }[kind];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = text.trim();
    if (kind === 'resolve' && !value) {
      setError('Yapılan işlemi yazmanız gerekiyor');
      return;
    }
    const body =
      kind === 'resolve'
        ? { corrective_action: value }
        : kind === 'close'
          ? { closing_note: value }
          : dueDate
            ? { comment: value, due_date: dueDate }
            : { comment: value };
    try {
      await action.mutateAsync({ id: issue.id, action: kind, body });
      notify.success(config.success);
      onDone?.();
      onClose();
    } catch (err) {
      notify.error(err, { fallback: 'İşlem tamamlanamadı' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={config.title}
      subtitle={`${issue.issue_number} · ${issue.title}`}
      icon={config.icon}
      size={620}
      submitLabel={config.submit}
      submitting={action.isPending}
      onSubmit={(event) => void submit(event)}
    >
      <ModalSection title={config.section}>
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Textarea
              label={config.label}
              withAsterisk={kind === 'resolve'}
              rows={kind === 'resolve' ? 4 : 3}
              placeholder={config.placeholder}
              value={text}
              error={error}
              data-autofocus
              onChange={(event) => {
                setText(event.currentTarget.value);
                setError(null);
              }}
            />
          </Grid.Col>
          {kind === 'reopen' ? (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Yeni Termin (opsiyonel)"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.currentTarget.value)}
              />
            </Grid.Col>
          ) : null}
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

/**
 * "Dosya Yükle": the type, an optional title and description for the batch,
 * then every picked file goes up one by one with its own progress (legacy
 * showFileUploadModal).
 */
export function IsgFileUploadModal({
  issue,
  onClose,
  onUploaded,
}: {
  issue: IsgIssue;
  onClose: () => void;
  onUploaded?: () => void;
}) {
  const [fileType, setFileType] = useState('photo');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const queryClient = useQueryClient();
  // The details' file list and the row's file count both move.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: isgKeys.all });
    onUploaded?.();
  };
  const queue = useUploadQueue((file, context) =>
    uploadIsgIssueFile(issue.id, file, { file_type: fileType, name, description }, context),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!files.length) {
      notify.warning('Lütfen en az bir dosya seçin');
      return;
    }
    const { uploaded, failed } = await queue.start(files);
    setFiles([]);
    if (uploaded) refresh();
    if (uploaded && !failed) {
      notify.success(`${uploaded} dosya yüklendi`);
      onClose();
    } else if (uploaded) {
      // The failed ones stay listed with their error, to retry or drop.
      notify.warning(`${uploaded} dosya yüklendi, ${failed} dosya yüklenemedi`);
    } else {
      notify.error('Dosyalar yüklenemedi');
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Dosya Yükle"
      subtitle={`${issue.issue_number} · ${issue.title}`}
      icon="fas fa-upload"
      size={620}
      submitLabel="Yükle"
      submitIcon="fas fa-upload"
      submitting={queue.busy}
      onSubmit={(event) => void submit(event)}
    >
      <ModalSection title="Dosyalar">
        <FileDropzone
          onFiles={(picked) => setFiles((list) => [...list, ...picked])}
          disabled={queue.busy}
        />
        {files.length ? (
          <ul
            style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}
            aria-label="Seçilen dosyalar"
          >
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                {file.name}{' '}
                <span style={{ color: 'var(--gk-muted)' }}>{(file.size / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <UploadQueueList
            items={queue.items}
            onRetry={(key) =>
              void queue.retry(key).then((result) => {
                if (result.uploaded) refresh();
              })
            }
            onDismiss={queue.dismiss}
          />
        </div>
      </ModalSection>
      <ModalSection title="Dosya Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Dosya Türü"
              withAsterisk
              allowDeselect={false}
              data={ISG_FILE_TYPE_OPTIONS}
              value={fileType}
              onChange={(value) => setFileType(value || 'photo')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Dosya Adı"
              placeholder="Opsiyonel (tüm dosyalar için)"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              placeholder="Opsiyonel"
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
