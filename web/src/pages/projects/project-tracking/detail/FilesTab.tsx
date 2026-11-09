import { Button, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  JOB_ORDER_FILE_TYPE_OPTIONS,
  jobOrderKeys,
  uploadJobOrderFile,
} from '@/api/projects/jobOrders';
import {
  downloadFilesAsZip,
  FaIcon,
  FileDropInput,
  FileAttachments,
  FormModal,
  ModalSection,
  notify,
  type AttachmentFile,
} from '@/ui';
import css from './JobOrderDetail.module.css';
import {
  EmptyState,
  ErrorState,
  jobOrderFileGroupsQueryOptions,
  LoadingState,
  Section,
  type JobOrderFileRow,
} from './parts';

/** Legacy mapFiles: the real file name for display and download, the category as a note. */
export function toAttachment(file: JobOrderFileRow, index: number): AttachmentFile {
  return {
    id: file.id ?? `${index}-${file.file_url ?? ''}`,
    url: file.file_url || file.url || file.file || '',
    name: file.filename || file.file_name || file.name || 'Dosya',
    size: file.file_size ?? null,
    uploadedAt: file.uploaded_at ?? null,
    uploadedBy:
      file.uploaded_by_name || (file.uploaded_by != null ? String(file.uploaded_by) : 'Bilinmeyen'),
    typeLabel: file.file_type_display || null,
    description: file.name || null,
  };
}

/** Legacy showJobOrderFileUploadModal: a type for all, several files in one request. */
export function JobOrderFileUploadModal({
  jobNo,
  onClose,
}: {
  jobNo: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fileType, setFileType] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!fileType) {
      setTypeError('Bu alan gereklidir');
      return;
    }
    if (!files.length) {
      notify.warning('Lütfen en az bir dosya seçin');
      return;
    }
    setBusy(true);
    try {
      // The API takes every file in one request.
      await uploadJobOrderFile(jobNo, files, fileType);
      notify.success(`${files.length} dosya başarıyla yüklendi`);
      onClose();
      await queryClient.invalidateQueries({ queryKey: jobOrderKeys.files(jobNo) });
    } catch (error) {
      console.error('Error uploading files:', error);
      notify.error(error, { fallback: 'Dosya yükleme sırasında hata oluştu' });
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Dosya Yükle"
      icon="fas fa-upload"
      size="lg"
      submitting={busy}
      onSubmit={() => void save()}
    >
      <Stack gap="xs" mb="md">
        <FileDropInput
          label="Dosyalar (Birden fazla seçebilirsiniz)"
          description="Birden fazla dosya seçmek için Ctrl (veya Cmd) tuşuna basılı tutarak tıklayın"
          multiple
          clearable
          value={files}
          onChange={setFiles}
        />
        {files.length ? (
          <div>
            <Text size="sm" fw={600}>
              Seçilen dosyalar ({files.length}):
            </Text>
            {files.map((file, i) => (
              <Paper key={`${file.name}-${i}`} withBorder p={6} mt={4}>
                <Group gap="xs" wrap="nowrap">
                  <FaIcon icon="fas fa-file" />
                  <Text size="sm" style={{ flex: 1 }}>
                    {file.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {(file.size / 1024).toFixed(1)} KB
                  </Text>
                </Group>
              </Paper>
            ))}
          </div>
        ) : null}
      </Stack>
      <ModalSection title="Dosya Bilgileri" icon="fas fa-file">
        <Select
          label="Dosya Türü"
          withAsterisk
          placeholder="Seçiniz"
          maw={{ sm: '50%' }}
          data={JOB_ORDER_FILE_TYPE_OPTIONS}
          value={fileType}
          error={typeError}
          onChange={(value) => {
            setFileType(value);
            setTypeError(null);
          }}
        />
      </ModalSection>
    </FormModal>
  );
}

/** Dosyalar: the job's own files and its source offer's files (legacy renderFilesTab). */
export function FilesSection({ jobNo }: { jobNo: string }) {
  const query = useQuery(jobOrderFileGroupsQueryOptions(jobNo));
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);

  const jobFiles = query.data?.jobOrderFiles ?? [];
  const offerFiles = query.data?.offerFiles ?? [];
  const total = jobFiles.length + offerFiles.length;

  const downloadAll = async () => {
    const all = [...jobFiles, ...offerFiles].map(toAttachment);
    if (!all.length) {
      notify.warning('İndirilecek dosya yok');
      return;
    }
    setZipping(true);
    notify.info('Dosyalar indiriliyor...');
    try {
      const result = await downloadFilesAsZip(all, jobNo);
      if (result.status === 'nothing-added')
        notify.warning('Zip içine eklenecek geçerli dosya bulunamadı');
      else if (result.status === 'done')
        notify.success(`${result.count} dosya zip olarak indirildi`);
      else notify.warning('İndirilecek dosya yok');
    } catch (error) {
      console.error('Error creating zip file:', error);
      notify.error('Zip dosyası oluşturulurken hata oluştu');
    } finally {
      setZipping(false);
    }
  };

  const uploadButton = (variant: 'filled' | 'outline') => (
    <Button
      size="xs"
      variant={variant}
      leftSection={<FaIcon icon="fas fa-upload" />}
      onClick={() => setUploading(true)}
    >
      Dosya Yükle
    </Button>
  );

  return (
    <Section
      title="Dosyalar"
      icon="fas fa-paperclip"
      action={
        query.isSuccess && total > 0 ? (
          <Group gap="xs">
            <Button
              size="xs"
              variant="outline"
              color="green"
              loading={zipping}
              leftSection={<FaIcon icon="fas fa-download" />}
              onClick={() => void downloadAll()}
            >
              Tümünü İndir (ZIP)
            </Button>
            {uploadButton('outline')}
          </Group>
        ) : null
      }
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState>Dosyalar yüklenirken hata oluştu.</ErrorState>
      ) : total === 0 ? (
        <EmptyState icon="fas fa-folder-open">
          <p>Henüz dosya eklenmemiş.</p>
          {uploadButton('filled')}
        </EmptyState>
      ) : (
        <>
          {jobFiles.length > 0 ? (
            <div className={css.fieldSection}>
              <FileAttachments
                title="İş Emri Dosyaları"
                layout="list"
                readOnly
                files={jobFiles.map(toAttachment)}
              />
            </div>
          ) : null}
          {offerFiles.length > 0 ? (
            <div className={css.fieldSection}>
              <FileAttachments
                title="Teklif Dosyaları"
                layout="list"
                readOnly
                files={offerFiles.map(toAttachment)}
              />
            </div>
          ) : null}
        </>
      )}
      {uploading ? (
        <JobOrderFileUploadModal jobNo={jobNo} onClose={() => setUploading(false)} />
      ) : null}
    </Section>
  );
}
