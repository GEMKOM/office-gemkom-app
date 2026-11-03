import { Grid, NumberInput, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  usePatchLinearCuttingTask,
  type LinearCuttingTask,
  type MachineDropdownItem,
} from '@/api/manufacturing/linearCutting';
import { DataTable, DetailModal, FaIcon, FormModal, ModalSection, notify, StatusBadge } from '@/ui';
import { BarLayout } from '../shared/BarDiagram';
import { cutColumns, materialText } from './columns';

export function TaskDetailModal({
  task,
  machineName,
  onClose,
}: {
  task: LinearCuttingTask;
  machineName: string | null;
  onClose: () => void;
}) {
  const completed = Boolean(task.completion_date);
  const plan =
    `${task.session || ''}${task.session_title ? ` — ${task.session_title}` : ''}`.trim() || '-';
  const cuts = task.layout_json ?? [];
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Görev Detayı - ${task.key}`}
      icon="fas fa-tasks"
      size="xl"
      sections={[
        {
          title: 'Özet',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Görev No', value: task.key, span: 4, copyable: true },
            { label: 'Kesim Planı', value: plan, span: 8 },
            { label: 'Ad', value: task.name || '-', span: 12 },
            {
              label: 'Durum',
              span: 3,
              render: completed ? (
                <StatusBadge color="green">
                  <FaIcon icon="fas fa-check" style={{ marginRight: 4 }} />
                  Tamamlandı
                </StatusBadge>
              ) : (
                <StatusBadge color="yellow">
                  <FaIcon icon="fas fa-clock" style={{ marginRight: 4 }} />
                  Bekliyor
                </StatusBadge>
              ),
            },
            { label: 'Malzeme', value: materialText(task), span: 6 },
            { label: 'Makine', value: task.machine_name || machineName || '-', span: 3 },
          ],
        },
        { title: 'Yerleşim', icon: 'fas fa-ruler-horizontal', content: <BarLayout task={task} /> },
        {
          title: 'Açıklama',
          icon: 'fas fa-align-left',
          hidden: !task.description,
          content: <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{task.description}</div>,
        },
        {
          title: 'Kesim Listesi',
          icon: 'fas fa-stream',
          hidden: !cuts.length,
          content: (
            <DataTable
              data={cuts}
              columns={cutColumns}
              getRowId={(_row, index) => String(index)}
              sortable
              striped
              verticalSpacing="xs"
              emptyMessage="Kesim bulunamadı"
            />
          ),
        },
      ]}
    />
  );
}

const editSchema = z.object({
  machine_fk: z.string(),
  estimated_hours: z.union([z.number().min(0, 'Değer 0 veya daha büyük olmalıdır'), z.literal('')]),
  description: z.string(),
});

type EditValues = z.infer<typeof editSchema>;

export function TaskEditModal({
  task,
  machines,
  onClose,
}: {
  task: LinearCuttingTask;
  machines: MachineDropdownItem[];
  onClose: () => void;
}) {
  const estimated = task.estimated_hours;
  const form = useForm<EditValues>({
    initialValues: {
      machine_fk: task.machine_fk != null ? String(task.machine_fk) : '',
      estimated_hours:
        estimated === null || estimated === undefined || estimated === '' ? '' : Number(estimated),
      description: task.description || '',
    },
    validate: zod4Resolver(editSchema),
  });
  const patch = usePatchLinearCuttingTask();

  const save = async (values: EditValues) => {
    try {
      await patch.mutateAsync({
        key: task.key,
        data: {
          machine_fk: values.machine_fk ? Number(values.machine_fk) : null,
          estimated_hours: values.estimated_hours === '' ? null : Number(values.estimated_hours),
          description: values.description ?? '',
        },
      });
      notify.success('Görev güncellendi');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Kaydedilemedi' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Görev Düzenle - ${task.key}`}
      icon="fas fa-edit"
      submitting={patch.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Görev Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Görev No" value={task.key} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Ad" value={task.name || ''} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Makine"
              placeholder="Makine Seçin..."
              data={machines.map((m) => ({ value: String(m.id), label: m.name }))}
              clearable
              searchable
              {...form.getInputProps('machine_fk')}
              onChange={(value) => form.setFieldValue('machine_fk', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Tahmini Süre (saat)"
              min={0}
              step={0.1}
              decimalSeparator=","
              {...form.getInputProps('estimated_hours')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Açıklama" rows={3} {...form.getInputProps('description')} />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
