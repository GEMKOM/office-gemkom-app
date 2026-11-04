import { Grid, MultiSelect, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import {
  addTemplateItem,
  addTemplateItemChild,
  taskTemplateErrorMessage,
  updateTemplateItem,
  type ChoiceOption,
  type TemplateChildItem,
  type TemplateItem,
} from '@/api/planning/taskTemplates';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';
const WEIGHT_HELP = 'Tamamlanma yüzdesi hesaplamasında kullanılır (1-100)';
const TYPE_HELP =
  'Özel görev tipi (Kaynaklı İmalat → Kaynak, Boya vb.). Şablon uygulanınca göreve aktarılır.';

/** Legacy EditModal number check: a filled field must parse and respect min/max. */
function numberError(value: string, min: number, max?: number): string | null {
  if (value.trim() === '') return null;
  const n = Number.parseFloat(value);
  if (Number.isNaN(n) || n < min || (max !== undefined && n > max))
    return 'Geçerli bir değer girin';
  return null;
}

/** Legacy getTaskTypeDropdownOptions: "no type" first (a Select option needs a non-empty value). */
const NO_TYPE = '__none__';
function taskTypeData(taskTypes: ChoiceOption[]) {
  return [{ value: NO_TYPE, label: 'Normal Görev (Tip Yok)' }, ...taskTypes];
}

const icon = (name: string) => <FaIcon icon={name} />;

interface ItemFieldsProps {
  form: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getInputProps: (path: string) => any;
    values: { task_type: string };
    setFieldValue: (path: 'task_type', value: string) => void;
  };
  taskTypes: ChoiceOption[];
  typeHelp?: string;
}

function SequenceWeightType({ form, taskTypes, typeHelp = TYPE_HELP }: ItemFieldsProps) {
  return (
    <>
      <Grid.Col span={6}>
        <TextInput
          label="Sıra"
          type="number"
          min={1}
          placeholder="Sıra numarası"
          leftSection={icon('fas fa-sort-numeric-up')}
          {...form.getInputProps('sequence')}
        />
      </Grid.Col>
      <Grid.Col span={6}>
        <TextInput
          label="Ağırlık"
          type="number"
          min={1}
          max={100}
          placeholder="Ağırlık (1-100)"
          description={WEIGHT_HELP}
          leftSection={icon('fas fa-weight')}
          {...form.getInputProps('weight')}
        />
      </Grid.Col>
      <Grid.Col span={12}>
        <Select
          label="Görev Tipi"
          placeholder="Görev tipi seçin..."
          data={taskTypeData(taskTypes)}
          description={typeHelp}
          leftSection={icon('fas fa-tag')}
          allowDeselect={false}
          value={form.values.task_type || NO_TYPE}
          onChange={(v) => form.setFieldValue('task_type', !v || v === NO_TYPE ? '' : v)}
        />
      </Grid.Col>
    </>
  );
}

const toInt = (value: string) => Number.parseInt(value, 10);

// ---- add main item --------------------------------------------------------------

interface AddItemModalProps {
  templateId: number;
  items: TemplateItem[];
  departments: ChoiceOption[];
  taskTypes: ChoiceOption[];
  onSaved: () => void;
  onClose: () => void;
}

