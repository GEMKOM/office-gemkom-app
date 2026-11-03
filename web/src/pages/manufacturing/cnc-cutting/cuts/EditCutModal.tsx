import { Center, Loader } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useState, type FormEvent } from 'react';
import {
  cncTaskKeys,
  cncTaskQueryOptions,
  deleteCncFile,
  updateCncTask,
  uploadCncTaskFile,
  type CncTask,
} from '@/api/manufacturing/cncTasks';
import { FileAttachments, FormModal, ModalSection, notify } from '@/ui';
import {
  CutBasicFields,
  cutFormValues,
  cutInput,
  cutSchema,
  EMPTY_CUT_FORM,
  toAttachment,
} from './cutForm';
import { PartsManager } from './PartsManager';
import {
  EMPTY_PLATE_SOURCE,
  plateSourceFromTask,
  PlateSourceSection,
  type PlateSourceValue,
} from './PlateSource';

/** "Kesim Düzenle" for ?cut=KEY&mode=edit: the cut, its parts and its files. */
export function EditCutModal({ cutKey, onClose }: { cutKey: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  // Errors are reported by the page (it closes the modal and cleans the URL).
  const task = useQuery(cncTaskQueryOptions(cutKey));
  const form = useForm({ initialValues: EMPTY_CUT_FORM, validate: zod4Resolver(cutSchema) });
  const [plate, setPlate] = useState<PlateSourceValue>(EMPTY_PLATE_SOURCE);
  // The form starts from the task as first loaded; refetches (parts, files) leave it alone.
  const [opened, setOpened] = useState<CncTask | null>(null);
  if (task.data && !opened) {
    setOpened(task.data);
    setPlate(plateSourceFromTask(task.data));
  }
  useEffect(() => {
    if (!opened) return;
    const values = cutFormValues(opened);
    form.setInitialValues(values);
    form.setValues(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: cncTaskKeys.all });

  const update = useMutation({
    mutationFn: (values: typeof form.values) => updateCncTask(cutKey, cutInput(values, plate)),
    onSuccess: () => refresh(),
  });

  const save = async (values: typeof form.values) => {
    try {
      await update.mutateAsync(values);
      notify.success('Kesim başarıyla güncellendi');
      onClose();
    } catch {
      notify.error('Kesim güncellenirken hata oluştu');
    }
  };

  const loaded = opened ? task.data : undefined;
  const files = (loaded?.files ?? []).map(toAttachment);

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Kesim Düzenle"
      subtitle={cutKey}
      submitDisabled={!loaded}
      icon="fas fa-edit"
      size="xl"
      submitLabel="Değişiklikleri Kaydet"
      submitting={update.isPending}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        // Part and picker modals render inside this form's React tree; their submits are not ours.
        if (event.target !== event.currentTarget) return;
        form.onSubmit((values) => void save(values))(event);
      }}
    >
      {loaded ? (
        <>
          <PlateSourceSection value={plate} onChange={setPlate} />
          <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
            <CutBasicFields form={form} dimensionsHelp="Plaka boyutları (opsiyonel)" />
          </ModalSection>
          <PartsManager taskKey={cutKey} parts={loaded.parts ?? []} />
          <ModalSection>
            <FileAttachments
              title="Dosyalar"
              files={files}
              emptyText="Dosya bulunamadı"
              onUpload={(file, { onProgress, signal }) =>
                uploadCncTaskFile(cutKey, file, { onProgress, signal })
              }
              onUploaded={({ uploaded, failed }) => {
                if (uploaded > 0) notify.success('Dosya(lar) başarıyla eklendi');
                if (failed > 0) notify.error('Dosya(lar) eklenirken hata oluştu');
                void refresh();
              }}
              onDelete={async (file) => {
                await deleteCncFile(String(file.id));
                notify.success('Dosya başarıyla silindi');
                await refresh();
              }}
            />
          </ModalSection>
        </>
      ) : (
        <Center p="xl">
          <Loader />
        </Center>
      )}
    </FormModal>
  );
}
