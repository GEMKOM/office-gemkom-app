import { Checkbox, Grid, NumberInput, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import type { NodeInput, OfferTemplate, TemplateInput, TemplateNode } from '@/api/sales/offerTemplates';
import { FormModal, ModalSection } from '@/ui';

const templateSchema = z.object({
  name: z.string().refine((v) => v.trim() !== '', 'Katalog Adı zorunludur.'),
  description: z.string(),
  is_active: z.boolean(),
});

const nodeSchema = z.object({
  title: z.string().refine((v) => v.trim() !== '', 'Başlık zorunludur.'),
  description: z.string(),
  sequence: z.union([z.number(), z.string()]),
  is_active: z.boolean(),
});

type TemplateValues = z.infer<typeof templateSchema>;
type NodeValues = z.infer<typeof nodeSchema>;

/** Runs a save; the modal stays open (and enabled again) when it fails. */
function useSaving() {
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };
  return [saving, run] as const;
}

export interface TemplateFormModalProps {
  /** null creates a catalog. */
  template: OfferTemplate | null;
  onClose: () => void;
  onSave: (data: TemplateInput) => Promise<void>;
}

/** Legacy showCreateTemplateModal / showEditTemplateModal. */
export function TemplateFormModal({ template, onClose, onSave }: TemplateFormModalProps) {
  const form = useForm<TemplateValues>({
    initialValues: {
      name: template?.name ?? '',
      description: template?.description ?? '',
      is_active: template ? Boolean(template.is_active) : true,
    },
    validate: zod4Resolver(templateSchema),
  });
  const [saving, run] = useSaving();
  return (
    <FormModal
      opened
      onClose={onClose}
      title={template ? 'Kataloğu Düzenle' : 'Yeni Katalog Oluştur'}
      icon={template ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="md"
      submitting={saving}
      onSubmit={form.onSubmit((values) => void run(() => onSave(values)))}
    >
      <ModalSection title="Katalog Bilgileri" icon="fas fa-book">
        <Stack gap="sm">
          <TextInput
            label="Katalog Adı"
            required
            placeholder={template ? undefined : 'Ör: MELTSHOP EQUIPMENT'}
            {...form.getInputProps('name')}
          />
          <Textarea
            label="Açıklama"
            rows={3}
            placeholder={template ? undefined : 'Katalog açıklaması'}
            {...form.getInputProps('description')}
          />
          <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
        </Stack>
      </ModalSection>
    </FormModal>
  );
}

export interface NodeFormModalProps {
  /** null adds a node. */
  node: TemplateNode | null;
  /** Adding under another node (title "Alt Ekipman Ekle"). */
  isChild: boolean;
  onClose: () => void;
  onSave: (data: NodeInput) => Promise<void>;
}

/** Legacy showNodeModal / showEditNodeModal. */
export function NodeFormModal({ node, isChild, onClose, onSave }: NodeFormModalProps) {
  const form = useForm<NodeValues>({
    initialValues: {
      title: node?.title ?? '',
      description: node?.description ?? '',
      sequence: node ? node.sequence || 1 : 1,
      is_active: node ? node.is_active !== false : true,
    },
    validate: zod4Resolver(nodeSchema),
  });
  const [saving, run] = useSaving();
  const title = node ? 'Ekipmanı Düzenle' : isChild ? 'Alt Ekipman Ekle' : 'Kök Ekipman Ekle';
  return (
    <FormModal
      opened
      onClose={onClose}
      title={title}
      icon={node ? 'fas fa-edit' : 'fas fa-plus'}
      size="md"
      submitting={saving}
      onSubmit={form.onSubmit((values) =>
        void run(() =>
          onSave({
            title: values.title,
            description: values.description,
            // Legacy parseInt(...) || 1.
            sequence: Math.trunc(Number(values.sequence)) || 1,
            is_active: values.is_active,
          }),
        ),
      )}
    >
      <ModalSection title="Ekipman Bilgileri" icon="fas fa-sitemap">
        <Stack gap="sm">
          <TextInput
            label="Başlık"
            required
            placeholder={node ? undefined : 'Ör: Weighing Belt Conveyor'}
            {...form.getInputProps('title')}
          />
          <Textarea label="Açıklama" rows={3} {...form.getInputProps('description')} />
          <Grid>
            <Grid.Col span={6}>
              <NumberInput label="Sıra" allowDecimal={false} {...form.getInputProps('sequence')} />
            </Grid.Col>
            <Grid.Col span={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
            </Grid.Col>
          </Grid>
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
