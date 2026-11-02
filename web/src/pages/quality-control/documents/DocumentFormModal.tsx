import { FileInput, Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  QUALITY_DOCUMENT_TYPE_CHOICES,
  useCreateQualityDocument,
  useUpdateQualityDocument,
  type QualityDocument,
  type QualityDocumentMeta,
} from '@/api/quality-control/documents';
import { errorMessage, FaIcon, FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';

export interface DocumentFormValues {
  title: string;
  document_type: string;
  document_number: string;
  revision: string;
  valid_until: string;
  job_order: string;
  description: string;
  file: File | null;
}

function initialValues(doc?: QualityDocument | null): DocumentFormValues {
  return {
    title: doc?.title || '',
    document_type: doc?.document_type || 'other',
    document_number: doc?.document_number || '',
    revision: doc?.revision || '',
    valid_until: doc?.valid_until || '',
    job_order: doc?.job_order_no || doc?.job_order || '',
    description: doc?.description || '',
    file: null,
  };
}

/** Legacy handleSave's metadata: trimmed text, null (not '') for the nullable date and job order. */
export function documentMeta(values: DocumentFormValues): QualityDocumentMeta {
  return {
    title: values.title.trim(),
    document_type: values.document_type || 'other',
    document_number: values.document_number.trim(),
    revision: values.revision.trim(),
    description: values.description.trim(),
    valid_until: values.valid_until ? values.valid_until : null,
    // job_order is keyed by job number (the JobOrder PK is job_no).
    job_order: values.job_order.trim() || null,
  };
}

const typeData = QUALITY_DOCUMENT_TYPE_CHOICES.map(({ value, label }) => ({ value, label }));

export interface DocumentFormModalProps {
  /** Without a document the modal uploads a new one. */
  document?: QualityDocument | null;
  onClose: () => void;
  onCreated?: () => void;
}

/** The create / edit modal of quality-control/documents (buildForm + handleSave). */
export function DocumentFormModal({ document, onClose, onCreated }: DocumentFormModalProps) {
  const editing = Boolean(document);
  const form = useForm<DocumentFormValues>({
    initialValues: initialValues(document),
    validate: {
      title: (value) => (value.trim() ? null : REQUIRED),
      file: (value) => (editing || value ? null : REQUIRED),
    },
  });
  const create = useCreateQualityDocument();
  const update = useUpdateQualityDocument();

  const save = async (values: DocumentFormValues) => {
    const meta = documentMeta(values);
    try {
      if (document) {
        await update.mutateAsync({ id: document.id, meta, file: values.file });
        notify.success('Evrak güncellendi.');
      } else {
        if (!values.file) {
          notify.warning('Lütfen bir dosya seçin.');
          return;
        }
        await create.mutateAsync({ file: values.file, meta });
        notify.success('Evrak yüklendi.');
        onCreated?.();
      }
      onClose();
    } catch (error) {
      console.error(error);
      notify.error(`İşlem başarısız: ${errorMessage(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Kalite Evrağını Düzenle' : 'Yeni Kalite Evrağı'}
      subtitle={
        document
          ? [document.document_number, document.title].filter(Boolean).join(' · ')
          : undefined
      }
      icon="fas fa-file-alt"
      size="lg"
      submitLabel={editing ? 'Kaydet' : 'Yükle'}
      submitIcon={editing ? 'fas fa-save' : 'fas fa-upload'}
      submitting={create.isPending || update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Evrak Bilgileri" icon="fas fa-file-alt">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput label="Başlık" withAsterisk {...form.getInputProps('title')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Evrak Tipi"
              data={typeData}
              allowDeselect={false}
              {...form.getInputProps('document_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Evrak No" {...form.getInputProps('document_number')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Revizyon" {...form.getInputProps('revision')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Geçerlilik Tarihi"
              type="date"
              {...form.getInputProps('valid_until')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="İş Emri No"
              description="Bir iş emrine bağlamak için iş emri numarasını girin (isteğe bağlı)."
              {...form.getInputProps('job_order')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Açıklama" rows={3} {...form.getInputProps('description')} />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Dosya" icon="fas fa-paperclip">
        <FileInput
          label={editing ? 'Yeni Dosya' : 'Dosya'}
          withAsterisk={!editing}
          clearable
          placeholder="Dosya seçin"
          leftSection={<FaIcon icon="fas fa-file-upload" />}
          description={
            editing
              ? 'Yeni dosya seçmezseniz mevcut dosya korunur.'
              : 'Yüklenecek evrak dosyasını seçin.'
          }
          {...form.getInputProps('file')}
        />
      </ModalSection>
    </FormModal>
  );
}
