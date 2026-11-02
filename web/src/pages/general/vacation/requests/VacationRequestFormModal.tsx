import { Alert, Box, Grid, Group, Select, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  LEAVE_TYPES,
  useCreateVacationRequest,
  vacationPreviewQueryOptions,
  type VacationPreview,
  type VacationRequestInput,
} from '@/api/general/vacation';
import { formatDate } from '@/lib/format';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { isCompensatoryLeave } from '../shared/vacationParts';

const REQUIRED = 'İzin türü ve tarih aralığı zorunludur.';
const TIMES_REQUIRED = 'Mazeret izni için başlangıç ve bitiş saati zorunludur.';

// The checks legacy ran in its save callback, as field errors.
export const vacationRequestSchema = z
  .object({
    leave_type: z.string().min(1, REQUIRED),
    start_date: z.string().min(1, REQUIRED),
    end_date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    reason: z.string(),
  })
  .superRefine((values, ctx) => {
    if (isCompensatoryLeave(values.leave_type)) {
      if (!values.start_time)
        ctx.addIssue({ code: 'custom', path: ['start_time'], message: TIMES_REQUIRED });
      if (!values.end_time)
        ctx.addIssue({ code: 'custom', path: ['end_time'], message: TIMES_REQUIRED });
      if (values.start_time && values.end_time && values.end_time <= values.start_time) {
        ctx.addIssue({
          code: 'custom',
          path: ['end_time'],
          message: 'Bitiş saati başlangıç saatinden sonra olmalıdır.',
        });
      }
      return;
    }
    if (!values.end_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: REQUIRED });
    } else if (values.start_date && values.end_date < values.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'Bitiş tarihi başlangıç tarihinden önce olamaz.',
      });
    }
  });

export type VacationRequestFormValues = z.infer<typeof vacationRequestSchema>;

/** Today as YYYY-MM-DD in local time (legacy used the UTC day; same thing outside midnight-3am). */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The request body legacy built from the form. */
export function vacationRequestPayload(values: VacationRequestFormValues): VacationRequestInput {
  const payload: VacationRequestInput = {
    leave_type: values.leave_type,
    start_date: values.start_date,
    end_date: values.end_date,
    reason: values.reason || '',
  };
  if (isCompensatoryLeave(values.leave_type)) {
    payload.end_date = payload.start_date;
    payload.start_time = values.start_time;
    payload.end_time = values.end_time;
  }
  return payload;
}

const WEEKDAY_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const EXCLUDED_REASONS: Record<string, string> = {
  weekend: 'Hafta Sonu',
  public_holiday: 'Resmi Tatil',
  half_day_holiday: '1/2 Gün Tatil (Arife)',
};

function PreviewCard({
  startDate,
  endDate,
  days,
  compensatory,
  excluded,
}: {
  startDate: string;
  endDate: string;
  days: VacationPreview['duration_days'] | '...';
  compensatory: boolean;
  excluded: NonNullable<VacationPreview['excluded']>;
}) {
  return (
    <Box p="sm" style={{ border: '1px solid var(--gk-line)', borderRadius: 'var(--gk-radius-md)' }}>
      <Group gap={6} mb="sm" align="baseline">
        <Text fw={800} size="lg" data-testid="preview-days">
          {days ?? 0}
        </Text>
        <Text size="sm" fw={600}>
          iş günü
        </Text>
      </Group>
      <Text size="sm" mb={6}>
        <FaIcon icon="fas fa-calendar-alt" style={{ marginRight: 6, color: 'var(--gk-muted)' }} />
        <strong>Tarih Aralığı:</strong> {formatDate(startDate, WEEKDAY_FORMAT)} -{' '}
        {formatDate(endDate, WEEKDAY_FORMAT)}
      </Text>
      {compensatory ? (
        <Text size="sm" c="dimmed">
          Mazeret izni bakiye düşümüne dahil değildir, önizleme hesaplaması yapılmaz.
        </Text>
      ) : (
        <>
          <Text size="sm" fw={600} mb={2}>
            Hariç Tutulan Günler:
          </Text>
          {excluded.length ? (
            <Box component="ul" m={0} pl="md">
              {excluded.map((item, index) => (
                <Text component="li" key={index} size="sm" c="dimmed">
                  {formatDate(item.date)} -{' '}
                  {item.name || EXCLUDED_REASONS[item.reason ?? ''] || item.reason || 'Hariç gün'}
                  {item.reason === 'half_day_holiday' ? ' (0.5 gün sayılır)' : ''}
                </Text>
              ))}
            </Box>
          ) : (
            <Text size="sm" c="dimmed">
              Hariç tutulan gün yok.
            </Text>
          )}
        </>
      )}
    </Box>
  );
}

