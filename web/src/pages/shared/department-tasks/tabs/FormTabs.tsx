import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import {
  bulkCreateSubtasks,
  createDepartmentTask,
  getDepartmentTask,
  patchDepartmentTask,
  type DepartmentTask,
} from '@/api/projects/departmentTasks';
import { FaIcon, notify } from '@/ui';
import { useDepartmentTasks } from '../context';
import { dateOnly, isTitleEditable, legacyErrorText } from '../logic';
import { TabTitle } from './SimpleTabs';

function numberOrEmpty(value: unknown): number | string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

/** Legacy renderEditActionForm + handleEditActionSubmit. */
export function EditTab({ task }: { task: DepartmentTask }) {
  const { users, closeTask, refreshRow } = useDepartmentTasks();
  const titleEditable = isTitleEditable(task);
  const derived =
    (task.estimated_duration_wd === null || task.estimated_duration_wd === undefined) &&
    task.derived_durations?.[task.id] !== null &&
    task.derived_durations?.[task.id] !== undefined
      ? task.derived_durations?.[task.id]
      : null;
  const [values, setValues] = useState(() => ({
    title: task.title || '',
    description: task.description || '',
    assigned_to: task.assigned_to ? String(task.assigned_to) : '',
    target_start_date: dateOnly(task.target_start_date),
    target_completion_date: dateOnly(task.target_completion_date),
    estimated_duration_wd: numberOrEmpty(task.estimated_duration_wd),
    notes: task.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    const body: Record<string, unknown> = {};
    // An emptied title is left out (legacy only sent a non-empty one).
    if (titleEditable && values.title.trim()) body.title = values.title.trim();
    body.description = values.description || null;
    body.assigned_to = values.assigned_to === '' ? null : Number.parseInt(values.assigned_to, 10);
    body.target_start_date = values.target_start_date || null;
    body.target_completion_date = values.target_completion_date || null;
    body.estimated_duration_wd =
      values.estimated_duration_wd === '' ? null : Number(values.estimated_duration_wd);
    body.notes = values.notes || null;
    setBusy(true);
    try {
      await patchDepartmentTask(task.id, body);
      notify.success('Görev güncellendi');
      closeTask();
      void refreshRow(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev güncellenirken hata oluştu'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TabTitle icon="fas fa-edit">Görevi Düzenle</TabTitle>
      <Stack gap="sm">
        <TextInput
          label={
            <>
              Başlık{' '}
              {titleEditable ? null : (
                <Text span c="dimmed">
                  (Değiştirilemez)
                </Text>
              )}
            </>
          }
          description={titleEditable ? 'Görev başlığı düzenlenebilir' : undefined}
          readOnly={!titleEditable}
          value={values.title}
          onChange={(e) => set('title', e.currentTarget.value)}
        />
        <Textarea
          label="Açıklama"
          rows={3}
          value={values.description}
          onChange={(e) => set('description', e.currentTarget.value)}
        />
        <SimpleGrid cols={2}>
          <Select
            label="Atanan Kişi"
            allowDeselect={false}
            searchable
            data={[
              { value: '', label: 'Atanmamış' },
              ...users.map((u) => ({ value: String(u.id), label: u.name || u.username })),
            ]}
            value={values.assigned_to}
            onChange={(v) => set('assigned_to', v ?? '')}
          />
          <TextInput
            type="date"
            label="Hedef Başlangıç Tarihi"
            value={values.target_start_date}
            onChange={(e) => set('target_start_date', e.currentTarget.value)}
          />
          <TextInput
            type="date"
            label="Hedef Bitiş Tarihi"
            value={values.target_completion_date}
            onChange={(e) => set('target_completion_date', e.currentTarget.value)}
          />
          <NumberInput
            label={
              <>
                Tahmini Süre (iş günü)
                {derived !== null ? (
                  <Text span c="dimmed">
                    {' '}
                    (türetilmiş — üst görevden)
                  </Text>
                ) : null}
              </>
            }
            min={0.5}
            step={0.5}
            decimalSeparator=","
            readOnly={derived !== null}
            placeholder={derived !== null ? `≈${derived} g (ağırlık payı)` : undefined}
            title={
              derived !== null
                ? 'Üst göreve girilen süreden türetiliyor — değiştirmek için üst görevin süresini güncelleyin'
                : undefined
            }
            value={values.estimated_duration_wd}
            onChange={(v) => set('estimated_duration_wd', v)}
          />
        </SimpleGrid>
        <Textarea
          label="Notlar"
          rows={2}
          value={values.notes}
          onChange={(e) => set('notes', e.currentTarget.value)}
        />
        <div>
          <Button type="submit" loading={busy} leftSection={<FaIcon icon="fas fa-save" />}>
            Kaydet
          </Button>
        </div>
      </Stack>
    </form>
  );
}

/** Legacy renderAddSubtaskActionForm + handleAddSubtaskActionSubmit (design). */
export function AddSubtaskTab({ task }: { task: DepartmentTask }) {
  const { closeTask, subtasksChanged } = useDepartmentTasks();
  const [values, setValues] = useState({
    title: '',
    description: '',
    sequence: ((task.subtasks_count || 0) + 1) as number | string,
    weight: '' as number | string,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      // Backend needs department and job_order: always from the parent, like legacy.
      const parent = await getDepartmentTask(task.id);
      const body: Record<string, unknown> = {
        job_order: parent.job_order,
        parent: parent.id,
        department: parent.department,
        sequence: Number.parseInt(String(values.sequence), 10) || 1,
      };
      if (values.title.trim()) body.title = values.title.trim();
      if (values.description.trim()) body.description = values.description.trim();
      if (values.weight !== '' && Number.isFinite(Number(values.weight)))
        body.weight = Number(values.weight);
      await createDepartmentTask(body);
      notify.success('Alt görev eklendi');
      closeTask();
      void subtasksChanged(task.id);
    } catch (error) {
      notify.error(error, { fallback: 'Alt görev eklenirken hata oluştu' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TabTitle icon="fas fa-plus-circle">Alt Görev Ekle</TabTitle>
      <Stack gap="sm">
        <TextInput
          label="Başlık"
          placeholder="Boş bırakılırsa iş emri adı kullanılır"
          description="Alt görev başlığı (boş bırakılabilir)"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.currentTarget.value }))}
        />
        <Textarea
          label="Açıklama"
          rows={3}
          placeholder="Alt görev açıklaması"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.currentTarget.value }))}
        />
        <SimpleGrid cols={2}>
          <NumberInput
            label="Sıra"
            min={1}
            description="Alt görev sırası"
            value={values.sequence}
            onChange={(v) => setValues((s) => ({ ...s, sequence: v }))}
          />
          <NumberInput
            label="Ağırlık"
            min={0}
            step={0.01}
            decimalSeparator=","
            description="Alt görev ağırlığı"
            value={values.weight}
            onChange={(v) => setValues((s) => ({ ...s, weight: v }))}
          />
        </SimpleGrid>
        <div>
          <Button type="submit" loading={busy} leftSection={<FaIcon icon="fas fa-save" />}>
            Alt Görev Ekle
          </Button>
        </div>
      </Stack>
    </form>
  );
}

