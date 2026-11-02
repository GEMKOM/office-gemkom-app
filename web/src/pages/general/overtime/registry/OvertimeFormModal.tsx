import {
  ActionIcon,
  Alert,
  Button,
  Grid,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  createOvertimeRequest,
  machiningOperatorsQueryOptions,
  operationsForJobQueryOptions,
  overtimeSaveErrorMessage,
  updateOvertimeRequest,
  validateOvertimeRequest,
  type OvertimeEntryInput,
  type OvertimeRequest,
  type OvertimeRequestInput,
} from '@/api/general/overtime';
import { useJobOrderOptions, useUsers, userLabel } from '@/api/reference';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { nextRowIndex } from './participantIndex';

const REQUIRED = 'Bu alan gereklidir';

interface ParticipantValues {
  /** Stable row key (see participantIndex). */
  key: number;
  user: string | null;
  job_no: string | null;
  description: string;
  operations: string[];
}

export interface OvertimeFormValues {
  reason: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  participants: ParticipantValues[];
}

type Form = UseFormReturnType<OvertimeFormValues>;
type Option = { value: string; label: string };

/** ISO/UTC datetime to local 'YYYY-MM-DD' / 'HH:MM' (legacy isoToLocalParts). */
export function isoToLocalParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function emptyParticipant(key: number): ParticipantValues {
  return { key, user: null, job_no: null, description: '', operations: [] };
}

export function overtimeFormValues(request?: OvertimeRequest | null): OvertimeFormValues {
  const start = isoToLocalParts(request?.start_at);
  const end = isoToLocalParts(request?.end_at);
  const entries = request?.entries ?? [];
  return {
    reason: request?.reason || '',
    start_date: start.date,
    start_time: start.time,
    end_date: end.date,
    end_time: end.time,
    participants: entries.length
      ? entries.map((entry, index) => ({
          key: index,
          user: entry.user_id != null ? String(entry.user_id) : null,
          job_no: entry.job_no || null,
          description: entry.description || '',
          operations: (entry.operations ?? []).map((op) => op.key),
        }))
      : [emptyParticipant(0)],
  };
}

function toIso(date: string, time: string): string {
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

interface ParticipantRowProps {
  form: Form;
  index: number;
  participant: ParticipantValues;
  userOptions: Option[];
  jobOptions: Option[];
  machinists: Set<number>;
  onRemove: () => void;
}

function ParticipantRow({
  form,
  index,
  participant,
  userOptions,
  jobOptions,
  machinists,
  onRemove,
}: ParticipantRowProps) {
  const path = `participants.${index}` as const;
  const isMachinist = participant.user !== null && machinists.has(Number(participant.user));
  const showOperations = isMachinist && Boolean(participant.job_no);
  const operations = useQuery({
    ...operationsForJobQueryOptions(participant.job_no ?? ''),
    enabled: showOperations,
  });
  const operationOptions = operations.data ?? [];
  // Prefilled keys that the job no longer offers are dropped, as legacy did.
  const selected = operations.data
    ? participant.operations.filter((key) => operationOptions.some((o) => o.value === key))
    : participant.operations;

  return (
    <div data-testid="participant-row">
      <Grid gap="sm" align="flex-start">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Select
            label="Çalışan"
            withAsterisk
            placeholder="Çalışan seçiniz..."
            description="Mesai talebine katılacak çalışan"
            searchable
            data={userOptions}
            limit={100}
            value={participant.user}
            onChange={(value) => {
              form.setFieldValue(`${path}.user`, value);
              form.setFieldValue(`${path}.operations`, []);
            }}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Select
            label="İş Emri No"
            withAsterisk
            placeholder="İş emri seçin"
            description="Çalışanın çalışacağı iş emri numarası"
            searchable
            data={jobOptions}
            limit={100}
            value={participant.job_no}
            onChange={(value) => {
              form.setFieldValue(`${path}.job_no`, value);
              form.setFieldValue(`${path}.operations`, []);
            }}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 10, md: 3 }}>
          <TextInput
            label="Açıklama"
            placeholder="Açıklama"
            description="İş emri için ek açıklama"
            {...form.getInputProps(`${path}.description`)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 2, md: 1 }} pt={30}>
          <ActionIcon
            variant="outline"
            color="red"
            size="lg"
            aria-label="Katılımcıyı Kaldır"
            title="Katılımcıyı Kaldır"
            onClick={onRemove}
          >
            <FaIcon icon="fas fa-trash" />
          </ActionIcon>
        </Grid.Col>
        {showOperations ? (
          <Grid.Col span={12}>
            <MultiSelect
              label="Talaşlı İmalat Operasyonları"
              placeholder="Operasyon seçiniz..."
              description="Bu operatörün mesaide çalışacağı operasyonlar (iş emrine göre)"
              searchable
              data={operationOptions}
              value={selected}
              onChange={(value) => form.setFieldValue(`${path}.operations`, value)}
            />
          </Grid.Col>
        ) : null}
      </Grid>
    </div>
  );
}

