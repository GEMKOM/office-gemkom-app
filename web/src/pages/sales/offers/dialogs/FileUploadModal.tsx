import { Grid, Group, Paper, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { OFFER_FILE_TYPE_OPTIONS, uploadOfferFile, useInvalidateOffers } from '@/api/sales/offers';
import { FaIcon, FileDropInput, FormModal, ModalSection, notify } from '@/ui';

/**
 * Legacy showFileUploadModal: a type (required), an optional name and note
 * for every file, several files, uploaded one by one.
 */
export function FileUploadModal({ offerId, onClose }: { offerId: number; onClose: () => void }) {
  const invalidate = useInvalidateOffers();
  const [fileType, setFileType] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [typeError, setTypeError] = useState<string | null>(null);
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
    let ok = 0;
    let failed = 0;
    for (const file of files) {
      try {
        await uploadOfferFile(offerId, file, { file_type: fileType, name, description });
        ok += 1;
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error);
        failed += 1;
      }
    }
    setBusy(false);
    if (ok > 0) {
      notify[failed ? 'warning' : 'success'](
        failed
          ? `${ok} dosya yüklendi, ${failed} dosya yüklenemedi`
          : `${ok} dosya başarıyla yüklendi`,
      );
      onClose();
      await invalidate();
    } else {
      notify.error('Dosyalar yüklenemedi');
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
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
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
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Dosya Türü"
              withAsterisk
              placeholder="Seçiniz"
              data={OFFER_FILE_TYPE_OPTIONS}
              value={fileType}
              error={typeError}
              onChange={(value) => {
                setFileType(value);
                setTypeError(null);
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Dosya Adı"
              placeholder="Opsiyonel (tüm dosyalar için)"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              placeholder="Opsiyonel (tüm dosyalar için)"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
