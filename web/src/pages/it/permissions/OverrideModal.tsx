import { NativeSelect, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { FormModal, notify } from '@/ui';

export interface OverrideModalProps {
  codename: string;
  onClose: () => void;
  /** Saves; a rejection keeps the modal open. */
  onSave: (values: { granted: boolean; reason: string }) => Promise<void>;
}

/** Legacy openOverrideModal: grant or deny one permission for this user, with a reason. */
export function OverrideModal({ codename, onClose, onSave }: OverrideModalProps) {
  const form = useForm({ initialValues: { granted: 'true', reason: '' } });
  const [saving, setSaving] = useState(false);

  const submit = async (values: { granted: string; reason: string }) => {
    setSaving(true);
    try {
      await onSave({ granted: values.granted === 'true', reason: values.reason || '' });
    } catch (error) {
      notify.error(error, { fallback: 'Geçersiz kılma kaydedilirken hata oluştu' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`${codename} — Yetki Geçersiz Kılma`}
      icon="fas fa-user-shield"
      size="lg"
      onSubmit={form.onSubmit((values) => void submit(values))}
      submitting={saving}
    >
      <Stack gap="sm">
        <TextInput label="Yetki Kodu" value={codename} readOnly />
        <NativeSelect
          label="Durum"
          data={[
            { value: 'true', label: 'Erişim Ver' },
            { value: 'false', label: 'Erişimi Engelle' },
          ]}
          {...form.getInputProps('granted')}
        />
        <Textarea label="Sebep (opsiyonel)" rows={3} {...form.getInputProps('reason')} />
      </Stack>
    </FormModal>
  );
}