/** The working-day preview under the form (schedulePreviewLoad / updatePreviewBox). */
function VacationPreviewBox({
  leaveType,
  startDate,
  endDate,
}: {
  leaveType: string;
  startDate: string;
  endDate: string;
}) {
  // Legacy waited 300 ms after the last change before asking.
  const [debounced] = useDebouncedValue({ startDate, endDate }, 300);
  const compensatory = isCompensatoryLeave(leaveType);
  const ready = Boolean(debounced.startDate && debounced.endDate) && !compensatory;
  const preview = useQuery({
    ...vacationPreviewQueryOptions(debounced.startDate, debounced.endDate),
    enabled: ready,
    retry: false,
  });

  if (!startDate || (!compensatory && !endDate)) {
    return (
      <Alert variant="light" color="gray" icon={<FaIcon icon="fas fa-calendar-day" />}>
        Tarih aralığı seçtiğinizde iş günü önizlemesi burada gösterilir.
      </Alert>
    );
  }
  if (compensatory) {
    return (
      <PreviewCard startDate={startDate} endDate={startDate} days={0} compensatory excluded={[]} />
    );
  }
  if (preview.isError) {
    return (
      <Alert variant="light" color="red" icon={<FaIcon icon="fas fa-triangle-exclamation" />}>
        {preview.error.message || 'Önizleme alınamadı.'}
      </Alert>
    );
  }
  const settled =
    preview.data && debounced.startDate === startDate && debounced.endDate === endDate;
  return (
    <PreviewCard
      startDate={settled ? (preview.data!.start_date ?? startDate) : startDate}
      endDate={settled ? (preview.data!.end_date ?? endDate) : endDate}
      days={settled ? preview.data!.duration_days : '...'}
      compensatory={false}
      excluded={settled && Array.isArray(preview.data!.excluded) ? preview.data!.excluded : []}
    />
  );
}

const leaveTypeData = LEAVE_TYPES.map(({ value, label }) => ({ value, label }));

export interface VacationRequestFormModalProps {
  onClose: () => void;
  onCreated?: () => void;
}

/** Port of requests.js initializeCreateModal. Mount it to open it. */
export function VacationRequestFormModal({ onClose, onCreated }: VacationRequestFormModalProps) {
  const form = useForm<VacationRequestFormValues>({
    initialValues: {
      leave_type: 'annual_leave',
      start_date: today(),
      end_date: today(),
      start_time: '',
      end_time: '',
      reason: '',
    },
    validate: zod4Resolver(vacationRequestSchema),
    onValuesChange: (values, previous) => {
      const compensatory = isCompensatoryLeave(values.leave_type);
      // Mazeret izni is a single day; the end date follows the start date.
      if (compensatory && values.end_date !== values.start_date) {
        form.setFieldValue('end_date', values.start_date);
      }
      // Leaving mazeret izni clears the hours (syncCompensatoryMode).
      if (
        !compensatory &&
        isCompensatoryLeave(previous.leave_type) &&
        (values.start_time || values.end_time)
      ) {
        form.setValues({ start_time: '', end_time: '' });
      }
    },
  });
  const create = useCreateVacationRequest();
  const compensatory = isCompensatoryLeave(form.values.leave_type);

  const save = async (values: VacationRequestFormValues) => {
    try {
      await create.mutateAsync(vacationRequestPayload(values));
      notify.success('İzin talebi oluşturuldu.');
      onCreated?.();
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Talep oluşturulamadı.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni İzin Talebi"
      icon="fas fa-calendar-plus"
      size="lg"
      submitLabel="Talep Oluştur"
      submitting={create.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Talep Bilgileri" icon="fas fa-file-signature">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="İzin Türü"
              placeholder="İzin türü seçin..."
              data={leaveTypeData}
              searchable
              allowDeselect={false}
              withAsterisk
              {...form.getInputProps('leave_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }} />
          <Grid.Col span={{ base: 12, sm: compensatory ? 4 : 12 }}>
            <TextInput
              type="date"
              label="Başlangıç Tarihi"
              withAsterisk
              {...form.getInputProps('start_date')}
            />
          </Grid.Col>
          {compensatory ? (
            <>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput
                  type="time"
                  step={900}
                  label="Başlangıç Saati"
                  withAsterisk
                  {...form.getInputProps('start_time')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput
                  type="time"
                  step={900}
                  label="Bitiş Saati"
                  withAsterisk
                  {...form.getInputProps('end_time')}
                />
              </Grid.Col>
            </>
          ) : (
            <Grid.Col span={12}>
              <TextInput
                type="date"
                label="Bitiş Tarihi"
                withAsterisk
                {...form.getInputProps('end_date')}
              />
            </Grid.Col>
          )}
          <Grid.Col span={12}>
            <Textarea label="Gerekçe (opsiyonel)" rows={3} {...form.getInputProps('reason')} />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Önizleme" icon="fas fa-calendar-day">
        <VacationPreviewBox
          leaveType={form.values.leave_type}
          startDate={form.values.start_date}
          endDate={form.values.end_date}
        />
      </ModalSection>
    </FormModal>
  );
}