export function AddItemModal({
  templateId,
  items,
  departments,
  taskTypes,
  onSaved,
  onClose,
}: AddItemModalProps) {
  const mainItems = items.filter((item) => item.parent === null || item.parent === undefined);
  const form = useForm({
    initialValues: {
      department: '',
      sequence: String(mainItems.length + 1),
      weight: '10',
      task_type: '',
      depends_on: [] as string[],
    },
    validate: {
      department: (v) => (v ? null : REQUIRED),
      sequence: (v) => numberError(v, 1),
      weight: (v) => numberError(v, 1, 100),
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const save = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      await addTemplateItem(templateId, {
        department: values.department,
        // title is auto-filled by the backend from the department
        sequence: toInt(values.sequence) || mainItems.length + 1,
        weight: values.weight ? toInt(values.weight) : 10,
        task_type: values.task_type || null,
        depends_on: values.depends_on.map(toInt),
      });
      onClose();
      notify.success('Ana görev başarıyla eklendi');
      onSaved();
    } catch (error) {
      console.error('Error adding item:', error);
      notify.error('Görev eklenirken bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Ana Görev Ekle"
      icon="fas fa-plus-circle"
      size="lg"
      submitLabel="Görev Ekle"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Ana Görev Bilgileri" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Select
              label="Departman"
              placeholder="Departman seçin..."
              withAsterisk
              data={departments}
              description="Başlık otomatik olarak departman adından oluşturulacak"
              leftSection={icon('fas fa-building')}
              {...form.getInputProps('department')}
            />
          </Grid.Col>
          <SequenceWeightType form={form} taskTypes={taskTypes} />
          <Grid.Col span={12}>
            <MultiSelect
              label="Bağımlılıklar"
              placeholder="Bağımlılık seçin..."
              searchable
              data={mainItems.map((item) => ({ value: String(item.id), label: item.title }))}
              description="Bu görevin başlaması için tamamlanması gereken ana görevler"
              {...form.getInputProps('depends_on')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

// ---- edit item (main or child) --------------------------------------------------------

interface EditItemModalProps {
  templateId: number;
  item: TemplateChildItem & { depends_on?: number[] | null };
  isChildItem: boolean;
  items: TemplateItem[];
  departments: ChoiceOption[];
  taskTypes: ChoiceOption[];
  onSaved: () => void;
  onClose: () => void;
}

export function EditItemModal({
  templateId,
  item,
  isChildItem,
  items,
  departments,
  taskTypes,
  onSaved,
  onClose,
}: EditItemModalProps) {
  const form = useForm({
    initialValues: {
      sequence: String(item.sequence || 1),
      weight: String(item.weight || 10),
      task_type: item.task_type || '',
      depends_on: (item.depends_on ?? []).map(String),
    },
    validate: {
      sequence: (v) => numberError(v, 1),
      weight: (v) => numberError(v, 1, 100),
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const departmentLabel =
    departments.find((d) => d.value === item.department)?.label ||
    item.department_display ||
    item.department ||
    '';
  const dependencyOptions = items
    .filter((i) => (i.parent === null || i.parent === undefined) && i.id !== item.id)
    .map((i) => ({ value: String(i.id), label: i.title }));

  const save = async (values: typeof form.values) => {
    const data: Parameters<typeof updateTemplateItem>[2] = {
      sequence: toInt(values.sequence) || item.sequence || undefined,
      weight: values.weight ? toInt(values.weight) : 10,
      task_type: values.task_type || null,
    };
    if (!isChildItem) data.depends_on = values.depends_on.map(toInt);
    setSubmitting(true);
    try {
      await updateTemplateItem(templateId, item.id, data);
      onClose();
      notify.success('Görev başarıyla güncellendi');
      onSaved();
    } catch (error) {
      console.error('Error updating item:', error);
      notify.error(taskTemplateErrorMessage(error, 'Görev güncellenirken bir hata oluştu'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Görev Düzenle"
      icon="fas fa-edit"
      size="lg"
      submitLabel="Değişiklikleri Kaydet"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection
        title={isChildItem ? 'Alt Görev Bilgileri' : 'Görev Bilgileri'}
        icon="fas fa-info-circle"
      >
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput
              label="Departman"
              value={departmentLabel}
              readOnly
              description="Departman değiştirilemez"
              leftSection={icon('fas fa-building')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Başlık"
              value={item.title}
              readOnly
              description="Başlık değiştirilemez"
              leftSection={icon('fas fa-heading')}
            />
          </Grid.Col>
          <SequenceWeightType
            form={form}
            taskTypes={taskTypes}
            typeHelp="Özel görev tipi. Şablon uygulanınca göreve aktarılır."
          />
          {!isChildItem ? (
            <Grid.Col span={12}>
              <MultiSelect
                label="Bağımlılıklar"
                placeholder="Bağımlılık seçin..."
                searchable
                data={dependencyOptions}
                description="Bu görevin başlaması için tamamlanması gereken ana görevler"
                {...form.getInputProps('depends_on')}
              />
            </Grid.Col>
          ) : null}
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

// ---- add child item -------------------------------------------------------------------

interface AddChildItemModalProps {
  templateId: number;
  parent: TemplateItem;
  taskTypes: ChoiceOption[];
  onSaved: () => void;
  onClose: () => void;
}

export function AddChildItemModal({
  templateId,
  parent,
  taskTypes,
  onSaved,
  onClose,
}: AddChildItemModalProps) {
  const children = parent.children ?? [];
  const nextSequence =
    children.length > 0 ? Math.max(...children.map((c) => c.sequence || 0)) + 1 : 1;
  const form = useForm({
    initialValues: { title: '', sequence: String(nextSequence), weight: '10', task_type: '' },
    validate: {
      title: (v) => (v.trim() ? null : REQUIRED),
      sequence: (v) => numberError(v, 1),
      weight: (v) => numberError(v, 1, 100),
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const save = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      await addTemplateItemChild(templateId, parent.id, {
        title: values.title,
        sequence: toInt(values.sequence) || nextSequence,
        weight: values.weight ? toInt(values.weight) : 10,
        task_type: values.task_type || null,
      });
      onClose();
      notify.success('Alt görev başarıyla eklendi');
      onSaved();
    } catch (error) {
      console.error('Error adding child item:', error);
      notify.error('Alt görev eklenirken bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Alt Görev Ekle"
      icon="fas fa-plus-circle"
      size="md"
      submitLabel="Alt Görev Ekle"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Alt Görev Bilgileri" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput
              label="Ana Görev"
              value={`${parent.department_display || parent.department} - ${parent.title}`}
              disabled
              description="Alt görev otomatik olarak bu ana göreve bağlanacak"
              leftSection={icon('fas fa-folder')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Alt Görev Başlığı"
              placeholder="Örn: Malzeme Listesi, İş Programı..."
              withAsterisk
              leftSection={icon('fas fa-heading')}
              {...form.getInputProps('title')}
            />
          </Grid.Col>
          <SequenceWeightType form={form} taskTypes={taskTypes} />
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
