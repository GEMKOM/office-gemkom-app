import { Checkbox, Grid, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createTaskTemplate,
  taskTemplateKeys,
  updateTaskTemplate,
  type TaskTemplate,
} from '@/api/planning/taskTemplates';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';

interface TemplateFormModalProps {
  /** Without a template the modal creates one. */
  template?: TaskTemplate | null;
  onClose: () => void;
}

/** The create and edit template modals of task-templates.js. */
export function TemplateFormModal({ template, onClose }: TemplateFormModalProps) {
  const editing = Boolean(template);
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      name: template?.name ?? '',
      description: template?.description || '',
      is_active: template ? Boolean(template.is_active) : true,
      is_default: template ? Boolean(template.is_default) : false,
    },
    validate: { name: (v) => (v.trim() ? null : REQUIRED) },
  });
  const [submitting, setSubmitting] = useState(false);

  const save = async (values: typeof form.values) => {
    const data = {
      name: values.name,
      description: values.description || '',
      is_active: values.is_active,
      is_default: values.is_default,
    };
    setSubmitting(true);
    try {
      if (template) await updateTaskTemplate(template.id, data);
      else await createTaskTemplate(data);
      onClose();
      notify.success(editing ? 'Şablon başarıyla güncellendi' : 'Şablon başarıyla oluşturuldu');
      void queryClient.invalidateQueries({ queryKey: taskTemplateKeys.all });
    } catch (error) {
      console.error(editing ? 'Error updating template:' : 'Error creating template:', error);
      notify.error(editing ? 'Şablon güncellenirken bir hata oluştu' : 'Şablon oluşturulurken bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Görev Şablonu Düzenle' : 'Yeni Görev Şablonu Oluştur'}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="lg"
      submitLabel={editing ? 'Değişiklikleri Kaydet' : 'Şablon Oluştur'}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Şablon Bilgileri" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput
              label="Şablon Adı"
              placeholder="Örn: Standart Üretim Akışı"
              withAsterisk
              leftSection={<FaIcon icon="fas fa-tag" />}
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Açıklama" placeholder="Şablon açıklaması..." rows={3} {...form.getInputProps('description')} />
          </Grid.Col>
          <Grid.Col span={6}>
            <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
          </Grid.Col>
          <Grid.Col span={6}>
            <Checkbox label="Varsayılan Şablon" {...form.getInputProps('is_default', { type: 'checkbox' })} />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