export interface OvertimeFormModalProps {
  /** A rejected / cancelled request to edit and re-submit; without it the modal creates one. */
  request?: OvertimeRequest | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Port of the create / "Düzenle & Gönder" modal in overtimeList.js. Mount it to open it. */
export function OvertimeFormModal({ request, onClose, onSaved }: OvertimeFormModalProps) {
  const queryClient = useQueryClient();
  const editing = Boolean(request?.id);
  const form = useForm<OvertimeFormValues>({
    initialValues: overtimeFormValues(request),
    validate: {
      reason: (v) => (v ? null : REQUIRED),
      start_date: (v) => (v ? null : REQUIRED),
      start_time: (v) => (v ? null : REQUIRED),
      end_date: (v) => (v ? null : REQUIRED),
      end_time: (v) => (v ? null : REQUIRED),
    },
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const users = useUsers();
  const jobs = useJobOrderOptions();
  const machiningOperators = useQuery(machiningOperatorsQueryOptions());

  useEffect(() => {
    if (users.isError) notify.error('Veriler yüklenirken hata oluştu.');
  }, [users.isError]);
  useEffect(() => {
    if (jobs.isError) notify.error('İş emirleri yüklenirken hata oluştu.');
  }, [jobs.isError]);

  const userOptions = useMemo<Option[]>(
    () => (users.data ?? []).map((u) => ({ value: String(u.id), label: userLabel(u) })),
    [users.data],
  );
  const jobOptions = useMemo<Option[]>(
    () => (jobs.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobs.data],
  );
  const machinists = useMemo(
    () => new Set((machiningOperators.data ?? []).map((u) => u.id).filter(Boolean)),
    [machiningOperators.data],
  );

  const save = useMutation({
    mutationFn: (data: OvertimeRequestInput) =>
      request?.id ? updateOvertimeRequest(request.id, data) : createOvertimeRequest(data),
  });

  const participants = form.values.participants;

  const addParticipant = () =>
    form.insertListItem(
      'participants',
      emptyParticipant(nextRowIndex(participants.map((p) => p.key))),
    );

  const removeParticipant = (index: number) => {
    if (participants.length <= 1) {
      notify.error('En az bir katılımcı olmalıdır.');
      return;
    }
    form.removeListItem('participants', index);
  };

  const submit = async (values: OvertimeFormValues) => {
    setFormErrors([]);
    const entries: OvertimeEntryInput[] = [];
    for (const p of values.participants) {
      if (!p.user || !p.job_no) {
        setFormErrors(['Lütfen tüm katılımcılar için gerekli bilgileri doldurun.']);
        return;
      }
      // Operations only exist for a machining operator with a job, as the select only showed then.
      let operations = machinists.has(Number(p.user)) ? p.operations : [];
      const offered = queryClient.getQueryData(operationsForJobQueryOptions(p.job_no).queryKey);
      if (offered && operations.length)
        operations = operations.filter((key) => offered.some((o) => o.value === key));
      entries.push({
        user: Number(p.user),
        job_no: p.job_no,
        description: p.description.trim(),
        operations,
      });
    }
    if (entries.length === 0) {
      setFormErrors(['En az 1 katılımcı eklemelisiniz.']);
      return;
    }

    const data: OvertimeRequestInput = {
      start_at: toIso(values.start_date, values.start_time),
      end_at: toIso(values.end_date, values.end_time),
      reason: values.reason.trim(),
      entries,
    };
    const errors = validateOvertimeRequest(data);
    if (errors.length) {
      setFormErrors(errors);
      return;
    }

    try {
      await save.mutateAsync(data);
      notify.success(
        editing
          ? 'Mesai talebi güncellendi ve yeniden gönderildi.'
          : 'Mesai talebi başarıyla oluşturuldu.',
      );
      onSaved();
      onClose();
    } catch (error) {
      notify.error(overtimeSaveErrorMessage(error, 'Mesai talebi oluşturulurken hata oluştu.'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Mesai Talebini Düzenle & Gönder' : 'Yeni Mesai Talebi'}
      subtitle={editing && request ? `#${request.id}` : undefined}
      icon={editing ? 'fas fa-redo' : 'fas fa-plus'}
      size="xl"
      submitting={save.isPending}
      onSubmit={form.onSubmit((values) => void submit(values))}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Textarea
          label="Mesai Nedeni"
          withAsterisk
          placeholder="Mesai talebinin nedenini açıklayın..."
          description="Mesai talebinin nedenini detaylı olarak açıklayın"
          rows={3}
          {...form.getInputProps('reason')}
        />
      </ModalSection>

      <ModalSection title="Tarih ve Saat" icon="fas fa-calendar">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="date"
              label="Başlangıç Tarihi"
              withAsterisk
              {...form.getInputProps('start_date')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="time"
              label="Başlangıç Saati"
              withAsterisk
              {...form.getInputProps('start_time')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="date"
              label="Bitiş Tarihi"
              withAsterisk
              {...form.getInputProps('end_date')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="time"
              label="Bitiş Saati"
              withAsterisk
              {...form.getInputProps('end_time')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Katılımcılar" icon="fas fa-users">
        <Group justify="space-between" mb="sm">
          <Text fw={600} size="sm">
            Katılımcı Listesi
          </Text>
          <Button
            size="xs"
            variant="outline"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={addParticipant}
          >
            Katılımcı Ekle
          </Button>
        </Group>
        <Stack gap="md">
          {participants.map((participant, index) => (
            <ParticipantRow
              key={participant.key}
              form={form}
              index={index}
              participant={participant}
              userOptions={userOptions}
              jobOptions={jobOptions}
              machinists={machinists}
              onRemove={() => removeParticipant(index)}
            />
          ))}
        </Stack>
      </ModalSection>

      {formErrors.length ? (
        <Alert color="red" variant="light" icon={<FaIcon icon="fas fa-exclamation-circle" />}>
          <Stack gap={2}>
            {formErrors.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </Stack>
        </Alert>
      ) : null}
    </FormModal>
  );
}