let bulkRowId = 0;

/** Legacy renderBulkSubtaskActionForm + handleBulkSubtaskActionSubmit (part tasks). */
export function BulkSubtaskTab({ task }: { task: DepartmentTask }) {
  const { closeTask, subtasksChanged } = useDepartmentTasks();
  const [rows, setRows] = useState(() => [{ id: ++bulkRowId, title: '' }]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const parent = await getDepartmentTask(task.id);
      let sequence = (parent.subtasks_count || 0) + 1;
      if (rows.some((r) => !r.title.trim())) {
        notify.error('Tüm görevler için başlık gereklidir');
        return;
      }
      if (rows.length === 0) {
        notify.error('En az bir görev eklemelisiniz');
        return;
      }
      const tasks = rows.map((r) => ({
        title: r.title.trim(),
        task_type: 'part',
        sequence: sequence++,
        weight: 10,
        subtasks: [],
      }));
      const response = await bulkCreateSubtasks(task.id, tasks);
      notify.success(response?.message || `${response?.tasks?.length || 0} alt görev oluşturuldu`);
      closeTask();
      void subtasksChanged(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Alt görevler oluşturulurken hata oluştu', true));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TabTitle icon="fas fa-layer-group">Toplu Alt Görev Ekle</TabTitle>
      <Group justify="space-between" mb="xs">
        <Text fw={500}>
          <FaIcon icon="fas fa-tasks" style={{ marginRight: 4 }} />
          Alt Görevler
        </Text>
        <Button
          size="xs"
          variant="outline"
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => setRows((r) => [...r, { id: ++bulkRowId, title: '' }])}
        >
          Görev Ekle
        </Button>
      </Group>
      <Stack gap={6} mah={400} style={{ overflowY: 'auto' }}>
        {rows.map((row, index) => (
          <Group key={row.id} gap="xs" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              size="xs"
              placeholder="Görev başlığı"
              aria-label={`Görev başlığı ${index + 1}`}
              value={row.title}
              onChange={(e) => {
                const title = e.currentTarget.value;
                setRows((r) => r.map((x) => (x.id === row.id ? { ...x, title } : x)));
              }}
            />
            <ActionIcon
              variant="outline"
              color="red"
              aria-label="Görevi kaldır"
              onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
            >
              <FaIcon icon="fas fa-trash" />
            </ActionIcon>
          </Group>
        ))}
      </Stack>
      <Button
        mt="md"
        type="submit"
        color="green"
        loading={busy}
        leftSection={<FaIcon icon="fas fa-save" />}
      >
        Alt Görevleri Oluştur
      </Button>
    </form>
  );
}
