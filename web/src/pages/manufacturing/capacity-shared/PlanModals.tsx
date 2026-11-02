import { Alert, Checkbox, Grid, NativeSelect, NumberInput, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { CuttingPlanTask } from '@/api/manufacturing/capacityPlanning';
import { FaIcon, FormModal } from '@/ui';
import type { AutoscheduleOptions } from './planLogic';

/** ms -> "YYYY-MM-DDTHH:MM" for a datetime-local input (local time, as legacy formatDateForInput). */
export function toDateTimeInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInput(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export interface TaskEditValues {
  planned_start_ms: number | null;
  planned_end_ms: number | null;
  plan_order: number | null;
  plan_locked: boolean;
}

/** "Görev Düzenle" (legacy #editTaskModal): dates, order and lock go into the draft. */
export function TaskEditModal({
  task,
  onClose,
  onSave,
}: {
  task: CuttingPlanTask;
  onClose: () => void;
  onSave: (values: TaskEditValues) => void;
}) {
  const [start, setStart] = useState(toDateTimeInput(task.planned_start_ms));
  const [end, setEnd] = useState(toDateTimeInput(task.planned_end_ms));
  const [order, setOrder] = useState<string | number>(task.plan_order ?? '');
  const [locked, setLocked] = useState(Boolean(task.plan_locked));
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Görev Düzenle"
      subtitle={task.key}
      icon="fas fa-edit"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number.parseInt(String(order), 10);
        onSave({
          planned_start_ms: fromDateTimeInput(start),
          planned_end_ms: fromDateTimeInput(end),
          plan_order: Number.isFinite(parsed) ? parsed : null,
          plan_locked: locked,
        });
      }}
    >
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TextInput
            type="datetime-local"
            label="Başlangıç Tarihi"
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TextInput
            type="datetime-local"
            label="Bitiş Tarihi"
            value={end}
            onChange={(e) => setEnd(e.currentTarget.value)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <NumberInput
            label="Sıra"
            min={1}
            allowDecimal={false}
            value={order}
            onChange={setOrder}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }} pt="xl">
          <Checkbox
            label="Planı Kilitle"
            checked={locked}
            onChange={(e) => setLocked(e.currentTarget.checked)}
          />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

/** "Otomatik Planlama" (legacy #autoscheduleModal). */
export function AutoscheduleModal({
  hasCalendar,
  onClose,
  onConfirm,
}: {
  hasCalendar: boolean;
  onClose: () => void;
  onConfirm: (options: AutoscheduleOptions) => void;
}) {
  const [criteria, setCriteria] = useState<AutoscheduleOptions['criteria']>('order');
  const [durationType, setDurationType] =
    useState<AutoscheduleOptions['durationType']>('remaining');
  // Defaults to now, as legacy.
  const [start, setStart] = useState(() => toDateTimeInput(Date.now()));
  const [error, setError] = useState<string | null>(null);
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Otomatik Planlama"
      icon="fas fa-magic"
      size="md"
      submitLabel="Planla"
      submitIcon="fas fa-magic"
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        const t = fromDateTimeInput(start);
        if (t === null) {
          setError('Geçerli bir başlangıç tarihi seçin');
          return;
        }
        onConfirm({ criteria, durationType, start: new Date(t) });
      }}
    >
      <Stack gap="sm">
        <NativeSelect
          label="Planlama Kriteri"
          value={criteria}
          onChange={(e) => setCriteria(e.currentTarget.value as AutoscheduleOptions['criteria'])}
          data={[
            { value: 'order', label: 'Sıraya Göre' },
            { value: 'finish_time', label: 'Bitiş Tarihine Göre' },
          ]}
        />
        <NativeSelect
          label="Süre Hesaplama"
          value={durationType}
          onChange={(e) =>
            setDurationType(e.currentTarget.value as AutoscheduleOptions['durationType'])
          }
          data={[
            { value: 'remaining', label: 'Kalan Saat' },
            { value: 'estimated', label: 'Tahmini Saat' },
          ]}
        />
        <TextInput
          type="datetime-local"
          label="Başlangıç Tarihi"
          value={start}
          onChange={(e) => setStart(e.currentTarget.value)}
        />
        {hasCalendar ? (
          <Alert color="green" icon={<FaIcon icon="fas fa-calendar-check" />}>
            <strong>Makine Takvimi Aktif (Turkey Time):</strong> Görevler sadece çalışma saatleri
            içinde planlanacaktır.
          </Alert>
        ) : (
          <Alert color="yellow" icon={<FaIcon icon="fas fa-calendar-times" />}>
            <strong>Makine Takvimi Bulunamadı:</strong> Görevler 7/24 planlanacaktır (Turkey Time).
          </Alert>
        )}
        <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
          Seçilen kriterlere göre görevler otomatik olarak planlanacaktır.
        </Alert>
      </Stack>
    </FormModal>
  );
}
