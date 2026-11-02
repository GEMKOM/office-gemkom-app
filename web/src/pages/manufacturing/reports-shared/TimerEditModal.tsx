import { Checkbox, Grid, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  useUpdateTimer,
  type FinishedTimer,
  type TimerPatch,
} from '@/api/manufacturing/finishedTimers';
import type { TimerModule } from '@/api/manufacturing/counts';
import { formatDateTime } from '@/lib/format';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';

/** "2h 5m" / "5m", as legacy formatDuration; '0m' for nothing. */
export function formatDurationSeconds(seconds: number): string {
  if (!seconds) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Epoch ms -> the value of an <input type="datetime-local"> in local time. */
export function toLocalDatetimeInput(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calculatedDuration(start: number | null | undefined, finish: string): string {
  if (!start || !finish) return '-';
  const end = new Date(finish).getTime();
  if (Number.isNaN(end)) return '-';
  return formatDurationSeconds(Math.floor((end - start) / 1000));
}

interface FormValues {
  finish_time: string;
  comment: string;
  manual_entry: boolean;
}

export interface TimerEditModalProps {
  module: TimerModule;
  timer: FinishedTimer;
  onClose: () => void;
}

function ReadOnly({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <Grid.Col span={{ base: 12, sm: 6 }}>
      <TextInput label={label} value={value} readOnly leftSection={<FaIcon icon={icon} />} />
    </Grid.Col>
  );
}

/**
 * Port of the "Zamanlayıcıyı Düzenle" EditModal of both finished-timers
 * pages. Only the finish time, comment and manual flag are editable; the
 * duration follows the finish time.
 */
export function TimerEditModal({ module, timer, onClose }: TimerEditModalProps) {
  const machining = module === 'machining';
  const form = useForm<FormValues>({
    initialValues: {
      finish_time: toLocalDatetimeInput(timer.finish_time),
      comment: timer.comment || '',
      manual_entry: Boolean(timer.manual_entry),
    },
  });
  const update = useUpdateTimer(module);

  const save = async (values: FormValues) => {
    const data: TimerPatch = {
      comment: values.comment,
      manual_entry: values.manual_entry,
      machine_fk: timer.machine_fk,
      finish_time: values.finish_time ? new Date(values.finish_time).getTime() : null,
    };
    if (machining) {
      // Legacy sends the read-only part fields back as they were.
      data.job_no = timer.job_no || '';
      data.image_no = timer.image_no || '';
      data.position_no = timer.position_no || '';
      data.quantity = Number.parseInt(String(timer.quantity ?? ''), 10) || null;
    }
    try {
      await update.mutateAsync({ id: timer.id, data });
      notify.success('Zamanlayıcı başarıyla güncellendi');
      onClose();
    } catch {
      notify.error('Zamanlayıcı güncellenirken hata oluştu');
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Zamanlayıcıyı Düzenle"
      icon="fas fa-edit"
      size="lg"
      onSubmit={form.onSubmit(save)}
      submitting={update.isPending}
      submitLabel="Kaydet"
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          {machining ? (
            <>
              <ReadOnly label="İş No" value={timer.job_no || ''} icon="fas fa-hashtag" />
              <ReadOnly label="Resim No" value={timer.image_no || ''} icon="fas fa-image" />
              <ReadOnly
                label="Pozisyon No"
                value={timer.position_no || ''}
                icon="fas fa-map-marker-alt"
              />
              <ReadOnly label="Adet" value={String(timer.quantity || '')} icon="fas fa-cubes" />
            </>
          ) : (
            <>
              <ReadOnly label="Nesting ID" value={timer.nesting_id || ''} icon="fas fa-hashtag" />
              <ReadOnly
                label="Kalınlık (mm)"
                value={timer.thickness_mm ? `${timer.thickness_mm} mm` : ''}
                icon="fas fa-ruler"
              />
            </>
          )}
          <ReadOnly label="Kullanıcı" value={timer.username || ''} icon="fas fa-user" />
        </Grid>
      </ModalSection>
      <ModalSection title="Zamanlayıcı Bilgileri" icon="fas fa-clock">
        <Grid gap="sm">
          <ReadOnly
            label="Başlangıç Zamanı"
            value={timer.start_time ? formatDateTime(timer.start_time) : '-'}
            icon="fas fa-calendar-check"
          />
          <ReadOnly
            label="Hesaplanan Süre"
            value={calculatedDuration(timer.start_time, form.values.finish_time)}
            icon="fas fa-hourglass-half"
          />
          <ReadOnly label="Makine" value={timer.machine_name || ''} icon="fas fa-cogs" />
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Bitiş Zamanı"
              type="datetime-local"
              leftSection={<FaIcon icon="fas fa-calendar-times" />}
              {...form.getInputProps('finish_time')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Yorum"
              placeholder="Yorum girin..."
              rows={3}
              {...form.getInputProps('comment')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Checkbox
              label="Manuel Giriş"
              {...form.getInputProps('manual_entry', { type: 'checkbox' })}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
