import { FileInput, Grid, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import {
  DISPOSITION_CHOICES,
  NCR_FILE_TYPE_OPTIONS,
  uploadNcrFile,
  useDecideNcr,
  useSubmitNcr,
  type Ncr,
} from '@/api/quality-control/ncrs';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { RadioChoices, REQUIRED } from './NcrFormModal';
import { NcrContext, numberedTitle } from './NcrPaperForm';
import classes from './ncrs.module.css';
import { statusLabel } from './ncrRules';

const submitSchema = z.object({
  root_cause: z.string().min(1, REQUIRED),
  corrective_action: z.string().min(1, REQUIRED),
  disposition: z.string().min(1, REQUIRED),
});

/** Port of handleSubmitNCR's modal: the assigned group answers sections 3–5 and sends to QC. */
export function NcrSubmitModal({ ncr, onClose }: { ncr: Ncr; onClose: () => void }) {
  const submit = useSubmitNcr();
  const form = useForm({
    initialValues: {
      root_cause: ncr.root_cause ?? '',
      corrective_action: ncr.corrective_action ?? '',
      disposition: ncr.disposition || 'pending',
    },
    validate: zod4Resolver(submitSchema),
  });

  const save = async (values: z.infer<typeof submitSchema>) => {
    const data = {
      root_cause: values.root_cause.trim(),
      corrective_action: values.corrective_action.trim(),
      disposition: values.disposition.trim(),
    };
    if (!data.root_cause || !data.corrective_action || !data.disposition) {
      notify.error('Kök neden, düzeltici faaliyet ve karar alanları zorunludur');
      return;
    }
    try {
      await submit.mutateAsync({ id: ncr.id, data });
      notify.success('NCR başarıyla gönderildi');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'NCR gönderilirken hata oluştu' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`${ncr.ncr_number || `NCR #${ncr.id}`} · Onaya Gönder`}
      icon="fas fa-paper-plane"
      size="lg"
      submitLabel="Onaya Gönder"
      submitIcon="fas fa-paper-plane"
      submitting={submit.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <NcrContext ncr={ncr} statusLabel={statusLabel(ncr)} />
      <ModalSection title={numberedTitle(3, 'Kök Neden Analizi')}>
        <Textarea
          label="Uygunsuzluk neden oluştu?"
          withAsterisk
          rows={5}
          placeholder="Örn. bükme kalıbı ayarı resim değerine göre kontrol edilmeden kullanıldı"
          {...form.getInputProps('root_cause')}
        />
      </ModalSection>
      <ModalSection title={numberedTitle(4, 'Düzeltici Faaliyet')}>
        <Textarea
          label="Tekrarlanmaması için ne yapıldı / yapılacak?"
          withAsterisk
          rows={5}
          placeholder="Yapılan / yapılacak işlem, sorumlusu ve tarihi"
          description="Kalite Kontrol bu bilgiye göre onaylar veya reddeder."
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          {...form.getInputProps('corrective_action')}
        />
      </ModalSection>
      <ModalSection title={numberedTitle(5, 'Karar (Uygunsuz Ürün)')}>
        <RadioChoices
          label="Etkilenen ürün için önerilen karar"
          choices={DISPOSITION_CHOICES}
          {...form.getInputProps('disposition')}
        />
      </ModalSection>
    </FormModal>
  );
}

/** Port of showNCRDecisionModal: QC approves (comment optional) or rejects (comment required). */
export function NcrDecisionModal({
  ncr,
  approve,
  onClose,
}: {
  ncr: Ncr;
  approve: boolean;
  onClose: () => void;
}) {
  const decide = useDecideNcr();
  const form = useForm({
    initialValues: { comment: '' },
    validate: { comment: (value) => (!approve && !value ? REQUIRED : null) },
  });

  const save = async ({ comment }: { comment: string }) => {
    try {
      await decide.mutateAsync({ id: ncr.id, approve, comment: comment || '' });
      notify.success(approve ? 'NCR onaylandı' : 'NCR reddedildi');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Karar verilirken hata oluştu' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="NCR Kararı"
      subtitle={[ncr.ncr_number, ncr.title].filter(Boolean).join(' · ') || undefined}
      icon="fas fa-gavel"
      size="lg"
      submitLabel="Karar Ver"
      submitIcon="fas fa-gavel"
      submitting={decide.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection
        title={approve ? 'Onaylama' : 'Reddetme'}
        icon={approve ? 'fas fa-check-circle' : 'fas fa-times-circle'}
      >
        <Textarea
          label="Yorum"
          withAsterisk={!approve}
          rows={4}
          placeholder={approve ? 'Onay yorumu (isteğe bağlı)' : 'Red nedeni (zorunlu)'}
          {...form.getInputProps('comment')}
        />
      </ModalSection>
    </FormModal>
  );
}

/** Port of showNcrFileUploadModal: several files, one type / name / description for all. */
export function NcrFileUploadModal({
  ncrId,
  onClose,
}: {
  ncrId: number;
  onClose: (uploaded: boolean) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const form = useForm({
    initialValues: { file_type: '', name: '', description: '' },
    validate: { file_type: (value) => (value ? null : REQUIRED) },
  });

  const save = async (values: { file_type: string; name: string; description: string }) => {
    if (files.length === 0) {
      notify.warning('Lütfen en az bir dosya seçin');
      return;
    }
    setUploading(true);
    let success = 0;
    let failed = 0;
    for (const file of files) {
      try {
        await uploadNcrFile(ncrId, file, values.file_type, values.name, values.description);
        success++;
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error);
        failed++;
      }
    }
    setUploading(false);
    if (success > 0 && failed === 0) {
      notify.success(`${success} dosya başarıyla yüklendi`);
      onClose(true);
    } else if (success > 0) {
      notify.warning(`${success} dosya yüklendi, ${failed} dosya yüklenemedi`);
      onClose(true);
    } else {
      notify.error('Dosyalar yüklenemedi');
    }
  };

  return (
    <FormModal
      opened
      onClose={() => onClose(false)}
      title="Dosya Yükle"
      icon="fas fa-upload"
      size="md"
      submitLabel="Yükle"
      submitIcon="fas fa-upload"
      submitting={uploading}
      onSubmit={form.onSubmit(save)}
    >
      <Stack gap="sm" mb="md">
        <FileInput
          label="Dosyalar (Birden fazla seçebilirsiniz)"
          description="Birden fazla dosya seçmek için Ctrl (veya Cmd) tuşuna basılı tutarak tıklayın"
          placeholder="Dosya seçin"
          multiple
          clearable
          value={files}
          onChange={setFiles}
          leftSection={<FaIcon icon="fas fa-paperclip" />}
        />
        {files.length ? (
          <div>
            <Text size="sm" fw={600} mb={4}>
              Seçilen dosyalar ({files.length}):
            </Text>
            <Stack gap={4}>
              {files.map((file, index) => (
                <div key={index} className={classes.fileRow}>
                  <FaIcon icon="fas fa-file" />
                  <span className={classes.fileName}>{file.name}</span>
                  <span className={classes.fileMeta}>{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </Stack>
          </div>
        ) : null}
      </Stack>
      <ModalSection title="Dosya Bilgileri" icon="fas fa-file">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Dosya Türü"
              withAsterisk
              data={NCR_FILE_TYPE_OPTIONS}
              placeholder="Seçiniz"
              {...form.getInputProps('file_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Dosya Adı"
              placeholder="Opsiyonel (tüm dosyalar için)"
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              placeholder="Opsiyonel (tüm dosyalar için)"
              {...form.getInputProps('description')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
