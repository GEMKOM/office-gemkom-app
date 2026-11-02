import {
  ActionIcon,
  Button,
  Grid,
  Group,
  Select,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createRecordInterval,
  deleteInterval,
  patchInterval,
  recordIntervalsKey,
  recordIntervalsQueryOptions,
  type LeaveInterval,
} from '@/api/human_resources/userAttendance';
import { confirm, DetailModal, FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { isoToLocalTime, LEAVE_TYPE_OPTIONS, leaveTypeLabel, timeOnDateToIso } from '../userForm';

export interface LeaveIntervalsModalProps {
  recordId: number;
  /** YYYY-MM-DD of the record. */
  date: string;
  /** After any change: the month's late / early-leave figures move with the intervals. */
  onChanged: () => void;
  onClose: () => void;
}

/** Port of ensureLeaveIntervalsUi: the leave intervals of one attendance record. */
export function LeaveIntervalsModal({
  recordId,
  date,
  onChanged,
  onClose,
}: LeaveIntervalsModalProps) {
  const queryClient = useQueryClient();
  const intervals = useQuery(recordIntervalsQueryOptions(recordId));
  // null: closed; 'new': add; an interval: edit.
  const [form, setForm] = useState<LeaveInterval | 'new' | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: recordIntervalsKey(recordId) });
    onChanged();
  };

  const remove = async (id: number) => {
    const ok = await confirm({
      title: 'Onay',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu izin aralığını silmek istediğinize emin misiniz?',
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteInterval(id);
      notify.success('Silindi');
      await refresh();
    } catch (error) {
      notify.error(error, { fallback: 'Silinemedi' });
    }
  };

  let content;
  if (intervals.isPending) {
    content = (
      <Text c="dimmed" size="sm">
        <FaIcon icon="fas fa-spinner fa-spin" /> Yükleniyor...
      </Text>
    );
  } else if (intervals.isError) {
    content = (
      <Text c="red" size="sm">
        Yüklenemedi: {intervals.error.message}
      </Text>
    );
  } else {
    const rows = intervals.data;
    content = (
      <>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>{date}</Text>
          <Button
            size="xs"
            variant="light"
            color="green"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setForm('new')}
          >
            Yeni Aralık
          </Button>
        </Group>
        <Table highlightOnHover verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Başlangıç</Table.Th>
              <Table.Th>Bitiş</Table.Th>
              <Table.Th>Tür</Table.Th>
              <Table.Th>Not</Table.Th>
              <Table.Th ta="right">İşlem</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length ? (
              rows.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{isoToLocalTime(it.start_time) || '-'}</Table.Td>
                  <Table.Td>{isoToLocalTime(it.end_time) || '-'}</Table.Td>
                  <Table.Td>
                    {it.leave_type_display || leaveTypeLabel(it.leave_type) || it.leave_type || '-'}
                  </Table.Td>
                  <Table.Td>{it.notes || '-'}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    <ActionIcon variant="subtle" aria-label="Düzenle" onClick={() => setForm(it)}>
                      <FaIcon icon="fas fa-edit" />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Sil"
                      onClick={() => void remove(it.id)}
                    >
                      <FaIcon icon="fas fa-trash" />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" size="sm">
                    Kayıt yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        <Text c="dimmed" size="xs" mt="xs">
          Not: Aralık değişiklikleri geç/erken çıkış hesaplarını otomatik günceller.
        </Text>
      </>
    );
  }

  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        title="İzin Aralıkları"
        icon="fas fa-person-walking-arrow-right"
        sections={[{ content }]}
      />
      {form ? (
        <IntervalFormModal
          recordId={recordId}
          date={date}
          interval={form === 'new' ? null : form}
          onSaved={refresh}
          onClose={() => setForm(null)}
        />
      ) : null}
    </>
  );
}

function IntervalFormModal({
  recordId,
  date,
  interval,
  onSaved,
  onClose,
}: {
  recordId: number;
  date: string;
  interval: LeaveInterval | null;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [start, setStart] = useState(interval ? isoToLocalTime(interval.start_time) : '');
  const [end, setEnd] = useState(interval ? isoToLocalTime(interval.end_time) : '');
  const [leaveType, setLeaveType] = useState(interval?.leave_type || 'paid_leave');
  const [notes, setNotes] = useState(interval?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    const startIso = timeOnDateToIso(date, start);
    const endIso = timeOnDateToIso(date, end);
    if (!startIso || !endIso) {
      notify.warning('Başlangıç ve bitiş saatleri gereklidir.');
      return;
    }
    const data = {
      start_time: startIso,
      end_time: endIso,
      leave_type: leaveType,
      notes: notes || '',
    };
    setSubmitting(true);
    try {
      if (interval) await patchInterval(interval.id, data);
      else await createRecordInterval(recordId, data);
      onClose();
      await onSaved();
    } catch (error) {
      notify.error(error, { fallback: interval ? 'Güncellenemedi' : 'Kaydedilemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="İzin Aralığı"
      subtitle={date}
      icon="fas fa-person-walking-arrow-right"
      submitting={submitting}
      onSubmit={() => void save()}
    >
      <ModalSection title="Aralık" icon="fas fa-clock">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Başlangıç"
              type="time"
              step={1}
              withAsterisk
              value={start}
              onChange={(e) => setStart(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Bitiş"
              type="time"
              step={1}
              withAsterisk
              value={end}
              onChange={(e) => setEnd(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="İzin Türü"
              withAsterisk
              data={LEAVE_TYPE_OPTIONS}
              allowDeselect={false}
              value={leaveType}
              onChange={(v) => setLeaveType(v ?? 'paid_leave')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Not (opsiyonel)"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
